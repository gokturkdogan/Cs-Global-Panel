import { readFileSync } from "node:fs";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME_ROLE } from "@/server/db/settings";
import { EXPECTED_TABLES } from "../../scripts/db/expected-tables";
import { describeTls } from "../../scripts/db/lib";
import { connectOwner, connectRuntime, expectPgError, urls } from "./helpers";

type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

/**
 * Runtime rolünün beklenen tablo yetkileri (migration 0002; PHASE 12.1 migration 0011 — D-144: personel
 * hesap/credential tabloları ve verifications yalnızca okunur). TRUNCATE/REFERENCES/TRIGGER hiçbirinde yok.
 */
const EXPECTED_PRIVILEGES: Record<string, Privilege[]> = {
  users: ["SELECT"],
  sessions: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  accounts: ["SELECT"],
  verifications: ["SELECT"],
  services: ["SELECT", "INSERT", "UPDATE"],
  service_document_requirements: ["SELECT", "INSERT", "UPDATE"],
  application_number_counters: ["SELECT", "INSERT", "UPDATE"],
  applications: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  application_document_requirements: ["SELECT", "INSERT", "UPDATE"],
  application_document_files: ["SELECT", "INSERT", "UPDATE"],
  application_access_tokens: ["SELECT", "INSERT", "UPDATE"],
  document_reviews: ["SELECT", "INSERT"],
  document_comments: ["SELECT", "INSERT"],
  application_internal_notes: ["SELECT", "INSERT"],
  application_status_history: ["SELECT", "INSERT"],
  audit_logs: ["SELECT", "INSERT"],
  rate_limit_buckets: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  // PHASE 08: tek satırlık kota kilidi/mutabakat durumu — ekleme/silme yok.
  storage_quota_state: ["SELECT", "UPDATE"],
  // PHASE 10 (D-116): silme işlemi + envanter — DELETE yok (yalnızca başvuruyla CASCADE).
  application_deletions: ["SELECT", "INSERT", "UPDATE"],
  application_deletion_objects: ["SELECT", "INSERT", "UPDATE"],
  // PHASE 10.1 (D-121): yazım girişimleri — DELETE yok.
  storage_write_attempts: ["SELECT", "INSERT", "UPDATE"],
};
const ALL_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

let runtime: pg.Client;
let owner: pg.Client;

beforeAll(async () => {
  runtime = await connectRuntime();
  owner = await connectOwner();
});
afterAll(async () => {
  await runtime.end();
  await owner.end();
});

describe("bağlantı", () => {
  it("veritabanına doğrulanmış TLS ile, beklenen rollerle bağlanır", async () => {
    const result = await runtime.query<{ db: string; user: string; major: number }>(
      `SELECT current_database() AS db, current_user AS user,
              current_setting('server_version_num')::int / 10000 AS major`,
    );
    const row = result.rows[0]!;
    expect(row.db).toBe(urls.runtime.database);
    expect(row.user).toBe(RUNTIME_ROLE);
    expect(row.major).toBeGreaterThanOrEqual(16);
    if (!urls.runtime.isLocal) {
      // Neon'da TLS proxy'de sonlanır; sunucu tarafı pg_stat_ssl değil istemci soketi denetlenir.
      for (const client of [runtime, owner]) {
        expect(describeTls(client)).toMatchObject({ encrypted: true, verified: true });
      }
    }
  });

  it("rol düzeyindeki zaman aşımları pooled bağlantıda geçerlidir", async () => {
    const result = await runtime.query<{ statement: string; lock: string; idle: string }>(
      `SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
              current_setting('idle_in_transaction_session_timeout') AS idle`,
    );
    expect(result.rows[0]).toEqual({ statement: "15s", lock: "5s", idle: "15s" });
  });

  it("şema: 17 tablo, pg_trgm kurulu, tüm migration'lar uygulanmış", async () => {
    const tables = await owner.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    expect(tables.rows.map((row) => row.name).sort()).toEqual([...EXPECTED_TABLES].sort());
    const ext = await owner.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
    expect(ext.rowCount).toBe(1);
    const journal = JSON.parse(
      readFileSync("src/server/db/migrations/meta/_journal.json", "utf8"),
    ) as { entries: unknown[] };
    const applied = await owner.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    );
    expect(applied.rows[0]!.count).toBe(journal.entries.length);
  });

  it("tüm zaman kolonları timestamptz'dir (INV-17)", async () => {
    const result = await owner.query<{ column: string; type: string }>(
      `SELECT table_name || '.' || column_name AS column, data_type AS type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND (column_name LIKE '%\\_at' OR column_name = 'ban_expires')`,
    );
    expect(result.rows.length).toBeGreaterThan(20);
    for (const row of result.rows)
      expect(row, row.column).toMatchObject({ type: "timestamp with time zone" });
  });
});

