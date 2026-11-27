import { mkdirSync } from "node:fs";

import type { Browser, Page, TestInfo } from "@playwright/test";
import type pg from "pg";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import {
  CUSTOMER_COOKIE,
  insertToken,
  seedActiveFile,
  seedApplication,
  signCustomerSession,
} from "../support/portal-seed";
import { openCustomerLink } from "./customer-link";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * Evrak inceleme ve başvuru iş akışı (PHASE 09). YALNIZCA izole veritabanı (commit eden mutasyonlar);
 * sentetik veri. Müşteri ve personel ayrı tarayıcı bağlamlarında.
 */
const isolated = isIsolatedTestDatabase();

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (process.env.E2E_SCREENSHOTS !== "1" || !isolated) return;
  if (!["Desktop Chrome", "Mobile Safari"].includes(testInfo.project.name)) return;
  const suffix = testInfo.project.name === "Mobile Safari" ? "-mobile" : "";
  mkdirSync("screenshots/phase-09", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/phase-09/${name}${suffix}.png`, fullPage: true });
}

async function customerPage(browser: Browser, testInfo: TestInfo, token: string) {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL: testInfo.project.use.baseURL,
  });
  const page = await context.newPage();
  await openCustomerLink(page, token);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page;
}

async function confirmDialog(page: Page, button: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

const reqIds = async (db: pg.Client, applicationId: string) =>
  (
    await db.query<{ id: string }>(
      "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
      [applicationId],
    )
  ).rows.map((row) => row.id);

const appStatus = async (db: pg.Client, applicationId: string) =>
  (
    await db.query<{ status: string }>("SELECT status FROM applications WHERE id = $1", [
      applicationId,
    ])
  ).rows[0]!.status;

test.describe("iş akışı (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  test("müşteri gönderir → personel karar + düzeltme talebi → müşteri düzeltme açıklamasını görür", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [
        { title: "Pasaport" },
        { title: "Banka Dökümü" },
        { title: "Ek Belge", required: false },
      ],
    });
    const [passport, bank] = await reqIds(runtimeDb, app.applicationId);

    // Müşteri: zorunlu eksikken gönderim pasif ve neden gösterilir.
    const customer = await customerPage(browser, testInfo, app.token);
    await expect(customer.getByTestId("submit-blockers")).toContainText("tüm zorunlu evrakları");
    await expect(customer.getByRole("button", { name: "İncelemeye Gönder" })).toBeDisabled();
    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, passport!);
    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, bank!);
    await customer.reload();
    await customer.getByRole("button", { name: "İncelemeye Gönder" }).click();
    await expect(customer.getByRole("alertdialog")).toContainText(
      "İnceleme süresince evraklarınızı değiştiremezsiniz",
    );
    await confirmDialog(customer, "İncelemeye Gönder");
    await expect(customer.getByTestId("submitted-notice")).toContainText(
      "Evraklarınız incelemeye gönderildi.",
    );
    await expect(customer.getByTestId("pdf-upload")).toHaveCount(0);
    await expect(customer.getByTestId("portal-timeline")).toContainText("İncelemede");
    await shot(customer, testInfo, "customer-under-review");
    expect(await appStatus(runtimeDb, app.applicationId)).toBe("UNDER_REVIEW");

    // Personel: pasaport onay, döküm düzeltme (müşteriye açıklama), "Evrakları Onayla" pasif, "Düzeltmeye Gönder".
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    const cards = page.getByTestId("staff-document");
    await expect(cards.nth(0).getByTestId("review-actions")).toContainText("v1");
    await cards.nth(0).getByRole("button", { name: "Onayla" }).click();
    await confirmDialog(page, "Onayla");
    await expect(cards.nth(0)).toContainText("Onaylandı");
    await cards.nth(1).getByRole("button", { name: "Düzeltme İste" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("textbox").fill("kısa");
    await dialog.getByRole("button", { name: "Düzeltme İste", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("10–1000");
    await dialog
      .getByRole("textbox")
      .fill("Dökümün son sayfası eksik, lütfen tamamını yükleyiniz.");
    await dialog.getByRole("button", { name: "Düzeltme İste", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(cards.nth(1)).toContainText("Düzeltme Gerekli");
    await expect(page.locator('[data-action="APPROVE_DOCUMENTS"]')).toBeDisabled();
    await shot(page, testInfo, "staff-review");
    await page.locator('[data-action="REQUEST_REVISION"]').click();
    await confirmDialog(page, "Düzeltmeye Gönder");
    await expect(page.getByTestId("application-history")).toContainText("Düzeltme talep edildi");

    // Müşteri: düzeltme açıklaması; onaylı evrak değiştirilemez; düzeltilecek evrak değiştirilebilir.
    await customer.reload();
    const docs = customer.getByTestId("portal-document");
    await expect(docs.nth(1)).toContainText("Dökümün son sayfası eksik");
    await expect(docs.nth(0).getByTestId("pdf-upload")).toHaveCount(0);
    await expect(docs.nth(1).getByRole("button", { name: "Dosyayı Değiştir" })).toBeVisible();
    await expect(
      customer.getByRole("button", { name: "Yeniden İncelemeye Gönder" }),
    ).toBeDisabled();
    await shot(customer, testInfo, "customer-revision");
    expect(await appStatus(runtimeDb, app.applicationId)).toBe("REVISION_REQUIRED");

    // Personel görünümü: inceleme geçmişi karar ve dosya versiyonunu gösterir; iptal her durumda mümkün.
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await cards.nth(1).getByTestId("staff-review-history").locator("summary").click();
    await expect(cards.nth(1).getByTestId("staff-review")).toContainText("Düzeltme istendi · v1");
    await expect(page.locator('[data-action="CANCEL"]')).toBeEnabled();
  });

  test("gönderim, karar ve durum aksiyonları gerçek UI ile; iptal gerekçesi müşteriye gösterilmez; yorum müşteriye görünür", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("employee");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const [passport] = await reqIds(runtimeDb, app.applicationId);
    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, passport!);

    // Personel müşteri adına gönderir → onaylar → Evrakları Onayla → İşleme Al → Tamamla.
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.locator('[data-action="SUBMIT"]').click();
    await confirmDialog(page, "İncelemeye Gönder (müşteri adına)");
    await expect(page.getByTestId("application-history")).toContainText("müşteri adına");
    await page
      .getByTestId("staff-document")
      .first()
      .getByRole("button", { name: "Onayla" })
      .click();
    await confirmDialog(page, "Onayla");
    for (const [code, label] of [
      ["APPROVE_DOCUMENTS", "Evrakları Onayla"],
      ["START_PROCESSING", "Başvuruyu İşleme Al"],
      ["COMPLETE", "Başvuruyu Tamamla"],
    ] as const) {
      await page.locator(`[data-action="${code}"]`).click();
      await confirmDialog(page, label);
    }
    expect(await appStatus(runtimeDb, app.applicationId)).toBe("COMPLETED");

    // Yorum ekle (düz metin).
    await page
      .getByTestId("comment-form")
      .getByRole("textbox")
      .fill("Danışmanlık süreciniz tamamlandı.\n<b>Teşekkürler</b>");
    await page.getByTestId("comment-form").getByRole("button", { name: "Yorum Ekle" }).click();
    await expect(page.getByTestId("staff-comments")).toContainText(
      "Danışmanlık süreciniz tamamlandı.",
    );

    // Yeniden aç (gerekçe zorunlu) → iptal (gerekçe zorunlu).
    await page.locator('[data-action="REOPEN_COMPLETED"]').click();
    const reopen = page.getByRole("alertdialog");
    await reopen.getByRole("button", { name: "Başvuruyu Yeniden Aç", exact: true }).click();
    await expect(reopen.getByRole("alert")).toContainText("Gerekçe zorunludur");
    await reopen.getByRole("textbox").fill("Ek talep");
    await reopen.getByRole("button", { name: "Başvuruyu Yeniden Aç", exact: true }).click();
    await expect(reopen).toBeHidden({ timeout: 15_000 });
    await page.locator('[data-action="CANCEL"]').click();
    const cancel = page.getByRole("alertdialog");
    await expect(cancel).toContainText("silinmeyecektir");
    await cancel.getByRole("textbox").fill("GİZLİ-İÇ-GEREKÇE müşteri vazgeçti");
    await cancel.getByRole("button", { name: "Başvuruyu İptal Et", exact: true }).click();
    await expect(cancel).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId("application-history")).toContainText("GİZLİ-İÇ-GEREKÇE");
    await shot(page, testInfo, "staff-history");
    expect(await appStatus(runtimeDb, app.applicationId)).toBe("CANCELLED");

    // Müşteri: iptal bilgisi; gerekçe, personel adı, aktör yok; yorum görünür (HTML çalıştırılmadan).
    const customer = await customerPage(browser, testInfo, app.token);
    await expect(customer.getByTestId("process-cancelled")).toBeVisible();
    await expect(customer.getByTestId("portal-comments")).toContainText("<b>Teşekkürler</b>");
    await expect(customer.locator("b")).toHaveCount(0);
    const html = await customer.content();
    expect(html).not.toContain("GİZLİ-İÇ-GEREKÇE");
    expect(html).not.toContain(admin.username);
    await expect(customer.getByTestId("submit-panel")).toHaveCount(0);
    await shot(customer, testInfo, "customer-cancelled");
    // Bağlantı iptal edilmedi.
    const token = await runtimeDb.query(
      "SELECT revoked_at FROM application_access_tokens WHERE id = $1",
      [app.tokenId],
    );
    expect(token.rows[0].revoked_at).toBeNull();
  });

  test("müşteri: düzeltme sonrası gerçek yükleme + yeniden gönderim; dosya kaldırma", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }, { title: "Fotoğraf", required: false }],
    });
    const [passport, photo] = await reqIds(runtimeDb, app.applicationId);
    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, photo!);
    const customer = await customerPage(browser, testInfo, app.token);
    // Kaldırma (D2): isteğe bağlı evrak dosyası.
    await customer
      .getByTestId("portal-document")
      .nth(1)
      .getByRole("button", { name: "Dosyayı Kaldır" })
      .click();
    await confirmDialog(customer, "Dosyayı Kaldır");
    await expect(
      customer.getByTestId("portal-document").nth(1).getByTestId("portal-active-file"),
    ).toHaveCount(0);
    const removed = await runtimeDb.query(
      "SELECT status FROM application_document_files WHERE requirement_id = $1",
      [photo],
    );
    expect(removed.rows.map((r) => r.status)).toEqual(["REMOVED"]);

    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, passport!);
    await customer.reload();
    await customer.getByRole("button", { name: "İncelemeye Gönder" }).click();
    await confirmDialog(customer, "İncelemeye Gönder");
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page
      .getByTestId("staff-document")
      .first()
      .getByRole("button", { name: "Düzeltme İste" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("textbox")
      .fill("Lütfen renkli ve okunaklı tarama yükleyiniz.");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Düzeltme İste", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeHidden({ timeout: 15_000 });
    await page.locator('[data-action="REQUEST_REVISION"]').click();
    await confirmDialog(page, "Düzeltmeye Gönder");

    await customer.reload();
    const card = customer.getByTestId("portal-document").first();
    await expect(card).toContainText("Lütfen renkli ve okunaklı tarama yükleyiniz.");
    const { fixtures } = await import("../support/pdf-fixtures");
    await expect(async () => {
      await card.getByTestId("pdf-upload-input").setInputFiles({
        name: "duzeltilmis.pdf",
        mimeType: "application/pdf",
        buffer: fixtures.valid(),
      });
      await expect(card.getByTestId("pdf-upload-status")).not.toBeEmpty({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(card.getByTestId("portal-active-file")).toContainText("duzeltilmis.pdf", {
      timeout: 20_000,
    });
    await customer.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
    await confirmDialog(customer, "Yeniden İncelemeye Gönder");
    await expect(customer.getByTestId("submitted-notice")).toBeVisible();
    expect(await appStatus(runtimeDb, app.applicationId)).toBe("UNDER_REVIEW");
    await shot(customer, testInfo, "customer-resubmitted");
  });

  test("ÇOKLU SEKME: başka başvuru açıldıktan sonra eski sekmeden gönderim reddedilir; hiçbir başvuruda değişiklik yok", async ({
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const a = await seedApplication(runtimeDb, admin.userId, {
      firstName: "Ada",
      documents: [{ title: "Pasaport" }],
    });
    const b = await seedApplication(runtimeDb, admin.userId, {
      firstName: "Bora",
      documents: [{ title: "Pasaport" }],
    });
    for (const app of [a, b]) {
      const [req] = await reqIds(runtimeDb, app.applicationId);
      await seedActiveFile(runtimeDb, admin.userId, app.applicationId, req!);
    }
    const context = await browser.newContext({ ...testInfo.project.use });
    const tabA = await context.newPage();
    await openCustomerLink(tabA, a.token);
    await expect(tabA.getByRole("heading", { level: 1 })).toContainText("Ada");
    const tabB = await context.newPage();
    await openCustomerLink(tabB, b.token);
    await expect(tabB.getByRole("heading", { level: 1 })).toContainText("Bora");
    await tabA.getByRole("button", { name: "İncelemeye Gönder" }).click();
    await tabA
      .getByRole("alertdialog")
      .getByRole("button", { name: "İncelemeye Gönder", exact: true })
      .click();
    await expect(tabA.getByText("Bu sayfa artık güncel değil").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await appStatus(runtimeDb, a.applicationId)).toBe("AWAITING_DOCUMENTS");
    expect(await appStatus(runtimeDb, b.applicationId)).toBe("AWAITING_DOCUMENTS");
    const history = await runtimeDb.query(
      "SELECT 1 FROM application_status_history WHERE application_id = ANY($1::uuid[]) AND transition_code = 'SUBMIT'",
      [[a.applicationId, b.applicationId]],
    );
    expect(history.rowCount).toBe(0);
    await context.close();
  });

  test("TM-40 / oturum: eski sekmeden yeniden gönderim ve kaldırma, eski form tekrarı, süresi dolmuş oturum, iptal ve yenilenmiş bağlantı reddedilir", async ({
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const seedRevision = async (firstName: string) => {
      const app = await seedApplication(runtimeDb, admin.userId, {
        firstName,
        status: "REVISION_REQUIRED",
        documents: [{ title: "Pasaport" }, { title: "Ek", required: false }],
      });
      const [req, optional] = await reqIds(runtimeDb, app.applicationId);
      await seedActiveFile(runtimeDb, admin.userId, app.applicationId, req!);
      await seedActiveFile(runtimeDb, admin.userId, app.applicationId, optional!);
      return app;
    };
    const history = async (ids: string[]) =>
      (
        await runtimeDb.query(
          "SELECT 1 FROM application_status_history WHERE application_id = ANY($1::uuid[]) AND transition_code <> 'CREATE'",
          [ids],
        )
      ).rowCount;
    const a = await seedRevision("Ada");
    const b = await seedRevision("Bora");
    const context = await browser.newContext({ ...testInfo.project.use });
    const tabA = await context.newPage();
    await openCustomerLink(tabA, a.token);
    await expect(tabA.getByRole("button", { name: "Yeniden İncelemeye Gönder" })).toBeEnabled();
    const tabA2 = await context.newPage(); // aynı bağlantı ikinci sekme (aynı bağlam — D-090)
    await openCustomerLink(tabA2, a.token);
    const tabB = await context.newPage();
    await openCustomerLink(tabB, b.token);
    await expect(tabB.getByRole("heading", { level: 1 })).toContainText("Bora");

    // Eski sekmeden yeniden gönderim ve kaldırma → reddedilir; hiçbir başvuruda değişiklik yok.
    await tabA.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
    await tabA
      .getByRole("alertdialog")
      .getByRole("button", { name: "Yeniden İncelemeye Gönder", exact: true })
      .click();
    await expect(tabA.getByText("Bu sayfa artık güncel değil").first()).toBeVisible({
      timeout: 15_000,
    });
    await tabA2
      .getByTestId("portal-document")
      .nth(1)
      .getByRole("button", { name: "Dosyayı Kaldır" })
      .click();
    await tabA2
      .getByRole("alertdialog")
      .getByRole("button", { name: "Dosyayı Kaldır", exact: true })
      .click();
    await expect(tabA2.getByText("Bu sayfa artık güncel değil").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await appStatus(runtimeDb, a.applicationId)).toBe("REVISION_REQUIRED");
    expect(await appStatus(runtimeDb, b.applicationId)).toBe("REVISION_REQUIRED");
    expect(await history([a.applicationId, b.applicationId])).toBe(0);
    const removed = await runtimeDb.query(
      "SELECT 1 FROM application_document_files WHERE application_id = ANY($1::uuid[]) AND status = 'REMOVED'",
      [[a.applicationId, b.applicationId]],
    );
    expect(removed.rowCount).toBe(0);

    // A bağlantısı yeniden açılır (bağlam A); A2 sekmesi eski formu taşır. A gönderir → A2'den tekrar: yan etkisiz.
    await openCustomerLink(tabA, a.token);
    await openCustomerLink(tabA2, a.token);
    await tabA.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
    await tabA
      .getByRole("alertdialog")
      .getByRole("button", { name: "Yeniden İncelemeye Gönder", exact: true })
      .click();
    await expect(tabA.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });
    await tabA2.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
    await tabA2
      .getByRole("alertdialog")
      .getByRole("button", { name: "Yeniden İncelemeye Gönder", exact: true })
      .click();
    await expect(tabA2.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 }); // yenilenen gerçek durum
    expect(await history([a.applicationId])).toBe(1);

    // Süresi dolmuş oturum: açık sayfadayken cookie süresi geçmiş imzalı değerle değişir → kaldırma reddedilir.
    const contextId = tabB.url().split("/portal/")[1]!;
    const now = Math.floor(Date.now() / 1000);
    await context.addCookies([
      {
        name: CUSTOMER_COOKIE,
        value: signCustomerSession({
          v: 1,
          typ: "cs-portal",
          aid: b.applicationId,
          tid: b.tokenId,
          ctx: contextId,
          iat: now - 8 * 86400,
          exp: now - 86400,
        }),
        url: testInfo.project.use.baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await tabB
      .getByTestId("portal-document")
      .nth(1)
      .getByRole("button", { name: "Dosyayı Kaldır" })
      .click();
    await tabB
      .getByRole("alertdialog")
      .getByRole("button", { name: "Dosyayı Kaldır", exact: true })
      .click();
    await expect(tabB.getByText("Oturumunuz sona erdi").first()).toBeVisible({ timeout: 15_000 });

    // İptal edilen ve yenilenen bağlantı: açık sayfadan işlem reddedilir.
    for (const reason of ["REVOKED", "ROTATED"] as const) {
      const app = await seedRevision(reason === "REVOKED" ? "Cem" : "Deniz");
      const tab = await context.newPage();
      await openCustomerLink(tab, app.token);
      await expect(tab.getByRole("button", { name: "Yeniden İncelemeye Gönder" })).toBeEnabled();
      await runtimeDb.query(
        "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = $1, revoked_by_user_id = $2 WHERE id = $3",
        [reason, admin.userId, app.tokenId],
      );
      if (reason === "ROTATED") await insertToken(runtimeDb, app.applicationId, admin.userId);
      await tab.getByRole("button", { name: "Yeniden İncelemeye Gönder" }).click();
      await tab
        .getByRole("alertdialog")
        .getByRole("button", { name: "Yeniden İncelemeye Gönder", exact: true })
        .click();
      await expect(
        tab.getByText(/Oturumunuz sona erdi|Bağlantınız kullanılamıyor/).first(),
      ).toBeVisible({ timeout: 15_000 });
      expect(await appStatus(runtimeDb, app.applicationId)).toBe("REVISION_REQUIRED");
    }
    await context.close();
  });

  test("yorum: çift tıklama tek yorum oluşturur", async ({ page, runtimeDb, signInAs }) => {
    const admin = await signInAs("employee");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page
      .getByTestId("comment-form")
      .getByRole("textbox")
      .fill("Evraklarınız tarafımıza ulaştı.");
    await page.getByTestId("comment-form").getByRole("button", { name: "Yorum Ekle" }).dblclick();
    await expect(page.getByTestId("staff-comments").getByRole("listitem")).toHaveCount(1);
    const rows = await runtimeDb.query(
      "SELECT 1 FROM document_comments WHERE application_id = $1",
      [app.applicationId],
    );
    expect(rows.rowCount).toBe(1);
  });
});
