/**
 * Statü ve kod değerleri — tek kaynak (STATE_TRANSITIONS.md, DATABASE_SCHEMA.md).
 * Veritabanı CHECK kısıtları bu listelerden üretilir; geçiş kuralları domain
 * katmanındadır (PHASE 09). Değer eklemek/çıkarmak yeni migration gerektirir.
 */

/** Başvuru statüleri (STATE_TRANSITIONS §1). Arşiv statüsü yoktur (OD-23). */
export const APPLICATION_STATUSES = [
  "AWAITING_DOCUMENTS",
  "UNDER_REVIEW",
  "REVISION_REQUIRED",
  "DOCUMENTS_APPROVED",
  "IN_PROCESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Evrak iş süreci statüleri (STATE_TRANSITIONS §2). */
export const DOCUMENT_STATUSES = [
  "NOT_UPLOADED",
  "UPLOADED",
  "PENDING_REVIEW",
  "APPROVED",
  "REVISION_REQUIRED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Dosyanın teknik yaşam döngüsü (STATE_TRANSITIONS §3) — evrak statüsünden ayrı eksendir. */
export const FILE_STATUSES = [
  "UPLOAD_PENDING",
  "VALIDATING",
  "ACTIVE",
  "SUPERSEDED",
  "REMOVED",
  "REJECTED",
  "EXPIRED",
] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

/** Versiyon numarası almış (doğrulanmış) dosya statüleri. */
export const VERSIONED_FILE_STATUSES = ["ACTIVE", "SUPERSEDED", "REMOVED"] as const;

/** Devam eden yükleme statüleri — evrak başına en fazla bir tane (BR-43). */
export const IN_PROGRESS_FILE_STATUSES = ["UPLOAD_PENDING", "VALIDATING"] as const;

/** Dosya reddi gerekçe kodları (personel içi). */
export const FILE_REJECTION_REASONS = [
  "NOT_PDF",
  "ACTIVE_CONTENT",
  "EMBEDDED_FILE",
  "ENCRYPTED",
  "MALFORMED",
  "TOO_LARGE",
  "RESOURCE_LIMIT",
  "STATE_CHANGED",
  "VALIDATION_ERROR",
] as const;

/** Statü geçmişi kodları: oluşturma + T1–T12 (STATE_TRANSITIONS §1.2). */
export const TRANSITION_CODES = [
  "CREATE",
  "SUBMIT",
  "REQUEST_REVISION",
  "APPROVE_DOCUMENTS",
  "RESUBMIT",
  "START_PROCESSING",
  "COMPLETE",
  "CANCEL",
  "REOPEN_CANCELLED",
  "REOPEN_COMPLETED",
  "REVERT_TO_DOCUMENTS_APPROVED",
  "REVERT_TO_REVIEW",
  "REVERT_FOR_REVISION",
] as const;
export type TransitionCode = (typeof TRANSITION_CODES)[number];

/** Gerekçesi zorunlu geçişler: T7–T12. */
export const REASON_REQUIRED_TRANSITION_CODES = [
  "CANCEL",
  "REOPEN_CANCELLED",
  "REOPEN_COMPLETED",
  "REVERT_TO_DOCUMENTS_APPROVED",
  "REVERT_TO_REVIEW",
  "REVERT_FOR_REVISION",
] as const;

export const REVIEW_DECISIONS = ["APPROVED", "REVISION_REQUIRED"] as const;

/** İşlemi yapan taraf (iş kayıtları). */
export const ACTOR_TYPES = ["USER", "CUSTOMER"] as const;

/** Audit aktör türleri (SECURITY §8). */
export const AUDIT_ACTOR_TYPES = ["USER", "CUSTOMER", "SYSTEM", "ANONYMOUS"] as const;

export const AUDIT_RESOURCE_TYPES = [
  "application",
  "document",
  "file",
  "user",
  "service",
  "document_template",
  "access_link",
  "session",
] as const;

/**
 * Audit metadata'sında izin verilen üst düzey anahtarlar (SECURITY §8.1).
 * PII, token, şifre, IP, user-agent, dosya adı hiçbir anahtarda yer almaz.
 */
export const AUDIT_METADATA_KEYS = [
  "accessTokenId",
  "changedFields",
  "count",
  "counts",
  "fileCount",
  "fileId",
  "from",
  "id",
  "onBehalfOfCustomer",
  "reason",
  "requirementId",
  "reviewId",
  "serviceId",
  "to",
  "transitionCode",
  "versionNumber",
] as const;

/**
 * Kalıcı başvuru silme (PHASE 10, D-116): sağlayıcıdaki her fiziksel versiyonun durumu. `DELETED` yalnızca
 * versiyona özgü listeleme ile YOKLUĞU doğrulanınca yazılır (silme yanıtı tek başına kanıt değildir).
 */
export const DELETION_OBJECT_STATES = ["PENDING", "DELETED"] as const;
export type DeletionObjectState = (typeof DELETION_OBJECT_STATES)[number];

/**
 * Silme adımının son hata kategorisi (personel içi, güvenli kod; sağlayıcı mesajı/anahtar içermez).
 * `MANUAL_DELETION_ERRORS` personel yeniden denemesiyle çözülmez: yapılandırma/yetki/sahiplik incelemesi gerekir.
 */
export const DELETION_ERROR_CODES = [
  "STORAGE_UNAVAILABLE",
  "STORAGE_LIMIT",
  "STORAGE_FORBIDDEN",
  "STORAGE_NOT_CONFIGURED",
  "LISTING_INCOMPLETE",
  "UNKNOWN_OBJECT",
  "OWNERSHIP_CONFLICT",
  "VERIFICATION_PENDING",
  "FINALIZATION_FAILED",
  // PHASE 10.1 (D-124, D-126): talepten önce başlamış bir storage yazımının sonucu kanıtlanamadı /
  // yazım takibi olmayan eski (migration 0008 öncesi) dosya kaydı.
  "UPLOAD_OUTCOME_UNKNOWN",
  "LEGACY_UNVERIFIED",
] as const;
export type DeletionErrorCode = (typeof DELETION_ERROR_CODES)[number];
export const MANUAL_DELETION_ERRORS: readonly DeletionErrorCode[] = [
  "STORAGE_FORBIDDEN",
  "STORAGE_NOT_CONFIGURED",
  "UNKNOWN_OBJECT",
  "OWNERSHIP_CONFLICT",
  "LEGACY_UNVERIFIED",
];

/**
 * Fiziksel storage yazım girişimi (PHASE 10.1, D-121…D-123). Dosya yaşam döngüsünden (FILE_STATUSES)
 * ayrı eksendir: dosyanın EXPIRED/REJECTED olması yazımın bittiğini kanıtlamaz.
 * - ADMITTED: rezervasyonla kabul edildi, PUT henüz gönderilmedi (silme talebiyle çitlenebilir).
 * - IN_PROGRESS: PUT gönderilmek üzere/gönderildi; sonuç henüz kaydedilmedi (süreç çökerse burada kalır).
 * - CONFIRMED: sağlayıcı versiyon kimliğiyle başarı döndürdü VEYA versiyon depoda gözlendi.
 * - FAILED: kesin başarısızlık — yalnızca istek hiç gönderilmediyse (bağlantı kurulamadı).
 * - FENCED: PUT başlamadan çitlendi (silme talebi / süresi dolmuş rezervasyon); hiç yazım olmaz.
 * - UNKNOWN: sonuç belirsiz (zaman aşımı, yanıt kaybı, sağlayıcı hatası, bütünlük uyuşmazlığı).
 * Çözülmüş (settled) = CONFIRMED | FAILED | FENCED. UNKNOWN yalnızca versiyon gözlemiyle CONFIRMED olur.
 */
export const WRITE_ATTEMPT_STATES = [
  "ADMITTED",
  "IN_PROGRESS",
  "CONFIRMED",
  "FAILED",
  "FENCED",
  "UNKNOWN",
] as const;
export type WriteAttemptState = (typeof WRITE_ATTEMPT_STATES)[number];
export const SETTLED_WRITE_ATTEMPT_STATES = ["CONFIRMED", "FAILED", "FENCED"] as const;
export const UNSETTLED_WRITE_ATTEMPT_STATES = ["ADMITTED", "IN_PROGRESS", "UNKNOWN"] as const;

export const WRITE_ATTEMPT_OUTCOMES = [
  "PROVIDER_CONFIRMED",
  "OBSERVED",
  "NOT_SENT",
  "FENCED_BY_DELETION",
  "RESERVATION_EXPIRED",
  "RESPONSE_LOST",
  "PROVIDER_ERROR",
  "NO_VERSION_ID",
  "INTEGRITY_MISMATCH",
] as const;
export type WriteAttemptOutcome = (typeof WRITE_ATTEMPT_OUTCOMES)[number];

export const ACCESS_TOKEN_REVOKE_REASONS = ["ROTATED", "REVOKED", "APPLICATION_DELETION"] as const;

/** Personel rolleri (Better Auth admin plugin `role` alanı). */
export const STAFF_ROLES = ["admin", "employee"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