describe("runtime rolü — en az yetki (D-054)", () => {
  it("süper kullanıcı değildir, rol/veritabanı oluşturamaz, RLS'i atlayamaz, başka role üye değildir", async () => {
    const role = await owner.query(
      `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit
         FROM pg_roles WHERE rolname = $1`,
      [RUNTIME_ROLE],
    );
    expect(role.rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
      rolreplication: false,
      rolinherit: false,
    });
    const memberships = await owner.query(
      "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1",
      [RUNTIME_ROLE],
    );
    expect(memberships.rowCount).toBe(0);
  });

  it("hiçbir tablonun, fonksiyonun veya şemanın sahibi değildir", async () => {
    const owned = await owner.query(
      `SELECT 1 FROM pg_class c WHERE c.relowner = (SELECT oid FROM pg_roles WHERE rolname = $1)
       UNION ALL SELECT 1 FROM pg_proc p WHERE p.proowner = (SELECT oid FROM pg_roles WHERE rolname = $1)
       UNION ALL SELECT 1 FROM pg_namespace n WHERE n.nspowner = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
      [RUNTIME_ROLE],
    );
    expect(owned.rowCount).toBe(0);
  });

  it("her tabloda yalnızca beklenen yetkilere sahiptir; yetkisiz yeni tablo kalmaz", async () => {
    // Tek sorgu (tablo × yetki): yüksek ağ gecikmesinde test süresini sınırlar; denetim aynıdır.
    const result = await owner.query<{ tbl: string; privilege: string; has: boolean }>(
      `SELECT t AS tbl, p AS privilege, has_table_privilege($1, 'public.' || t, p) AS has
       FROM unnest($2::text[]) AS t CROSS JOIN unnest($3::text[]) AS p`,
      [RUNTIME_ROLE, [...EXPECTED_TABLES], [...ALL_PRIVILEGES]],
    );
    for (const table of EXPECTED_TABLES) {
      const expected = EXPECTED_PRIVILEGES[table];
      expect(expected, `${table} için beklenen yetki tanımı yok`).toBeDefined();
      for (const privilege of ALL_PRIVILEGES) {
        const row = result.rows.find((item) => item.tbl === table && item.privilege === privilege);
        expect(row?.has, `${table} ${privilege}`).toBe((expected as string[]).includes(privilege));
      }
    }
  });

  it.each([
    ["tablo oluşturamaz", "CREATE TABLE public.intruder (id int)", "42501"],
    ["tablo silemez", "DROP TABLE services", "42501"],
    ["tablo değiştiremez", "ALTER TABLE services ADD COLUMN intruder int", "42501"],
    ["TRUNCATE yapamaz", "TRUNCATE rate_limit_buckets", "42501"],
    ["audit kaydını güncelleyemez", "UPDATE audit_logs SET action = 'TAMPERED'", "42501"],
    ["audit kaydını silemez", "DELETE FROM audit_logs", "42501"],
    ["audit trigger'ını kapatamaz", "ALTER TABLE audit_logs DISABLE TRIGGER ALL", "42501"],
    ["migration kayıtlarını okuyamaz", "SELECT * FROM drizzle.__drizzle_migrations", "42501"],
    ["hizmet silemez (BR-22)", "DELETE FROM services WHERE false", "42501"],
    [
      "değiştirilemez inceleme kaydını güncelleyemez",
      "UPDATE document_reviews SET decision = 'APPROVED' WHERE false",
      "42501",
    ],
    ["geçici tablo oluşturamaz", "CREATE TEMP TABLE intruder (id int)", "42501"],
    // PHASE 12.1 (D-144): personel hesabı/credential'ı çalışma zamanı rolüyle oluşturulamaz/değiştirilemez.
    [
      "personel hesabı oluşturamaz",
      "INSERT INTO users (id, name, email, username, role) VALUES ('x', 'x', 'x@staff.invalid', 'x', 'employee')",
      "42501",
    ],
    ["personel hesabını değiştiremez", "UPDATE users SET username = username WHERE false", "42501"],
    ["personel rolünü değiştiremez", "UPDATE users SET role = role WHERE false", "42501"],
    [
      "credential kaydı oluşturamaz",
      "INSERT INTO accounts (id, account_id, provider_id, user_id, password) VALUES ('x', 'x', 'credential', 'x', 'x')",
      "42501",
    ],
    ["şifre hash'ini değiştiremez", "UPDATE accounts SET password = password WHERE false", "42501"],
    ["personel hesabını silemez", "DELETE FROM users WHERE false", "42501"],
    ["credential kaydını silemez", "DELETE FROM accounts WHERE false", "42501"],
    [
      "doğrulama kaydı yazamaz",
      "INSERT INTO verifications (id, identifier, value, expires_at) VALUES ('x', 'x', 'x', now())",
      "42501",
    ],
    ["rol özniteliğini değiştiremez", "ALTER ROLE cs_app_runtime CREATEROLE", "42501"],
  ])("%s", async (_label, statement, code) => {
    await expectPgError(runtime.query(statement), code);
  });

  it("D-144: kendine yetki veremez — GRANT etkisizdir (PostgreSQL uyarı verir, yetki eklenmez)", async () => {
    await runtime
      .query("GRANT INSERT, UPDATE ON users, accounts TO cs_app_runtime")
      .catch(() => undefined);
    const rows = await runtime.query<{ t: string; p: string; has: boolean }>(
      `SELECT t, p, has_table_privilege('cs_app_runtime', t, p) AS has
         FROM unnest(ARRAY['users', 'accounts']) t, unnest(ARRAY['INSERT', 'UPDATE']) p`,
    );
    expect(rows.rows.every((row) => !row.has)).toBe(true);
  });

  it("audit kaydı ekleyebilir ve okuyabilir (geri alınan transaction — kalıcı test kaydı yok)", async () => {
    await runtime.query("BEGIN");
    try {
      const inserted = await runtime.query<{ id: string }>(
        `INSERT INTO audit_logs (action, actor_type, resource_type, metadata)
         VALUES ('TEST_EVENT', 'SYSTEM', 'session', '{"count": 1}') RETURNING id`,
      );
      expect(inserted.rows[0]!.id).toBeDefined();
      const read = await runtime.query("SELECT 1 FROM audit_logs WHERE id = $1", [
        inserted.rows[0]!.id,
      ]);
      expect(read.rowCount).toBe(1);
    } finally {
      await runtime.query("ROLLBACK");
    }
  });
});

describe("audit_logs değiştirilemezliği (INV-13)", () => {
  it("tablo sahibi rol için de UPDATE/DELETE/TRUNCATE trigger ile engellenir (geri alınan transaction — kalıcı test kaydı yok)", async () => {
    // Satır düzeyi trigger'ın tetiklenmesi için en az bir kayıt gerekir; kayıt yalnızca bu transaction'da
    // vardır ve ROLLBACK ile kaybolur (ortak veritabanına kalıcı yazım yok — D-086).
    await owner.query("BEGIN");
    try {
      await owner.query(
        "INSERT INTO audit_logs (action, actor_type, resource_type, metadata) VALUES ('TEST_EVENT', 'SYSTEM', 'session', '{}'::jsonb)",
      );
      const rejects = async (statement: string) => {
        await owner.query("SAVEPOINT attempt");
        await expect(owner.query(statement)).rejects.toThrow(/yalnızca eklemeye açıktır/);
        await owner.query("ROLLBACK TO SAVEPOINT attempt");
      };
      await expect(
        owner.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE false"),
      ).resolves.toBeDefined();
      await rejects("UPDATE audit_logs SET action = 'TAMPERED'");
      await rejects("DELETE FROM audit_logs");
      await rejects("TRUNCATE audit_logs");
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it.each([
    ["e-posta", '{"email": "a@example.invalid"}'],
    ["telefon", '{"phone": "+905550000001"}'],
    ["token", '{"token": "x"}'],
    ["IP", '{"ip": "192.0.2.1"}'],
    ["dizi", "[]"],
  ])("izinli olmayan metadata reddedilir: %s", async (_label, metadata) => {
    await expectPgError(
      runtime.query(
        "INSERT INTO audit_logs (action, actor_type, resource_type, metadata) VALUES ('TEST_EVENT', 'SYSTEM', 'session', $1::jsonb)",
        [metadata],
      ),
      "23514",
    );
  });
});
