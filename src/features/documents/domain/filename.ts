import { ALLOWED_FILE_EXTENSION, MAX_FILENAME_LENGTH } from "@/config/constants";

/**
 * Görünen dosya adı sanitizasyonu (FILE_STORAGE §4). Orijinal ad yalnızca metadata'dır: nesne anahtarına,
 * log'a veya audit'e yazılmaz (kişisel veri içerebilir). Uzantı `.pdf` değilse `null` (NOT_PDF).
 * Unicode NFC; kontrol karakterleri, yön (bidi) denetim karakterleri ve `/ \ : * ? " < > |` kaldırılır;
 * baştaki noktalar kaldırılır; boşluklar tekleştirilir; uzantı korunarak ≤ 200 karakter.
 */
const CONTROL_AND_RESERVED =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff/\\:*?"<>|]/g;
const FALLBACK = "belge.pdf";

export function sanitizeFilename(raw: string): string | null {
  const normalized = raw
    .normalize("NFC")
    .replace(CONTROL_AND_RESERVED, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized.toLowerCase().endsWith(ALLOWED_FILE_EXTENSION)) return null;
  let base = normalized
    .slice(0, -ALLOWED_FILE_EXTENSION.length)
    .replace(/^[.\s]+/, "")
    .trim();
  const maxBase = MAX_FILENAME_LENGTH - ALLOWED_FILE_EXTENSION.length;
  if ([...base].length > maxBase) base = [...base].slice(0, maxBase).join("").trim();
  return base.length === 0 ? FALLBACK : `${base}${ALLOWED_FILE_EXTENSION}`;
}

/**
 * Güvenli `Content-Disposition` (RFC 6266/5987): ASCII yedek ad + `filename*` UTF-8. Ad zaten
 * sanitize edilmiştir; yine de CR/LF/tırnak üretilmez (header enjeksiyonu yok).
 */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const safe = sanitizeFilename(filename) ?? FALLBACK;
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_");
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Bayt → "1,2 MB" (Türkçe, ondalık MB; arayüz gösterimi). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bayt`;
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}
