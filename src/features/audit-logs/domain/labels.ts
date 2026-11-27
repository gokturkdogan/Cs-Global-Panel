import {
  APPLICATION_STATUSES,
  DOCUMENT_STATUSES,
  TRANSITION_CODES,
  type AUDIT_ACTOR_TYPES,
  type AUDIT_RESOURCE_TYPES,
} from "@/config/statuses";
import { DOCUMENT_STATUS_PRESENTATION } from "@/features/applications/domain/document-status-labels";
import { APPLICATION_STATUS_PRESENTATION } from "@/features/applications/domain/status-labels";
import { TRANSITION_HISTORY_LABELS } from "@/features/applications/domain/transition-labels";

/**
 * İşlem geçmişi sunumu (PHASE 10, D-119). Audit event kodları için merkezi Türkçe etiketler; koda yeni bir
 * event eklenip burada etiketlenmezse unit test başarısız olur. Bilinmeyen/eski event'ler genel etiketle
 * gösterilir; ham metadata hiçbir zaman kullanıcıya dökülmez — yalnızca izinli alanlar biçimlendirilir.
 */
export const AUDIT_ACTION_LABELS = {
  USER_LOGIN: "Personel Girişi",
  USER_LOGIN_FAILED: "Başarısız Giriş Denemesi",
  USER_LOGOUT: "Personel Çıkışı",
  USER_CREATED: "Personel Hesabı Oluşturuldu (CLI)",
  USER_PASSWORD_SET: "Personel Şifresi Belirlendi (CLI)",
  USER_SESSIONS_REVOKED: "Personel Oturumları Kapatıldı (CLI)",
  APPLICATION_CREATED: "Başvuru Oluşturuldu",
  APPLICATION_UPDATED: "Müşteri Bilgileri Güncellendi",
  APPLICATION_SUBMITTED: "Başvuru İncelemeye Gönderildi",
  APPLICATION_RESUBMITTED: "Başvuru Yeniden İncelemeye Gönderildi",
  APPLICATION_STATUS_CHANGED: "Başvuru Durumu Değişti",
  APPLICATION_DELETION_REQUESTED: "Kalıcı Silme Başlatıldı",
  APPLICATION_DELETION_FAILED: "Kalıcı Silme Adımı Tamamlanamadı",
  APPLICATION_DELETED: "Başvuru Kalıcı Olarak Silindi",
  ACCESS_LINK_CREATED: "Müşteri Bağlantısı Oluşturuldu",
  ACCESS_LINK_ROTATED: "Müşteri Bağlantısı Yenilendi",
  ACCESS_LINK_REVOKED: "Müşteri Bağlantısı İptal Edildi",
  ACCESS_LINK_VIEWED: "Müşteri Bağlantısı Görüntülendi",
  ACCESS_LINK_SHARE_PREPARED: "WhatsApp Paylaşımı Hazırlandı",
  DOCUMENT_UPLOADED: "Evrak Yüklendi",
  DOCUMENT_REPLACED: "Evrak Dosyası Değiştirildi",
  DOCUMENT_DELETED: "Evrak Dosyası Kaldırıldı",
  DOCUMENT_VALIDATION_REJECTED: "Dosya Reddedildi",
  DOCUMENT_UPLOAD_FAILED: "Dosya Yüklemesi Tamamlanamadı",
  DOCUMENT_VIEWED: "Evrak Görüntülendi",
  DOCUMENT_DOWNLOADED: "Evrak İndirildi",
  DOCUMENT_APPROVED: "Evrak Onaylandı",
  DOCUMENT_REVISION_REQUESTED: "Evrak İçin Düzeltme İstendi",
  DOCUMENT_APPROVAL_INVALIDATED: "Evrak Onayı Geçersizleşti",
  DOCUMENT_COMMENT_ADDED: "Müşteriye Görünür Yorum Eklendi",
  INTERNAL_NOTE_ADDED: "Şirket İçi Not Eklendi",
  SERVICE_CREATED: "Hizmet Oluşturuldu",
  SERVICE_UPDATED: "Hizmet Güncellendi",
  SERVICE_ACTIVATED: "Hizmet Aktifleştirildi",
  SERVICE_DEACTIVATED: "Hizmet Pasifleştirildi",
  DOCUMENT_TEMPLATE_CREATED: "Evrak Şablonu Oluşturuldu",
  DOCUMENT_TEMPLATE_UPDATED: "Evrak Şablonu Güncellendi",
  DOCUMENT_TEMPLATE_ACTIVATED: "Evrak Şablonu Aktifleştirildi",
  DOCUMENT_TEMPLATE_DEACTIVATED: "Evrak Şablonu Pasifleştirildi",
  STORAGE_RECONCILED: "Depolama Mutabakatı (CLI)",
  TECHNICAL_CLEANUP_EXECUTED: "Teknik Depolama Temizliği (CLI)",
} as const;

export type KnownAuditAction = keyof typeof AUDIT_ACTION_LABELS;
export const KNOWN_AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as KnownAuditAction[];

export function isKnownAuditAction(value: string): value is KnownAuditAction {
  return Object.hasOwn(AUDIT_ACTION_LABELS, value);
}

export function auditActionLabel(action: string): string {
  return isKnownAuditAction(action) ? AUDIT_ACTION_LABELS[action] : "Diğer işlem";
}

export const AUDIT_ACTOR_LABELS: Record<(typeof AUDIT_ACTOR_TYPES)[number], string> = {
  USER: "Personel",
  CUSTOMER: "Müşteri",
  SYSTEM: "Sistem",
  ANONYMOUS: "Anonim",
};

