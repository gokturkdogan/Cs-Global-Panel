import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";

import type { UploadActor } from "./upload-rules";

/**
 * Evrak inceleme ve kaldırma kuralları (STATE_TRANSITIONS §2.2 D2, D4–D8; BR-44, BR-55…BR-58;
 * PHASE 09 — D-109). Saf fonksiyonlar; sunucu kilit altında yeniden çağırır.
 */

export type ReviewDecision = "APPROVED" | "REVISION_REQUIRED";

/**
 * BR-55: inceleme yalnızca `UNDER_REVIEW` başvuruda. D4/D5: `PENDING_REVIEW` → karar; D6/BR-58: karar
 * değişikliği (`APPROVED ↔ REVISION_REQUIRED`) yine `UNDER_REVIEW`'da. Aynı karar tekrar verilemez.
 */
export function reviewTarget(
  applicationStatus: ApplicationStatus,
  documentStatus: DocumentStatus,
  decision: ReviewDecision,
): DocumentStatus | null {
  if (applicationStatus !== "UNDER_REVIEW") return null;
  if (decision === "APPROVED") {
    return documentStatus === "PENDING_REVIEW" || documentStatus === "REVISION_REQUIRED"
      ? "APPROVED"
      : null;
  }
  return documentStatus === "PENDING_REVIEW" || documentStatus === "APPROVED"
    ? "REVISION_REQUIRED"
    : null;
}

/**
 * BR-44 "kaldır": `AWAITING_DOCUMENTS`'ta `UPLOADED`; `REVISION_REQUIRED`'da `UPLOADED` ve
 * `REVISION_REQUIRED` evrakların aktif dosyası. Müşteri ve personel aynı (personel `UNDER_REVIEW`'da
 * kaldıramaz — yalnızca yükler/değiştirir). `APPROVED`/`PENDING_REVIEW` hiçbir zaman kaldırılamaz.
 */
export function canRemoveFile(
  _actor: UploadActor,
  applicationStatus: ApplicationStatus,
  documentStatus: DocumentStatus,
): boolean {
  if (applicationStatus === "AWAITING_DOCUMENTS") return documentStatus === "UPLOADED";
  if (applicationStatus === "REVISION_REQUIRED") {
    return documentStatus === "UPLOADED" || documentStatus === "REVISION_REQUIRED";
  }
  return false;
}

/** D2: `UPLOADED → NOT_UPLOADED`; D8: isteğe bağlı `REVISION_REQUIRED → NOT_UPLOADED`, zorunluda kalır. */
export function documentStatusAfterRemoval(
  documentStatus: DocumentStatus,
  isRequired: boolean,
): DocumentStatus {
  if (documentStatus === "REVISION_REQUIRED")
    return isRequired ? "REVISION_REQUIRED" : "NOT_UPLOADED";
  return "NOT_UPLOADED";
}
