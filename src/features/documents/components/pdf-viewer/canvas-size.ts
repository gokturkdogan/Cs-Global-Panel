/**
 * PDF tuval boyutu sınırları (PHASE 12.1, REVIEW-03; D-136). Saf yardımcı: tuval belleği AYIRILMADAN
 * önce kesin sınırlar uygulanır. Çıktı ölçeği (DPR) en fazla `MAX_DEVICE_PIXEL_RATIO`; toplam piksel en
 * fazla `MAX_CANVAS_PIXELS` (≈16,7 MP, 4 bayt/piksel ≈ 64 MiB); her kenar en fazla `MAX_CANVAS_DIMENSION`.
 * Asgari ölçek tabanı YOKTUR — taban, olağan dışı büyük sayfada sınırı aşmaya yol açardı. Ölçek
 * `MIN_RENDER_RATIO` altına düşmek zorundaysa sayfa okunaksız olurdu → çizim yapılmaz (güvenli hata).
 *
 * Bu sınır yalnızca tuval tamponunu kapsar; pdf.js ayrıştırıcı/çizici belleğinin tamamının mutlak sınırı
 * değildir (görüntü boyutu `maxImageSize` ve `canvasMaxAreaInBytes` ayrıca verilir).
 */
export const MAX_CANVAS_PIXELS = 4096 * 4096;
export const MAX_CANVAS_DIMENSION = 8192;
export const MAX_DEVICE_PIXEL_RATIO = 3;
export const MIN_RENDER_RATIO = 0.05;

export type CanvasSize = {
  /** Tuval tamponu (piksel). */
  readonly width: number;
  readonly height: number;
  /** Görünüm (CSS pikseli) → tampon dönüşüm ölçeği. */
  readonly ratio: number;
};

const positiveFinite = (value: number) => Number.isFinite(value) && value > 0;

/**
 * `viewportWidth × viewportHeight` CSS pikselindeki sayfa için güvenli tuval boyutu; sınır içinde
 * çizilemiyorsa `null`. Yuvarlama sonrası tamsayı boyutlar yeniden doğrulanır.
 */
export function computeCanvasSize(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): CanvasSize | null {
  if (!positiveFinite(viewportWidth) || !positiveFinite(viewportHeight)) return null;
  const wanted = Math.min(
    positiveFinite(devicePixelRatio) ? devicePixelRatio : 1,
    MAX_DEVICE_PIXEL_RATIO,
  );
  const ratio = Math.min(
    wanted,
    Math.sqrt(MAX_CANVAS_PIXELS / (viewportWidth * viewportHeight)),
    MAX_CANVAS_DIMENSION / viewportWidth,
    MAX_CANVAS_DIMENSION / viewportHeight,
  );
  if (!positiveFinite(ratio) || ratio < MIN_RENDER_RATIO) return null;
  const width = Math.floor(viewportWidth * ratio);
  const height = Math.floor(viewportHeight * ratio);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_CANVAS_DIMENSION ||
    height > MAX_CANVAS_DIMENSION ||
    width * height > MAX_CANVAS_PIXELS
  ) {
    return null;
  }
  return { width, height, ratio };
}
