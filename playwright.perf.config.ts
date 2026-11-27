import { defineConfig, devices } from "@playwright/test";

/**
 * PHASE 11 performans ölçümleri (D-134). YALNIZCA izole geçici veritabanı + yerel private depolama
 * (`pnpm perf:isolated`); gerçek Neon/B2 kullanılmaz. Ölçüm production build (`next build` + `next start`)
 * üzerinde, tek worker ile (ölçümler birbirini etkilemesin) yapılır. Sonuçlar `perf-results/`
 * altına JSON olarak yazılır (gitignore). Trace kapalı (D-067).
 */
const PORT = 3300;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/perf",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 15 * 60_000,
  use: { baseURL, trace: "off", actionTimeout: 30_000, navigationTimeout: 60_000 },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1", APP_ENV: "development", APP_URL: baseURL },
  },
});
