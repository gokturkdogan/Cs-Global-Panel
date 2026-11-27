import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { Browser, Page, TestInfo } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedActiveFile, seedApplication } from "../support/portal-seed";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 10 — şirket içi notlar (S16), işlem geçmişi (iki hesap), kalıcı silme (E5 + ilerleme/sürdürme).
 * YALNIZCA izole veritabanı + yerel private storage (commit eden mutasyonlar); sentetik veri.
 */
const isolated = isIsolatedTestDatabase();
const DESKTOP = ["Desktop Chrome", "Desktop WebKit"];

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (process.env.E2E_SCREENSHOTS !== "1" || !isolated) return;
  if (!["Desktop Chrome", "Mobile Safari"].includes(testInfo.project.name)) return;
  const suffix = testInfo.project.name === "Mobile Safari" ? "-mobile" : "";
  mkdirSync("screenshots/phase-10", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/phase-10/${name}${suffix}.png`, fullPage: true });
}

async function newPage(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL: testInfo.project.use.baseURL,
  });
  return { context, page: await context.newPage() };
}

async function addNote(page: Page, text: string) {
  const form = page.getByTestId("internal-note-form");
  await form.getByRole("textbox").fill(text);
  await form.getByRole("button", { name: "Not Ekle" }).click();
  await expect(form.getByRole("status")).toContainText("Not eklendi.");
  await expect(page.getByTestId("internal-note-list")).toContainText(text);
}

test.describe("PHASE 10 operasyonlar (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);
  test.describe.configure({ timeout: 90_000 });

  test("S16: şirket içi not müşteri HTML/RSC yanıtlarında yoktur; müşteri cihazında görünmez", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const sentinel = `INTERNAL_NOTE_PRIVATE_SENTINEL_${randomUUID().slice(0, 8)}`;

    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await expect(page.getByTestId("internal-notes")).toContainText(
      "Bu notlar yalnızca şirket personeli tarafından görülebilir.",
    );
    await expect(page.getByTestId("internal-notes")).toContainText(
      "Bu başvuruya henüz şirket içi not eklenmemiş.",
    );
    await addNote(page, `${sentinel}\nGüncel iş sözleşmesi bekleniyor.`);
    await shot(page, testInfo, "staff-internal-notes");

    // Müşteri: ayrı tarayıcı bağlamı; tüm belge ve RSC/fetch yanıt gövdeleri taranır.
    const customer = await newPage(browser, testInfo);
    const bodies: string[] = [];
    customer.page.on("response", async (response) => {
      const type = response.request().resourceType();
      if (!["document", "fetch", "xhr", "script"].includes(type)) return;
      try {
        bodies.push(await response.text());
      } catch {
        // yönlendirme yanıtlarının gövdesi yoktur
      }
    });
    await customer.page.goto(`/b/${app.token}`);
    await expect(customer.page.getByRole("heading", { level: 1 })).toBeVisible();
    await customer.page.reload();
    await customer.page.waitForLoadState("networkidle");
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toContain(sentinel);
    expect(await customer.page.content()).not.toContain(sentinel);
    await expect(customer.page.getByText("Şirket İçi Notlar")).toHaveCount(0);
    await customer.context.close();
  });

  test("işlem geçmişi: iki hesap aynı ekranı görür; başvuru filtresi UUID ile; not metni audit'te yok", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    test.skip(!DESKTOP.includes(testInfo.project.name), "personel masaüstü senaryosu");
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const noteText = `Audit'e yazılmamalı ${randomUUID().slice(0, 8)}`;
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await addNote(page, noteText);

    await page.getByTestId("application-audit-link").click();
    await expect(page).toHaveURL(new RegExp(`applicationId=${app.applicationId}`));
    await expect(page.getByTestId("audit-application-filter")).toContainText(app.number);
    const list = page.getByTestId("audit-list");
    await expect(list.locator('[data-action="INTERNAL_NOTE_ADDED"]')).toContainText(
      "Şirket İçi Not Eklendi",
    );
    await expect(list.locator('[data-action="INTERNAL_NOTE_ADDED"]')).toContainText("Personel");
    expect(await page.content()).not.toContain(noteText);
    await shot(page, testInfo, "audit-logs");

    // Numara ile filtre: URL'de numara değil UUID.
    await page.goto("/dashboard/audit-logs");
    // PHASE 11: mobilde filtreler katlanmıştır.
    const toggle = page.getByTestId("audit-filters-toggle");
    if (await toggle.isVisible()) await toggle.click();
    const filters = page.getByTestId("audit-filters");
    await filters.getByLabel("Başvuru numarası").fill(app.number);
    await filters.getByLabel("İşlem türü").selectOption("INTERNAL_NOTE_ADDED");
    await filters.getByRole("button", { name: "Filtrele", exact: true }).click();
    await expect(page).toHaveURL(/applicationId=/);
    expect(page.url()).not.toContain(app.number);
    await expect(page.getByTestId("audit-list").locator("li")).toHaveCount(1);

    // Geçersiz tarih aralığı.
    await filters.getByLabel("Başlangıç tarihi").fill("2026-12-31");
    await filters.getByLabel("Bitiş tarihi").fill("2026-01-01");
    await filters.getByRole("button", { name: "Filtrele", exact: true }).click();
    await expect(filters.getByRole("alert")).toContainText("Başlangıç tarihi bitiş tarihinden");

    // EMPLOYEE: aynı menü ve aynı kayıt.
    const employee = await newPage(browser, testInfo);
    await signInAs("employee", employee.context);
    await employee.page.goto("/dashboard");
    await employee.page
      .getByRole("navigation")
      .first()
      .getByRole("link", { name: "İşlem Geçmişi" })
      .click();
    await expect(employee.page).toHaveURL(/\/dashboard\/audit-logs/);
    await employee.page.goto(`/dashboard/audit-logs?applicationId=${app.applicationId}`);
    await expect(
      employee.page.getByTestId("audit-list").locator('[data-action="INTERNAL_NOTE_ADDED"]'),
    ).toBeVisible();
    await expect(
      employee.page.getByRole("button", { name: /sil|düzenle|dışa aktar/i }),
    ).toHaveCount(0);
    await employee.context.close();
  });

  test("E5: EMPLOYEE başvuruyu numara yazarak kalıcı siler → listede yok; bağlantı ve dosya URL'leri geçersiz", async ({
    page,
    request,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    test.skip(!DESKTOP.includes(testInfo.project.name), "personel masaüstü senaryosu");
    const employee = await signInAs("employee");
    const app = await seedApplication(runtimeDb, employee.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const [requirementId] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows.map((r) => r.id);
    const fileId = await seedActiveFile(
      runtimeDb,
      employee.userId,
      app.applicationId,
      requirementId!,
    );
    await runtimeDb.query(
      "UPDATE application_document_files SET upload_expires_at = now() - interval '2 hours' WHERE application_id = $1",
      [app.applicationId],
    );

    await page.goto(`/dashboard/applications/${app.applicationId}`);
    const zone = page.getByTestId("danger-zone");
    await expect(zone).toContainText("Tehlikeli İşlemler");
    await zone.getByRole("button", { name: "Başvuruyu Kalıcı Olarak Sil" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(app.number);
    await expect(dialog).toContainText("Bu işlem geri alınamaz.");
    await expect(dialog).toContainText("Saklama yükümlülüklerinizi kontrol ediniz.");
    await dialog.getByLabel("Silme gerekçesi (personel içi)").fill("Saklama yükümlülüğü sona erdi");
    await dialog.getByLabel(/Onaylamak için başvuru numarasını yazınız/).fill("CS-2000-000001");
    await dialog.getByRole("button", { name: "Kalıcı Silmeyi Başlat" }).click();
    await expect(dialog.getByRole("alert")).toContainText("eşleşmiyor");
    expect(
      (
        await runtimeDb.query("SELECT deletion_requested_at FROM applications WHERE id = $1", [
          app.applicationId,
        ])
      ).rows[0]!.deletion_requested_at,
    ).toBeNull();
    await shot(page, testInfo, "delete-dialog");
    await dialog.getByLabel(/Onaylamak için başvuru numarasını yazınız/).fill(app.number);
    await dialog.getByRole("button", { name: "Kalıcı Silmeyi Başlat" }).click();

    await expect(page).toHaveURL(/\/dashboard\/applications\?deleted=1/, { timeout: 20_000 });
    await expect(
      page.getByRole("status").filter({ hasText: "Başvuru kalıcı olarak silindi." }),
    ).toBeVisible();
    await expect(page.getByText(app.number)).toHaveCount(0);
    expect(
      (await runtimeDb.query("SELECT 1 FROM applications WHERE id = $1", [app.applicationId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await runtimeDb.query(
          "SELECT actor_user_id FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETED'",
          [app.applicationId],
        )
      ).rows,
    ).toEqual([{ actor_user_id: employee.userId }]);

    // Eski bağlantı ve dosya URL'leri geçersiz.
    const link = await request.get(`/b/${app.token}`, { maxRedirects: 0 });
    expect(link.headers()["location"] ?? "").toContain("/link-invalid");
    const file = await page.request.get(`/api/files/${fileId}`);
    expect(file.status()).toBe(404);
    const detail = await page.goto(`/dashboard/applications/${app.applicationId}`);
    expect(detail?.status()).toBe(404);
  });

  test("silme ilerlemesi: sonucu kanıtlanmamış yükleme varken güvenle bekletilir; kanıt gelince tamamlanır; kuyrukta görünür", async ({
    page,
    browser,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    test.skip(!DESKTOP.includes(testInfo.project.name), "personel masaüstü senaryosu");
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const [requirementId] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows.map((r) => r.id);
    await seedActiveFile(runtimeDb, admin.userId, app.applicationId, requirementId!);
    // Silmeden önce başlamış, sonucu henüz bilinmeyen bir değiştirme yüklemesi (PUT sağlayıcıda).
    const pendingFileId = randomUUID();
    const pendingKey = `applications/${app.applicationId}/${requirementId}/${pendingFileId}.pdf`;
    await runtimeDb.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname,
         original_filename, size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, 'UPLOAD_PENDING', $4, 'yeni.pdf', 1024, $5, 'USER', $6, now() - interval '1 day')`,
      [pendingFileId, app.applicationId, requirementId, pendingKey, "c".repeat(64), admin.userId],
    );
    const attempt = await runtimeDb.query<{ id: string }>(
      `INSERT INTO storage_write_attempts (application_id, file_id, object_key, state, started_at)
       VALUES ($1, $2, $3, 'IN_PROGRESS', now() - interval '1 day') RETURNING id`,
      [app.applicationId, pendingFileId, pendingKey],
    );

    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.getByRole("button", { name: "Başvuruyu Kalıcı Olarak Sil" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByLabel("Silme gerekçesi (personel içi)").fill("Test silme gerekçesi");
    await dialog.getByLabel(/Onaylamak için başvuru numarasını yazınız/).fill(app.number);
    await dialog.getByRole("button", { name: "Kalıcı Silmeyi Başlat" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const progress = page.getByTestId("deletion-progress");
    await expect(progress).toContainText("Kalıcı Silme Devam Ediyor");
    await expect(progress).toContainText("müşteri erişimi ve tüm işlemleri kapatılmıştır");
    await expect(page.getByTestId("deletion-error")).toContainText(
      "Silme işlemi güvenli şekilde bekletiliyor",
    );
    await expect(page.getByTestId("deletion-unresolved-writes")).toContainText(
      "süre geçmesi kanıt sayılmaz",
    );
    await expect(page.getByText("Başvuru kalıcı olarak silindi.")).toHaveCount(0);
    await expect(page.getByTestId("internal-notes")).toHaveCount(0);
    await expect(page.getByText(app.firstName)).toHaveCount(0);
    await shot(page, testInfo, "deletion-progress");

    // Müşteri erişimi anında kapalı.
    const customer = await newPage(browser, testInfo);
    await customer.page.goto(`/b/${app.token}`);
    await expect(customer.page).toHaveURL(/link-invalid/);
    await customer.context.close();

    // Kuyruk (yalnızca numara ve ilerleme).
    await page.goto("/dashboard/applications");
    const queue = page.getByTestId("deletion-queue");
    await expect(queue).toContainText(app.number);
    await expect(queue).not.toContainText(app.firstName);
    await queue.getByRole("link", { name: app.number }).click();

    // Süre geçmiş olsa da (alanlar 1 gün geride) sürdürme sonlandırmaz.
    await page.getByTestId("resume-deletion").click();
    await expect(page.getByTestId("resume-deletion")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("deletion-unresolved-writes")).toBeVisible();

    // Sağlayıcı sonucu kanıtlandı (versiyon kimliği) → bir sonraki adım güvenle tamamlar.
    await runtimeDb.query(
      `UPDATE storage_write_attempts SET state = 'CONFIRMED', outcome = 'PROVIDER_CONFIRMED',
         version_id = $2, settled_at = now() WHERE id = $1`,
      [attempt.rows[0]!.id, `late-version-${pendingFileId}`],
    );
    await page.getByTestId("resume-deletion").click();
    await expect(page).toHaveURL(/\/dashboard\/applications\?deleted=1/, { timeout: 20_000 });
    await expect(page.getByText(app.number)).toHaveCount(0);
  });

  test("müşteri oturumu personel ekranlarına erişemez; yabancı kökenden yıkıcı istek 403", async ({
    browser,
    request,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    test.skip(!DESKTOP.includes(testInfo.project.name), "personel masaüstü senaryosu");
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    const customer = await newPage(browser, testInfo);
    await customer.page.goto(`/b/${app.token}`);
    await expect(customer.page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const path of ["/dashboard/audit-logs", `/dashboard/applications/${app.applicationId}`]) {
      await customer.page.goto(path);
      await expect(customer.page).toHaveURL(/\/login$/);
    }
    await customer.context.close();
    const forged = await request.post(`/dashboard/applications/${app.applicationId}`, {
      headers: { origin: "https://evil.example", "next-action": "x" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    expect(
      (
        await runtimeDb.query("SELECT deletion_requested_at FROM applications WHERE id = $1", [
          app.applicationId,
        ])
      ).rows[0]!.deletion_requested_at,
    ).toBeNull();
  });
});
