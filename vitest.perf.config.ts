import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * PHASE 11 veritabanı sorgu analizi (D-134). YALNIZCA izole geçici veritabanı: `pnpm perf:db:isolated`.
 * Normal test kapılarına dahil değildir (ölçüm aracıdır).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/perf/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
