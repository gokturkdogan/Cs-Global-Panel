import type { DocumentStatus } from "@/config/statuses";

import type { StatusPresentation } from "./status-labels";

/** Evrak statüsü → etiket/ton (STATE_TRANSITIONS §2, DESIGN_SYSTEM §1.2). Eksiksizlik derleme zamanında. */
export const DOCUMENT_STATUS_PRESENTATION = {
  NOT_UPLOADED: { label: "Yüklenmedi", tone: "neutral" },
  UPLOADED: { label: "Yüklendi", tone: "success" },
  PENDING_REVIEW: { label: "İnceleme Bekliyor", tone: "info" },
  APPROVED: { label: "Onaylandı", tone: "success" },
  REVISION_REQUIRED: { label: "Düzeltme Gerekli", tone: "warning" },
} as const satisfies Record<DocumentStatus, StatusPresentation>;
