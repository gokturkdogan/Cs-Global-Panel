import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";

/**
 * Yükleme/değiştirme kuralları (BR-44, BR-45, BR-48; STATE_TRANSITIONS §2 D1, D7, D9). Saf fonksiyonlar:
 * UI butonları bu sonuca göre gösterilir; sunucu aynı fonksiyonu rezervasyon ve aktivasyon
 * transaction'larında kilit altında YENİDEN çağırır. İki personel hesabı eşittir (OD-24).
 * Kaldırma (BR-44 "kaldır", D2/D8) bu fazda uygulanmadı (D-103).
 */

export type UploadActor = "CUSTOMER" | "STAFF";

const CUSTOMER_UPLOADABLE: Partial<Record<ApplicationStatus, readonly DocumentStatus[]>> = {
  AWAITING_DOCUMENTS: ["NOT_UPLOADED", "UPLOADED"],
  REVISION_REQUIRED: ["NOT_UPLOADED", "UPLOADED", "REVISION_REQUIRED"],
};

/** Personel: müşteriyle aynı + `UNDER_REVIEW`'da tüm evrak statüleri (OD-17, D9). */
const STAFF_UPLOADABLE: Partial<Record<ApplicationStatus, readonly DocumentStatus[]>> = {
  ...CUSTOMER_UPLOADABLE,
  UNDER_REVIEW: ["NOT_UPLOADED", "UPLOADED", "PENDING_REVIEW", "APPROVED", "REVISION_REQUIRED"],
};

export function canUploadDocument(
  actor: UploadActor,
  applicationStatus: ApplicationStatus,
  documentStatus: DocumentStatus,
): boolean {
  const table = actor === "CUSTOMER" ? CUSTOMER_UPLOADABLE : STAFF_UPLOADABLE;
  return table[applicationStatus]?.includes(documentStatus) ?? false;
}

/**
 * Yeni dosya aktif olduğunda evrak statüsü. `UNDER_REVIEW` → `PENDING_REVIEW` (D9; önceki onay yeni
 * dosyaya aktarılmaz — BR-48); diğer izinli durumlarda `UPLOADED` (D1, D7, değiştirmede aynı kalır).
 * İzin yoksa `null`.
 */
export function documentStatusAfterUpload(
  actor: UploadActor,
  applicationStatus: ApplicationStatus,
  documentStatus: DocumentStatus,
): DocumentStatus | null {
  if (!canUploadDocument(actor, applicationStatus, documentStatus)) return null;
  return applicationStatus === "UNDER_REVIEW" ? "PENDING_REVIEW" : "UPLOADED";
}

/** Önceki onay yeni dosyayla geçersiz kılınıyor mu? (audit `from/to` için) */
export function invalidatesApproval(before: DocumentStatus, after: DocumentStatus): boolean {
  return before === "APPROVED" && after !== "APPROVED";
}
