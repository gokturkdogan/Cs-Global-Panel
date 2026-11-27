import type { Page, Route } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { fixtures, multiPagePdf } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { MAX_CANVAS_PIXELS } from "../../src/features/documents/components/pdf-viewer/canvas-size";
import { uploadAsCustomer as upload } from "./customer-upload";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 12.1 — REVIEW-02 (worker/kaynak yaşam döngüsü) ve REVIEW-03 (tuval sınırı) gerçek tarayıcıda.
 * YALNIZCA izole veritabanı + yerel private depolama; sentetik PDF. Hata yolları Playwright yönlendirme
 * (route) ile istemci tarafında üretilir — sunucu/sağlayıcı davranışı değiştirilmez.
 * Ölçüm: açık worker sayısı (`page.workers()`), kapanış sonrası yeni dosya isteği, tuval tamponu boyutu.
 */
const isolated = isIsolatedTestDatabase();
const BIG = multiPagePdf(20, 3_000_000);
const FILE_PATH = /\/api\/files\/[0-9a-f-]{36}/;

async function openStaffViewer(page: Page) {
  await page.getByTestId("pdf-view-button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closeViewer(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function expectNoWorkers(page: Page) {
  await expect.poll(() => page.workers().length, { timeout: 10_000 }).toBe(0);
}

function countFileRequests(page: Page) {
  const seen = { count: 0 };
  page.on("request", (request) => {
    if (FILE_PATH.test(new URL(request.url()).pathname)) seen.count += 1;
  });
  return seen;
}

test.describe("PDF görüntüleyici kaynak yaşam döngüsü — REVIEW-02/03 (izole)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  async function seedFile(
    page: Page,
    runtimeDb: import("pg").Client,
    baseURL: string,
    bytes: Buffer,
  ) {
    const userId = (
      await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1")
    ).rows[0]!.id;
    const app = await seedApplication(runtimeDb, userId, { documents: [{ title: "Pasaport" }] });
    const [requirement] = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    await upload(page.context().browser()!, runtimeDb, baseURL, app.token, requirement!.id, bytes);
    return app;
  }

  test("W2–W5: ilk aralık isteği 500 / 429 / 404 / ağ hatası → anlaşılır hata, worker hemen serbest; kapanış sonrası istek yok", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    await signInAs("admin");
    const app = await seedFile(page, runtimeDb, baseURL!, BIG);
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    for (const [label, fail, message] of [
      ["500", (route: Route) => route.fulfill({ status: 500, body: "" }), /görüntülenemedi/],
      ["429", (route: Route) => route.fulfill({ status: 429, body: "" }), /./],
      ["404", (route: Route) => route.fulfill({ status: 404, body: "" }), /artık görüntülenemiyor/],
      ["ağ", (route: Route) => route.abort("failed"), /görüntülenemedi/],
    ] as const) {
      await page.route(FILE_PATH, fail);
      await openStaffViewer(page);
      await expect(page.getByTestId("pdf-viewer-error"), label).toBeVisible();
      await expect(page.getByTestId("pdf-viewer-error").getByRole("alert")).toHaveText(message);
      // Görüntüleyici açıkken bile worker serbest bırakılmış olmalı (hata yolu).
      await expectNoWorkers(page);
      const requests = countFileRequests(page);
      await closeViewer(page);
      await page.unroute(FILE_PATH);
      await page.waitForTimeout(300);
      expect(requests.count, label).toBe(0);
    }
  });

  test("W6/W7/W10/W15: içe aktarma ve ilk istek tamamlanmadan kapatma, hızlı aç/kapa, tekrarlı başarısız açılış → worker 0", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    await signInAs("admin");
    const app = await seedFile(page, runtimeDb, baseURL!, BIG);
    await page.goto(`/dashboard/applications/${app.applicationId}`);

    // W7: worker oluşturuldu, ilk aralık yanıtı bekletiliyor → kapat.
    const held: Route[] = [];
    await page.route(FILE_PATH, (route) => {
      held.push(route);
    });
    await openStaffViewer(page);
    await expect.poll(() => held.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(page.workers().length).toBeGreaterThan(0);
    await closeViewer(page);
    await expectNoWorkers(page);
    const late = countFileRequests(page);
    for (const route of held) await route.continue().catch(() => undefined);
    await page.unroute(FILE_PATH);
    await page.waitForTimeout(300);
    expect(late.count).toBe(0);

    // W6 + W10: hemen kapatma (dinamik içe aktarma sürerken) ve hızlı aç/kapa döngüsü.
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId("pdf-view-button").first().click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    await expectNoWorkers(page);

    // W15: tekrarlı başarısız açılışlar birikmez.
    await page.route(FILE_PATH, (route) => route.fulfill({ status: 500, body: "" }));
    for (let i = 0; i < 3; i += 1) {
      await openStaffViewer(page);
      await expect(page.getByTestId("pdf-viewer-error")).toBeVisible();
      await closeViewer(page);
    }
    await page.unroute(FILE_PATH);
    await expectNoWorkers(page);

    // Ardından normal açılış hâlâ çalışır (eski görev yeni görüntüleyiciyi etkilemez — W13).
    await openStaffViewer(page);
    await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute("data-rendered", "1", {
      timeout: 20_000,
    });
    await closeViewer(page);
    await expectNoWorkers(page);
  });

  test("W14: worker betiği yüklenemezse görüntüleyici kapanınca worker kalmaz", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    await signInAs("admin");
    const app = await seedFile(page, runtimeDb, baseURL!, fixtures.valid());
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.route(/pdf\.worker/, (route) => route.abort("failed"));
    await openStaffViewer(page);
    await page.waitForTimeout(1_000);
    await closeViewer(page);
    await expectNoWorkers(page);
    await page.unroute(/pdf\.worker/);
  });

  test("REVIEW-03: aşırı uzun sayfa güvenli hatayla çizilmez; çok geniş sayfa sınır içinde çizilir; tuval tamponu ≤ sınır", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }) => {
    await signInAs("admin");
    const tall = await seedFile(page, runtimeDb, baseURL!, fixtures.extremeTallPage());
    await page.goto(`/dashboard/applications/${tall.applicationId}`);
    await openStaffViewer(page);
    await expect(page.getByTestId("pdf-viewer-error").getByRole("alert")).toHaveText(
      "Bu sayfa görüntülenemedi. Dosyayı indirerek açabilirsiniz.",
      { timeout: 20_000 },
    );
    const tallCanvas = await page
      .getByTestId("pdf-viewer-canvas")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLCanvasElement).width * (n as HTMLCanvasElement).height),
      );
    for (const pixels of tallCanvas) expect(pixels).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    await closeViewer(page);
    await expectNoWorkers(page);

    const wide = await seedFile(page, runtimeDb, baseURL!, fixtures.veryWidePage());
    await page.goto(`/dashboard/applications/${wide.applicationId}`);
    await openStaffViewer(page);
    const canvas = page.getByTestId("pdf-viewer-canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "1", { timeout: 20_000 });
    for (const zoom of ["Yakınlaştır", "Yakınlaştır", "Yakınlaştır", "Yakınlaştır"]) {
      await page.getByRole("button", { name: zoom }).click();
      await expect(canvas).toHaveAttribute("data-rendered", "1", { timeout: 20_000 });
      const { width, height } = await canvas.evaluate((c) => ({
        width: (c as HTMLCanvasElement).width,
        height: (c as HTMLCanvasElement).height,
      }));
      expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(width).toBeLessThanOrEqual(8192);
    }
    await closeViewer(page);
    await expectNoWorkers(page);
  });
});
