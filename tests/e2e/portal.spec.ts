import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { Page, TestInfo } from "@playwright/test";
import type pg from "pg";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import {
  CUSTOMER_COOKIE,
  insertToken,
  seedApplication,
  signCustomerSession,
} from "../support/portal-seed";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * Müşteri portalı (PHASE 07). Salt okunur testler (geçersiz bağlantı, başlıklar) her ortamda; geçerli
 * bağlantı/oturum/iptal/çoklu sekme testleri YALNIZCA izole veritabanında (sentetik veri, test
 * token'ları). Token ve cookie değerleri yalnızca bellekte; trace kapalı; ekran görüntülerinde token yok.
 */

const isolated = isIsolatedTestDatabase();

function watch(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (!["localhost", "127.0.0.1"].includes(host)) external.push(host);
  });
  return { errors, external };
}

async function shot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {},
) {
  if (
    process.env.E2E_SCREENSHOTS !== "1" ||
    !isolated ||
    testInfo.project.name !== "Desktop Chrome"
  )
    return;
  mkdirSync("screenshots/phase-07", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: `screenshots/phase-07/${name}.png`,
    fullPage: options.fullPage ?? true,
  });
}

const portalUrl = /\/portal\/[A-Za-z0-9_-]{22}$/;

test.describe("müşteri bağlantısı — geçersiz girişler (her ortam, salt okunur)", () => {
  for (const [name, path] of [
    ["biçimsiz", "/b/gecersiz-baglanti"],
    ["aşırı uzun", `/b/${"A".repeat(400)}`],
    ["bilinmeyen kanonik token", `/b/${randomBytes(32).toString("base64url")}`],
    ["kodlanmış özel karakter", "/b/%2e%2e%2f%2e%2e%2fetc"],
  ] as const) {
    test(`${name} → 303 /link-invalid; no-store, no-referrer, noindex; cookie yok`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      expect(new URL(response.headers().location!, "http://x").pathname).toBe("/link-invalid");
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      expect(response.headers()["set-cookie"] ?? "").not.toContain(CUSTOMER_COOKIE);
    });
  }

  test("geçersiz bağlantı ekranı: genel mesaj, müşteri verisi yok, CSP, harici istek ve konsol hatası yok", async ({
    page,
  }, testInfo) => {
    const { errors, external } = watch(page);
    const response = await page.goto("/link-invalid");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response?.headers()["content-security-policy"]).toMatch(/'nonce-/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Bu bağlantı geçersiz veya kullanım dışı olabilir. Lütfen CS Global ile iletişime geçiniz.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Telefonla ara" })).toBeDisabled(); // iletişim bilgisi tanımlı değil
    await expect(page.getByText("İletişim bilgisi yakında eklenecek.")).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0); // personel menüsü yok
    await shot(page, testInfo, "invalid-link");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test("bağlamsız /portal ve rastgele bağlam: hiçbir oturuma yönlendirmez, veri göstermez", async ({
    page,
  }) => {
    await page.goto("/portal");
    await expect(
      page.getByRole("heading", { level: 1, name: "Oturumunuz sona erdi" }),
    ).toBeVisible();
    await page.goto(`/portal/${randomBytes(16).toString("base64url")}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();
  });
});

test.describe("müşteri portalı (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  let userId: string;
  test.beforeEach(async ({ runtimeDb }) => {
    userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1"))
      .rows[0]!.id;
  });

  const dbState = async (db: pg.Client, applicationId: string) =>
    (
      await db.query(
        `SELECT a.status, a.version, a.updated_at, (SELECT array_agg(t.revoked_at ORDER BY t.created_at) FROM application_access_tokens t WHERE t.application_id = a.id) AS tokens,
              (SELECT array_agg(r.status ORDER BY r.sort_order) FROM application_document_requirements r WHERE r.application_id = a.id) AS docs,
              (SELECT count(*)::int FROM audit_logs WHERE application_id = a.id) AS audits
       FROM applications a WHERE a.id = $1`,
        [applicationId],
      )
    ).rows[0];

  test("geçerli bağlantı: 303 + güvenli cookie → token'sız portal; gerçek veri; GET hiçbir şeyi değiştirmez; sızıntı yok", async ({
    page,
    context,
    runtimeDb,
    request,
  }, testInfo) => {
    const app = await seedApplication(runtimeDb, userId, {
      documents: [
        {
          title: "Pasaport",
          instructions: "Fotoğraflı sayfayı okunaklı PDF olarak yükleyiniz.\nİkinci satır.",
        },
        { title: "Fotoğraf", required: false },
        {
          title: "Banka Dökümü",
          instructions: '<img src=x onerror=alert(1)><script>alert("x")</script>',
        },
      ],
    });
    const before = await dbState(runtimeDb, app.applicationId);

    // Doğrudan istek: yönlendirme ve cookie öznitelikleri (değer yazdırılmaz).
    const entry = await request.get(`/b/${app.token}`, { maxRedirects: 0 });
    expect(entry.status()).toBe(303);
    const location = entry.headers().location!;
    expect(location).toMatch(portalUrl);
    expect(location).not.toContain(app.token);
    expect(entry.headers()["cache-control"]).toContain("no-store");
    expect(entry.headers()["referrer-policy"]).toBe("no-referrer");
    const setCookie = entry.headers()["set-cookie"] ?? "";
    expect(setCookie).toMatch(new RegExp(`^${CUSTOMER_COOKIE}=`));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=604800/);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(setCookie).not.toContain(app.token);

    const { errors, external } = watch(page);
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    const response = await page.goto(`/b/${app.token}`);
    await expect(page).toHaveURL(portalUrl);
    expect(page.url()).not.toContain(app.token);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");

    await expect(
      page.getByRole("heading", { level: 1, name: `Merhaba, ${app.firstName} ${app.lastName}` }),
    ).toBeVisible();
    const summary = page.getByTestId("portal-summary");
    await expect(summary).toContainText(app.number);
    await expect(summary).toContainText(app.serviceName);
    await expect(summary).toContainText("Evrak Bekleniyor");
    await expect(page.getByTestId("portal-status-message")).toHaveText(
      "Gerekli evraklarınızı yükleyip incelemeye gönderin.",
    );
    await expect(page.locator('[aria-current="step"]')).toContainText("Evrak Yükleme");
    await expect(page.getByTestId("document-progress-text")).toHaveText(
      "0 / 2 zorunlu evrak yüklendi · %0",
    );
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    const titles = await page
      .getByTestId("portal-document")
      .getByRole("heading", { level: 3 })
      .allTextContents();
    expect(titles.map((title) => title.replace(/^\d+\.\s*/, ""))).toEqual([
      "Pasaport",
      "Fotoğraf",
      "Banka Dökümü",
    ]);
    await expect(page.getByTestId("portal-instructions").nth(1)).toHaveText(
      '<img src=x onerror=alert(1)><script>alert("x")</script>',
    );
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    // PHASE 08: yükleme alanı gerçek (her yüklenebilir evrak için bir PDF seçici); sayfa açılışında PDF okunmaz.
    await expect(page.getByRole("button", { name: "PDF Yükle" })).toHaveCount(3);
    await expect(page.locator('input[type="file"][accept="application/pdf,.pdf"]')).toHaveCount(3);
    await expect(page.getByRole("button", { name: "İncelemeye Gönder" })).toBeDisabled();
    await expect(page.getByRole("navigation")).toHaveCount(0);

    const html = await page.content();
    for (const secret of [
      app.token,
      app.applicationId,
      app.tokenId,
      "+905320000123",
      "example.invalid",
    ])
      expect(html).not.toContain(secret);
    expect(
      await page.evaluate(
        () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
      ),
    ).not.toContain(app.token);
    const cookie = (await context.cookies()).find((item) => item.name === CUSTOMER_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(Math.round((cookie.expires * 1000 - Date.now()) / 86_400_000)).toBe(7);

    await shot(page, testInfo, "portal-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, testInfo, "portal-mobile-390");
    await page.setViewportSize({ width: 320, height: 700 });
    await shot(page, testInfo, "portal-mobile-320");
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.E2E_SCREENSHOTS === "1" && testInfo.project.name === "Desktop Chrome") {
      await page
        .locator("section", { has: page.getByRole("heading", { name: "Başvuru süreci" }) })
        .screenshot({ path: "screenshots/phase-07/progress.png" });
      await page
        .getByTestId("portal-documents")
        .screenshot({ path: "screenshots/phase-07/document-cards.png" });
    }

    await page.reload();
    await expect(page.getByTestId("portal-summary")).toContainText(app.number); // yenileme oturumu korur
    expect(await dbState(runtimeDb, app.applicationId)).toEqual(before); // BR-105: GET yan etkisiz
    expect(dialogs).toEqual([]);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test("iptal: açık oturum bir sonraki istekte reddedilir, eski bağlantı geçersiz; yeniden oluşturulan bağlantı çalışır", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("portal-summary")).toContainText(app.number);
    await runtimeDb.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'REVOKED', revoked_by_user_id = $2 WHERE id = $1",
      [app.tokenId, userId],
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();
    await expect(page.getByText(app.number)).toHaveCount(0);
    await page.goto(`/b/${app.token}`);
    await expect(page).toHaveURL(/\/link-invalid$/);
    const fresh = await insertToken(runtimeDb, app.applicationId, userId);
    await page.goto(`/b/${fresh.token}`);
    await expect(page.getByTestId("portal-summary")).toContainText(app.number);
  });

  test("yenileme: eski oturum ve eski bağlantı reddedilir; yeni bağlantı çalışır; farklı tarayıcıdaki eski oturum da kapanır", async ({
    page,
    browser,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    const otherBrowser = await browser.newContext();
    try {
      const other = await otherBrowser.newPage();
      await page.goto(`/b/${app.token}`);
      await other.goto(`/b/${app.token}`);
      await expect(other.getByTestId("portal-summary")).toContainText(app.number);
      await runtimeDb.query(
        "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $2 WHERE id = $1",
        [app.tokenId, userId],
      );
      const fresh = await insertToken(runtimeDb, app.applicationId, userId);
      for (const tab of [page, other]) {
        await tab.reload();
        await expect(
          tab.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
        ).toBeVisible();
      }
      await page.goto(`/b/${app.token}`);
      await expect(page).toHaveURL(/\/link-invalid$/);
      await page.goto(`/b/${fresh.token}`);
      await expect(page.getByTestId("portal-summary")).toContainText(app.number);
    } finally {
      await otherBrowser.close();
    }
  });

  test("silme sürecindeki başvuru, süresi dolmuş ve değiştirilmiş oturum güvenli biçimde reddedilir", async ({
    page,
    context,
    runtimeDb,
    baseURL,
  }, testInfo) => {
    const app = await seedApplication(runtimeDb, userId);
    await page.goto(`/b/${app.token}`);
    await expect(page).toHaveURL(portalUrl);
    const contextId = page.url().split("/portal/")[1]!;

    // Süresi dolmuş (doğru imzalı) oturum.
    const iat = Math.floor(Date.now() / 1000) - 8 * 86400;
    await context.addCookies([
      {
        name: CUSTOMER_COOKIE,
        value: signCustomerSession({
          v: 1,
          typ: "cs-portal",
          aid: app.applicationId,
          tid: app.tokenId,
          ctx: contextId,
          iat,
          exp: iat + 7 * 86400,
        }),
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Oturumunuz sona erdi" }),
    ).toBeVisible();
    await shot(page, testInfo, "session-expired");

    // Değiştirilmiş imza.
    await context.addCookies([
      {
        name: CUSTOMER_COOKIE,
        value: `${signCustomerSession({ v: 1, typ: "cs-portal", aid: app.applicationId, tid: app.tokenId, ctx: contextId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }).slice(0, -4)}AAAA`,
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();

    // Silme talebi.
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("portal-summary")).toBeVisible();
    await runtimeDb.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $2 WHERE id = $1",
      [app.applicationId, userId],
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();
    await page.goto(`/b/${app.token}`);
    await expect(page).toHaveURL(/\/link-invalid$/);
  });

  test("ÇOKLU SEKME: B açılınca A sekmesi B'ye dönüşmez; yenileme, geri/ileri ve sekmeye dönüşte bağlam uyuşmazlığı", async ({
    context,
    runtimeDb,
  }) => {
    const a = await seedApplication(runtimeDb, userId, { firstName: "Alper", lastName: "Ak" });
    const b = await seedApplication(runtimeDb, userId, { firstName: "Burcu", lastName: "Bal" });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto(`/b/${a.token}`);
    await expect(tabA.getByTestId("portal-summary")).toContainText(a.number);
    await tabA.goto("/link-invalid"); // geri/ileri geçmişi için
    await tabA.goBack();
    await expect(tabA.getByTestId("portal-summary")).toContainText(a.number);

    await tabB.goto(`/b/${b.token}`);
    await expect(tabB.getByTestId("portal-summary")).toContainText(b.number);

    // A sekmesi: görünürlük değişince sunucuda yeniden doğrulanır → uyuşmazlık, B verisi YOK.
    await tabA.bringToFront();
    // Olay, hidrasyon tamamlanıp dinleyici bağlanana kadar yinelenir.
    const mismatchA = tabA.getByRole("heading", { level: 1, name: "Bu sayfa artık güncel değil" });
    await expect(async () => {
      await tabA.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect(mismatchA).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(tabA.getByText(b.number)).toHaveCount(0);
    await expect(tabA.getByText("Burcu")).toHaveCount(0);

    await tabA.reload();
    await expect(
      tabA.getByRole("heading", { level: 1, name: "Bu sayfa artık güncel değil" }),
    ).toBeVisible();
    await tabA.goForward().catch(() => undefined);
    await tabA.goBack().catch(() => undefined);
    await tabA.waitForLoadState("load");
    await expect(tabA.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(tabA.getByText(b.number)).toHaveCount(0);
    expect(await tabA.content()).not.toContain(b.number);

    // A'nın bağlantısını yeniden açmak A'yı geri getirir; bu kez B sekmesi uyuşmazlık gösterir.
    await tabA.goto(`/b/${a.token}`);
    await expect(tabA.getByTestId("portal-summary")).toContainText(a.number);
    await tabB.reload();
    await expect(
      tabB.getByRole("heading", { level: 1, name: "Bu sayfa artık güncel değil" }),
    ).toBeVisible();
    expect(await tabB.content()).not.toContain(a.number);

    // Bağlam değiştirme: B'nin bağlam kimliğini A'nın URL'sinde denemek erişim sağlamaz.
    const tampered = await context.newPage();
    await tampered.goto(`/portal/${randomBytes(16).toString("base64url")}`);
    await expect(tampered.getByRole("heading", { level: 1 })).toHaveText(
      /Bu sayfa artık güncel değil|Bağlantınız kullanılamıyor/,
    );
    expect(await tampered.content()).not.toContain(a.number);
  });

  test("ÇOKLU SEKME: aynı anda açılan iki bağlantı — hiçbir sekme diğerinin verisini göstermez", async ({
    context,
    runtimeDb,
  }) => {
    for (let round = 0; round < 3; round += 1) {
      const a = await seedApplication(runtimeDb, userId, { firstName: "Ece" });
      const b = await seedApplication(runtimeDb, userId, { firstName: "Fırat" });
      const [tabA, tabB] = [await context.newPage(), await context.newPage()];
      await Promise.all([tabA.goto(`/b/${a.token}`), tabB.goto(`/b/${b.token}`)]);
      for (const [tab, own, foreign] of [
        [tabA, a, b],
        [tabB, b, a],
      ] as const) {
        await tab.reload();
        await tab.getByRole("heading", { level: 1 }).waitFor(); // iskelet bitene kadar
        const text = await tab.locator("main").innerText();
        expect(text.includes(own.number) || text.includes("Bu sayfa artık güncel değil")).toBe(
          true,
        );
        expect(text).not.toContain(foreign.number);
      }
      await tabA.close();
      await tabB.close();
    }
  });

  test("ÇOKLU SEKME: aynı bağlantıyı ikinci kez açmak önceki sekmeyi eskitmez; yenilenmiş bağlantı yeni bağlam alır", async ({
    context,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto(`/b/${app.token}`);
    await expect(first.getByTestId("portal-summary")).toContainText(app.number);
    await second.goto(`/b/${app.token}`);
    await expect(second.getByTestId("portal-summary")).toContainText(app.number);
    expect(new URL(second.url()).pathname).toBe(new URL(first.url()).pathname);
    await first.reload();
    await expect(first.getByTestId("portal-summary")).toContainText(app.number);

    // Bağlantı yenilenirse: yeni bağlantı yeni bağlam üretir; eski bağlamlı sekme erişemez.
    await runtimeDb.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $2 WHERE id = $1",
      [app.tokenId, userId],
    );
    const fresh = await insertToken(runtimeDb, app.applicationId, userId);
    await second.goto(`/b/${fresh.token}`);
    await expect(second.getByTestId("portal-summary")).toContainText(app.number);
    expect(new URL(second.url()).pathname).not.toBe(new URL(first.url()).pathname);
    await first.reload();
    await expect(first.getByRole("heading", { level: 1 })).toHaveText(
      /Bu sayfa artık güncel değil|Bağlantınız kullanılamıyor/,
    );
    await expect(first.getByTestId("portal-summary")).toHaveCount(0);
  });

  test("personel ve müşteri oturumu birlikte: ayrı bağlamlar; müşteri oturumu personel paneline erişemez", async ({
    browser,
    signInAs,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    const shared = await browser.newContext();
    const customerOnly = await browser.newContext();
    try {
      await signInAs("admin", shared);
      const page = await shared.newPage();
      await page.goto(`/b/${app.token}`);
      await expect(page.getByTestId("portal-summary")).toContainText(app.number);
      await expect(page.getByRole("navigation")).toHaveCount(0); // portal personel menüsü göstermez
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 1, name: "Genel Bakış" })).toBeVisible(); // personel oturumu korunur
      const cookies = (await shared.cookies()).map((cookie) => cookie.name).sort();
      expect(cookies).toEqual(expect.arrayContaining([CUSTOMER_COOKIE, "cs.session_token"]));

      const customer = await customerOnly.newPage();
      await customer.goto(`/b/${app.token}`);
      await expect(customer.getByTestId("portal-summary")).toBeVisible();
      for (const path of [
        "/dashboard",
        "/dashboard/applications",
        `/dashboard/applications/${app.applicationId}`,
        "/dashboard/services",
      ]) {
        await customer.goto(path);
        await expect(customer).toHaveURL(/\/login$/);
      }
    } finally {
      await shared.close();
      await customerOnly.close();
    }
  });

  test("statü görünümleri: düzeltme, tamamlandı, iptal; zorunlu evrak yok; snapshot adı", async ({
    page,
    runtimeDb,
  }, testInfo) => {
    const revision = await seedApplication(runtimeDb, userId, {
      status: "REVISION_REQUIRED",
      documents: [
        {
          title: "Pasaport",
          status: "REVISION_REQUIRED",
          revisionMessage: "Sayfa okunaklı değil, lütfen yeniden tarayın.",
        },
        { title: "Diploma", status: "APPROVED" },
        { title: "Fotoğraf", required: false },
      ],
    });
    await page.goto(`/b/${revision.token}`);
    await expect(page.getByTestId("portal-status-message")).toHaveText(
      "Bazı evraklarınızın düzeltilmesi gerekiyor.",
    );
    await expect(page.locator('[aria-current="step"]')).toContainText("Düzeltme bekleniyor");
    await expect(page.getByTestId("document-progress")).toContainText("Düzeltme bekleyen evrak: 1");
    await expect(page.getByTestId("document-progress-text")).toHaveText(
      "1 / 2 zorunlu evrak yüklendi · %50",
    );
    await expect(
      page
        .getByTestId("portal-document")
        .first()
        .getByRole("status")
        .filter({ hasText: "Sayfa okunaklı değil" }),
    ).toContainText("Sayfa okunaklı değil, lütfen yeniden tarayın.");
    await expect(page.getByRole("button", { name: "İncelemeye Gönder" })).toBeDisabled();
    await shot(page, testInfo, "status-revision");

    const completed = await seedApplication(runtimeDb, userId, {
      status: "COMPLETED",
      documents: [{ title: "Pasaport", status: "APPROVED" }],
    });
    await page.goto(`/b/${completed.token}`);
    await expect(page.getByTestId("portal-status-message")).toContainText(
      "CS Global danışmanlık süreciniz tamamlandı. (Resmî vize sonucu değildir.)",
    );
    await expect(page.locator('[data-state="done"]')).toHaveCount(5);
    await expect(page.getByTestId("pdf-upload")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "İncelemeye Gönder" })).toHaveCount(0);
    await shot(page, testInfo, "status-completed");

    const cancelled = await seedApplication(runtimeDb, userId, { status: "CANCELLED" });
    await page.goto(`/b/${cancelled.token}`);
    await expect(page.getByTestId("process-cancelled")).toContainText(
      "Bu başvuru iptal edilmiştir.",
    );
    await expect(page.getByTestId("process-steps")).toHaveCount(0);
    await expect(page.getByTestId("pdf-upload")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "İncelemeye Gönder" })).toHaveCount(0);
    await shot(page, testInfo, "status-cancelled");

    const optionalOnly = await seedApplication(runtimeDb, userId, {
      documents: [{ title: "Ek Belge", required: false }],
    });
    await page.goto(`/b/${optionalOnly.token}`);
    await expect(page.getByTestId("document-progress")).toContainText("Zorunlu evrak bulunmuyor.");
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });

  for (const width of [320, 360, 375, 390, 414, 430, 768, 1024, 1440]) {
    test(`${width}px: uzun ad/hizmet/talimatla yatay taşma yok, dokunma alanları ≥44px`, async ({
      page,
      runtimeDb,
    }, testInfo) => {
      test.skip(
        !["Desktop Chrome", "Desktop WebKit"].includes(testInfo.project.name),
        "genişlikler masaüstü projelerinde",
      );
      const longWord = "ÇokuzunkelimeboşluksuzmetinİstanbulÜsküdarŞişliÇankırıĞüzelyurt".repeat(2);
      const app = await seedApplication(runtimeDb, userId, {
        firstName: "Ayşegül Nurcan Elif Zeynep",
        lastName: "Karaosmanoğlu-Büyükşehirlioğlu",
        serviceName: `Almanya Nitelikli Çalışan Vizesi ve Aile Birleşimi Danışmanlığı ${randomUUID().slice(0, 4)}`,
        documents: [
          {
            title: `Uzun Evrak Başlığı ${longWord}`,
            instructions: `${longWord}\n${"Satır ".repeat(80)}`,
          },
        ],
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/b/${app.token}`);
      await expect(page.getByTestId("portal-summary")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
      const small = await page
        .locator("main button:visible, main summary:visible")
        .evaluateAll(
          (elements) =>
            elements.filter((element) => element.getBoundingClientRect().height < 44).length,
        );
      expect(small).toBe(0);
    });
  }

  test("klavye: odak görünür, ayrıntı aç/kapa klavyeyle çalışır", async ({ page, runtimeDb }) => {
    const app = await seedApplication(runtimeDb, userId);
    await page.goto(`/b/${app.token}`);
    const summary = page.locator("summary").first();
    // Akışla gelen içerik yerine yerleşene kadar (gizli kapsayıcıdan taşınma odağı düşürür).
    await expect(summary).toBeVisible();
    await expect(async () => {
      await summary.focus();
      await expect(summary).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    const details = page.locator("details").first();
    await expect(details).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
  });
});
