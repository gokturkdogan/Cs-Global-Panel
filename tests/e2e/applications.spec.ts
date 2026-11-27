import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import type pg from "pg";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { expect, sessionsAvailable, sessionsSkipReason, test } from "./fixtures";
import { collectErrors } from "./console-errors";

/**
 * Başvuru yönetimi (PHASE 06).
 * - Salt okunur testler her ortamda (ortak `neondb` dahil; veri yazılmaz, form gönderilmez).
 * - Oluşturma, düzenleme, bağlantı ve WhatsApp testleri YALNIZCA izole geçici veritabanında
 *   (`pnpm test:e2e:isolated`): geçici hesaplar, sentetik veri, test token'ları (gerçek müşteri
 *   bağlantısı değildir). WhatsApp (`wa.me`) istekleri yakalanır; gerçek mesaj gönderilmez.
 * - Bağlantı/mesaj içeren öğeler (`data-sensitive`) ekran görüntülerinde maskelenir; trace kapalı.
 */
test.skip(!sessionsAvailable, sessionsSkipReason);

const isolated = isIsolatedTestDatabase();
const tag = () => randomBytes(3).toString("hex");

async function screenshot(page: Page, testInfo: TestInfo, name: string, projects: string[]) {
  if (process.env.E2E_SCREENSHOTS !== "1" || !isolated || !projects.includes(testInfo.project.name))
    return;
  mkdirSync("screenshots/phase-06", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: `screenshots/phase-06/${name}.png`,
    fullPage: true,
    mask: [
      page.locator("[data-sensitive]"),
      page.getByTestId("header-username"),
      page.getByTestId("sidebar-username"),
    ],
    maskColor: "#1E3A8A",
  });
}

