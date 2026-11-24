/**
 * pnpm db:migrate
 *
 * Bekleyen migration'ları migration/yönetim rolüyle (DATABASE_URL_UNPOOLED, pooler olmayan uç nokta)
 * tek transaction'da uygular. Uygulanmış migration'lar yeniden uygulanmaz
 * (drizzle.__drizzle_migrations). Önce `pnpm db:init` çalıştırılmış olmalıdır.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "./lib.ts";
import {
  countAppliedMigrations,
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
} from "./migrations.ts";

await runCli("db:migrate", async () => {
  loadLocalEnv();
  const { owner } = resolveDatabaseUrls();

  const client = await connect(owner, "cs-global-db-migrate");
  try {
    const before = await countAppliedMigrations(client);
    await migrate(drizzle({ client }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
    const after = await countAppliedMigrations(client);
    console.log(`Migration tamamlandı: ${after - before} yeni, toplam ${after} uygulanmış.`);
  } finally {
    await client.end();
  }
});
