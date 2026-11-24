/**
 * pnpm db:verify
 *
 * Salt okunur bağlantı doğrulaması: hiçbir veri yazmaz, değiştirmez. Bağlantı adresi, şifre
 * veya tablo içeriği yazdırılmaz; yalnızca ad, sürüm, rol öznitelikleri ve sayılar raporlanır.
 */
import type pg from "pg";

import { EXPECTED_TABLES } from "./expected-tables.ts";
import { connect, describeTls, loadLocalEnv, resolveDatabaseUrls, runCli } from "./lib.ts";
import { countAppliedMigrations } from "./migrations.ts";
import { RUNTIME_ROLE } from "../../src/server/db/settings.ts";

async function describeConnection(client: pg.Client, label: string): Promise<void> {
  const info = await client.query<{ database: string; user: string; version: string }>(
    "SELECT current_database() AS database, current_user AS user, current_setting('server_version') AS version",
  );
  const row = info.rows[0];
  const tls = describeTls(client);
  console.log(
    `[${label}] veritabanı=${row?.database} rol=${row?.user} PostgreSQL=${row?.version} ` +
      `TLS=${tls.encrypted ? `evet (${tls.protocol}, sertifika doğrulandı=${tls.verified})` : "HAYIR"}`,
  );
}

await runCli("db:verify", async () => {
  loadLocalEnv();
  const urls = resolveDatabaseUrls();
  console.log(
    `sunucu türü: ${urls.owner.isLocal ? "yerel" : "uzak"} · pooled runtime: ${urls.runtime.host.includes("-pooler") ? "evet" : "hayır"}`,
  );

  const owner = await connect(urls.owner, "cs-global-db-verify");
  try {
    await describeConnection(owner, "yönetim");

    const role = await owner.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
      rolreplication: boolean;
      rolcanlogin: boolean;
    }>(
      "SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin FROM pg_roles WHERE rolname = $1",
      [RUNTIME_ROLE],
    );
    const runtimeRole = role.rows[0];
    console.log(
      runtimeRole === undefined
        ? `Runtime rolü ${RUNTIME_ROLE}: yok (pnpm db:init ile oluşturulur)`
        : `Runtime rolü ${RUNTIME_ROLE}: login=${runtimeRole.rolcanlogin} superuser=${runtimeRole.rolsuper} createrole=${runtimeRole.rolcreaterole} createdb=${runtimeRole.rolcreatedb} bypassrls=${runtimeRole.rolbypassrls} replication=${runtimeRole.rolreplication}`,
    );

    const ext = await owner.query<{ name: string; installed: string | null }>(
      "SELECT name, installed_version AS installed FROM pg_available_extensions WHERE name = 'pg_trgm'",
    );
    console.log(
      `pg_trgm: ${ext.rows[0] === undefined ? "desteklenmiyor" : `destekleniyor, kurulu=${ext.rows[0].installed ?? "hayır"}`}`,
    );

    const tables = await owner.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const names = tables.rows.map((row) => row.name);
    const unexpected = names.filter((name) => !EXPECTED_TABLES.includes(name));
    console.log(
      `public tabloları: ${names.length} (beklenen ${EXPECTED_TABLES.length}); projeye ait olmayan: ${unexpected.length === 0 ? "yok" : unexpected.join(", ")}`,
    );
    console.log(`Uygulanmış migration: ${await countAppliedMigrations(owner)}`);
  } finally {
    await owner.end();
  }

  try {
    const runtime = await connect(urls.runtime, "cs-global-db-verify-runtime");
    try {
      await describeConnection(runtime, "runtime");
    } finally {
      await runtime.end();
    }
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.log(
      `[runtime] bağlantı kurulamadı${typeof code === "string" ? ` (kod ${code})` : ""} — db:init çalıştırıldı mı?`,
    );
  }
});