/** İzole veritabanında sentetik aktif hizmet + evraklar (geçici hesap adına). */
async function seedService(
  db: pg.Client,
  userId: string,
  titles: { title: string; required?: boolean; active?: boolean }[],
) {
  const name = `E2E Vize ${tag()}`;
  const service = await db.query<{ id: string }>(
    "INSERT INTO services (name, description, created_by_user_id, updated_by_user_id) VALUES ($1, 'Sentetik test hizmeti', $2, $2) RETURNING id",
    [name, userId],
  );
  const serviceId = service.rows[0]!.id;
  for (const [index, item] of titles.entries()) {
    await db.query(
      `INSERT INTO service_document_requirements (service_id, title, instructions, is_required, is_active, sort_order, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        serviceId,
        item.title,
        `${item.title} için PDF yükleyin.\nOkunaklı olmalı.`,
        item.required ?? true,
        item.active ?? true,
        (index + 1) * 10,
        userId,
      ],
    );
  }
  return { serviceId, name };
}

async function fillCustomer(
  page: Page,
  values: { firstName: string; lastName: string; phone: string; email: string },
) {
  await page.locator("#application-firstName").fill(values.firstName);
  await page.locator("#application-lastName").fill(values.lastName);
  await page.locator("#application-phone").fill(values.phone);
  await page.locator("#application-email").fill(values.email);
}

async function createViaUi(
  page: Page,
  serviceName: string,
  customer = {
    firstName: "Çağla",
    lastName: "Işık",
    phone: "0532 111 22 33",
    email: `test.${tag()}@example.invalid`,
  },
) {
  await page.goto("/dashboard/applications/new");
  await fillCustomer(page, customer);
  await page.locator("#application-serviceId").selectOption({ label: serviceName });
  await expect(page.getByTestId("service-preview").getByRole("listitem").first()).toBeVisible();
  await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Başvuru başarıyla oluşturuldu!" })).toBeVisible();
  const number = (await page
    .getByTestId("create-success-summary")
    .locator("dd")
    .first()
    .textContent())!.trim();
  const link = await page.locator("#created-link").inputValue();
  return { number, link, customer };
}

/** Başarı ekranından detaya geçer ve istemci gezinmesinin bitmesini bekler. */
async function openDetail(page: Page) {
  await page.getByRole("link", { name: "Başvuru Detayına Git" }).click();
  await expect(page).toHaveURL(/\/dashboard\/applications\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("application-summary")).toBeVisible();
}

async function interceptWhatsApp(context: BrowserContext) {
  const opened: string[] = [];
  await context.route("https://wa.me/**", async (route) => {
    opened.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<p>intercepted</p>" });
  });
  return opened;
}

test.describe("başvurular — salt okunur", () => {
  test("liste: başlık, açıklama, Yeni Başvuru, arama, filtreler, sayfalama; no-store; konsol hatası yok", async ({
    page,
    signInAs,
  }) => {
    const errors = collectErrors(page);
    await signInAs("employee");
    const response = await page.goto("/dashboard/applications");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page).toHaveTitle("Başvurular | CS Global");
    await expect(page.getByRole("heading", { level: 1, name: "Başvurular" })).toBeVisible();
    await expect(page.getByText("Tüm müşteri başvurularınızı yönetin.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Yeni Başvuru" }).first()).toHaveAttribute(
      "href",
      "/dashboard/applications/new",
    );
    await expect(page.getByRole("searchbox", { name: "Başvuru ara" })).toBeVisible();
    await expect(page.locator("#filter-status")).toBeVisible();
    await expect(page.locator("#filter-service")).toBeVisible();
    await expect(page.getByTestId("pagination-summary")).toContainText("Sayfa");
    await expect(page.getByText("Henüz kullanıma hazır değil")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("arama metni URL'ye ve geçmişe yazılmaz; durum filtresi URL'de", async ({
    page,
    signInAs,
  }) => {
    await signInAs("employee");
    await page.goto("/dashboard/applications");
    const secret = `Gizli Arama ${tag()}`;
    await page.getByRole("searchbox", { name: "Başvuru ara" }).fill(secret);
    await page.getByRole("button", { name: "Ara" }).click();
    await expect(
      page.getByText(/Aramanıza veya filtrelere uygun başvuru bulunamadı\./),
    ).toBeVisible();
    expect(page.url()).not.toContain(encodeURIComponent(secret.split(" ")[0]!));
    expect(page.url()).not.toContain("Gizli");
    await page.getByRole("button", { name: "Temizle" }).click();
    await page.locator("#filter-status").selectOption("UNDER_REVIEW");
    await expect(page).toHaveURL(/status=UNDER_REVIEW/);
    await expect(page.locator("#filter-status")).toHaveValue("UNDER_REVIEW");
  });

  test("yeni başvuru formu: yalnızca aktif hizmetler; boş gönderimde Türkçe hatalar (veri yazılmaz)", async ({
    page,
    signInAs,
  }) => {
    await signInAs("admin");
    await page.goto("/dashboard/applications/new");
    await expect(page.getByRole("heading", { level: 1, name: "Yeni Başvuru" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Müşteri Bilgileri" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hizmet Bilgileri" })).toBeVisible();
    await expect(page.locator("option", { hasText: "(pasif)" })).toHaveCount(0);
    if ((await page.locator("#application-serviceId").count()) === 0) {
      // Aktif hizmet yoksa form gönderilemez ve açık uyarı gösterilir.
      await expect(page.getByText("Aktif hizmet bulunmuyor.", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Başvuru Oluştur" })).toBeDisabled();
      return;
    }
    await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
    await expect(page.getByText("Ad zorunludur.", { exact: true })).toBeVisible();
    await expect(page.getByText("Soyad zorunludur.", { exact: true })).toBeVisible();
    await expect(page.getByText("Telefon numarası zorunludur.", { exact: true })).toBeVisible();
    await expect(page.getByText("E-posta adresi zorunludur.", { exact: true })).toBeVisible();
    await expect(page.locator("#application-firstName")).toBeFocused();
  });

  test("geçersiz ve bilinmeyen başvuru kimliği 404; oturumsuz erişim girişe; başka origin'den mutasyon 403", async ({
    page,
    signInAs,
    request,
  }) => {
    const forged = await request.post("/dashboard/applications/new", {
      headers: { origin: "https://evil.example", "next-action": "x" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    for (const path of ["/dashboard/applications", "/dashboard/applications/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await signInAs("employee");
    for (const id of ["gecersiz", randomUUID()]) {
      const response = await page.goto(`/dashboard/applications/${id}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
    }
  });

  test("iki hesap başvuru sayfalarında aynı form, buton ve bağlantıları görür", async ({
    browser,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "tek projede yeterli");
    const snapshot = async (role: "admin" | "employee", path: string) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const session = await signInAs(role, context);
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const initial = session.username.charAt(0).toLocaleUpperCase("tr-TR");
        const outside = ':not(section[aria-label="Başvuru listesi"] *):visible';
        const strip = (values: string[]) =>
          values.map((value) =>
            value
              .replaceAll(`${initial}${session.username}`, "<k>")
              .replaceAll(session.username, "<k>")
              .trim(),
          );
        return {
          buttons: strip(await page.locator(`button${outside}`).allTextContents()),
          links: strip(await page.locator(`a${outside}`).allTextContents()),
          fields: await page.locator(`:is(input, select, textarea)${outside}`).count(),
        };
      } finally {
        await context.close();
      }
    };
    for (const path of ["/dashboard/applications", "/dashboard/applications/new"]) {
      expect(await snapshot("admin", path)).toEqual(await snapshot("employee", path));
    }
  });

  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    test(`${width}px: liste ve yeni başvuru formunda yatay taşma yok`, async ({
      page,
      signInAs,
    }, testInfo) => {
      test.skip(
        !["Desktop Chrome", "Desktop WebKit"].includes(testInfo.project.name),
        "genişlikler masaüstü projelerinde",
      );
      await page.setViewportSize({ width, height: 900 });
      await signInAs("employee");
      for (const path of ["/dashboard/applications", "/dashboard/applications/new"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("başvurular — mutasyonlar (izole veritabanı)", () => {
  test.skip(!isolated, ISOLATION_SKIP_REASON);

  test("oluşturma: önizleme, çift tıklamada tek kayıt, başarı ekranı, bağlantı biçimi, kopyalama, dashboard", async ({
    page,
    context,
    signInAs,
    runtimeDb,
    baseURL,
  }, testInfo) => {
    const errors = collectErrors(page);
    const admin = await signInAs("admin");
    const { name, serviceId } = await seedService(runtimeDb, admin.userId, [
      { title: "Pasaport" },
      { title: "Eski Evrak", active: false },
      { title: "Fotoğraf", required: false },
    ]);

    await page.goto("/dashboard/applications/new");
    await screenshot(page, testInfo, "new-application-form-desktop", ["Desktop Chrome"]);
    await fillCustomer(page, {
      firstName: "Ömer",
      lastName: "Çakır",
      phone: "+90 (532) 111-22-33",
      email: `Omer.${tag()}@Example.INVALID`,
    });
    await page.locator("#application-phone").fill("12");
    await page.locator("#application-serviceId").selectOption({ label: name });
    const preview = page.getByTestId("service-preview");
    await expect(preview.getByRole("listitem")).toHaveCount(2);
    await expect(preview.getByRole("listitem").nth(0)).toContainText("Pasaport");
    await expect(preview.getByRole("listitem").nth(0)).toContainText("Zorunlu");
    await expect(preview.getByRole("listitem").nth(1)).toContainText("İsteğe bağlı");
    await expect(preview).not.toContainText("Eski Evrak");
    await expect(preview).toContainText("yalnızca PDF, dosya başına en fazla 10 MB");
    await screenshot(page, testInfo, "service-preview-desktop", ["Desktop Chrome"]);

    await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
    await expect(page.getByText(/Geçerli bir telefon numarası girin/)).toBeVisible();
    await page.locator("#application-phone").fill("+90 (532) 111-22-33");
    await page.getByRole("button", { name: "Başvuru Oluştur" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "Başvuru başarıyla oluşturuldu!" }),
    ).toBeVisible();
    const summary = page.getByTestId("create-success-summary");
    await expect(summary).toContainText(/CS-\d{4}-\d{6}/);
    await expect(summary).toContainText("Ömer Çakır");
    await expect(summary).toContainText(name);
    await expect(summary).toContainText("Evrak Bekleniyor");
    const link = await page.locator("#created-link").inputValue();
    expect(link).toMatch(new RegExp(`^${new URL(baseURL!).origin}/b/[A-Za-z0-9_-]{43}$`));
    expect(page.url()).toMatch(/\/dashboard\/applications\/new$/); // bağlantı URL'de değil
    await expect(
      page.getByText("Müşteri paneli geliştirme aşamasındadır", { exact: false }).first(),
    ).toBeVisible();
    await screenshot(page, testInfo, "application-success-desktop", ["Desktop Chrome"]);

    const mine = await runtimeDb.query("SELECT 1 FROM applications WHERE service_id = $1", [
      serviceId,
    ]);
    expect(mine.rowCount).toBe(1); // çift tıklama → tek kayıt (paralel testlerden bağımsız)
    const token = link.split("/b/")[1]!;
    const stored = await runtimeDb.query(
      "SELECT token_hash, token_ciphertext FROM application_access_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    );
    expect(JSON.stringify(stored.rows)).not.toContain(token);
    expect(
      await page.evaluate(
        () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
      ),
    ).not.toContain(token);

    if (testInfo.project.name === "Desktop Chrome") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Bağlantıyı Kopyala" }).click();
      await expect(page.getByText("Bağlantı panoya kopyalandı.")).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    }

    await openDetail(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CS-\d{4}-\d{6}/);
    // PHASE 11 (D-139): test kendi gezinmesini başlatmadan önce sayfanın uçuştaki ön-getirmelerini bekler.
    // Aksi hâlde `page.goto` bu fetch'leri iptal eder ve WebKit iptali Next.js yönlendiricisinden yakalanmamış
    // "… due to access control checks" ret'i olarak raporlar (teşhis: istek ağa hiç çıkmaz; bekleme ile
    // 0/240, beklemesiz ~%3). Hata toplayıcı ve D-131 istisnası değişmedi.
    await page.waitForLoadState("networkidle");
    await page.goto("/dashboard");
    // Paralel testler aynı anda başvuru ekleyip silme sürecine alabildiği için tam eşitlik integration
    // testinde (dashboard.test.ts) doğrulanır; burada sayaç gerçek veriyi (> 0) gösterir.
    const total = Number(
      (await page
        .getByTestId("dashboard-stats")
        .getByRole("heading", { name: "Toplam Başvuru" })
        .locator("xpath=../..")
        .locator("p")
        .first()
        .textContent())!.replace(/\D/g, ""),
    );
    expect(total).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("eski önizleme: şablon değişince oluşturulmaz, önizleme yenilenir; ikinci denemede güncel liste", async ({
    page,
    signInAs,
    runtimeDb,
  }) => {
    const admin = await signInAs("admin");
    const { name, serviceId } = await seedService(runtimeDb, admin.userId, [{ title: "Pasaport" }]);
    await page.goto("/dashboard/applications/new");
    await fillCustomer(page, {
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: "05321112233",
      email: `ayse.${tag()}@example.invalid`,
    });
    await page.locator("#application-serviceId").selectOption({ label: name });
    await expect(page.getByTestId("service-preview")).toContainText("Pasaport");
    await runtimeDb.query(
      "UPDATE service_document_requirements SET title = 'Pasaport (güncel)', version = version + 1 WHERE service_id = $1",
      [serviceId],
    );
    await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
    await expect(page.getByText(/evrak listesi siz formu doldururken değişti/)).toBeVisible();
    await expect(page.getByTestId("service-preview")).toContainText("Pasaport (güncel)");
    expect(
      (await runtimeDb.query("SELECT 1 FROM applications WHERE service_id = $1", [serviceId]))
        .rowCount,
    ).toBe(0);
    await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
    await expect(
      page.getByRole("heading", { name: "Başvuru başarıyla oluşturuldu!" }),
    ).toBeVisible();
  });

  test("WhatsApp: alıcı gösterilir, mesaj BR-161, wa.me yalnızca tıklamayla açılır (yakalanır, gönderilmez)", async ({
    page,
    context,
    signInAs,
    runtimeDb,
  }) => {
    const admin = await signInAs("admin");
    const opened = await interceptWhatsApp(context);
    const { name } = await seedService(runtimeDb, admin.userId, [{ title: "Pasaport" }]);
    const created = await createViaUi(page, name, {
      firstName: "Zeynep",
      lastName: "Şahin",
      phone: "0532 444 55 66",
      email: `z.${tag()}@example.invalid`,
    });
    await page.getByRole("button", { name: "WhatsApp ile Paylaş" }).click();
    const dialog = page.getByRole("dialog", { name: /WhatsApp ile paylaş/ });
    await expect(dialog).toBeVisible();
    expect(opened).toEqual([]); // açılmadan önce harici istek yok
    await dialog.getByRole("button", { name: "Mesajı hazırla" }).click();
    await expect(dialog.getByTestId("whatsapp-recipient")).toContainText("Zeynep Şahin");
    await expect(dialog.getByTestId("whatsapp-recipient")).toContainText("+90 532 444 55 66");
    const href = await dialog.getByRole("link", { name: "WhatsApp'ta aç" }).getAttribute("href");
    expect(href!.startsWith("https://wa.me/905324445566?text=")).toBe(true);
    const text = decodeURIComponent(href!.split("?text=")[1]!);
    expect(
      text.startsWith("Sayın Zeynep Şahin,\n\nCS Global'i tercih ettiğiniz için teşekkür ederiz."),
    ).toBe(true);
    expect(text).toContain(`${name} danışmanlık süreciniz için`);
    expect(text).toContain(`\n${created.link}\n`);
    expect(await dialog.getByRole("link", { name: "WhatsApp'ta aç" }).getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
    expect(opened).toEqual([]);
    const popupPromise = page.waitForEvent("popup");
    await dialog.getByRole("link", { name: "WhatsApp'ta aç" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(opened).toHaveLength(1);
    expect(opened[0]!.startsWith("https://wa.me/905324445566?text=")).toBe(true);
    await popup.close();
  });

  test("detay: snapshot, geçmiş, müşteri düzenleme (iletişim uyarısı), bağlantı göster/yenile/iptal/yeniden oluştur", async ({
    page,
    signInAs,
    runtimeDb,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const { name } = await seedService(runtimeDb, admin.userId, [
      { title: "Pasaport" },
      { title: "Fotoğraf", required: false },
    ]);
    const created = await createViaUi(page, name);
    await openDetail(page);
    await expect(page.getByTestId("application-summary")).toContainText("Evrak Bekleniyor");
    await expect(page.getByTestId("application-requirements").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("application-requirements")).toContainText("Yüklenmedi");
    await expect(page.getByTestId("application-history")).toContainText(
      "Başvuru oluşturuldu → Evrak Bekleniyor",
    );
    // PHASE 08: personel müşteri adına yükleyebilir (her evrak için bir buton).
    await expect(page.getByRole("button", { name: "Müşteri Adına PDF Yükle" })).toHaveCount(2);
    await screenshot(page, testInfo, "application-detail-desktop", ["Desktop Chrome"]);
    await screenshot(page, testInfo, "application-detail-mobile", ["Mobile Chrome"]);

    // Bağlantı: gizli → göster → yenile (onay) → iptal (Escape iptali, sonra onay) → yeniden oluştur.
    const card = page.getByTestId("access-link-card");
    await expect(card.locator("#access-link-value")).toHaveValue(/gizli/);
    await card.getByRole("button", { name: "Göster" }).click();
    await expect(card.locator("#access-link-value")).toHaveValue(created.link);
    await screenshot(page, testInfo, "link-management-desktop", ["Desktop Chrome"]);

    await card.getByRole("button", { name: "Bağlantıyı Yenile" }).click();
    const rotateDialog = page.getByRole("alertdialog", { name: "Bağlantı yenilensin mi?" });
    await expect(rotateDialog).toContainText(created.number);
    await rotateDialog.getByRole("button", { name: "Yenile" }).click();
    await expect(
      card.getByText("Yeni bağlantı oluşturuldu. Eski bağlantı artık geçersiz."),
    ).toBeVisible();
    await expect(card.locator("#access-link-value")).not.toHaveValue(created.link);
    await expect(card.locator("#access-link-value")).toHaveValue(/\/b\/[A-Za-z0-9_-]{43}$/);

    await card.getByRole("button", { name: "Bağlantıyı İptal Et" }).click();
    const revokeDialog = page.getByRole("alertdialog", { name: "Bağlantı iptal edilsin mi?" });
    await expect(revokeDialog).toContainText("İptal edilen bağlantı tekrar kullanılamaz.");
    await page.keyboard.press("Escape");
    await expect(revokeDialog).toBeHidden();
    await expect(card.getByText("Bağlantı aktif")).toBeVisible();
    await card.getByRole("button", { name: "Bağlantıyı İptal Et" }).click();
    await revokeDialog.getByRole("button", { name: "İptal Et" }).click();
    await expect(card.getByText("Bağlantı yok")).toBeVisible();
    await card.getByRole("button", { name: "Yeni bağlantı oluştur" }).click();
    await expect(card.getByText("Bağlantı aktif")).toBeVisible();

    // Müşteri düzenleme: telefon değişince uyarı.
    await page.getByRole("button", { name: "Düzenle" }).click();
    await page.locator("#customer-phone").fill("+49 1512 3456789");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByText("Değişiklikler kaydedildi.")).toBeVisible();
    await expect(page.getByText(/Mevcut bağlantı önceki alıcıda kalmış olabilir/)).toBeVisible();
    await expect(page.getByTestId("customer-info")).toContainText("+49 1512 3456789");
  });

  test("eşzamanlılık: eski müşteri formu ve eski bağlantı onayı reddedilir (iki hesap eşit)", async ({
    browser,
    signInAs,
    runtimeDb,
  }) => {
    const adminContext = await browser.newContext();
    const employeeContext = await browser.newContext();
    try {
      const admin = await signInAs("admin", adminContext);
      await signInAs("employee", employeeContext);
      const { name } = await seedService(runtimeDb, admin.userId, [{ title: "Pasaport" }]);
      const adminPage = await adminContext.newPage();
      const employeePage = await employeeContext.newPage();
      await createViaUi(adminPage, name);
      await openDetail(adminPage);
      await employeePage.goto(adminPage.url());

      // Çalışan bağlantıyı yeniler; yönetici eski sayfadan iptal etmeye çalışır → çakışma.
      await employeePage.getByRole("button", { name: "Bağlantıyı Yenile" }).click();
      await employeePage.getByRole("alertdialog").getByRole("button", { name: "Yenile" }).click();
      await expect(
        employeePage.getByText("Yeni bağlantı oluşturuldu.", { exact: false }),
      ).toBeVisible();
      await adminPage.getByRole("button", { name: "Bağlantıyı İptal Et" }).click();
      await adminPage.getByRole("alertdialog").getByRole("button", { name: "İptal Et" }).click();
      await expect(
        adminPage.getByText("Bu kayıt başka bir işlem tarafından güncellendi.", { exact: false }),
      ).toBeVisible();
      await adminPage.getByRole("alertdialog").getByRole("button", { name: "Vazgeç" }).click();

      // Çalışan müşteri adını değiştirir; yönetici eski formla kaydeder → çakışma + yenile.
      await employeePage.getByRole("button", { name: "Düzenle" }).click();
      await employeePage.locator("#customer-firstName").fill("Güncel");
      await employeePage.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(employeePage.getByText("Değişiklikler kaydedildi.")).toBeVisible();
      await adminPage.getByRole("button", { name: "Düzenle" }).click();
      await adminPage.locator("#customer-lastName").fill("Bayat");
      await adminPage.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(
        adminPage.getByText("Bu kayıt başka bir işlem tarafından güncellendi.", { exact: false }),
      ).toBeVisible();
      await expect(adminPage.getByRole("button", { name: "Sayfayı yenile" })).toBeVisible();
    } finally {
      await adminContext.close();
      await employeeContext.close();
    }
  });

  test("liste: Türkçe/telefon/e-posta/numara araması, hizmet ve durum filtresi, sayfalama, satır kopyalama", async ({
    page,
    context,
    signInAs,
    runtimeDb,
  }, testInfo) => {
    test.skip(
      !["Desktop Chrome", "Mobile Chrome"].includes(testInfo.project.name),
      "veri yoğun; iki projede",
    );
    const admin = await signInAs("admin");
    const { name, serviceId } = await seedService(runtimeDb, admin.userId, [{ title: "Pasaport" }]);
    const unique = randomBytes(2).toString("hex").replace(/[0-9]/g, "q");
    // 11 sentetik başvuru (doğrudan; oluşturma akışı ayrı testte) + bağlantısız.
    for (let i = 0; i < 11; i += 1) {
      const number = `CS-2094-${randomInt(100_000_000_000, 999_999_999_999)}`; /* 12 hane: paket genelinde çakışma ihmal edilebilir (D-133 notu) */
      await runtimeDb.query(
        `INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot, created_by_user_id, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - make_interval(secs => $11))`,
        [
          number,
          i === 0 ? "Şükrü" : "Deneme",
          `Kişi${unique}`,
          i === 0 ? "+905334445566" : `+9053200000${String(10 + i)}`,
          `k${i}.${unique}@example.invalid`,
          `${i === 0 ? "sukru" : "deneme"} kisi${unique} k${i}.${unique}@example.invalid ${i === 0 ? "905334445566 5334445566 05334445566" : `9053200000${10 + i}`}`,
          serviceId,
          name,
          admin.userId,
          randomUUID(),
          i,
        ],
      );
    }
    await page.goto(`/dashboard/applications?serviceId=${serviceId}&pageSize=10`);
    await expect(page.getByTestId("pagination-summary")).toHaveText("11 kayıt · Sayfa 1 / 2");
    await page.getByRole("button", { name: "Sonraki" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("pagination-summary")).toHaveText("11 kayıt · Sayfa 2 / 2");
    await screenshot(page, testInfo, "application-list-desktop", ["Desktop Chrome"]);
    await screenshot(page, testInfo, "application-list-mobile", ["Mobile Chrome"]);

    for (const query of [
      `ŞÜKRÜ KİŞİ${unique.toUpperCase()}`,
      "0533 444 55 66",
      `k0.${unique}@example.invalid`,
    ]) {
      await page.getByRole("searchbox", { name: "Başvuru ara" }).fill(query);
      await page.getByRole("button", { name: "Ara" }).click();
      await expect(page.getByTestId("pagination-summary"), query).toHaveText(
        "1 kayıt · Sayfa 1 / 1",
      );
      // Arama metni URL'ye yazılmaz (D-085). Rastgele UUID'ler rakam içerebileceğinden yalnızca
      // sorgu parametre değerleri (kimlik olmayanlar) ve parametre adları kontrol edilir.
      const params = new URL(page.url()).searchParams;
      expect([...params.keys()].sort()).not.toContain("q");
      for (const [name, value] of params) {
        if (name !== "serviceId") expect(value, name).not.toMatch(/444|şükrü|example\.invalid/i);
      }
    }
    await page.locator("#filter-status").selectOption("COMPLETED");
    await expect(
      page.getByText(/Aramanıza veya filtrelere uygun başvuru bulunamadı\./),
    ).toBeVisible();

    // Bağlantılı başvuru satırından kopyalama (yalnızca Chromium'da pano izni verilebilir).
    const created = await createViaUi(page, name);
    await page.goto(`/dashboard/applications?serviceId=${serviceId}`);
    const copyButton = page
      .getByRole("button", { name: `${created.number} bağlantısını kopyala` })
      .locator("visible=true");
    if (testInfo.project.name === "Desktop Chrome")
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await copyButton.click();
    await expect(
      page.getByText(/Bağlantı panoya kopyalandı\.|Panoya kopyalanamadı/).first(),
    ).toBeVisible();
    if (testInfo.project.name === "Desktop Chrome") {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(created.link);
    }
  });

  test("silme sürecindeki başvuru detayda 404 ve listede yok", async ({
    page,
    signInAs,
    runtimeDb,
  }) => {
    const admin = await signInAs("admin");
    const { name } = await seedService(runtimeDb, admin.userId, [{ title: "Pasaport" }]);
    const created = await createViaUi(page, name);
    await openDetail(page);
    const url = page.url();
    await runtimeDb.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $2 WHERE application_number = $1",
      [created.number, admin.userId],
    );
    expect((await page.goto(url))?.status()).toBe(404);
  });
});
