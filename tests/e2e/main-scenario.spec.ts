import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";

import { devices, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { expect, test } from "./fixtures";

/**
 * TESTING_STRATEGY §5.1 — zorunlu 19 adımlı ana senaryo (PHASE 09.1). Tek başvuru, baştan sona, YALNIZCA
 * gerçek arayüz etkileşimleriyle (veritabanına doğrudan statü yazımı, test bypass'ı veya oturum basımı
 * yok; personel şifreyle giriş/çıkış yapar). İzole veritabanı + geçici `test-` hesapları (rastgele
 * şifreler) + geçici yerel depolama; gerçek B2 yok. WhatsApp açılmaz (yalnızca bağlantı doğrulanır).
 * Desktop Chrome ve Desktop WebKit; müşteri ayrı bağlamda mobil cihaz emülasyonuyla.
 */
const isolated = isIsolatedTestDatabase();
const accountsAvailable = process.env.E2E_ACCOUNTS === "available";
const admin = {
  username: process.env.E2E_ADMIN_USERNAME ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
const employee = {
  username: process.env.E2E_EMPLOYEE_USERNAME ?? "",
  password: process.env.E2E_EMPLOYEE_PASSWORD ?? "",
};

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (process.env.E2E_SCREENSHOTS !== "1") return;
  mkdirSync("screenshots/phase-09", { recursive: true });
  const suffix = testInfo.project.name === "Desktop WebKit" ? "-webkit" : "";
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/phase-09/main-${name}${suffix}.png`, fullPage: true });
}

async function signIn(page: Page, account: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Kullanıcı adı").fill(account.username);
  await page.getByLabel("Şifre", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signOut(page: Page, username: string) {
  await page.getByRole("button", { name: `Hesap menüsü: ${username}` }).click();
  await page.getByRole("menuitem", { name: "Çıkış Yap" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function confirm(page: Page, label: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** Dosya seçimi (hydration/akış sırasında kaybolan olaya karşı durum alanı dolana kadar tekrar). */
async function choosePdf(card: Locator, name: string) {
  await expect(async () => {
    await card
      .getByTestId("pdf-upload-input")
      .setInputFiles({ name, mimeType: "application/pdf", buffer: fixtures.valid() });
    await expect(card.getByTestId("pdf-upload-status")).not.toBeEmpty({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(card.getByTestId("portal-active-file")).toContainText(name, { timeout: 30_000 });
}

async function customerContext(browser: Browser, testInfo: TestInfo) {
  const device =
    testInfo.project.name === "Desktop WebKit" ? devices["iPhone 15"] : devices["Pixel 7"];
  return browser.newContext({ ...device, baseURL: testInfo.project.use.baseURL });
}

test.describe("ana senaryo — 19 adım (TESTING_STRATEGY §5.1)", () => {
  test.skip(!isolated || !accountsAvailable, ISOLATION_SKIP_REASON);

  test("ADMIN hizmet → EMPLOYEE başvuru → müşteri yükleme/gönderim → inceleme/düzeltme → yeniden gönderim → onay → işlem → tamamlandı", async ({
    page,
    context,
    browser,
  }, testInfo) => {
    test.skip(
      !["Desktop Chrome", "Desktop WebKit"].includes(testInfo.project.name),
      "ana senaryo masaüstü Chrome/WebKit projelerinde; müşteri mobil emülasyonla",
    );
    test.setTimeout(240_000);
    const tag = randomBytes(3).toString("hex");
    const serviceName = `Ana Senaryo Vizesi ${tag}`;
    const opened: string[] = [];
    await context.route("https://wa.me/**", async (route) => {
      opened.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<p>yakalandı</p>" });
    });

    // 1. ADMIN giriş.
    await signIn(page, admin);
    // 2. Hizmet oluşturma.
    await page.goto("/dashboard/services/new");
    await page.getByLabel("Hizmet adı").fill(serviceName);
    await page.getByRole("button", { name: "Hizmeti Oluştur" }).click();
    await expect(page.getByRole("heading", { level: 1, name: serviceName })).toBeVisible();
    // 3. Evrak gereksinimleri (2 zorunlu, 1 isteğe bağlı).
    for (const [title, required] of [
      ["Pasaport", true],
      ["Banka Dökümü", true],
      ["Ek Belge", false],
    ] as const) {
      await page.getByRole("button", { name: "Yeni Evrak Ekle" }).click();
      const form = page.getByRole("form", { name: "Yeni evrak gereksinimi" });
      await form.getByLabel("Evrak adı").fill(title);
      await form
        .getByLabel("Müşteriye gösterilecek yükleme talimatı")
        .fill(`${title} — okunaklı PDF yükleyiniz.`);
      if (!required) await form.getByLabel("Zorunlu evrak").uncheck();
      await form.getByRole("button", { name: "Evrakı Ekle" }).click();
      await expect(
        page
          .getByTestId("requirement-item")
          .filter({ has: page.getByRole("heading", { name: title }) }),
      ).toBeVisible();
    }
    // (Adım 2–3'ün parçası) Yeni hizmet varsayılan olarak pasif oluşturulur; evraklar eklendikten sonra aktifleştirilir.
    await page.getByRole("button", { name: "Hizmeti aktifleştir" }).click();
    await expect(page.getByRole("button", { name: "Hizmeti pasifleştir" })).toBeVisible();
    // 4. ADMIN çıkış.
    await signOut(page, admin.username);

    // 5. EMPLOYEE aynı giriş ekranından (zorunlu şifre değişimi yok).
    await signIn(page, employee);
    // 6. Yeni başvuru.
    await page.goto("/dashboard/applications/new");
    await page.locator("#application-firstName").fill("Ece");
    await page.locator("#application-lastName").fill("Kaya");
    await page.locator("#application-phone").fill("0532 765 43 21");
    await page.locator("#application-email").fill(`ece.${tag}@example.invalid`);
    await page.locator("#application-serviceId").selectOption({ label: serviceName });
    await expect(page.getByTestId("service-preview").getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Başvuru Oluştur" }).click();
    await expect(
      page.getByRole("heading", { name: "Başvuru başarıyla oluşturuldu!" }),
    ).toBeVisible();
    // 7. Sonuç ekranı: bağlantı, Kopyala, WhatsApp (onay penceresinde ad + telefon; wa.me + mesaj; açılmaz).
    const link = await page.locator("#created-link").inputValue();
    expect(link).toMatch(/\/b\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByRole("button", { name: /Kopyala/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "WhatsApp ile Paylaş" }).click();
    const share = page.getByRole("dialog", { name: /WhatsApp ile paylaş/ });
    await share.getByRole("button", { name: "Mesajı hazırla" }).click();
    await expect(share.getByTestId("whatsapp-recipient")).toContainText("Ece Kaya");
    await expect(share.getByTestId("whatsapp-recipient")).toContainText("+90 532 765 43 21");
    const href = (await share.getByRole("link", { name: "WhatsApp'ta aç" }).getAttribute("href"))!;
    expect(href.startsWith("https://wa.me/905327654321?text=")).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1]!)).toContain(link);
    expect(opened).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Başvuru Detayına Git" }).click();
    await expect(page).toHaveURL(/\/dashboard\/applications\/[0-9a-f-]{36}$/);
    const applicationId = page.url().split("/").at(-1)!;

    // 8. Müşteri (mobil, ayrı bağlam) bağlantıyı açar → doğrudan portal; adres çubuğunda token yok.
    const customerCtx = await customerContext(browser, testInfo);
    const customer = await customerCtx.newPage();
    const token = link.split("/b/")[1]!;
    await customer.goto(new URL(link).pathname);
    await expect(customer).toHaveURL(/\/portal\/[A-Za-z0-9_-]{22}$/);
    expect(customer.url()).not.toContain(token);
    await expect(customer.getByRole("heading", { level: 1 })).toContainText("Ece Kaya");
    // 9. PDF yükleme (ilerleme → "Yüklendi").
    const docs = customer.getByTestId("portal-document");
    await choosePdf(docs.nth(0), "pasaport.pdf");
    await choosePdf(docs.nth(1), "dokum-v1.pdf");
    await expect(customer.getByTestId("document-progress")).toContainText(
      "2 / 2 zorunlu evrak yüklendi · %100",
    );
    // 10. İncelemeye gönder.
    await customer.getByRole("button", { name: "İncelemeye Gönder" }).click();
    await confirm(customer, "İncelemeye Gönder");
    await expect(customer.getByTestId("submitted-notice")).toBeVisible();

    // 11. EMPLOYEE inceler; Pasaport onay.
    await page.reload();
    const staffDocs = page.getByTestId("staff-document");
    await expect(staffDocs.nth(0).getByTestId("review-actions")).toContainText("v1");
    await staffDocs.nth(0).getByRole("button", { name: "Onayla" }).click();
    await confirm(page, "Onayla");
    await expect(staffDocs.nth(0)).toContainText("Onaylandı");
    // 12. Banka Dökümü için gerekçeli düzeltme + "Düzeltmeye Gönder".
    await staffDocs.nth(1).getByRole("button", { name: "Düzeltme İste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("textbox")
      .fill("Dökümün son üç ayı eksik; lütfen tam dökümü yükleyiniz.");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Düzeltme İste", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeHidden({ timeout: 20_000 });
    await expect(staffDocs.nth(1)).toContainText("Düzeltme Gerekli");
    await page.locator('[data-action="REQUEST_REVISION"]').click();
    await confirm(page, "Düzeltmeye Gönder");
    await expect(page.getByTestId("application-history")).toContainText("Düzeltme talep edildi");

    // 13. Müşteri açıklamayı görür.
    await customer.reload();
    await expect(docs.nth(1)).toContainText(
      "Dökümün son üç ayı eksik; lütfen tam dökümü yükleyiniz.",
    );
    await expect(docs.nth(0).getByTestId("pdf-upload")).toHaveCount(0); // onaylı evrak kilitli
    // 14. Evrağı değiştirir (yeni versiyon).
    await choosePdf(docs.nth(1), "dokum-v2.pdf");
    // 15. Tekrar gönderir.
    await customer.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
    await confirm(customer, "Yeniden İncelemeye Gönder");
    await expect(customer.getByTestId("submitted-notice")).toBeVisible();

    // 16. EMPLOYEE yeni versiyonu (v2) onaylar → "Evrakları Onayla".
    await page.reload();
    await expect(staffDocs.nth(1).getByTestId("review-actions")).toContainText("v2");
    await staffDocs.nth(1).getByRole("button", { name: "Onayla" }).click();
    await confirm(page, "Onayla");
    await page.locator('[data-action="APPROVE_DOCUMENTS"]').click();
    await confirm(page, "Evrakları Onayla");
    // 17. Başvuru "İşlemde".
    await page.locator('[data-action="START_PROCESSING"]').click();
    await confirm(page, "Başvuruyu İşleme Al");
    await expect(page.getByTestId("application-summary")).toContainText("Başvuru İşlemde");
    // 18. Tamamlandı.
    await page.locator('[data-action="COMPLETE"]').click();
    await confirm(page, "Başvuruyu Tamamla");
    await expect(page.getByTestId("application-summary")).toContainText("Süreç Tamamlandı");
    await shot(page, testInfo, "staff-completed");

    // 19. Müşteri güncel süreci salt okunur görür; bağlantı hâlâ geçerli.
    await customer.goto(new URL(link).pathname);
    await expect(customer).toHaveURL(/\/portal\/[A-Za-z0-9_-]{22}$/);
    await expect(customer.getByTestId("portal-status-message")).toContainText(
      "CS Global danışmanlık süreciniz tamamlandı.",
    );
    await expect(customer.getByTestId("pdf-upload")).toHaveCount(0);
    await expect(customer.getByTestId("submit-panel")).toHaveCount(0);
    await expect(customer.getByRole("button", { name: "Dosyayı Kaldır" })).toHaveCount(0);
    await expect(customer.getByTestId("portal-timeline")).toContainText("Süreç Tamamlandı");
    await shot(customer, testInfo, "customer-completed");

    // Bütünlük: dosya versiyonları, kararlar, statü geçmişi, audit, bağlantı.
    const db = await connect(resolveDatabaseUrls().runtime, "cs-global-e2e-main");
    try {
      const files = await db.query<{ title: string; status: string; version_number: number }>(
        `SELECT r.title, f.status, f.version_number FROM application_document_files f
           JOIN application_document_requirements r ON r.id = f.requirement_id
          WHERE f.application_id = $1 ORDER BY r.sort_order, f.version_number`,
        [applicationId],
      );
      expect(files.rows.map((r) => [r.title, r.status, r.version_number])).toEqual([
        ["Pasaport", "ACTIVE", 1],
        ["Banka Dökümü", "SUPERSEDED", 1],
        ["Banka Dökümü", "ACTIVE", 2],
      ]);
      const reviews = await db.query<{ title: string; decision: string; version_number: number }>(
        `SELECT r.title, d.decision, f.version_number FROM document_reviews d
           JOIN application_document_requirements r ON r.id = d.requirement_id
           JOIN application_document_files f ON f.id = d.file_id
          WHERE d.application_id = $1 ORDER BY d.created_at`,
        [applicationId],
      );
      expect(reviews.rows.map((r) => [r.title, r.decision, r.version_number])).toEqual([
        ["Pasaport", "APPROVED", 1],
        ["Banka Dökümü", "REVISION_REQUIRED", 1],
        ["Banka Dökümü", "APPROVED", 2],
      ]);
      const history = await db.query<{ transition_code: string; actor_type: string }>(
        "SELECT transition_code, actor_type FROM application_status_history WHERE application_id = $1 ORDER BY created_at, id",
        [applicationId],
      );
      expect(history.rows.map((r) => `${r.transition_code}:${r.actor_type}`)).toEqual([
        "CREATE:USER",
        "SUBMIT:CUSTOMER",
        "REQUEST_REVISION:USER",
        "RESUBMIT:CUSTOMER",
        "APPROVE_DOCUMENTS:USER",
        "START_PROCESSING:USER",
        "COMPLETE:USER",
      ]);
      const audit = await db.query<{ action: string; n: number }>(
        "SELECT action, count(*)::int AS n FROM audit_logs WHERE application_id = $1 GROUP BY action",
        [applicationId],
      );
      const counts = Object.fromEntries(audit.rows.map((r) => [r.action, r.n]));
      expect(counts).toMatchObject({
        APPLICATION_CREATED: 1,
        DOCUMENT_UPLOADED: 2,
        DOCUMENT_REPLACED: 1,
        APPLICATION_SUBMITTED: 1,
        APPLICATION_RESUBMITTED: 1,
        DOCUMENT_APPROVED: 2,
        DOCUMENT_REVISION_REQUESTED: 1,
        APPLICATION_STATUS_CHANGED: 4,
      });
      const auditText = JSON.stringify(
        await db
          .query("SELECT metadata FROM audit_logs WHERE application_id = $1", [applicationId])
          .then((r) => r.rows),
      );
      expect(auditText).not.toMatch(/son üç ayı|Ece|Kaya|dokum-v|pasaport\.pdf/);
      const tokenRow = await db.query(
        "SELECT count(*)::int AS n FROM application_access_tokens WHERE application_id = $1 AND revoked_at IS NULL",
        [applicationId],
      );
      expect(tokenRow.rows[0].n).toBe(1);
    } finally {
      await db.end();
    }
    await customerCtx.close();
  });
});
