import type { BrowserContext, Page } from "@playwright/test";
import type pg from "pg";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { expect, sessionsAvailable, test } from "../e2e/fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { multiPagePdf } from "../support/pdf-fixtures";
import { seedApplication, type SeededApplication } from "../support/portal-seed";

import {
  enableStatements,
  installVitals,
  PERF_LABEL,
  readStatements,
  readVitals,
  resetStatements,
  screenshotPath,
  stats,
  summarize,
  summarizeNet,
  trackNetwork,
  WARM_RUNS,
  writeResult,
  type PageSample,
} from "./support";

/**
 * PHASE 11 sayfa ve PDF performans ölçümü (D-134). YALNIZCA izole veritabanı. Sentetik veri:
 * 100 başvuru (5 hizmet, 3 evrak), 1 000 audit satırı ve bir müşteri başvurusuna gerçek yükleme hattından
 * geçen 4 sentetik PDF. Soğuk = yeni tarayıcı bağlamı (HTTP önbelleği boş); sıcak = aynı bağlamda tekrar.
 */
const isolated = isIsolatedTestDatabase();

export const PDF_CASES = [
  { name: "pdf-20k-1p", pages: 1, bytes: 20_000, layout: "clustered" },
  { name: "pdf-1m-10p", pages: 10, bytes: 1_000_000, layout: "clustered" },
  { name: "pdf-5m-50p", pages: 50, bytes: 5_000_000, layout: "clustered" },
  { name: "pdf-10m-100p", pages: 100, bytes: 10_000_000, layout: "clustered" },
  { name: "pdf-10m-100p-worst", pages: 100, bytes: 10_000_000, layout: "interleaved" },
] as const;

async function bulkSeed(db: pg.Client, userId: string) {
  const existing = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM services WHERE name LIKE 'Perf Hizmet %'",
  );
  if (existing.rows[0]!.n > 0) return;
  await db.query(
    `INSERT INTO services (name, created_by_user_id, updated_by_user_id)
       SELECT 'Perf Hizmet ' || g, $1, $1 FROM generate_series(1, 5) g`,
    [userId],
  );
  await db.query(
    `WITH s AS (SELECT id, name, row_number() OVER (ORDER BY name) AS rn FROM services WHERE name LIKE 'Perf Hizmet %')
     INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164,
        customer_email, search_text, service_id, service_name_snapshot, created_by_user_id, status)
     SELECT 'CS-2094-' || lpad(g::text, 12, '0'), 'Sentetik' || g, 'Müşteri', '+90532' || lpad(g::text, 7, '0'),
        'perf' || g || '@example.invalid', 'sentetik' || g, s.id, s.name, $1,
        (ARRAY['AWAITING_DOCUMENTS','UNDER_REVIEW','REVISION_REQUIRED','DOCUMENTS_APPROVED','IN_PROCESS','COMPLETED','CANCELLED'])[1 + g % 7]
       FROM generate_series(1, 100) g JOIN s ON s.rn = 1 + g % 5`,
    [userId],
  );
  await db.query(
    `INSERT INTO application_document_requirements (application_id, title, is_required, sort_order, status)
       SELECT a.id, t.title, true, t.ord * 10, 'NOT_UPLOADED'
         FROM applications a CROSS JOIN (VALUES ('Pasaport', 1), ('Fotoğraf', 2), ('Banka Dökümü', 3)) AS t(title, ord)
        WHERE a.application_number LIKE 'CS-2094-%'`,
  );
  await db.query(
    `INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, resource_id, application_id)
       SELECT 'APPLICATION_CREATED', 'USER', $1, 'application', a.id::text, a.id
         FROM applications a CROSS JOIN generate_series(1, 10) WHERE a.application_number LIKE 'CS-2094-%'`,
    [userId],
  );
}

async function upload(
  context: BrowserContext,
  baseURL: string,
  db: pg.Client,
  requirementId: string,
  bytes: Buffer,
) {
  const { version } = (
    await db.query<{ version: number }>(
      "SELECT version FROM application_document_requirements WHERE id = $1",
      [requirementId],
    )
  ).rows[0]!;
  const response = await context.request.post(
    `/api/documents/${requirementId}/file?expectedVersion=${version}`,
    {
      data: bytes,
      headers: {
        "content-type": "application/pdf",
        "x-upload-filename": "sentetik.pdf",
        origin: baseURL,
      },
      timeout: 120_000,
    },
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { fileId: string }).fileId;
}

