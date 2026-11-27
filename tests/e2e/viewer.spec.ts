import type { Page, Request } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { MAX_PDF_SIZE_BYTES } from "../../src/config/constants";
import { multiPagePdf, validPdfOfSize } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { collectErrors } from "./console-errors";
import { uploadAsCustomer as upload } from "./customer-upload";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 11 (D-135, D-136) — uygulama içi PDF görüntüleyici ve güvenli Range. YALNIZCA izole veritabanı +
 * geçici yerel private depolama. Sentetik çok sayfalı PDF'ler (gerçek belge yok). Doğrulananlar: ilk
 * sayfa yalnızca gereken aralıklarla çizilir (dosyanın tamamı indirilmez), sayfa gezinme, yakınlaştırma,
 * kapatma (istekler durur), CSP ihlali/konsol hatası yok, sayfa açılışında PDF isteği yok.
 */
const isolated = isIsolatedTestDatabase();
const BIG = multiPagePdf(40, 4_000_000);

type FileTraffic = { status: number; range: string | null; bytes: number };

function trackFiles(page: Page) {
  const traffic: FileTraffic[] = [];
  page.on("requestfinished", (request: Request) => {
    if (!/\/api\/(files|portal\/[^/]+\/files)\//.test(new URL(request.url()).pathname)) return;
    void (async () => {
      const response = await request.response();
      const sizes = await request.sizes();
      traffic.push({
        status: response?.status() ?? 0,
        range: request.headers().range ?? null,
        bytes: sizes.responseBodySize,
      });
    })();
  });
  return traffic;
}

async function expectRendered(page: Page, pageNumber: number) {
  await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute(
    "data-rendered",
    String(pageNumber),
    { timeout: 20_000 },
  );
}

test.describe("PDF görüntüleyici (izole veritabanı)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  let userId: string;
  test.beforeEach(async ({ runtimeDb }) => {
    userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1"))
      .rows[0]!.id;
  });

  test("personel: aralıklı ilk sayfa, gezinme, yakınlaştırma, kapatma; tam dosya indirilmez", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    await signInAs("admin");
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL!, app.token, requirement!.id, BIG);

    const traffic = trackFiles(page);
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await expect(page.getByRole("heading", { level: 1, name: app.number })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Sayfa açılışında dosya isteği yok (ön-getirme dahil).
    expect(traffic).toEqual([]);

    const trigger = page.getByTestId("pdf-view-button").first();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectRendered(page, 1);
    await expect(page.getByTestId("pdf-viewer-page-indicator")).toHaveText("Sayfa 1 / 40");

    await page.getByRole("button", { name: "Sonraki sayfa" }).click();
    await expectRendered(page, 2);
    await expect(page.getByTestId("pdf-viewer-page-indicator")).toHaveText("Sayfa 2 / 40");
    await page.getByRole("button", { name: "Önceki sayfa" }).click();
    await expectRendered(page, 1);

    const before = await page.getByTestId("pdf-viewer-canvas").evaluate((c) => c.clientWidth);
    await page.getByRole("button", { name: "Yakınlaştır" }).click();
    await expect(page.getByTestId("pdf-viewer-zoom")).toHaveText("%125");
    await expectRendered(page, 1);
    expect(
      await page.getByTestId("pdf-viewer-canvas").evaluate((c) => c.clientWidth),
    ).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Uzaklaştır" }).click();
    await expect(page.getByTestId("pdf-viewer-zoom")).toHaveText("%100");

    // Tüm dosya istekleri tek aralıklı 206; toplam aktarım dosyanın küçük bir kısmı.
    await page.waitForLoadState("networkidle");
    expect(traffic.length).toBeGreaterThan(0);
    for (const entry of traffic) {
      expect(entry.status).toBe(206);
      expect(entry.range).toMatch(/^bytes=\d+-\d+$/);
    }
    const transferred = traffic.reduce((sum, entry) => sum + entry.bytes, 0);
    expect(transferred).toBeLessThan(BIG.length / 4);

    // Kapatma: Escape → pencere kapanır, odak tetikleyiciye döner, yeni dosya isteği olmaz.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const afterClose = traffic.length;
    await page.waitForTimeout(500);
    expect(traffic.length).toBe(afterClose);
    expect(errors).toEqual([]);
  });

  test("müşteri (mobil öncelikli): görüntüleyici aralıklı çalışır; kapat düğmesi; konsol hatası yok", async ({
    page,
    runtimeDb,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL!, app.token, requirement!.id, BIG);

    const traffic = trackFiles(page);
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("portal-active-file")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(traffic).toEqual([]);
    await page.getByTestId("pdf-view-button").click();
    await expectRendered(page, 1);
    await page.getByRole("button", { name: "Sonraki sayfa" }).click();
    await expectRendered(page, 2);
    await page.getByRole("button", { name: "Görüntüleyiciyi kapat" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    for (const entry of traffic) expect(entry.status).toBe(206);
    expect(traffic.reduce((sum, entry) => sum + entry.bytes, 0)).toBeLessThan(BIG.length / 4);
    expect(errors).toEqual([]);
  });

  test("küçük çok sayfalı dosya (≤ 1 MiB): tek istekte okunur, sayfa gezinme çalışır", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    await signInAs("admin");
    const small = multiPagePdf(10, 900_000);
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL!, app.token, requirement!.id, small);
    const traffic = trackFiles(page);
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.getByTestId("pdf-view-button").first().click();
    await expectRendered(page, 1);
    await expect(page.getByTestId("pdf-viewer-page-indicator")).toHaveText("Sayfa 1 / 10");
    await page.getByRole("button", { name: "Sonraki sayfa" }).click({ timeout: 10_000 });
    await expectRendered(page, 2);
    await page.waitForLoadState("networkidle");
    expect(traffic).toHaveLength(1);
    expect(traffic[0]).toMatchObject({ status: 206, range: `bytes=0-${small.length - 1}` });
    expect(errors).toEqual([]);
  });

  test("büyük tek nesneli (10 MiB tek sayfa) ve dağınık yapılı PDF: tek teslimle çizilir, istek sayısı sınırlı", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    await signInAs("admin");
    const single = validPdfOfSize(MAX_PDF_SIZE_BYTES);
    const scattered = multiPagePdf(40, 4_000_000, "interleaved");
    const app = await seedApplication(runtimeDb, userId, {
      documents: [{ title: "Tek Sayfa" }, { title: "Dağınık" }],
    });
    const requirements = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [app.applicationId],
      )
    ).rows;
    await upload(
      page.context().browser()!,
      runtimeDb,
      baseURL!,
      app.token,
      requirements[0]!.id,
      single,
    );
    await upload(
      page.context().browser()!,
      runtimeDb,
      baseURL!,
      app.token,
      requirements[1]!.id,
      scattered,
    );
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    const buttons = page.getByTestId("pdf-view-button").filter({ visible: true });

    let traffic = trackFiles(page);
    await buttons.nth(0).click();
    await expectRendered(page, 1);
    await page.waitForLoadState("networkidle");
    for (const entry of traffic) expect(entry.status).toBe(206);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    page.removeAllListeners("requestfinished");
    traffic = trackFiles(page);
    await buttons.nth(1).click();
    await expectRendered(page, 1);
    await page.waitForLoadState("networkidle");
    // Uyarlamalı büyütme: 4 istekten sonra 1 MiB pencereler → 4 MB dağınık dosya ≤ 4 + 4 + pay.
    expect(traffic.length).toBeLessThanOrEqual(12);
    for (const entry of traffic) expect(entry.status).toBe(206);
    expect(errors).toEqual([]);
  });

  test("sayfaya git ve klavye gezinmesi (←/→, Home/End); sayı alanında yazarken ok tuşu sayfa değiştirmez", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    const errors = collectErrors(page);
    await signInAs("admin");
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL!, app.token, requirement!.id, BIG);
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.getByTestId("pdf-view-button").filter({ visible: true }).first().click();
    await expectRendered(page, 1);
    const indicator = page.getByTestId("pdf-viewer-page-indicator");
    const input = page.getByLabel("Gidilecek sayfa numarası");
    await input.fill("40");
    await input.press("ArrowRight"); // alan içinde: sayfa değişmez
    await expect(indicator).toHaveText("Sayfa 1 / 40");
    await input.press("Enter");
    await expectRendered(page, 40);
    await expect(indicator).toHaveText("Sayfa 40 / 40");
    await page.getByRole("button", { name: "Önceki sayfa" }).focus();
    await page.keyboard.press("Home");
    await expectRendered(page, 1);
    await page.keyboard.press("ArrowRight");
    await expectRendered(page, 2);
    await page.keyboard.press("End");
    await expectRendered(page, 40);
    // Aralık dışı değer sınırlanır.
    await input.fill("999");
    await input.press("Enter");
    await expect(indicator).toHaveText("Sayfa 40 / 40");
    expect(errors).toEqual([]);
  });

  test("görüntüleyici yetkisiz/eski dosyada güvenli hata gösterir (404 → mesaj + indirme)", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    await signInAs("admin");
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL!, app.token, requirement!.id, BIG);
    await page.goto(`/b/${app.token}`);
    await expect(page.getByTestId("pdf-view-button")).toBeVisible();
    // Sayfa açıkken dosya değiştirilir (eski ACTIVE → SUPERSEDED): müşteri eski dosyayı göremez.
    await upload(
      page.context().browser()!,
      runtimeDb,
      baseURL!,
      app.token,
      requirement!.id,
      multiPagePdf(2, 50_000),
    );
    await page.getByTestId("pdf-view-button").click();
    await expect(page.getByTestId("pdf-viewer-error")).toContainText("artık görüntülenemiyor");
  });
});
