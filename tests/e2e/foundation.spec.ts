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

  const response = await page.goto("/");
  await page.waitForLoadState("networkidle");
  return { response, consoleErrors, pageErrors, externalRequests };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("başlangıç sayfası", () => {
  test("açılır, Türkçe içerik gösterir, hata ve harici istek üretmez", async ({ page }) => {
    const { response, consoleErrors, pageErrors, externalRequests } = await openHome(page);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("CS Global | Vize Danışmanlık Paneli");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vize Danışmanlık Yönetim Platformu" }),
    ).toBeVisible();
    await expect(page.getByText("CS Global", { exact: true })).toBeVisible();
    await expect(page.getByText("Platform altyapısı hazırlanıyor.")).toBeVisible();
    await expect(page.getByText(/güvenli platformda buluşacak/)).toBeVisible();

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
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
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
    });
  }
});

test("robots.txt tüm botları engeller", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/User-Agent: \*\s+Disallow: \//);
});