async function measurePage(
  page: Page,
  owner: pg.Client,
  url: string,
  ready: (page: Page) => Promise<void>,
): Promise<PageSample> {
  const net = trackNetwork(page);
  await resetStatements(owner);
  await page.goto(url);
  await ready(page);
  await page.waitForLoadState("networkidle");
  // Görünüm alanındaki bağlantıların prefetch'i boşta tetiklenir → kısa ek bekleme.
  await page.waitForTimeout(500);
  await net.settle();
  net.stop();
  const vitals = await readVitals(page);
  const db = await readStatements(owner);
  return {
    ttfb: vitals.ttfb,
    fcp: vitals.fcp,
    lcp: vitals.lcp,
    cls: vitals.cls,
    dcl: vitals.dcl,
    load: vitals.load,
    ...summarizeNet(net.entries),
    dbCalls: db.calls,
    sqlMs: db.sqlMs,
  };
}

/**
 * İlk sayfa süresi sayfa içinde ölçülür (Playwright `expect` yoklaması ve tıklama hazırlık beklemesi ölçümü
 * bozmasın): gerçek `click` olayında `performance.now()`; tuvalin `data-rendered="1"` olduğu an MutationObserver ile yakalanır.
 */
async function armFirstPageTimer(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __viewerDone?: Promise<number> };
    w.__viewerDone = new Promise<number>((resolve) => {
      let t0 = 0;
      // Başlangıç: gerçek tıklama olayı (Playwright'ın eyleme hazırlık beklemesi ölçüme girmez).
      document.addEventListener("click", () => (t0 = performance.now()), {
        capture: true,
        once: true,
      });
      const observer = new MutationObserver(() => {
        const canvas = document.querySelector<HTMLElement>('[data-testid="pdf-viewer-canvas"]');
        if (t0 > 0 && canvas?.dataset.rendered === "1") {
          observer.disconnect();
          resolve(performance.now() - t0);
        }
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-rendered"],
      });
    });
  });
}

async function readFirstPageTimer(page: Page): Promise<number> {
  const ms = await page.evaluate(() =>
    Promise.race([
      (window as unknown as { __viewerDone: Promise<number> }).__viewerDone,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("zaman aşımı")), 30_000),
      ),
    ]),
  );
  return Number(ms.toFixed(1));
}

type Target = {
  readonly name: string;
  readonly url: string;
  readonly ready: (page: Page) => Promise<void>;
};

