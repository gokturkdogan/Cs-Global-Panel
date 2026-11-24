import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Next.js dışında çalışan CLI için yerel secret'lar .env.local'dan okunur (varsa).
// Mevcut ortam değişkenleri ezilmez. URL hiçbir yerde loglanmaz.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Yalnızca migration/yönetim bağlantısı (tablo sahibi rol, pooler olmayan uç nokta).
// `generate` ve `check` veritabanı bağlantısı gerektirmez.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
  strict: true,
  verbose: true,
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
});
