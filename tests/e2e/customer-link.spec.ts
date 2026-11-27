import type { Page, Request } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { CUSTOMER_COOKIE, insertToken, seedApplication } from "../support/portal-seed";
import { CUSTOMER_LINK_BUTTON, openCustomerLink } from "./customer-link";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 12.1 — D-141 müşteri bağlantısı ara sayfası (C1…C17). Sentetik başvurular yalnızca izole
 * veritabanında; token/cookie değerleri yalnızca bellekte (yazdırılmaz, ekran görüntüsü yok).
 * C2/C3/C15 (HEAD, cookie saklayan önizleme istemcisi, genel meta) `security-audit.spec.ts`;
 * C4/C7/C8 istek düzeyi `portal.spec.ts`; C18 tüm paket.
 */

const isolated = isIsolatedTestDatabase();
const portalUrl = /\/portal\/[A-Za-z0-9_-]{22}$/;

async function customerCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === CUSTOMER_COOKIE);
}

function trackEntryPosts(page: Page): Request[] {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/b/enter") {
      posts.push(request);
    }
  });
  return posts;
}

test.describe("müşteri bağlantısı ara sayfası — D-141 (izole)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  let userId: string;
  test.beforeEach(async ({ runtimeDb }) => {
    userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1"))
      .rows[0]!.id;
  });

  test("C1/C5/C16: GET genel sayfa (oturum yok, kişisel veri yok) → açık giriş → temiz portal URL'i; token gövdede, Referer yok, istemci depolamasında yok", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    const posts = trackEntryPosts(page);
    await page.goto(`/b/${app.token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Başvuru Takip Paneli" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Başvurunuzun güncel durumunu takip etmek ve gerekli belgelerinizi yüklemek için devam edin.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Bu bağlantı size özeldir, başkalarıyla paylaşmayınız."),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("CS Global");
    for (const secret of [app.firstName, app.lastName, app.number, app.serviceName]) {
      await expect(page.locator("body")).not.toContainText(secret);
    }
    expect(await customerCookie(page)).toBeUndefined();
    expect(posts).toHaveLength(0); // otomatik gönderim yok

    await page.getByRole("button", { name: CUSTOMER_LINK_BUTTON }).click();
    await expect(page).toHaveURL(portalUrl);
    expect(page.url()).not.toContain(app.token);
    await expect(
      page.getByRole("heading", { level: 1, name: `Merhaba, ${app.firstName} ${app.lastName}` }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(new URL(post.url()).search).toBe("");
    expect(post.url()).not.toContain(app.token);
    expect(post.postData()).toBe(`token=${app.token}`);
    // D-146: Referer en fazla köken (yol/token yok); Origin gerçek köken (CSRF kontrolü için).
    const origin = new URL(page.url()).origin;
    expect([null, `${origin}/`]).toContain(await post.headerValue("referer"));
    expect(await post.headerValue("origin")).toBe(origin);
    const cookie = (await customerCookie(page))!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.value).not.toContain(app.token);
    const storage = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
    }));
    for (const value of Object.values(storage)) expect(value).not.toContain(app.token);
    expect(await page.content()).not.toContain(app.token);
  });

  test("C4/C6: iptal edilmiş ve yenilenmiş token → GET aynı genel sayfa; POST genel geçersiz ekran; cookie yok", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    await runtimeDb.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'REVOKED', revoked_by_user_id = $2 WHERE id = $1",
      [app.tokenId, userId],
    );
    await page.goto(`/b/${app.token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Başvuru Takip Paneli" }),
    ).toBeVisible();
    await page.getByRole("button", { name: CUSTOMER_LINK_BUTTON }).click();
    await expect(page).toHaveURL(/\/link-invalid$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bağlantınız kullanılamıyor" }),
    ).toBeVisible();
    expect(await customerCookie(page)).toBeUndefined();
    // Yeni token çalışır (yenileme).
    const fresh = await insertToken(runtimeDb, app.applicationId, userId);
    await openCustomerLink(page, fresh.token);
    await expect(page).toHaveURL(portalUrl);
  });

  test("C9/C10: A oturumu açıkken B bağlantısının GET'i A'yı değiştirmez; B açık girişi kabul edilmiş tek bağlam davranışı (A sekmesi güncel değil)", async ({
    page,
    runtimeDb,
  }) => {
    const a = await seedApplication(runtimeDb, userId);
    const b = await seedApplication(runtimeDb, userId);
    await openCustomerLink(page, a.token);
    await expect(page).toHaveURL(portalUrl);
    const portalA = page.url();
    const cookieA = (await customerCookie(page))!.value;

    const other = await page.context().newPage();
    await other.goto(`/b/${b.token}`);
    await expect(
      other.getByRole("heading", { level: 1, name: "Başvuru Takip Paneli" }),
    ).toBeVisible();
    expect((await customerCookie(page))!.value).toBe(cookieA);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: `Merhaba, ${a.firstName} ${a.lastName}` }),
    ).toBeVisible();

    await other.getByRole("button", { name: CUSTOMER_LINK_BUTTON }).click();
    await expect(other).toHaveURL(portalUrl);
    await expect(
      other.getByRole("heading", { level: 1, name: `Merhaba, ${b.firstName} ${b.lastName}` }),
    ).toBeVisible();
    await page.goto(portalA);
    await expect(
      page.getByRole("heading", { level: 1, name: "Bu sayfa artık güncel değil" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(b.lastName);
  });

  test("C11: personel oturumu varken müşteri girişi yetki yükseltmez; personel cookie'si değişmez", async ({
    page,
    runtimeDb,
    signInAs,
  }) => {
    await signInAs("admin");
    const staffCookies = (await page.context().cookies()).filter((c) => c.name !== CUSTOMER_COOKIE);
    const app = await seedApplication(runtimeDb, userId);
    await openCustomerLink(page, app.token);
    await expect(page).toHaveURL(portalUrl);
    await expect(page.getByRole("navigation")).toHaveCount(0); // personel menüsü yok
    const after = (await page.context().cookies()).filter((c) => c.name !== CUSTOMER_COOKIE);
    expect(after.map((c) => [c.name, c.value])).toEqual(staffCookies.map((c) => [c.name, c.value]));
    // Personel oturumu ele geçirilmedi/değişmedi; müşteri oturumu personel menüsü göstermez.
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("C12/C17: çift tıklama tek POST; klavye (Tab + Enter) ile giriş; 320 px'de taşma yok ve hedef ≥ 44 px", async ({
    page,
    runtimeDb,
  }, testInfo) => {
    const app = await seedApplication(runtimeDb, userId);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`/b/${app.token}`);
    const button = page.getByRole("button", { name: CUSTOMER_LINK_BUTTON });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    const posts = trackEntryPosts(page);
    await button.dblclick();
    await expect(page).toHaveURL(portalUrl);
    expect(posts).toHaveLength(1);

    // Klavye: yeni bağlamda Tab ile düğmeye ulaşılır, Enter gönderir.
    const second = await page
      .context()
      .browser()!
      .newContext({ ...testInfo.project.use });
    const keyboard = await second.newPage();
    await keyboard.goto(`/b/${app.token}`);
    const target = keyboard.getByRole("button", { name: CUSTOMER_LINK_BUTTON });
    await expect(target).toBeVisible();
    if (testInfo.project.name.includes("Chrome")) {
      for (
        let i = 0;
        i < 10 && !(await target.evaluate((el) => el === document.activeElement));
        i += 1
      ) {
        await keyboard.keyboard.press("Tab");
      }
    } else {
      await target.focus(); // WebKit: Tab sırası tarayıcı ayarına bağlı (accessibility.spec ile aynı)
    }
    await expect(target).toBeFocused();
    await keyboard.keyboard.press("Enter");
    await expect(keyboard).toHaveURL(portalUrl);
    await second.close();
  });

  test("C13/C14: geri/ileri/yenile otomatik token değişimi yapmaz; prefetch ve RSC istekleri oturum açmaz", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId);
    for (const headers of [
      { "next-router-prefetch": "1" } as Record<string, string>,
      { purpose: "prefetch" },
      { rsc: "1" },
      { "sec-purpose": "prefetch" },
    ]) {
      const response = await page.request.get(`/b/${app.token}`, { headers, maxRedirects: 0 });
      expect(response.headers()["set-cookie"] ?? "").not.toContain(CUSTOMER_COOKIE);
    }
    expect(await customerCookie(page)).toBeUndefined();

    const posts = trackEntryPosts(page);
    await openCustomerLink(page, app.token);
    await expect(page).toHaveURL(portalUrl);
    expect(posts).toHaveLength(1);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/b/${app.token}$`));
    await expect(page.getByRole("button", { name: CUSTOMER_LINK_BUTTON })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: CUSTOMER_LINK_BUTTON })).toBeEnabled();
    await page.goForward().catch(() => undefined);
    await page.waitForLoadState("load");
    expect(posts).toHaveLength(1); // geri/yenile/ileri yeni POST üretmez
  });

  test("SEC-06: geçerli token başına giriş sınırı aşılınca genel 'erişilemiyor' ekranı; diğer müşteri etkilenmez", async ({
    request,
    baseURL,
    runtimeDb,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "istek düzeyi; tek proje yeterli");
    const app = await seedApplication(runtimeDb, userId);
    const other = await seedApplication(runtimeDb, userId);
    const post = (token: string) =>
      request.post("/b/enter", { form: { token }, headers: { origin: baseURL! }, maxRedirects: 0 });
    for (let i = 0; i < 30; i += 1) {
      const response = await post(app.token);
      expect(new URL(response.headers().location!, "http://x").pathname).toMatch(/^\/portal\//);
    }
    const limited = await post(app.token);
    expect(limited.status()).toBe(303);
    expect(new URL(limited.headers().location!, "http://x").pathname).toBe("/link-unavailable");
    expect(limited.headers()["set-cookie"] ?? "").not.toContain(CUSTOMER_COOKIE);
    const unaffected = await post(other.token);
    expect(new URL(unaffected.headers().location!, "http://x").pathname).toMatch(/^\/portal\//);
    // Geçersiz token'lar sayaç satırı üretmez (kardinalite gerçek token sayısıyla sınırlı). Paralel
    // testlerden bağımsız: hiçbir `link:` satırı var olmayan bir token kimliğine ait olmamalı.
    for (let i = 0; i < 5; i += 1) {
      await post(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"));
    }
    const orphan = await runtimeDb.query(
      `SELECT 1 FROM rate_limit_buckets r WHERE r.key LIKE 'link:%' AND NOT EXISTS (
         SELECT 1 FROM application_access_tokens t WHERE 'link:exchange:' || t.id = r.key)`,
    );
    expect(orphan.rowCount).toBe(0);
  });
});
