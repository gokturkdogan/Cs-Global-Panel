import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import {
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
} from "../../scripts/db/migrations";

/**
 * Integration testleri projenin tek veritabanında çalışır (D-059). Bekleyen migration'lar uygulanır;
 * testler yalnızca kendi oluşturdukları sentetik kayıtları siler.
 */
export default async function setup(): Promise<void> {
  const { owner } = resolveDatabaseUrls();
  const client = await connect(owner, "cs-global-test-setup");
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    await client.end();
  }
}
