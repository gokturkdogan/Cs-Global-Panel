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

/**
 * Personel girişi rate limit'leri (SECURITY §6, D-063, D-068). Denemeler sayılır; başarılı giriş
 * kullanıcı adı sayacını sıfırlar; sabit 15 dakikalık pencere; kalıcı hesap kilidi yoktur.
 * - Kullanıcı adı başına: var olan ve olmayan tüm kullanıcı adlarına aynı şekilde uygulanır.
 * - Bilinmeyen kullanıcı adları (ortak): yalnızca var olmayan adlarla yapılan toplu denemeleri
 *   sınırlar; gerçek hesapların girişini etkilemez (global limit DoS riskinin azaltılması — P4-03).
 */
export const LOGIN_RATE_LIMIT_PER_USERNAME = { max: 10, windowSeconds: 15 * 60 } as const;
export const LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES = { max: 50, windowSeconds: 15 * 60 } as const;

/**
 * Hizmet ve evrak şablonu metin sınırları (DATABASE_SCHEMA §4.1–4.2 CHECK kısıtlarıyla aynı).
 * Dosya tipi/boyutu/sayısı şablon alanı değildir (OD-16).
 */
export const SERVICE_TEXT_LIMITS = {
  nameMin: 2,
  nameMax: 150,
  descriptionMax: 2000,
  requirementTitleMin: 2,
  requirementTitleMax: 150,
  requirementDescriptionMax: 2000,
  requirementInstructionsMax: 4000,
} as const;

/** Hizmet listesi tek sorguda en fazla bu kadar kayıt döndürür (sınırsız sorgu yok). */
export const SERVICE_LIST_LIMIT = 100;

/** Arama metni üst sınırı (karakter). */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * Dosya depolama kotası (PHASE 08, D-101). Ücretsiz Backblaze B2 kapasitesi (10 GB) aşılmasın diye
 * uygulama tarafı sınırlar. Ortam değişkeniyle yalnızca DAHA DÜŞÜK değer verilebilir (testler);
 * üst sınır kodda sabittir. Bayt (10^9 = GB, ondalık — sağlayıcı faturalamasıyla aynı birim).
 */
export const STORAGE_HARD_MAX_TOTAL_BYTES = 9_000_000_000;
export const STORAGE_DEFAULT_WARNING_BYTES = 8_000_000_000;

/** Yükleme isteği (D-100): ham PDF gövdesi; süre, eşzamanlılık ve dosya adı sınırları. */
export const UPLOAD_REQUEST_TIMEOUT_MS = 120_000;
/** Rezervasyondan sonra storage yazımı bu sürede tamamlanmazsa yükleme yarım sayılır (teknik temizlik). */
export const UPLOAD_PENDING_TTL_SECONDS = 15 * 60;
/** Süreç başına aynı anda işlenen yükleme sayısı (bellek: en fazla 4 × 10 MB). */
export const MAX_CONCURRENT_UPLOADS = 4;
/** Görünen dosya adı üst sınırı (DB CHECK ile aynı). */
export const MAX_FILENAME_LENGTH = 200;

/** Yapısal PDF doğrulama kaynak sınırları (D-099). Aşılırsa `RESOURCE_LIMIT`. */
export const PDF_VALIDATION_LIMITS = {
  timeoutMs: 20_000,
  maxHeapMb: 256,
  maxPages: 2_000,
  maxObjects: 100_000,
  maxInflatedBytes: 64 * 1024 * 1024,
  maxNestingDepth: 64,
} as const;

/** Dosya istekleri için aktör başına sabit pencereli limitler (sağlayıcı kotasını korur). */
export const FILE_UPLOAD_RATE_LIMIT = { max: 30, windowSeconds: 60 * 60 } as const;
export const FILE_DOWNLOAD_RATE_LIMIT = { max: 120, windowSeconds: 60 * 60 } as const;