test.describe("PHASE 11 performans ölçümü (izole)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  test("sayfalar + PDF teslimi", async ({ browser, runtimeDb, signInAs, baseURL }, testInfo) => {
    const project = testInfo.project.name;
    const owner = await connect(resolveDatabaseUrls().owner, "cs-global-perf");
    try {
      await enableStatements(owner);
      const userId = (
        await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1")
      ).rows[0]!.id;
      await bulkSeed(runtimeDb, userId);
      const app: SeededApplication = await seedApplication(runtimeDb, userId, {
        firstName: "Deniz",
        lastName: "Örnek",
        documents: PDF_CASES.map((_, i) => ({ title: `Sentetik Evrak ${i + 1}` })),
      });
      const requirements = (
        await runtimeDb.query<{ id: string }>(
          "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
          [app.applicationId],
        )
      ).rows;
      const serviceId = (
        await runtimeDb.query<{ id: string }>(
          "SELECT service_id AS id FROM applications WHERE id = $1",
          [app.applicationId],
        )
      ).rows[0]!.id;

      const contextOptions = {
        viewport: testInfo.project.use.viewport,
        userAgent: testInfo.project.use.userAgent,
        deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
        isMobile: testInfo.project.use.isMobile,
        hasTouch: testInfo.project.use.hasTouch,
        baseURL,
      };
      const staffContext = await browser.newContext(contextOptions);
      await installVitals(staffContext);
      await signInAs("admin", staffContext);

      const fileIds: string[] = [];
      for (const [index, item] of PDF_CASES.entries()) {
        fileIds.push(
          await upload(
            staffContext,
            baseURL!,
            runtimeDb,
            requirements[index]!.id,
            multiPagePdf(item.pages, item.bytes, item.layout),
          ),
        );
      }

      const heading = (name: RegExp | string) => async (page: Page) => {
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      };
      const staffTargets: Target[] = [
        { name: "dashboard", url: "/dashboard", ready: heading("Genel Bakış") },
        { name: "applications", url: "/dashboard/applications", ready: heading("Başvurular") },
        {
          name: "application-detail",
          url: `/dashboard/applications/${app.applicationId}`,
          ready: heading(app.number),
        },
        { name: "services", url: "/dashboard/services", ready: heading("Hizmetler") },
        {
          name: "service-detail",
          url: `/dashboard/services/${serviceId}`,
          ready: async (page) => {
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          },
        },
        { name: "audit-logs", url: "/dashboard/audit-logs", ready: heading("İşlem Geçmişi") },
      ];

      const results: Record<string, unknown> = {
        label: PERF_LABEL,
        project,
        dataset: { applications: 101, auditRows: "≥1000", pdfs: PDF_CASES },
      };

      // Sunucu soğuk: build sonrası ilk istek (bu projenin ilk gezinmesi).
      const pages: Record<string, unknown> = {};
      for (const target of staffTargets) {
        const coldContext = await browser.newContext(contextOptions);
        await installVitals(coldContext);
        await signInAs("admin", coldContext);
        const coldPage = await coldContext.newPage();
        const cold = await measurePage(coldPage, owner, target.url, target.ready);
        await coldPage.screenshot({
          path: screenshotPath(project, `staff-${target.name}`),
          fullPage: true,
        });
        await coldContext.close();
        const page = await staffContext.newPage();
        const warm: PageSample[] = [];
        for (let run = 0; run < WARM_RUNS; run += 1) {
          warm.push(await measurePage(page, owner, target.url, target.ready));
        }
        await page.close();
        pages[target.name] = { cold, warm: summarize(warm) };
      }
      results.staffPages = pages;

      // İstemci tarafı gezinme (RSC yükü): Genel Bakış → Başvurular bağlantısı.
      {
        const page = await staffContext.newPage();
        await page.goto("/dashboard");
        await heading("Genel Bakış")(page);
        await page.waitForLoadState("networkidle");
        const net = trackNetwork(page);
        await resetStatements(owner);
        // Mobilde gezinme menüsü kapalıdır: önce menü açılır (ölçüm bağlantı tıklamasından başlar).
        const menu = page.getByRole("button", { name: "Menüyü aç" });
        if (await menu.isVisible()) await menu.click();
        const start = Date.now();
        await page
          .getByRole("navigation")
          .getByRole("link", { name: "Başvurular", exact: true })
          .filter({ visible: true })
          .first()
          .click({ timeout: 10_000 });
        await heading("Başvurular")(page);
        const elapsed = Date.now() - start;
        await page.waitForLoadState("networkidle");
        await net.settle();
        console.log(`[perf] ${project}: istemci gezinmesi ölçüldü`);
        results.softNavigation = {
          elapsedMs: elapsed,
          ...summarizeNet(net.entries),
          db: await readStatements(owner),
        };
        await page.close();
      }

      // INP yaklaşık değeri: arama kutusuna yazma + filtre değişimi (Event Timing, en uzun olay).
      {
        const page = await staffContext.newPage();
        await page.goto("/dashboard/applications");
        await heading("Başvurular")(page);
        await page.getByLabel("Başvuru ara").pressSequentially("Sentetik12", { delay: 30 });
        await page.getByLabel("Durum").selectOption("UNDER_REVIEW");
        await page.waitForLoadState("networkidle");
        results.interaction = { inpApproxMs: (await readVitals(page)).inp };
        await page.close();
      }

      // PDF teslimi (personel): mevcut uç noktadan tam indirme süresi ve bayt (N=5, sıcak).
      {
        const page = await staffContext.newPage();
        await page.goto(`/dashboard/applications/${app.applicationId}`);
        await heading(app.number)(page);
        const pdf: Record<string, unknown> = {};
        for (const [index, item] of PDF_CASES.entries()) {
          const samples = [];
          for (let run = 0; run < 5; run += 1) {
            samples.push(
              await page.evaluate(async (url) => {
                const t0 = performance.now();
                const response = await fetch(url, {
                  cache: "no-store",
                  signal: AbortSignal.timeout(60_000),
                });
                const headersAt = performance.now() - t0;
                const reader = response.body!.getReader();
                let bytes = 0;
                let firstChunkAt = 0;
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (bytes === 0) firstChunkAt = performance.now() - t0;
                  bytes += value.byteLength;
                }
                return {
                  status: response.status,
                  acceptRanges: response.headers.get("accept-ranges"),
                  headersMs: headersAt,
                  firstChunkMs: firstChunkAt,
                  totalMs: performance.now() - t0,
                  bytes,
                };
              }, `/api/files/${fileIds[index]}?disposition=inline`),
            );
          }
          pdf[item.name] = {
            status: samples[0]!.status,
            acceptRanges: samples[0]!.acceptRanges,
            bytesPerOpen: samples[0]!.bytes,
            headersMs: stats(samples.map((s) => s.headersMs)),
            firstChunkMs: stats(samples.map((s) => s.firstChunkMs)),
            fullDownloadMs: stats(samples.map((s) => s.totalMs)),
          };
        }
        results.pdfFullFetch = pdf;
        console.log(`[perf] ${project}: tam indirme ölçümü bitti`);
        await page.close();
      }

      // Görüntüleyici (PHASE 11, D-136) — varsa: ilk sayfa süresi, aktarılan bayt, aralık isteği sayısı,
      // sonraki sayfa / yakınlaştırma / yeniden açma ek baytları (B1–B8). Görüntüleyici yoksa (eski kod)
      // ölçülmez.
      {
        const page = await staffContext.newPage();
        await page.goto(`/dashboard/applications/${app.applicationId}`);
        await heading(app.number)(page);
        await page.waitForLoadState("networkidle");
        if ((await page.getByTestId("pdf-view-button").count()) > 0) {
          const net = trackNetwork(page);
          const fileTraffic = () => {
            const files = net.entries.filter((e) => e.file);
            return {
              requests: files.length,
              bytes: files.reduce((n, e) => n + e.bytes, 0),
              statuses: [...new Set(files.map((e) => e.status))],
            };
          };
          const rendered = (n: number) =>
            expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute(
              "data-rendered",
              String(n),
              { timeout: 30_000 },
            );
          const viewer: Record<string, unknown> = {};
          for (const [index, item] of PDF_CASES.entries()) {
            const firstPage: number[] = [];
            let open = { requests: 0, bytes: 0, statuses: [] as number[] };
            let next = { requests: 0, bytes: 0 };
            let zoom = { requests: 0, bytes: 0 };
            for (let run = 0; run < 3; run += 1) {
              console.log(`[perf] ${project}: görüntüleyici ${item.name} #${run + 1}`);
              await net.settle();
              net.reset();
              await armFirstPageTimer(page);
              await page
                .getByTestId("pdf-view-button")
                .filter({ visible: true })
                .nth(index)
                .click();
              firstPage.push(await readFirstPageTimer(page));
              await rendered(1);
              if (run === 0 && item.name === "pdf-10m-100p") {
                await page.screenshot({ path: screenshotPath(project, "viewer-staff") });
              }
              await net.settle();
              open = fileTraffic();
              if (item.pages > 1) {
                await page.getByRole("button", { name: "Sonraki sayfa" }).click();
                await rendered(2);
                await net.settle();
                const after = fileTraffic();
                next = {
                  requests: after.requests - open.requests,
                  bytes: after.bytes - open.bytes,
                };
              }
              const beforeZoom = fileTraffic();
              await page.getByRole("button", { name: "Yakınlaştır" }).click();
              await rendered(item.pages > 1 ? 2 : 1);
              await net.settle();
              const afterZoom = fileTraffic();
              zoom = {
                requests: afterZoom.requests - beforeZoom.requests,
                bytes: afterZoom.bytes - beforeZoom.bytes,
              };
              await page.keyboard.press("Escape");
              await expect(page.getByRole("dialog")).toBeHidden();
            }
            viewer[item.name] = {
              fileBytes: multiPagePdf(item.pages, item.bytes, item.layout).length,
              firstPageMs: stats(firstPage),
              openRequests: open.requests,
              openBytes: open.bytes,
              statuses: open.statuses,
              nextPage: next,
              zoom,
              reopenSameAsOpen: true,
            };
          }
          results.pdfViewer = viewer;
          console.log(`[perf] ${project}: görüntüleyici ölçümü bitti`);

          // PHASE 11.1 dizileri: ilk 3 sayfa, son sayfa (sayfaya git), tüm sayfalar (klavye), iptal.
          const sequences: Record<string, unknown> = {};
          const openFresh = async (index: number) => {
            await net.settle();
            net.reset();
            await page.getByTestId("pdf-view-button").filter({ visible: true }).nth(index).click();
            await rendered(1);
          };
          const close = async () => {
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toBeHidden();
          };
          for (const [index, item] of PDF_CASES.entries()) {
            if (item.pages < 50) continue;
            const traffic = async () => {
              await net.settle();
              return fileTraffic();
            };
            await openFresh(index);
            for (const n of [2, 3]) {
              await page.keyboard.press("ArrowRight");
              await rendered(n);
            }
            const firstThree = await traffic();
            await close();

            await openFresh(index);
            const jumpStart = Date.now();
            await page.getByTestId("pdf-viewer-page-input").fill(String(item.pages));
            await page.getByTestId("pdf-viewer-page-input").press("Enter");
            await rendered(item.pages);
            const lastPageMs = Date.now() - jumpStart;
            const lastPage = await traffic();
            await close();

            await openFresh(index);
            const allStart = Date.now();
            await page.getByRole("button", { name: "Sonraki sayfa" }).focus();
            for (let n = 2; n <= item.pages; n += 1) {
              await page.keyboard.press("ArrowRight");
              await rendered(n);
            }
            const allPagesMs = Date.now() - allStart;
            const allPages = await traffic();
            await close();

            // İptal: açılır açılmaz kapatma → aktarım durur (dosyanın tamamı inmez).
            await net.settle();
            net.reset();
            await page.getByTestId("pdf-view-button").filter({ visible: true }).nth(index).click();
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toBeHidden();
            await page.waitForTimeout(1_000);
            const cancelled = await traffic();

            sequences[item.name] = {
              firstThreePages: firstThree,
              lastPage: { ...lastPage, jumpMs: lastPageMs },
              allPages: { ...allPages, totalMs: allPagesMs },
              cancelledOpen: cancelled,
            };
          }
          net.stop();
          results.pdfSequences = sequences;
        } else {
          results.pdfViewer = "NOT MEASURED (görüntüleyici yok — eski kod)";
        }
        await page.close();
      }
      await staffContext.close();

      // Müşteri paneli (mobil öncelikli).
      {
        const customerContext = await browser.newContext(contextOptions);
        await installVitals(customerContext);
        const page = await customerContext.newPage();
        const ready = async (p: Page) => {
          await expect(p.getByTestId("document-progress")).toBeVisible();
        };
        // Soğuk: bağlantıyla ilk giriş (303 → panel), boş önbellek.
        const cold = await measurePage(page, owner, `/b/${app.token}`, ready);
        await expect(page).toHaveURL(/\/portal\//);
        const portalUrl = new URL(page.url()).pathname;
        await page.screenshot({ path: screenshotPath(project, "customer-portal"), fullPage: true });
        const warm: PageSample[] = [];
        for (let run = 0; run < WARM_RUNS; run += 1) {
          warm.push(await measurePage(page, owner, portalUrl, ready));
        }
        results.customerPortal = { cold, warm: summarize(warm) };
        // B10: müşteri görüntüleyicisi (5 MB / 50 sayfa) — ilk sayfa süresi ve aktarılan bayt.
        if ((await page.getByTestId("pdf-view-button").count()) > 0) {
          const net = trackNetwork(page);
          await armFirstPageTimer(page);
          await page.getByTestId("pdf-view-button").nth(2).click();
          const firstPageMs = await readFirstPageTimer(page);
          await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute("data-rendered", "1");
          await page.screenshot({ path: screenshotPath(project, "viewer-customer") });
          await net.settle();
          const files = net.entries.filter((e) => e.file);
          results.customerViewer = {
            case: PDF_CASES[2].name,
            firstPageMs,
            requests: files.length,
            bytes: files.reduce((n, e) => n + e.bytes, 0),
          };
          net.stop();
        }
        await customerContext.close();
      }

      writeResult(project, "pages", results);
    } finally {
      await owner.end();
    }
  });
});
