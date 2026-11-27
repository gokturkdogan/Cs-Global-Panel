import { expect, test, type Page } from "@playwright/test";

/** Sayfayı açar; konsol hatalarını, sayfa hatalarını ve harici istekleri toplar. */
async function openHome(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol !== "data:") {
      externalRequests.push(request.url());
    }
  });

  const response = await page.goto("/login");
  await page.waitForLoadState("networkidle");
  return { response, consoleErrors, pageErrors, externalRequests };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("giriş ekranı (ortak temel)", () => {
  test("kök adres giriş ekranına yönlendirir", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("açılır, Türkçe içerik gösterir, hata ve harici istek üretmez", async ({ page }) => {
    const { response, consoleErrors, pageErrors, externalRequests } = await openHome(page);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Personel Girişi | CS Global");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(page.getByRole("heading", { level: 1, name: "Personel Girişi" })).toBeVisible();
    await expect(page.getByText("CS Global", { exact: true })).toBeVisible();
    await expect(page.getByText("Vize Danışmanlık Yönetim Platformu")).toBeVisible();
    await expect(page.getByText("Kullanıcı adınız ve şifrenizle giriş yapın.")).toBeVisible();

    // CSP ihlalleri dahil konsol hatası yok.
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("yerel Geist fontu yüklenir", async ({ page }) => {
    await openHome(page);
    const fontFamily = await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(fontFamily).toMatch(/Geist/i);

    const loadedGeist = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(
        (font) => /Geist/i.test(font.family) && font.status === "loaded",
      );
    });
    expect(loadedGeist).toBe(true);
  });

  test("işletim sistemi koyu tema tercihinde açık tema kalır", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openHome(page);
    const background = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    expect(background).toBe("rgb(248, 250, 252)");
  });

  test("mevcut cihaz görünümünde yatay taşma yoktur", async ({ page }) => {
    await openHome(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("güvenlik header'ları gönderilir", async ({ page }) => {
    const { response } = await openHome(page);
    const headers = response?.headers() ?? {};

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    // PHASE 11 (D-136): görüntüleyici worker'ı yalnızca aynı köken; joker/blob/wasm izni yok.
    expect(csp).toContain("worker-src 'self';");
    expect(csp).not.toMatch(/worker-src[^;]*(\*|blob:|data:)/);
    expect(csp).not.toContain("wasm-unsafe-eval");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("responsive genişlikler", () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Desktop Chrome'da çalışır",
  );

  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    test(`${width}px genişlikte yatay taşma yoktur`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openHome(page);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeInViewport();
    });
  }
});

test("robots.txt tüm botları engeller", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/User-Agent: \*\s+Disallow: \//);
});
