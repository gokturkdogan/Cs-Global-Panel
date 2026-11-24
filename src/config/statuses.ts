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

export const ACCESS_TOKEN_REVOKE_REASONS = ["ROTATED", "REVOKED", "APPLICATION_DELETION"] as const;

/** Personel rolleri (Better Auth admin plugin `role` alanı). */
export const STAFF_ROLES = ["admin", "employee"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
