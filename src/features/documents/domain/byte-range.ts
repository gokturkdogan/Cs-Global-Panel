/**
 * HTTP bayt aralığı (Range) çözümleme ve politika (PHASE 11, D-135; RFC 9110 §14). Saf fonksiyonlar:
 * istemci başlığı yalnızca sözdizimi olarak okunur; sınırlar her zaman sunucudaki kayıtlı dosya boyutuna
 * göre hesaplanır (istemciden boyut, anahtar veya versiyon kabul edilmez).
 *
 * Politika:
 * - Range yok → tam yanıt (200).
 * - `bytes` dışındaki birim → yok sayılır (RFC 9110 §14.2) → tam yanıt.
 * - Tek aralık desteklenir; çoklu aralık (virgül), bozuk sözdizimi, aşırı uzun başlık, sayısal taşma,
 *   başlangıç ≥ boyut, sıfır uzunluklu sonek, boş dosya → 416 (RFC 9110 §14.2 sunucunun bu tür başlıkları
 *   reddetmesine izin verir; tam dosyaya düşmek sağlayıcı trafiğini gereksiz artırırdı).
 * - Bitiş ≥ boyut → boyut − 1'e kırpılır; sonek (`bytes=-N`) son N bayt.
 * - `If-Range` yalnızca güçlü ETag ile birebir eşleşirse aralık uygulanır; aksi hâlde (tarih, zayıf etiket,
 *   farklı etiket) Range yok sayılır → tam yanıt (RFC 9110 §13.1.5).
 */

/** Kabul edilen en uzun Range başlığı (tek aralık için fazlasıyla yeterli). */
export const MAX_RANGE_HEADER_LENGTH = 100;
/** Sayı başına en fazla basamak (10 MiB dosyalar için 8 yeter; taşmayı önler). */
const MAX_DIGITS = 15;

export type ByteRange = { readonly start: number; readonly end: number };

export type RangeDecision =
  | { readonly kind: "full" }
  | { readonly kind: "partial"; readonly range: ByteRange }
  | { readonly kind: "unsatisfiable" };

const SINGLE = /^bytes=(\d*)-(\d*)$/;

export function parseRangeHeader(header: string | null, size: number): RangeDecision {
  if (header === null) return { kind: "full" };
  const value = header.trim();
  if (value.length === 0) return { kind: "full" };
  if (value.length > MAX_RANGE_HEADER_LENGTH) return { kind: "unsatisfiable" };
  const unit = value.slice(0, value.indexOf("=") === -1 ? value.length : value.indexOf("="));
  if (unit.trim().toLowerCase() !== "bytes") return { kind: "full" };
  const normalized = `bytes=${value.slice(unit.length + 1).replace(/\s+/g, "")}`;
  if (normalized.includes(",")) return { kind: "unsatisfiable" };
  const match = SINGLE.exec(normalized);
  if (match === null) return { kind: "unsatisfiable" };
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart.length > MAX_DIGITS || rawEnd.length > MAX_DIGITS) return { kind: "unsatisfiable" };
  if (!Number.isSafeInteger(size) || size <= 0) return { kind: "unsatisfiable" };
  if (rawStart === "") {
    if (rawEnd === "") return { kind: "unsatisfiable" };
    const suffix = Number(rawEnd);
    if (suffix === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(rawStart);
  if (start >= size) return { kind: "unsatisfiable" };
  if (rawEnd === "") return { kind: "partial", range: { start, end: size - 1 } };
  const end = Number(rawEnd);
  if (end < start) return { kind: "unsatisfiable" };
  return { kind: "partial", range: { start, end: Math.min(end, size - 1) } };
}

/** `If-Range` koşulu: yalnızca güçlü ETag'in birebir eşleşmesi aralığı korur. */
export function ifRangeAllowsPartial(ifRange: string | null, etag: string): boolean {
  if (ifRange === null) return true;
  const value = ifRange.trim();
  return value.startsWith('"') && value === etag;
}

export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1;
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

export function unsatisfiedRangeHeader(size: number): string {
  return `bytes */${size}`;
}

/**
 * Sağlayıcı yanıtındaki `Content-Range` değerini doğrular: tam olarak istenen aralık ve kayıtlı toplam boyut.
 * Sağlayıcı farklı aralık/boyut dönerse (ör. 206 yerine 200, eski versiyon) yanıt aktarılmaz.
 */
export function providerRangeMatches(
  contentRange: string | null | undefined,
  range: ByteRange,
  size: number,
): boolean {
  return contentRange === contentRangeHeader(range, size);
}
