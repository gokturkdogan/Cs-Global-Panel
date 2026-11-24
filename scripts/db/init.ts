/**
 * pnpm db:init
 *
 * Veritabanını ilk kez hazırlar (migration'dan önce; tekrar çalıştırılabilir):
 * 1. Bağlanılan veritabanının DATABASE_URL_UNPOOLED'daki veritabanı olduğunu ve bu projeye ait
 *    olmayan tablo içermediğini doğrular (varsa hiçbir şey yazmadan durur).
 * 2. En az yetkili runtime rolünü (`cs_app_runtime`) oluşturur veya şifresini DATABASE_URL'deki
 *    değerle eşitler; rol düzeyinde sorgu/kilit zaman aşımlarını tanımlar.
 * Tablo yetkileri migration'dadır (0002). Şifre hiçbir yere yazdırılmaz.
 */
import { EXPECTED_TABLES } from "./expected-tables.ts";
import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "./lib.ts";
import { RUNTIME_ROLE } from "../../src/server/db/settings.ts";

/** Rol düzeyinde zaman aşımları (Neon pooler oturum SET'ini korumadığı için rol düzeyinde). */
const RUNTIME_ROLE_SETTINGS = {
  statement_timeout: "15s",
  lock_timeout: "5s",
  idle_in_transaction_session_timeout: "15s",
} as const;

await runCli("db:init", async () => {
  loadLocalEnv();
  const urls = resolveDatabaseUrls();
  const runtimePassword = decodeURIComponent(new URL(urls.runtime.connectionString).password);

  const client = await connect(urls.owner, "cs-global-db-init");
  try {
    const db = await client.query<{ name: string }>("SELECT current_database() AS name");
    const databaseName = db.rows[0]?.name;
    if (databaseName === undefined || databaseName !== urls.owner.database) {
      throw new Error("Bağlanılan veritabanı beklenen veritabanı değil.");
    }

    // Başka bir projeye ait tablolar varsa dokunma.
    const tables = await client.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const unexpected = tables.rows
      .map((row) => row.name)
      .filter((name) => !EXPECTED_TABLES.includes(name));
    if (unexpected.length > 0) {
      throw new Error(
        `public şemasında bu projeye ait olmayan ${unexpected.length} tablo var: ${unexpected.join(", ")}. İşlem durduruldu.`,
      );
    }

    // PUBLIC'in geçici tablo oluşturma yetkisi kaldırılır (en az yetki).
    await client.query(
      `REVOKE TEMPORARY ON DATABASE ${client.escapeIdentifier(databaseName)} FROM PUBLIC`,
    );

    const role = client.escapeIdentifier(RUNTIME_ROLE);
    const password = client.escapeLiteral(runtimePassword);
    // SUPERUSER/REPLICATION/BYPASSRLS varsayılan olarak kapalıdır; bunları belirtmek (NO… dahil)
    // PostgreSQL 16+'ta süper kullanıcı ister. Kapalı oldukları aşağıda doğrulanır.
    const attributes = "LOGIN NOCREATEDB NOCREATEROLE NOINHERIT";
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [RUNTIME_ROLE]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE ROLE ${role} WITH ${attributes} PASSWORD ${password}`);
      console.log(`Runtime rolü "${RUNTIME_ROLE}" oluşturuldu.`);
    } else {
      await client.query(`ALTER ROLE ${role} WITH ${attributes} PASSWORD ${password}`);
      console.log(`Runtime rolü "${RUNTIME_ROLE}" mevcut; öznitelikleri ve şifresi eşitlendi.`);
    }
    for (const [setting, value] of Object.entries(RUNTIME_ROLE_SETTINGS)) {
      await client.query(`ALTER ROLE ${role} SET ${setting} = ${client.escapeLiteral(value)}`);
    }

    const attrs = await client.query<{ unsafe: boolean }>(
      "SELECT (rolsuper OR rolreplication OR rolbypassrls OR rolcreatedb OR rolcreaterole) AS unsafe FROM pg_roles WHERE rolname = $1",
      [RUNTIME_ROLE],
    );
    if (attrs.rows[0]?.unsafe !== false) {
      throw new Error(
        `"${RUNTIME_ROLE}" yüksek yetkili bir özniteliğe sahip; en az yetkiye aykırı.`,
      );
    }
    const memberships = await client.query(
      "SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1",
      [RUNTIME_ROLE],
    );
    if ((memberships.rowCount ?? 0) > 0) {
      throw new Error(`"${RUNTIME_ROLE}" başka rollerin üyesi; en az yetki ilkesine aykırı.`);
    }
    console.log("Tamamlandı. Sonraki adım: pnpm db:migrate");
  } finally {
    await client.end();
  }
});
