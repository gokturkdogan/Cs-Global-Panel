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
export default async function setup(): Promise<() => Promise<void>> {
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
  return teardown;
}

/**
 * Güvenlik ağı: yarıda kalan testlerden geriye geçici (`test-` önekli) hesap ve bunlara bağlı
 * kayıt kalmasın. Gerçek hesaplara ve onların kayıtlarına dokunulmaz. Audit kayıtları silinmez.
 */
async function teardown(): Promise<void> {
  const { owner } = resolveDatabaseUrls();
  const client = await connect(owner, "cs-global-test-teardown");
  try {
    await client.query("DELETE FROM applications WHERE created_by_user_id LIKE 'test-%'");
    await client.query(
      "DELETE FROM service_document_requirements WHERE service_id IN (SELECT id FROM services WHERE created_by_user_id LIKE 'test-%')",
    );
    await client.query("DELETE FROM services WHERE created_by_user_id LIKE 'test-%'");
    await client.query("DELETE FROM users WHERE id LIKE 'test-%'");
  } finally {
    await client.end();
  }
}
