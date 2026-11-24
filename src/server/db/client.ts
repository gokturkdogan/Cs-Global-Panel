import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseEnv } from "@/server/env";

import * as schema from "./schema";
import { POOL_OPTIONS } from "./settings";

/**
 * Veritabanı istemcisi (ARCHITECTURE §12.1).
 *
 * - Lazy: modül import edildiğinde bağlantı açılmaz; ilk `getDb()` çağrısında tek bir Pool kurulur.
 * - Süreç başına tek Pool; development'ta hot reload'da yeniden kullanılır (globalThis).
 * - Sorgu ve kilit zaman aşımları runtime rolüne veritabanında tanımlıdır (`pnpm db:init`),
 *   çünkü Neon pooler (PgBouncer, transaction modu) oturum düzeyindeki SET'i korumaz.
 * - Hata loglarında bağlantı adresi, kullanıcı adı, şifre veya sorgu parametresi yer almaz.
 */

export type Database = NodePgDatabase<typeof schema>;

type DatabaseState = { readonly pool: Pool; readonly db: Database };

const globalForDb = globalThis as typeof globalThis & { __csGlobalDatabase?: DatabaseState };

/** Verilen bağlantı adresiyle Pool + Drizzle örneği oluşturur (testler ve runtime ortak). */
export function createDatabase(connectionString: string): DatabaseState {
  const pool = new Pool({ connectionString, ...POOL_OPTIONS, application_name: "cs-global" });
  pool.on("error", (error: Error & { code?: string }) => {
    // Boştaki bir bağlantı koptuğunda süreç çökmesin; yalnızca hata kodu loglanır.
    console.error("[db] Boştaki veritabanı bağlantısında hata", { code: error.code ?? "unknown" });
  });
  return { pool, db: drizzle({ client: pool, schema }) };
}

/** Uygulamanın paylaşılan veritabanı örneği. */
export function getDb(): Database {
  globalForDb.__csGlobalDatabase ??= createDatabase(getDatabaseEnv().databaseUrl);
  return globalForDb.__csGlobalDatabase.db;
}
