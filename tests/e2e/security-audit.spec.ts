import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { fixtures, multiPagePdf } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { openCustomerLink } from "./customer-link";
import { collectErrors } from "./console-errors";
import { uploadAsCustomer } from "./customer-upload";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 12 güvenlik denetimi (izole veritabanı + geçici yerel depolama; sentetik veri). Gerçek hesap,
 * gerçek müşteri verisi veya gerçek sağlayıcı yoktur. Bulgular ve kanıtlar: docs/SECURITY_AUDIT.md.
 */
const isolated = isIsolatedTestDatabase();

/** Çalışırsa global bayrak bırakan XSS yükleri (alert yerine iz bırakır; diyaloglar ayrıca yakalanır). */
const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;

async function expectNoXss(page: Page) {
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
}

test.describe("PHASE 12 güvenlik denetimi (izole)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  let userId: string;
  test.beforeEach(async ({ runtimeDb }) => {
    userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1"))
      .rows[0]!.id;
  });

  test("depolanmış XSS: kişi/hizmet/evrak/yorum/not/düzeltme/dosya adı alanları düz metin olarak gösterilir (personel + müşteri)", async ({
    page,
    runtimeDb,
    signInAs,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const errors = collectErrors(page);
    const app = await seedApplication(runtimeDb, userId, {
      firstName: `Ad ${XSS}`.slice(0, 100),
      lastName: "Soyad",
      serviceName: `Hizmet ${randomUUID().slice(0, 6)} ${XSS}`,
      status: "REVISION_REQUIRED",
      documents: [
        {
          title: `Evrak ${XSS}`.slice(0, 150),
          instructions: `Talimat ${XSS}`,
          status: "REVISION_REQUIRED",
          revisionMessage: `Düzeltme ${XSS}`,
        },
      ],
    });
    await runtimeDb.query(
      "UPDATE application_document_files SET original_filename = $2 WHERE application_id = $1",
      [app.applicationId, `dosya ${XSS}.pdf`.slice(0, 200)],
    );
    await runtimeDb.query(
      "INSERT INTO document_comments (application_id, body, author_user_id) VALUES ($1, $2, $3)",
      [app.applicationId, `Yorum ${XSS}`, userId],
    );
    await runtimeDb.query(
      "INSERT INTO application_internal_notes (application_id, body, author_user_id) VALUES ($1, $2, $3)",
      [app.applicationId, `Not ${XSS}`, userId],
    );

    // Personel ekranları.
    await signInAs("admin");
    for (const path of [
      "/dashboard",
      "/dashboard/applications",
      `/dashboard/applications/${app.applicationId}`,
      "/dashboard/audit-logs",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoXss(page);
    }
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await expect(page.getByText(`Not ${XSS}`)).toBeVisible();
    await expect(page.getByText(`Yorum ${XSS}`).first()).toBeVisible();

    // Müşteri paneli (aynı bağlamda personel cookie'si de var: müşteri kapsamı yalnızca kendi oturumundan).
    await openCustomerLink(page, app.token);
    await expect(page.getByText(`Talimat ${XSS}`)).toBeVisible();
    await expect(page.getByText(`Düzeltme ${XSS}`)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoXss(page);
    // İç not müşteri yüküne girmez.
    expect(await page.content()).not.toContain("Not <img");
    expect(dialogs).toEqual([]);
    expect(errors.filter((e) => !e.includes("Failed to load resource"))).toEqual([]);
  });

  test("dosya uç noktaları HEAD/Range yetki matrisi: anonim, çapraz müşteri, çapraz oturum türü, iptal → bayt/boyut sızmaz", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
    browser,
  }) => {
    const docs = [{ title: "Pasaport" }];
    const a = await seedApplication(runtimeDb, userId, { documents: docs });
    const b = await seedApplication(runtimeDb, userId, { documents: docs });
    const reqOf = async (applicationId: string) =>
      (
        await runtimeDb.query<{ id: string }>(
          "SELECT id FROM application_document_requirements WHERE application_id = $1",
          [applicationId],
        )
      ).rows[0]!.id;
    const pdf = multiPagePdf(3, 120_000);
    const fileA = await uploadAsCustomer(
      browser,
      runtimeDb,
      baseURL!,
      a.token,
      await reqOf(a.applicationId),
      pdf,
    );
    const fileB = await uploadAsCustomer(
      browser,
      runtimeDb,
      baseURL!,
      b.token,
      await reqOf(b.applicationId),
      pdf,
    );

    const noLeak = async (
      label: string,
      request: APIRequestContext,
      url: string,
      expected: number[],
    ) => {
      for (const [method, headers] of [
        ["GET", { range: "bytes=0-99" }],
        ["HEAD", {}],
        ["GET", {}],
      ] as const) {
        const response = await request.fetch(url, { method, headers, maxRedirects: 0 });
        expect(expected, `${label} ${method}`).toContain(response.status());
        const h = response.headers();
        expect(h["content-range"], label).toBeUndefined();
        expect(h["accept-ranges"], label).toBeUndefined();
        expect(h.etag, label).toBeUndefined();
        expect(h["content-type"] ?? "", label).not.toContain("application/pdf");
        if (method !== "HEAD") {
          const body = await response.body();
          expect(body.subarray(0, 5).toString(), label).not.toBe("%PDF-");
          expect(body.toString(), label).not.toContain(String(pdf.length));
        }
      }
    };

    // Anonim.
    const anonymous = await browser.newContext({ baseURL });
    await noLeak("anon staff", anonymous.request, `/api/files/${fileA}?disposition=inline`, [401]);
    await noLeak(
      "anon portal",
      anonymous.request,
      `/api/portal/AAAAAAAAAAAAAAAAAAAAAA/files/${fileA}?disposition=inline`,
      [401, 404],
    );

    // Müşteri A oturumu.
    const customerA = await browser.newContext({ baseURL });
    const pageA = await customerA.newPage();
    await openCustomerLink(pageA, a.token);
    const contextA = new URL(pageA.url()).pathname.split("/portal/")[1]!;
    // Kendi dosyası: Range 206, HEAD meta.
    const own = await customerA.request.get(
      `/api/portal/${contextA}/files/${fileA}?disposition=inline`,
      {
        headers: { range: "bytes=0-99" },
      },
    );
    expect(own.status()).toBe(206);
    expect(own.headers()["content-range"]).toBe(`bytes 0-99/${pdf.length}`);
    // B'nin dosyası, A'nın bağlamıyla → 404, boyut/varlık sızmaz.
    await noLeak(
      "A→B file",
      customerA.request,
      `/api/portal/${contextA}/files/${fileB}?disposition=inline`,
      [404],
    );
    // Müşteri cookie'si personel uç noktasını açmaz.
    await noLeak(
      "customer→staff route",
      customerA.request,
      `/api/files/${fileA}?disposition=inline`,
      [401],
    );
    // Yanlış bağlam (URL bağlamı ≠ cookie bağlamı).
    await noLeak(
      "context mismatch",
      customerA.request,
      `/api/portal/${randomUUID().replaceAll("-", "").slice(0, 22)}/files/${fileA}?disposition=inline`,
      [401, 404, 409],
    );

    // Personel cookie'si müşteri uç noktasını açmaz (müşteri oturumu yok).
    const staffOnly = await browser.newContext({ baseURL });
    await signInAs("admin", staffOnly);
    await noLeak(
      "staff→customer route",
      staffOnly.request,
      `/api/portal/${contextA}/files/${fileA}?disposition=inline`,
      [401],
    );
    // Personel kendi uç noktasında: Range + HEAD çalışır.
    const head = await staffOnly.request.fetch(`/api/files/${fileB}?disposition=inline`, {
      method: "HEAD",
    });
    expect(head.status()).toBe(200);
    expect(head.headers()["accept-ranges"]).toBe("bytes");

    // Bağlantı yenileme/iptal sonrası eski oturumla Range → 404.
    await runtimeDb.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $1 WHERE id = $2",
      [userId, a.tokenId],
    );
    await noLeak(
      "revoked",
      customerA.request,
      `/api/portal/${contextA}/files/${fileA}?disposition=inline`,
      [401, 404],
    );
    for (const context of [anonymous, customerA, staffOnly]) await context.close();
    expect(page).toBeTruthy();
  });

  test("rate limit izolasyonu: müşteri A'nın parça/HEAD sınırı (600/saat) dolar → 429; müşteri B ve personel etkilenmez; reddedilen istek dosya baytı döndürmez", async ({
    runtimeDb,
    signInAs,
    baseURL,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "tek proje yeterli (600 istek)");
    test.setTimeout(180_000);
    const a = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const b = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const reqOf = async (applicationId: string) =>
      (
        await runtimeDb.query<{ id: string }>(
          "SELECT id FROM application_document_requirements WHERE application_id = $1",
          [applicationId],
        )
      ).rows[0]!.id;
    const pdf = multiPagePdf(2, 60_000);
    const fileA = await uploadAsCustomer(
      browser,
      runtimeDb,
      baseURL!,
      a.token,
      await reqOf(a.applicationId),
      pdf,
    );
    const fileB = await uploadAsCustomer(
      browser,
      runtimeDb,
      baseURL!,
      b.token,
      await reqOf(b.applicationId),
      pdf,
    );
    const open = async (token: string) => {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await openCustomerLink(page, token);
      return { context, ctx: new URL(page.url()).pathname.split("/portal/")[1]! };
    };
    const A = await open(a.token);
    const B = await open(b.token);
    const urlA = `/api/portal/${A.ctx}/files/${fileA}?disposition=inline`;
    const started = Date.now();
    let accepted = 0;
    for (let i = 0; i < 600; i += 1) {
      const response = await A.context.request.fetch(urlA, { method: "HEAD" });
      if (response.status() === 200) accepted += 1;
    }
    const perRequestMs = (Date.now() - started) / 600;
    expect(accepted).toBe(600);
    const limited = await A.context.request.get(urlA, { headers: { range: "bytes=0-99" } });
    expect(limited.status()).toBe(429);
    expect(limited.headers()["content-range"]).toBeUndefined();
    expect((await limited.body()).subarray(0, 5).toString()).not.toBe("%PDF-");
    // Diğer müşteri ve personel etkilenmez.
    const otherCustomer = await B.context.request.get(
      `/api/portal/${B.ctx}/files/${fileB}?disposition=inline`,
      {
        headers: { range: "bytes=0-99" },
      },
    );
    expect(otherCustomer.status()).toBe(206);
    const staff = await browser.newContext({ baseURL });
    await signInAs("admin", staff);
    const staffResponse = await staff.request.get(`/api/files/${fileA}?disposition=inline`, {
      headers: { range: "bytes=0-99" },
    });
    expect(staffResponse.status()).toBe(206);
    testInfo.annotations.push({
      type: "rate-limit-ms-per-request",
      description: perRequestMs.toFixed(1),
    });
    console.log(
      `[security-audit] HEAD + sayaç ortalama ${perRequestMs.toFixed(1)} ms/istek (izole, yerel)`,
    );
    for (const context of [A.context, B.context, staff]) await context.close();
  });

  test("görüntüleyici aktif içerik: harici URI bağlantısı ve form alanı tetiklenmez, harici istek yok; tekrar aç/kapat sonrası worker kalmaz", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    const external: string[] = [];
    await page.context().route(
      (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
      async (route) => {
        external.push(new URL(route.request().url()).hostname);
        await route.abort();
      },
    );
    const popups: string[] = [];
    page.on("popup", (popup) => popups.push(popup.url()));
    await signInAs("admin");
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const requirement = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows[0]!.id;
    await uploadAsCustomer(
      page.context().browser()!,
      runtimeDb,
      baseURL!,
      app.token,
      requirement,
      fixtures.externalLinkAndForm(),
    );
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    const before = page.url();
    const trigger = page.getByTestId("pdf-view-button").filter({ visible: true }).first();
    for (let round = 0; round < 5; round += 1) {
      await trigger.click();
      await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute("data-rendered", "1");
      if (round === 0) {
        // Bağlantının kapladığı alana ve form alanına tıklama: gezinme/istek yok, DOM'a giriş alanı eklenmez.
        await page.getByTestId("pdf-viewer-canvas").click({ position: { x: 40, y: 40 } });
        await page.getByTestId("pdf-viewer-canvas").click({ position: { x: 80, y: 120 } });
        expect(
          await page
            .getByRole("dialog")
            .locator("a[href], textarea, input:not([type=number])")
            .count(),
        ).toBe(0);
      }
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    await expect.poll(() => page.workers().length, { timeout: 10_000 }).toBe(0);
    expect(page.url()).toBe(before);
    expect(popups).toEqual([]);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("bağlantı önizleme/tarayıcı (D-141, SEC-02): GET/HEAD oturum açmaz; cookie saklayan ve yönlendirme izleyen istemci müşteri verisine/dosyaya ulaşamaz", async ({
    runtimeDb,
    baseURL,
    playwright,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "HTTP düzeyi; tek proje yeterli");
    const app = await seedApplication(runtimeDb, userId, {
      firstName: "Önizleme",
      lastName: `Gözcü${randomUUID().slice(0, 6)}`,
    });
    for (const method of ["GET", "HEAD"] as const) {
      const entry = await fetch(`${baseURL}/b/${app.token}`, { method, redirect: "manual" });
      expect(entry.status).toBe(200);
      expect(entry.headers.get("set-cookie")).toBeNull();
      expect(entry.headers.get("location")).toBeNull();
      expect(entry.headers.get("cache-control")).toContain("no-store");
      // D-146: ara sayfa Referer olarak en fazla kökeni gönderir (yol/token asla).
      expect(entry.headers.get("referrer-policy")).toBe("strict-origin");
      const body = await entry.text();
      for (const secret of [app.lastName, app.number, app.serviceName, "Pasaport"]) {
        expect(body).not.toContain(secret);
      }
      // Genel Open Graph / başlık: kişisel veri veya başvuru numarası yok.
      expect(body).not.toMatch(/og:(title|description)[^>]*Gözcü/);
    }

    // Cookie saklayan ve yönlendirme izleyen istemci (bazı önizleme/tarama botları): yalnızca ara sayfa.
    const jar = await playwright.request.newContext({ baseURL });
    const preview = await jar.get(`/b/${app.token}`);
    const previewBody = await preview.text();
    expect(previewBody).toContain("Başvuru Takip Paneli");
    expect(previewBody).not.toContain(app.lastName);
    await jar.head(`/b/${app.token}`);
    expect((await jar.storageState()).cookies).toEqual([]);
    const portal = await jar.get("/portal");
    expect(await portal.text()).not.toContain(app.lastName);
    await jar.dispose();
    // GET/HEAD bu bağlantı için sayaç satırı dahil hiçbir şey yazmaz (paralel testlerden bağımsız sorgu).
    const exchangeRows = await runtimeDb.query(
      `SELECT 1 FROM rate_limit_buckets WHERE key IN (
         SELECT 'link:exchange:' || id FROM application_access_tokens WHERE application_id = $1)`,
      [app.applicationId],
    );
    expect(exchangeRows.rowCount).toBe(0);
    testInfo.annotations.push({
      type: "SEC-02",
      description: "GET/HEAD önizleme: oturum 0, veri 0",
    });
  });

  test("çıkış sonrası geri tuşu: yeniden yükleme girişe yönlendirir; bfcache görünürlüğü kaydedilir", async ({
    page,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("Mobile"), "masaüstü kenar çubuğu çıkış düğmesi");
    const app = await seedApplication(runtimeDb, userId, {
      lastName: `Geri${randomUUID().slice(0, 6)}`,
    });
    await signInAs("admin");
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await expect(page.getByRole("heading", { level: 1, name: app.number })).toBeVisible();
    await page.getByRole("button", { name: "Çıkış Yap" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    const visibleAfterBack = await page
      .getByText(app.lastName)
      .first()
      .isVisible()
      .catch(() => false);
    testInfo.annotations.push({
      type: "bfcache",
      description: `geri tuşunda içerik görünür: ${visibleAfterBack}`,
    });
    console.log(
      `[security-audit] ${testInfo.project.name}: çıkış sonrası geri tuşunda içerik görünür: ${visibleAfterBack}`,
    );
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(app.lastName)).toHaveCount(0);
  });
});
