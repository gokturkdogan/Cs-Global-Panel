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
 * Dosya depolama kotası (PHASE 08, D-101; PHASE 11.1, OD-26). Hedef: 100 GB sınır / 90 GB uyarı
 * (Backblaze için yıllık ~10 USD bütçe). Kod tavanıdır: ortam değişkeniyle yalnızca EŞİT veya DAHA DÜŞÜK
 * değer verilebilir. Aktif ortam, sağlayıcı hesabı hazır olana kadar `.env.local`'da daha düşük güvenli
 * değerle (9 GB / 8 GB) çalışabilir. Bayt (10^9 = GB, ondalık — sağlayıcı faturalamasıyla aynı birim);
 * değerler `Number.MAX_SAFE_INTEGER`'ın çok altındadır.
 */
export const STORAGE_HARD_MAX_TOTAL_BYTES = 100_000_000_000;
export const STORAGE_DEFAULT_WARNING_BYTES = 90_000_000_000;

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

/**
 * PHASE 11 (D-135) bayt aralığı (Range) teslimi. En fazla `MAX_RANGE_CHUNK_BYTES` uzunluğundaki aralıklar
 * "parça" sınıfındadır ve ayrı limitle sayılır; daha uzun aralıklar ve tam istekler indirme sınıfındadır
 * (`FILE_DOWNLOAD_RATE_LIMIT`). Kötü durum sağlayıcı çıkışı aktör başına saatte
 * 120 × 10 MiB + 600 × 1 MiB ile sınırlıdır. Görüntüleyici parça boyutu bu sınırın altındadır.
 */
export const MAX_RANGE_CHUNK_BYTES = 1024 * 1024;
export const FILE_RANGE_RATE_LIMIT = { max: 600, windowSeconds: 60 * 60 } as const;
/** Parça istekleri için `DOCUMENT_VIEWED` audit kaydı aktör + dosya başına bu pencerede en fazla bir kez. */
export const FILE_VIEW_AUDIT_WINDOW_SECONDS = 10 * 60;
/** Görüntüleyicinin aralık parça boyutu (pdf.js `rangeChunkSize`; `MAX_RANGE_CHUNK_BYTES` altında). */
export const PDF_VIEWER_CHUNK_BYTES = 256 * 1024;

/**
 * İş akışı metin sınırları (PHASE 09; DB CHECK'leriyle aynı): düzeltme açıklaması müşteriye görünür
 * (BR-56, 10–1000); geçiş gerekçesi personel içi (T7–T12, 1–1000); müşteriye görünür yorum (1–2000);
 * şirket içi not (PHASE 10, 1–5000); kalıcı silme gerekçesi (PHASE 10, personel içi, 1–1000).
 */
export const WORKFLOW_TEXT_LIMITS = {
  revisionMessageMin: 10,
  revisionMessageMax: 1000,
  reasonMax: 1000,
  commentMax: 2000,
  internalNoteMax: 5000,
  deletionReasonMax: 1000,
} as const;

/** Başvuru detayında gösterilen en fazla şirket içi not (en yeniler; sınırsız sorgu yok — PHASE 10). */
export const INTERNAL_NOTES_LIST_LIMIT = 50;

/** İşlem geçmişi (audit) sayfa boyutları (PHASE 10); sunucu en fazla 50 kayıt döndürür. */
export const AUDIT_PAGE_SIZES = [10, 20, 50] as const;

/**
 * Kalıcı başvuru silme (PHASE 10, D-116). Sınırlı adımlar — tek istekte tüm silme zorunlu değildir.
 * - Kira: aynı anda tek adım (iki personel / sekme); süre dolarsa başka istek devralır.
 * - (PHASE 10.1, D-124) Zamana dayalı yükleme bekleme payı KALDIRILDI: süre dolması bir storage yazımının
 *   bittiğini kanıtlamaz; sonlandırma yalnızca kalıcı yazım girişimi kanıtlarıyla yapılır.
 * - Toplu silme: adım başına en fazla bu kadar versiyona özgü DeleteObject, sıralı (paralel değil).
 * - Liste: başvuru öneki için adım başına en fazla bu kadar sayfa (1000 versiyon/sayfa, Class C).
 */
export const DELETION_LEASE_SECONDS = 120;
export const DELETION_BATCH_SIZE = 50;
export const DELETION_LIST_MAX_PAGES = 5;
/** Silme işlemleri listesinde gösterilen en fazla kayıt. */
export const DELETION_QUEUE_LIMIT = 50;
