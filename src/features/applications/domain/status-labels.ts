import type { ApplicationStatus } from "@/config/statuses";

/**
 * Başvuru statüsü → personel arayüzü etiketi ve görsel ton (STATE_TRANSITIONS §1, DESIGN_SYSTEM §1.2).
 * Tek kaynak: UI'da statü etiketi/rengi elle yazılmaz. `satisfies Record<…>` her statünün eşlendiğini
 * derleme zamanında zorunlu kılar (yeni statü eklenirse tip hatası verir).
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "processing" | "destructive";

export type StatusPresentation = { readonly label: string; readonly tone: StatusTone };

export const APPLICATION_STATUS_PRESENTATION = {
  AWAITING_DOCUMENTS: { label: "Evrak Bekleniyor", tone: "neutral" },
  UNDER_REVIEW: { label: "İncelemede", tone: "info" },
  REVISION_REQUIRED: { label: "Düzeltme Bekleniyor", tone: "warning" },
  DOCUMENTS_APPROVED: { label: "Evraklar Onaylandı", tone: "success" },
  IN_PROCESS: { label: "Başvuru İşlemde", tone: "processing" },
  COMPLETED: { label: "Süreç Tamamlandı", tone: "success" },
  CANCELLED: { label: "İptal Edildi", tone: "destructive" },
} as const satisfies Record<ApplicationStatus, StatusPresentation>;

export function presentApplicationStatus(status: ApplicationStatus): StatusPresentation {
  return APPLICATION_STATUS_PRESENTATION[status];
}
