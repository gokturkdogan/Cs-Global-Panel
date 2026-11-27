import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { Locator, Page, TestInfo } from "@playwright/test";

import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PDF yükleme ve dosya erişimi (PHASE 08). YALNIZCA izole veritabanı + geçici yerel private depolama
 * (gerçek Backblaze yok). Sentetik PDF'ler; token/cookie yalnızca bellekte; trace kapalı.
 */
const isolated = isIsolatedTestDatabase();

async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (process.env.E2E_SCREENSHOTS !== "1" || !isolated) return;
  if (!["Desktop Chrome", "Mobile Safari"].includes(testInfo.project.name)) return;
  const suffix = testInfo.project.name === "Mobile Safari" ? "-mobile" : "";
  mkdirSync("screenshots/phase-08", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/phase-08/${name}${suffix}.png`, fullPage: true });
}

/**
 * Dosya seçimi: hydration/akış sırasında düğüm yer değiştirirse `change` olayı kaybolabilir; durum
 * alanı dolana kadar (olay ulaştığında durum eşzamanlı "hazırlanıyor" olur → çift yükleme yok)
 * yeniden denenir.
 */
async function choose(card: Locator, file: Parameters<Locator["setInputFiles"]>[0]) {
  await expect(async () => {
    await card.getByTestId("pdf-upload-input").setInputFiles(file);
    await expect(card.getByTestId("pdf-upload-status")).not.toBeEmpty({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

const pdfFile = (name = "pasaport.pdf", buffer: Buffer = fixtures.valid()) => ({
  name,
  mimeType: "application/pdf",
  buffer,
});

test.describe("PDF yükleme (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  let userId: string;
  test.beforeEach(async ({ runtimeDb }) => {
    userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1"))
      .rows[0]!.id;
  });

  const twoDocs = [{ title: "Pasaport" }, { title: "Banka Dökümü" }];

  test("müşteri: gerçek ilerleme → 'Yüklendi' yalnızca kayıttan sonra; ilerleme güncellenir; görüntüleme başlıkları", async ({
    page,
    runtimeDb,
  }, testInfo) => {
    const app = await seedApplication(runtimeDb, userId, { documents: twoDocs });
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("document-progress")).toContainText(
      "0 / 2 zorunlu evrak yüklendi · %0",
    );
    const card = page.getByTestId("portal-document").first();
    const seen: string[] = [];
    const status = card.getByTestId("pdf-upload-status");
    const observer = setInterval(() => {
      void status
        .textContent()
        .then((text) => text && seen.push(text))
        .catch(() => undefined);
    }, 20);
    await choose(card, pdfFile());
    await expect(card.getByTestId("portal-active-file")).toContainText("pasaport.pdf", {
      timeout: 20_000,
    });
    clearInterval(observer);
    expect(seen.join("|")).toMatch(/Gönderiliyor|Kontrol ediliyor|Yüklendi/);
    await expect(page.getByTestId("document-progress")).toContainText(
      "1 / 2 zorunlu evrak yüklendi · %50",
    );
    await expect(card.getByRole("button", { name: "Dosyayı Değiştir" })).toBeVisible();
    await expect(page.getByRole("button", { name: "İncelemeye Gönder" })).toBeDisabled();
    await shot(page, testInfo, "customer-uploaded");

    // Görüntüleme: yetkili route, no-store/no-referrer/nosniff, güvenli Content-Disposition, storage bilgisi yok.
    // PHASE 11 (D-136): "Görüntüle" artık bağlantı değil görüntüleyici düğmesidir (sayfada dosya adresi yok);
    // uç nokta oturum bağlamı + dosya kimliğiyle doğrudan çağrılır.
    await expect(card.getByTestId("pdf-view-button")).toBeVisible();
    const context = new URL(page.url()).pathname.split("/portal/")[1]!;
    const activeId = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_files WHERE application_id = $1 AND status = 'ACTIVE'",
        [app.applicationId],
      )
    ).rows[0]!.id;
    const href = `/api/portal/${context}/files/${activeId}?disposition=inline`;
    expect(href).toMatch(
      /^\/api\/portal\/[A-Za-z0-9_-]{22}\/files\/[0-9a-f-]{36}\?disposition=inline$/,
    );
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toBe("application/pdf");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-disposition"]).toMatch(/^inline; filename="pasaport\.pdf"/);
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const html = await page.content();
    expect(html).not.toContain("applications/");
    expect(html).not.toContain(app.token);

    // Metadata DB'de; nesne anahtarı UUID; dosya adı audit'e yazılmaz.
    const file = await runtimeDb.query<{ blob_pathname: string; uploaded_by_actor_type: string }>(
      "SELECT blob_pathname, uploaded_by_actor_type FROM application_document_files WHERE application_id = $1 AND status = 'ACTIVE'",
      [app.applicationId],
    );
    expect(file.rows[0]!.uploaded_by_actor_type).toBe("CUSTOMER");
    expect(file.rows[0]!.blob_pathname).not.toContain("pasaport");
    const audit = await runtimeDb.query(
      "SELECT action, metadata FROM audit_logs WHERE application_id = $1",
      [app.applicationId],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("pasaport.pdf");
  });

  test("müşteri: aktif içerikli PDF ve PDF olmayan dosya reddedilir; anlaşılır mesaj, dosya kaydedilmez", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId, { documents: twoDocs });
    await page.goto(`/b/${app.token}`);
    const card = page.getByTestId("portal-document").first();
    await choose(card, pdfFile("betik.pdf", fixtures.javascriptOpenAction()));
    await expect(card.getByTestId("pdf-upload-status")).toContainText("aktif içerik", {
      timeout: 20_000,
    });
    await expect(card.getByTestId("pdf-upload-status")).toContainText("Önceki dosyanız korunuyor.");
    await choose(card, {
      name: "resim.jpg",
      mimeType: "image/jpeg",
      buffer: fixtures.jpegWithPdfExtension(),
    });
    await expect(card.getByTestId("pdf-upload-status")).toContainText("Yalnızca PDF");
    await choose(card, pdfFile("sahte.pdf", fixtures.jpegWithPdfExtension()));
    await expect(card.getByTestId("pdf-upload-status")).toContainText("Yalnızca PDF");
    await expect(card.getByTestId("portal-active-file")).toHaveCount(0);
    const rows = await runtimeDb.query(
      "SELECT 1 FROM application_document_files WHERE application_id = $1",
      [app.applicationId],
    );
    expect(rows.rowCount).toBe(0);
  });

  test("ÇOKLU SEKME: başka başvuru açıldıktan sonra eski sekmeden yükleme reddedilir; yanlış başvuruya dosya bağlanmaz", async ({
    context,
    runtimeDb,
  }) => {
    const a = await seedApplication(runtimeDb, userId, { firstName: "Ada", documents: twoDocs });
    const b = await seedApplication(runtimeDb, userId, { firstName: "Bora", documents: twoDocs });
    const tabA = await context.newPage();
    await tabA.goto(`/b/${a.token}`);
    await expect(tabA.getByRole("heading", { level: 1 })).toContainText("Ada");
    const tabB = await context.newPage();
    await tabB.goto(`/b/${b.token}`);
    await expect(tabB.getByRole("heading", { level: 1 })).toContainText("Bora");
    // Sekme A hâlâ eski sayfayı gösteriyor (yeniden yüklenmedi) → yükleme denemesi.
    const card = tabA.getByTestId("portal-document").first();
    await choose(card, pdfFile());
    await expect(card.getByTestId("pdf-upload-status")).toContainText(
      "Bu sayfa artık güncel değil",
      { timeout: 20_000 },
    );
    const rows = await runtimeDb.query(
      "SELECT application_id FROM application_document_files WHERE application_id = ANY($1::uuid[])",
      [[a.applicationId, b.applicationId]],
    );
    expect(rows.rowCount).toBe(0);
    // Sekme B kendi başvurusuna yükleyebilir.
    const cardB = tabB.getByTestId("portal-document").first();
    await choose(cardB, pdfFile());
    await expect(cardB.getByTestId("portal-active-file")).toBeVisible({ timeout: 20_000 });
    const owned = await runtimeDb.query<{ application_id: string }>(
      "SELECT application_id FROM application_document_files WHERE status = 'ACTIVE' AND application_id = ANY($1::uuid[])",
      [[a.applicationId, b.applicationId]],
    );
    expect(owned.rows.map((r) => r.application_id)).toEqual([b.applicationId]);
  });

  test("yetki ayrımı: oturumsuz/yabancı köken/başka başvuru/eski versiyon reddedilir; müşteri cookie'si personel route'unu açmaz", async ({
    page,
    request,
    runtimeDb,
  }) => {
    const a = await seedApplication(runtimeDb, userId, { documents: twoDocs });
    const b = await seedApplication(runtimeDb, userId, { documents: twoDocs });
    await page.goto(`/b/${a.token}`);
    const context = page.url().split("/portal/")[1]!;
    const reqA = (
      await runtimeDb.query<{ id: string; version: number }>(
        "SELECT id, version FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [a.applicationId],
      )
    ).rows[0]!;
    const reqB = (
      await runtimeDb.query<{ id: string; version: number }>(
        "SELECT id, version FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [b.applicationId],
      )
    ).rows[0]!;
    const body = fixtures.valid();
    const post = (url: string, origin: string | null, client = page.request) =>
      client.post(url, {
        data: body,
        headers: {
          "content-type": "application/pdf",
          "x-upload-filename": "a.pdf",
          ...(origin ? { origin } : {}),
        },
      });
    const base = new URL(page.url()).origin;

    // CSRF: yabancı/eksik köken → 403.
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version}`,
          "https://evil.example",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version}`,
          null,
        )
      ).status(),
    ).toBe(403);
    // Başka başvurunun evrakı → 404; oturumsuz istemci → 401.
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqB.id}/file?expectedVersion=${reqB.version}`,
          base,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version}`,
          base,
          request,
        )
      ).status(),
    ).toBe(401);
    // Müşteri cookie'si personel yükleme/görüntüleme route'unu açmaz.
    expect(
      (await post(`/api/documents/${reqA.id}/file?expectedVersion=${reqA.version}`, base)).status(),
    ).toBe(401);
    // Eski expectedVersion → 409.
    const stale = await post(
      `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version + 3}`,
      base,
    );
    expect(stale.status(), await stale.text()).toBe(409);
    // Geçerli yükleme + değiştirme → eski versiyon müşteriye kapalı (404), aktif açık.
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version}`,
          base,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(
          `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version + 1}`,
          base,
        )
      ).status(),
    ).toBe(200);
    const files = await runtimeDb.query<{ id: string; status: string }>(
      "SELECT id, status FROM application_document_files WHERE requirement_id = $1 ORDER BY created_at",
      [reqA.id],
    );
    const [old, active] = files.rows;
    expect([old!.status, active!.status]).toEqual(["SUPERSEDED", "ACTIVE"]);
    expect((await page.request.get(`/api/portal/${context}/files/${old!.id}`)).status()).toBe(404);
    expect(
      (
        await page.request.get(`/api/portal/${context}/files/${active!.id}?disposition=attachment`)
      ).status(),
    ).toBe(200);
    expect((await page.request.get(`/api/files/${active!.id}`)).status()).toBe(401);
    expect((await request.get(`/api/portal/${context}/files/${active!.id}`)).status()).toBe(401);
    expect((await page.request.get(`/api/portal/${context}/files/${randomUUID()}`)).status()).toBe(
      404,
    );
    // Boyut sınırı: 10 MB + 1 bayt → 413 (gövde okunmadan).
    const tooBig = await page.request.post(
      `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version + 2}`,
      {
        data: Buffer.alloc(10_485_761, 0x20),
        headers: { "content-type": "application/pdf", "x-upload-filename": "a.pdf", origin: base },
      },
    );
    expect(tooBig.status()).toBe(413);
    // Yanlış içerik türü → 415.
    const wrongType = await page.request.post(
      `/api/portal/${context}/documents/${reqA.id}/file?expectedVersion=${reqA.version + 2}`,
      {
        data: body,
        headers: { "content-type": "image/jpeg", "x-upload-filename": "a.pdf", origin: base },
      },
    );
    expect(wrongType.status()).toBe(415);
  });

  test("statü yüklemeye izin vermiyorsa buton yok (UNDER_REVIEW müşteri için kilitli)", async ({
    page,
    runtimeDb,
  }) => {
    const app = await seedApplication(runtimeDb, userId, {
      status: "UNDER_REVIEW",
      documents: [{ title: "Pasaport", status: "PENDING_REVIEW" }],
    });
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("portal-document")).toHaveCount(1);
    await expect(page.getByTestId("pdf-upload")).toHaveCount(0);
  });

  test("uzun dosya adı mobilde taşma yapmaz", async ({ page, runtimeDb }, testInfo) => {
    const app = await seedApplication(runtimeDb, userId, { documents: twoDocs });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/b/${app.token}`);
    const card = page.getByTestId("portal-document").first();
    await choose(card, pdfFile(`${"Çok-uzun-dosya-adı-".repeat(9)}son.pdf`));
    await expect(card.getByTestId("portal-active-file")).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, testInfo, "long-filename-320");
  });
});

test.describe("personel dosya yönetimi (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  test("müşteri adına yükleme, değiştirme onayı, versiyon geçmişi, eski versiyonu indirme; kapasite kartı", async ({
    page,
    runtimeDb,
    signInAs,
  }, testInfo) => {
    const admin = await signInAs("admin");
    const app = await seedApplication(runtimeDb, admin.userId, {
      documents: [{ title: "Pasaport" }],
    });
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    const card = page.getByTestId("staff-document").first();
    await choose(card, pdfFile("ilk.pdf"));
    await expect(card.getByTestId("staff-active-file")).toContainText("ilk.pdf", {
      timeout: 20_000,
    });
    await expect(card.getByTestId("staff-active-file")).toContainText("v1");
    await expect(card.getByTestId("staff-active-file")).toContainText(
      "antivirüs taraması değildir",
    );

    // Değiştirme: onay penceresi eski dosyanın korunacağını söyler.
    await card.getByRole("button", { name: "Dosyayı Değiştir" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("önceki versiyon olarak korunur");
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Dosyayı Değiştir" }).click();
    await (await chooser).setFiles(pdfFile("ikinci.pdf"));
    await expect(card.getByTestId("staff-active-file")).toContainText("ikinci.pdf", {
      timeout: 20_000,
    });
    await expect(card.getByTestId("staff-active-file")).toContainText("v2");
    await card.getByTestId("staff-file-history").locator("summary").click();
    await expect(card.getByTestId("staff-file-version")).toHaveCount(2);
    await expect(card.getByTestId("staff-file-version").last()).toContainText("Önceki versiyon");
    await shot(page, testInfo, "staff-history");

    const oldHref = await card
      .getByTestId("staff-file-version")
      .last()
      .getByRole("link", { name: "Dosyayı İndir" })
      .getAttribute("href");
    const old = await page.request.get(oldHref!);
    expect(old.status()).toBe(200);
    expect(old.headers()["content-disposition"]).toMatch(/^attachment; filename="ilk\.pdf"/);
    expect(old.headers()["content-security-policy"]).toContain("sandbox");

    await page.goto("/dashboard");
    await expect(page.getByTestId("storage-capacity")).toContainText("/ 9 GB");
    await expect(page.getByTestId("storage-capacity")).toContainText("kullanıldı");
    await shot(page, testInfo, "dashboard-capacity");
  });
});
