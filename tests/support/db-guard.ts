import type pg from "pg";

/**
 * Ortak (Neon) veritabanı test bağlantısı koruması (PHASE 10.2, D-129). PHASE 10.1'de Neon'da da çalışan
 * bir test dosyası geri alınmayan bir INSERT ile kalıcı audit kaydı yazdı; kök neden, Neon'da çalışan
 * testlerin bağlantılarında kalıcı yazımı engelleyen hiçbir mekanizma olmamasıydı.
 *
 * Kurallar (yalnızca izole OLMAYAN veritabanında etkin):
 * - Transaction DIŞINDAKİ yazma ifadesi otomatik olarak `BEGIN … ROLLBACK` içinde çalıştırılır: hata
 *   davranışı (ör. 42501 yetki, 23514 CHECK) korunur, etkisi kalıcı olmaz.
 * - Açık transaction içinde yazma yapıldıysa `COMMIT`/`END` reddedilir (önce ROLLBACK gönderilir).
 * - Salt okunur transaction'ların COMMIT'i serbesttir.
 * - Tek istisna (D-067 ile onaylı kısa ömürlü teknik kayıtlar): `sessions` (test başına oluşturulup silinen
 *   `test-session-*` oturumları) ve `rate_limit_buckets` (HMAC'li geçici sayaçlar). Gerçek oturumlar veri
 *   parmak izinde sayılır; bir test onlara dokunursa çalıştırma başarısız olur.
 * Bu bir test aracıdır; uygulama koduna, yetkilendirmeye veya production'a etkisi yoktur.
 */
export type StatementKind = "begin" | "commit" | "rollback" | "savepoint" | "read" | "write";

export class SharedDatabaseWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedDatabaseWriteError";
  }
}

function stripLeading(sql: string): string {
  let text = sql;
  for (;;) {
    const trimmed = text.replace(/^[\s(]+/, "");
    if (trimmed.startsWith("--")) {
      const end = trimmed.indexOf("\n");
      text = end === -1 ? "" : trimmed.slice(end + 1);
    } else if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      text = end === -1 ? "" : trimmed.slice(end + 2);
    } else {
      return trimmed;
    }
  }
}

/** D-067: ortak veritabanında commit edilmesine izin verilen kısa ömürlü teknik tablolar. */
export const TRANSIENT_TABLES = new Set(["sessions", "rate_limit_buckets"]);

/** Yazma ifadesinin hedef tablosu (INSERT INTO / UPDATE / DELETE FROM); belirlenemezse null. */
export function writeTarget(sql: string): string | null {
  const match =
    /^(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(
      stripLeading(sql),
    );
  return match ? match[1]!.toLowerCase() : null;
}

export function statementKind(sql: string): StatementKind {
  const text = stripLeading(sql);
  const word = (/^[A-Za-z]+/.exec(text)?.[0] ?? "").toUpperCase();
  switch (word) {
    case "BEGIN":
    case "START":
      return "begin";
    case "COMMIT":
    case "END":
      return "commit";
    case "ROLLBACK":
    case "ABORT":
      return /^\w+\s+(WORK\s+|TRANSACTION\s+)?TO\b/i.test(text) ? "savepoint" : "rollback";
    case "SAVEPOINT":
    case "RELEASE":
      return "savepoint";
    case "SELECT":
      // SELECT … INTO yeni tablo oluşturur.
      return /\binto\s+(temp(orary)?\s+|unlogged\s+|table\s+)?[a-z_"]/i.test(text) &&
        !/\bfrom\b[\s\S]*\binto\b/i.test(text)
        ? "write"
        : "read";
    case "SHOW":
    case "VALUES":
    case "TABLE":
    case "SET":
    case "RESET":
      return "read";
    case "WITH":
      return /\b(insert|update|delete|merge)\b/i.test(text) ? "write" : "read";
    case "EXPLAIN":
      return /\banalyze\b/i.test(text) ? "write" : "read";
    default:
      return "write";
  }
}

type Queryable = { query: (...args: never[]) => unknown };
type Callback = (...args: unknown[]) => void;

/** İstemciyi yerinde korumaya alır (aynı nesne döner). Promise ve callback biçimini destekler. */
export function guardSharedDatabaseClient<T extends Queryable>(client: T): T {
  const marker = client as T & { __sharedDbGuard?: true };
  if (marker.__sharedDbGuard) return client;
  const original = (client.query as (...args: unknown[]) => Promise<unknown>).bind(client);
  let inTransaction = false;
  let wrote = false;

  async function guarded(args: unknown[]): Promise<unknown> {
    const first = args[0];
    const text =
      typeof first === "string"
        ? first
        : typeof first === "object" && first !== null && "text" in first
          ? String((first as { text: unknown }).text)
          : "";
    const kind = statementKind(text);
    if (kind === "begin") {
      const result = await original(...args);
      inTransaction = true;
      wrote = false;
      return result;
    }
    if (kind === "commit") {
      if (inTransaction && wrote) {
        await original("ROLLBACK");
        inTransaction = false;
        wrote = false;
        throw new SharedDatabaseWriteError(
          "Ortak veritabanında yazma içeren transaction commit edilemez (test izolasyonu — D-129).",
        );
      }
      inTransaction = false;
      return original(...args);
    }
    if (kind === "rollback") {
      inTransaction = false;
      wrote = false;
      return original(...args);
    }
    if (kind === "write" && TRANSIENT_TABLES.has(writeTarget(text) ?? "")) {
      return original(...args);
    }
    if (kind === "write") {
      if (inTransaction) {
        wrote = true;
        return original(...args);
      }
      await original("BEGIN");
      try {
        return await original(...args);
      } finally {
        await original("ROLLBACK");
      }
    }
    return original(...args);
  }

  (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
    const callback = typeof args.at(-1) === "function" ? (args.pop() as Callback) : null;
    const promise = guarded(args);
    if (callback === null) return promise;
    promise.then(
      (result) => callback(null, result),
      (error: unknown) => callback(error),
    );
    return undefined;
  };
  marker.__sharedDbGuard = true;
  return client;
}

/** Pool'u korumaya alır: `connect()` korumalı istemci verir; `query()` korumalı istemci üzerinden. */
export function guardSharedDatabasePool(pool: pg.Pool): pg.Pool {
  const originalConnect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>;
  const connectGuarded = async () => guardSharedDatabaseClient(await originalConnect());
  (pool as unknown as { connect: unknown }).connect = (callback?: Callback) => {
    const promise = connectGuarded();
    if (typeof callback !== "function") return promise;
    promise.then(
      (client) => callback(null, client, () => client.release()),
      (error: unknown) => callback(error),
    );
    return undefined;
  };
  (pool as unknown as { query: unknown }).query = async (...args: unknown[]) => {
    const client = await connectGuarded();
    try {
      return await (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
    } finally {
      client.release();
    }
  };
  return pool;
}
