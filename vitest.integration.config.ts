import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration testleri gerçek PostgreSQL ister: projenin tek veritabanı (.env.local — D-059).
// Testler yalnızca kendi sentetik kayıtlarını oluşturur ve siler. Mevcut değişkenler ezilmez.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const isolated = process.env.ISOLATED_TEST_DB === "1";
const NEON_SAFE_FILES = ["auth", "dashboard", "privileges", "services"];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Ortak veritabanında (neondb) yalnızca salt okunur veya tamamen geri alınan test dosyaları
    // çalışır; commit eden testler (sentetik başvuru/dosya/token, eşzamanlılık, silme, başvuru
    // yönetimi) yalnızca izole geçici veritabanında (`pnpm test:integration:isolated`, D-077/D-086).
    include: isolated
      ? ["tests/integration/**/*.test.ts"]
      : NEON_SAFE_FILES.map((name) => `tests/integration/${name}.test.ts`),
    globalSetup: ["tests/integration/global-setup.ts"],
    // Dosyalar aynı veritabanını paylaşır; sırayla çalışır.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
