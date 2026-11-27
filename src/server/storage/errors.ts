/**
 * Sınıflandırılmış depolama hataları (PHASE 08 §22). Mesajlar kullanıcıya gösterilmez; sağlayıcı
 * yanıt gövdesi, anahtar, bucket adresi veya credential içermez.
 * - NOT_CONFIGURED: yapılandırma eksik/hatalı (fail-closed).
 * - NOT_FOUND: nesne/versiyon yok.
 * - LIMIT: sağlayıcı kotası/cap'i veya rate limit (403 cap, 429) — otomatik yeniden deneme yapılmaz.
 * - UNAVAILABLE: geçici erişim sorunu (zaman aşımı, 5xx, ağ).
 * - FORBIDDEN: yetkisiz anahtar / yanlış bucket.
 * - INTEGRITY: boyut/sağlama uyuşmazlığı (yazılan veya okunan nesne beklenenle aynı değil).
 * - AMBIGUOUS: yazma sonucu bilinmiyor (yanıt kayboldu) — kör yeniden yazma yapılmaz, mutabakat gerekir.
 * - NOT_SENT: istek sağlayıcıya hiç ulaşmadı (bağlantı kurulamadı/ad çözülemedi) — yazma kesin olarak
 *   gerçekleşmedi (PHASE 10.1, D-123). Diğer tüm PUT hataları yazma açısından belirsiz sayılır.
 */
export type StorageErrorKind =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "LIMIT"
  | "UNAVAILABLE"
  | "FORBIDDEN"
  | "INTEGRITY"
  | "AMBIGUOUS"
  | "NOT_SENT";

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  /** Yalnızca teknik kod (ör. HTTP durum kodu veya sağlayıcı hata kodu); değer/URL içermez. */
  readonly code: string | undefined;
  // Parametre özelliği kullanılmaz: dosya Node.js tip ayıklamasıyla (betikler) de çalışır.
  constructor(kind: StorageErrorKind, code?: string) {
    super(`Depolama hatası: ${kind}${code ? ` (${code})` : ""}`);
    this.name = "StorageError";
    this.kind = kind;
    this.code = code;
  }
}

export function isStorageError(error: unknown, kind?: StorageErrorKind): error is StorageError {
  return error instanceof StorageError && (kind === undefined || error.kind === kind);
}
