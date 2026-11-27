import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  computeCanvasSize,
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_PIXELS,
  MAX_DEVICE_PIXEL_RATIO,
  MIN_RENDER_RATIO,
} from "@/features/documents/components/pdf-viewer/canvas-size";

/** PHASE 12.1 REVIEW-03 — tuval tamponu tahsisinden önce kesin sınırlar. */
function withinLimits(size: { width: number; height: number }) {
  expect(Number.isSafeInteger(size.width) && Number.isSafeInteger(size.height)).toBe(true);
  expect(size.width).toBeGreaterThanOrEqual(1);
  expect(size.height).toBeGreaterThanOrEqual(1);
  expect(size.width).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
  expect(size.height).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
  expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
}

describe("computeCanvasSize — REVIEW-03", () => {
  it("normal A4 sayfa, DPR 1 ve 2: tam kalite (ölçek düşürülmez)", () => {
    expect(computeCanvasSize(800, 1131, 1)).toEqual({ width: 800, height: 1131, ratio: 1 });
    const hi = computeCanvasSize(800, 1131, 2)!;
    expect(hi).toEqual({ width: 1600, height: 2262, ratio: 2 });
    withinLimits(hi);
  });

  it("yüksek DPR üst sınırı ve en büyük yakınlaştırma (3×) piksel sınırında kalır", () => {
    const capped = computeCanvasSize(400, 566, 10)!;
    expect(capped.ratio).toBe(MAX_DEVICE_PIXEL_RATIO);
    const zoomed = computeCanvasSize(2400, 3394, 3)!;
    withinLimits(zoomed);
    expect(zoomed.ratio).toBeLessThan(3);
  });

  it("çok geniş / çok uzun sayfa: tek kenar sınırı uygulanır", () => {
    const wide = computeCanvasSize(100_000, 100, 2)!;
    withinLimits(wide);
    expect(wide.width).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
    const tall = computeCanvasSize(800, 120_000, 2)!;
    withinLimits(tall);
  });

  it("önceki 0,25 tabanının altına düşmesi gereken dev sayfa sınırı aşmaz (taban yok)", () => {
    // Eski hesap: max(0.25, …) → 30 000 × 30 000 × 0,25² = 56,25 MP (sınırın 3 katı).
    const huge = computeCanvasSize(30_000, 30_000, 1)!;
    withinLimits(huge);
    expect(huge.ratio).toBeLessThan(0.25);
    expect(huge.ratio).toBeGreaterThanOrEqual(MIN_RENDER_RATIO);
  });

  it("okunaksız olacak kadar küçük ölçek gerekiyorsa çizim yapılmaz (güvenli hata)", () => {
    expect(computeCanvasSize(1_000_000, 1_000_000, 1)).toBeNull();
    expect(computeCanvasSize(MAX_CANVAS_DIMENSION / MIN_RENDER_RATIO + 1_000, 10, 1)).toBeNull();
  });

  it("geçersiz boyutlar reddedilir: NaN, Infinity, negatif, sıfır; geçersiz DPR → 1", () => {
    for (const [w, h] of [
      [Number.NaN, 100],
      [100, Number.POSITIVE_INFINITY],
      [-1, 100],
      [100, 0],
      [0, 0],
    ] as const) {
      expect(computeCanvasSize(w, h, 1)).toBeNull();
    }
    expect(computeCanvasSize(100, 100, Number.NaN)).toEqual({ width: 100, height: 100, ratio: 1 });
    expect(computeCanvasSize(100, 100, -2)).toEqual({ width: 100, height: 100, ratio: 1 });
    expect(computeCanvasSize(100, 100, 0)).toEqual({ width: 100, height: 100, ratio: 1 });
  });

  it("tam sınır ve yuvarlama sınırı: 4096 × 4096 kabul; bir piksel fazlası küçültülür", () => {
    expect(computeCanvasSize(4096, 4096, 1)).toEqual({ width: 4096, height: 4096, ratio: 1 });
    const over = computeCanvasSize(4097, 4096, 1)!;
    withinLimits(over);
    const odd = computeCanvasSize(4096.9, 4095.7, 1)!;
    withinLimits(odd);
    expect(computeCanvasSize(MAX_CANVAS_DIMENSION, 2048, 1)).toEqual({
      width: MAX_CANVAS_DIMENSION,
      height: 2048,
      ratio: 1,
    });
  });

  it("mobil görünüm ve tekrarlı yakınlaştırma/çizim deterministik ve sınırda", () => {
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 2, 1]) {
      withinLimits(computeCanvasSize(343 * zoom, 485 * zoom, 3)!);
    }
  });
});

describe("görüntüleyici kaynak yaşam döngüsü — REVIEW-02/03 (statik)", () => {
  const viewer = readFileSync(
    "src/features/documents/components/pdf-viewer/pdf-viewer.tsx",
    "utf8",
  );

  it("worker oluşturulduğu anda serbest bırakma listesine girer (ilk aralık isteğinden önce); hata yolu da serbest bırakır", () => {
    const created = viewer.indexOf("worker = new Worker(");
    const firstFetch = viewer.indexOf("await fetchRange(0, initialEnd)");
    const release = viewer.indexOf("const release = () =>");
    expect(release).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(release);
    expect(firstFetch).toBeGreaterThan(created);
    expect(viewer).toMatch(/\.catch\(\(error: unknown\) => \{\s*\/\/[^\n]*\n\s*release\(\);/);
    expect(viewer).toContain("if (released) return;");
  });

  it("tuval boyutu yalnızca sınır yardımcısından; eski 0,25 tabanı yok", () => {
    expect(viewer).toContain("computeCanvasSize(viewport.width, viewport.height");
    expect(viewer).not.toMatch(/Math\.max\(0\.25/);
  });
});
