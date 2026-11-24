/**
 * Veritabanı bağlantı ayarları ve adres doğrulama (D-054, D-055, D-059: tek veritabanı).
 *
 * Bu dosya saf TypeScript'tir ve `server-only` içermez: Next.js runtime'ı, Node ile
 * doğrudan çalışan `scripts/db/*` komutları ve testler aynı kuralları kullanır.
 * Secret içermez. Hata mesajları bağlantı adresinin hiçbir parçasını içermez.
 */

/** Uygulamanın çalışma zamanında kullandığı en az yetkili rol (db:init oluşturur). */
export const RUNTIME_ROLE = "cs_app_runtime";

/** pg Pool ayarları — gerekçe: docs/ARCHITECTURE.md §12.1. */
export const POOL_OPTIONS = {
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class DatabaseConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, problem: string) {
    super(`${variable}: ${problem}`);
    this.name = "DatabaseConfigError";
    this.variable = variable;
  }
}

export type ParsedDatabaseUrl = {
  readonly connectionString: string;
  readonly host: string;
  readonly database: string;
  readonly user: string;
  readonly isLocal: boolean;
};

type ParseOptions = {
  /** Bağlantının bu rol ile yapılması zorunludur (ör. runtime için `cs_app_runtime`). */
  readonly expectedUser?: string;
  /** Yerel (localhost) veritabanına izin verilir mi? */
  readonly allowLocal: boolean;
};

/**
 * PostgreSQL bağlantı adresini doğrular. Uzak sunucularda `sslmode=verify-full` zorunludur
 * (sunucu sertifikası ve ana makine adı doğrulanır — Neon önerisi).
 */
export function parseDatabaseUrl(
  value: string | undefined,
  variable: string,
  options: ParseOptions,
): ParsedDatabaseUrl {
  if (value === undefined || value.trim() === "") {
    throw new DatabaseConfigError(variable, "tanımlı değil");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new DatabaseConfigError(variable, "geçerli bir bağlantı adresi değil");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DatabaseConfigError(variable, "postgresql:// ile başlamalı");
  }

  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(url.username);

  if (host === "" || database === "" || database.includes("/")) {
    throw new DatabaseConfigError(variable, "sunucu ve veritabanı adı içermeli");
  }
  if (user === "" || url.password === "") {
    throw new DatabaseConfigError(variable, "kullanıcı adı ve şifre içermeli");
  }

  const isLocal = LOCAL_HOSTS.has(host);
  if (isLocal && !options.allowLocal) {
    throw new DatabaseConfigError(variable, "bu ortamda yerel veritabanı kullanılamaz");
  }
  if (!isLocal && url.searchParams.get("sslmode") !== "verify-full") {
    throw new DatabaseConfigError(variable, "uzak bağlantılarda sslmode=verify-full zorunlu");
  }
  if (options.expectedUser !== undefined && user !== options.expectedUser) {
    throw new DatabaseConfigError(variable, `bağlantı ${options.expectedUser} rolüyle yapılmalı`);
  }

  return { connectionString: url.toString(), host, database, user, isLocal };
}
