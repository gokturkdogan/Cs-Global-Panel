import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E testleri production build (`next build` + `next start`) üzerinde çalışır.
 * Mobil projeler tarayıcı emülasyonudur; gerçek cihaz testi yerine geçmez.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // Trace kapalı: trace dosyaları istek header'larını (oturum cookie'si dahil) diske yazar (D-067).
    trace: "off",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 15"] } },
    { name: "Desktop WebKit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // Better Auth'un güvenilen origin'i test sunucusunun adresiyle eşleşmeli.
    env: { NEXT_TELEMETRY_DISABLED: "1", APP_ENV: "development", APP_URL: baseURL },
  },
});
