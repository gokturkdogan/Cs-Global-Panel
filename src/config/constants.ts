/**
 * Sabit uygulama yapılandırması (D-037). Panelden veya env ile değiştirilemez.
 * Değerler kabul edilmiş ürün kararlarından gelir; değişiklik yeni karar gerektirir.
 * Diğer sabitler (rate limit, upload süreleri, sayfalama) ilgili fazda eklenir.
 */

/** Kabul edilen tek dosya türü (OD-16, BR-40). */
export const ALLOWED_FILE_MIME = "application/pdf";
export const ALLOWED_FILE_EXTENSION = ".pdf";

/** Dosya başına üst sınır: 10 MB = 10 × 1024 × 1024 bayt (OD-16). */
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

/** Personel şifre uzunluğu sınırları (OD-22). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Oturum süreleri: 7 gün, sabit; kullanımla uzatılmaz (OD-22). */
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
export const STAFF_SESSION_MAX_AGE_SECONDS = SEVEN_DAYS_IN_SECONDS;
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = SEVEN_DAYS_IN_SECONDS;

/** Müşteri erişim token'ı uzunluğu: 32 bayt = 256 bit CSPRNG (OD-01). */
export const ACCESS_TOKEN_BYTES = 32;