export const AUDIT_RESOURCE_LABELS: Record<(typeof AUDIT_RESOURCE_TYPES)[number], string> = {
  application: "Başvuru",
  document: "Evrak",
  file: "Dosya",
  user: "Personel hesabı",
  service: "Hizmet",
  document_template: "Evrak şablonu",
  access_link: "Müşteri bağlantısı",
  session: "Oturum",
};

/** Gerekçe/hata KODLARI (serbest metin değil). Listede olmayan kod gösterilmez. */
const REASON_LABELS: Record<string, string> = {
  INVALID_CREDENTIALS: "Hatalı kullanıcı adı veya şifre",
  RATE_LIMITED: "Deneme sınırı aşıldı",
  NOT_PDF: "PDF değil",
  ACTIVE_CONTENT: "Etkin içerik",
  EMBEDDED_FILE: "Gömülü dosya",
  ENCRYPTED: "Şifreli PDF",
  MALFORMED: "Bozuk PDF",
  TOO_LARGE: "Boyut sınırı",
  RESOURCE_LIMIT: "Doğrulama kaynak sınırı",
  STATE_CHANGED: "Durum değişti",
  VALIDATION_ERROR: "Doğrulama hatası",
  STORAGE_ERROR: "Depolama hatası",
  STORAGE_LIMIT: "Depolama sağlayıcı sınırı",
  STORAGE_AMBIGUOUS: "Depolama yanıtı belirsiz",
  STORAGE_NO_VERSION: "Depolama versiyon kimliği yok",
  ACTIVATION_FAILED: "Aktivasyon başarısız",
  STORAGE_UNAVAILABLE: "Depolama erişilemiyor",
  STORAGE_FORBIDDEN: "Depolama yetki/politika reddi",
  STORAGE_NOT_CONFIGURED: "Depolama yapılandırması yok",
  LISTING_INCOMPLETE: "Envanter tamamlanamadı",
  UNKNOWN_OBJECT: "Sahipliği doğrulanamayan nesne",
  OWNERSHIP_CONFLICT: "Sahiplik çakışması",
  VERIFICATION_PENDING: "Silme doğrulaması bekliyor",
  FINALIZATION_FAILED: "Veritabanı temizliği başarısız",
  UPLOAD_OUTCOME_UNKNOWN: "Yükleme sonucu doğrulanamadı",
  LEGACY_UNVERIFIED: "Yazım takibi olmayan eski kayıt",
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  phone: "Telefon",
  email: "E-posta",
  name: "Ad",
  title: "Başlık",
  description: "Açıklama",
  instructions: "Talimat",
  isRequired: "Zorunluluk",
  isActive: "Aktiflik",
  sortOrder: "Sıralama",
};

function statusLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if ((APPLICATION_STATUSES as readonly string[]).includes(value)) {
    return APPLICATION_STATUS_PRESENTATION[value as (typeof APPLICATION_STATUSES)[number]].label;
  }
  if ((DOCUMENT_STATUSES as readonly string[]).includes(value)) {
    return DOCUMENT_STATUS_PRESENTATION[value as (typeof DOCUMENT_STATUSES)[number]].label;
  }
  return null;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export type AuditDetail = { readonly label: string; readonly value: string };

/**
 * Metadata'dan YALNIZCA izinli alanları Türkçe biçimlendirir (allowlist). Kimlikler (dosya, evrak, token),
 * serbest metin ve tanınmayan değerler gösterilmez; eski kayıtlardaki beklenmeyen anahtarlar yok sayılır.
 */
export function describeAuditMetadata(metadata: unknown): AuditDetail[] {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const m = metadata as Record<string, unknown>;
  const details: AuditDetail[] = [];
  const from = statusLabel(m.from);
  const to = statusLabel(m.to);
  if (from !== null || to !== null) {
    details.push({ label: "Durum", value: `${from ?? "—"} → ${to ?? "—"}` });
  }
  if (
    typeof m.transitionCode === "string" &&
    (TRANSITION_CODES as readonly string[]).includes(m.transitionCode)
  ) {
    details.push({
      label: "Geçiş",
      value: TRANSITION_HISTORY_LABELS[m.transitionCode as (typeof TRANSITION_CODES)[number]],
    });
  }
  if (isCount(m.versionNumber))
    details.push({ label: "Dosya versiyonu", value: `v${m.versionNumber}` });
  if (isCount(m.fileCount)) details.push({ label: "Dosya sayısı", value: String(m.fileCount) });
  if (isCount(m.count)) details.push({ label: "Adet", value: String(m.count) });
  if (typeof m.reason === "string" && Object.hasOwn(REASON_LABELS, m.reason)) {
    details.push({ label: "Neden", value: REASON_LABELS[m.reason]! });
  }
  if (m.onBehalfOfCustomer === true) details.push({ label: "Müşteri adına", value: "Evet" });
  if (Array.isArray(m.changedFields)) {
    const fields = m.changedFields
      .filter(
        (field): field is string => typeof field === "string" && Object.hasOwn(FIELD_LABELS, field),
      )
      .map((field) => FIELD_LABELS[field]!);
    if (fields.length > 0) details.push({ label: "Değişen alanlar", value: fields.join(", ") });
  }
  if (m.counts !== null && typeof m.counts === "object" && !Array.isArray(m.counts)) {
    const parts = Object.entries(m.counts as Record<string, unknown>)
      .filter(([key, value]) => /^[a-zA-Z]{1,40}$/.test(key) && isCount(value))
      .map(([key, value]) => `${key}: ${value as number}`);
    if (parts.length > 0) details.push({ label: "Sayılar", value: parts.join(" · ") });
  }
  return details;
}
