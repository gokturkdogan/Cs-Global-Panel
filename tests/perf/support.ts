import { mkdirSync, writeFileSync } from "node:fs";

import type { BrowserContext, Page, Request } from "@playwright/test";
import type pg from "pg";

/**
 * PHASE 11 ölçüm yardımcıları (D-134). Uygulamaya ölçüm kodu, özel header veya endpoint eklenmez:
 * web vitals tarayıcının standart Performance API'leriyle (init script), ağ ölçümleri Playwright istek
 * olaylarıyla, SQL ölçümleri yalnızca izole container'daki `pg_stat_statements` ile alınır.
 * Sonuçlarda URL'ler bağlam/kimlik içermeyecek biçimde etiketlenir; token/cookie yazılmaz.
 */

export const PERF_LABEL = (process.env.PERF_LABEL ?? "run").replace(/[^a-z0-9-]/gi, "");
export const WARM_RUNS = Number(process.env.PERF_WARM_RUNS ?? 7);

/** Tarayıcıda LCP/CLS/INP gözlemcisi (standart PerformanceObserver; sayfa CSP'sinden bağımsız init script). */
export function installVitals(context: BrowserContext) {
  return context.addInitScript(() => {
    const perf = { lcp: 0, cls: 0, inp: 0 };
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) perf.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.inp = Math.max(perf.inp, entry.duration);
      }).observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit);
    } catch {
      // Desteklenmeyen tarayıcı (WebKit LCP/INP yok) → 0 kalır, raporda "ölçülmedi".
    }
  });
}

export type NetEntry = {
  readonly kind: string;
  readonly bytes: number;
  readonly rsc: boolean;
  readonly prefetch: boolean;
  readonly file: boolean;
  readonly status: number;
  readonly range: string | null;
};

/** Sayfa ağ trafiğini toplar (yalnızca tür/boyut/bayraklar; URL saklanmaz). */
export function trackNetwork(page: Page) {
  const entries: NetEntry[] = [];
  const pending: Promise<void>[] = [];
  const onFinished = (request: Request) => {
    pending.push(
      (async () => {
        const response = await request.response();
        const sizes = await request.sizes().catch(() => null);
        const headers = request.headers();
        const path = new URL(request.url()).pathname;
        entries.push({
          kind: request.resourceType(),
          bytes: Math.max(0, sizes?.responseBodySize ?? 0),
          rsc: headers.rsc === "1" || new URL(request.url()).searchParams.has("_rsc"),
          prefetch: headers["next-router-prefetch"] === "1",
          file: /^\/api\/(files|portal\/[^/]+\/files)\//.test(path),
          status: response?.status() ?? 0,
          range: headers.range ?? null,
        });
      })().catch(() => undefined),
    );
  };
  page.on("requestfinished", onFinished);
  return {
    async settle() {
      // Yanıtı hiç tamamlanmayan (iptal edilen) istekler ölçümü kilitlemesin.
      await Promise.race([
        Promise.all(pending),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
    },
    reset() {
      entries.length = 0;
      pending.length = 0;
    },
    entries,
    stop() {
      page.off("requestfinished", onFinished);
    },
  };
}

export type DbStats = { readonly calls: number; readonly sqlMs: number };

/** İzole container'da pg_stat_statements (yalnızca runtime rolünün sorguları). */
export async function enableStatements(owner: pg.Client) {
  await owner.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
}

export async function resetStatements(owner: pg.Client) {
  await owner.query("SELECT pg_stat_statements_reset()");
}

export async function readStatements(owner: pg.Client): Promise<DbStats> {
  const result = await owner.query<{ calls: number; ms: number }>(
    `SELECT coalesce(sum(calls), 0)::int AS calls, coalesce(sum(total_exec_time), 0)::float8 AS ms
       FROM pg_stat_statements WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = 'cs_app_runtime')`,
  );
  return { calls: result.rows[0]!.calls, sqlMs: Number(result.rows[0]!.ms.toFixed(2)) };
}

export type PageSample = {
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  dcl: number;
  load: number;
  requests: number;
  jsBytes: number;
  totalBytes: number;
  rscRequests: number;
  rscBytes: number;
  prefetchRequests: number;
  fileRequests: number;
  dbCalls: number;
  sqlMs: number;
};

export async function readVitals(page: Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const perf = (window as unknown as { __perf?: { lcp: number; cls: number; inp: number } })
      .__perf ?? { lcp: 0, cls: 0, inp: 0 };
    return {
      ttfb: nav ? nav.responseStart - nav.startTime : 0,
      fcp,
      lcp: perf.lcp,
      cls: perf.cls,
      inp: perf.inp,
      dcl: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
      load: nav ? nav.loadEventEnd - nav.startTime : 0,
    };
  });
}

export function summarizeNet(entries: readonly NetEntry[]) {
  return {
    requests: entries.length,
    jsBytes: entries.filter((e) => e.kind === "script").reduce((n, e) => n + e.bytes, 0),
    totalBytes: entries.reduce((n, e) => n + e.bytes, 0),
    rscRequests: entries.filter((e) => e.rsc).length,
    rscBytes: entries.filter((e) => e.rsc).reduce((n, e) => n + e.bytes, 0),
    prefetchRequests: entries.filter((e) => e.prefetch).length,
    fileRequests: entries.filter((e) => e.file).length,
  };
}

export function stats(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { median: 0, p95: 0, n: 0 };
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]!
      : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  return { median: Number(median.toFixed(2)), p95: Number(at(0.95).toFixed(2)), n: sorted.length };
}

export function summarize(samples: readonly PageSample[]) {
  const keys = Object.keys(samples[0] ?? {}) as (keyof PageSample)[];
  return Object.fromEntries(keys.map((key) => [key, stats(samples.map((s) => s[key]))]));
}

export function writeResult(project: string, name: string, data: unknown) {
  const dir = `perf-results/${PERF_LABEL}`;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${name}-${project.replace(/\s+/g, "-").toLowerCase()}.json`;
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function screenshotPath(project: string, name: string) {
  const dir = `screenshots/phase-11/${PERF_LABEL}`;
  mkdirSync(dir, { recursive: true });
  return `${dir}/${name}${project === "Mobile Chrome" ? "-mobile" : ""}.png`;
}
