import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PHASE 11 statik politika testleri (D-135…D-137): ön-getirme, görüntüleyici izolasyonu, CSP ve
 * kalıcı PDF önbelleği yasağı. Kaynak metni üzerinde çalışır (derleme gerektirmez).
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk("src").filter((path) => /\.(ts|tsx)$/.test(path));
const read = (path: string) => readFileSync(path, "utf8");

describe("ön-getirme (prefetch) politikası — D-137", () => {
  const PREFETCH_ALLOWED = new Set([
    join("src", "components", "dashboard", "nav-links.tsx"),
    join("src", "components", "dashboard", "breadcrumb.tsx"),
    join("src", "app", "(dashboard)", "dashboard", "not-found.tsx"),
  ]);

  it("liste/tablo/sayfalama/aksiyon bağlantılarında prefetch kapalı; yalnızca ana gezinme açık", () => {
    const offenders: string[] = [];
    for (const path of sources) {
      if (PREFETCH_ALLOWED.has(path)) continue;
      for (const match of read(path).matchAll(/<Link(\s[^>]*)?>/g)) {
        if (!match[0].includes("prefetch={false}")) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("bearer bağlantısı, dosya uç noktası ve API yolları Next.js Link ile verilmez (ön-getirilemez)", () => {
    for (const path of sources) {
      for (const match of read(path).matchAll(/<Link[\s\S]*?href=\{?[`"']([^`"']+)/g)) {
        expect(match[1], path).not.toMatch(/^\/(api|b)\//);
      }
    }
  });
});

describe("PDF görüntüleyici izolasyonu — D-136", () => {
  const viewer = read("src/features/documents/components/pdf-viewer/pdf-viewer.tsx");
  const dialog = read("src/features/documents/components/pdf-viewer/pdf-viewer-dialog.tsx");

  it("pdf.js yalnızca görüntüleyicide ve dinamik import ile yüklenir", () => {
    const importers = sources.filter(
      (path) =>
        /from "pdfjs-dist|import\("pdfjs-dist"\)/.test(read(path)) && !path.includes("server"),
    );
    expect(importers).toEqual([
      join("src", "features", "documents", "components", "pdf-viewer", "pdf-viewer.tsx"),
    ]);
    expect(viewer).toContain('await import("pdfjs-dist")');
    expect(viewer).not.toMatch(/^import [^t].*from "pdfjs-dist"/m);
    expect(dialog).toContain('lazy(() => import("./pdf-viewer"))');
  });

  it("güvenli pdf.js seçenekleri: aralık taşıyıcısı, otomatik getirme/akış kapalı, XFA/WASM kapalı, annotation kapalı", () => {
    for (const option of [
      "range: transport",
      "disableAutoFetch: true",
      "disableStream: true",
      "enableXfa: false",
      "useWasm: false",
      "annotationMode: 0",
    ]) {
      expect(viewer).toContain(option);
    }
    expect(viewer).toContain('new Worker(new URL("./pdf.worker.ts", import.meta.url)');
    expect(viewer).not.toMatch(/workerSrc\s*=|cdn|unpkg|jsdelivr|https?:\/\//i);
  });

  it("PDF baytları kalıcı depolamaya yazılmaz (IndexedDB, localStorage, Cache API, Service Worker yok)", () => {
    for (const path of sources) {
      const source = read(path);
      expect(source, path).not.toMatch(
        /indexedDB|localStorage\.setItem|sessionStorage\.setItem|caches\.open|serviceWorker\.register/,
      );
    }
  });
});

describe("CSP — D-136", () => {
  const proxy = read("src/proxy.ts");
  it("worker-src yalnızca 'self'; eval/wasm/joker yok", () => {
    expect(proxy).toContain(`"worker-src 'self'"`);
    expect(proxy).not.toMatch(/worker-src[^"]*(\*|blob:|data:)/);
    expect(proxy).not.toContain("wasm-unsafe-eval");
    expect(proxy).toMatch(/isDevelopment \? " 'unsafe-eval'" : ""/);
  });
});

describe("Range teslimi — D-135", () => {
  const service = read("src/features/documents/service.ts");
  it("sağlayıcıya aralık iletilir; tam okuma + uygulamada kesme yapılmaz", () => {
    const open = service.slice(service.indexOf("export async function openDocumentFile"));
    expect(open).toContain("storage.getObject(row.key, row.versionId, {");
    expect(open).toContain("...(range ? { range } : {})");
    expect(open).not.toMatch(/\.slice\(|subarray\(|arrayBuffer\(\)/);
    // Anahtar/versiyon yalnızca DB kaydından; istemci isteğinden alınmaz.
    expect(open).not.toMatch(/request\.(key|versionId)/);
  });
});

describe("migration 0010 — D-138", () => {
  it("yalnızca ek (additive) bileşik audit indeksi; sorgu sırasıyla birebir (DESC NULLS FIRST)", () => {
    const sql = read("src/server/db/migrations/0010_audit_logs_keyset_index.sql").trim();
    expect(sql).toBe(
      'CREATE INDEX "audit_logs_occurred_at_id_idx" ON "audit_logs" USING btree ("occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);',
    );
    expect(sql).not.toMatch(/DROP|ALTER|GRANT|REVOKE|DELETE|UPDATE/);
  });
});

describe("depolama sınırları — OD-26 / D-140", () => {
  it("kapasite değerleri yalnızca src/config/constants.ts'te (başka kaynak dosyada sabit yok)", () => {
    const pattern =
      /\b(?:9_?000_?000_?000|8_?000_?000_?000|100_?000_?000_?000|90_?000_?000_?000|9e9|8e9|100e9|90e9)\b/;
    const offenders = sources.filter(
      (path) => path !== join("src", "config", "constants.ts") && pattern.test(read(path)),
    );
    expect(offenders).toEqual([]);
  });
});
