import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";

/**
 * Müşteri paneli ilerleme kuralları (BUSINESS_RULES §11, BR-110…BR-114, D-092). Saf fonksiyonlar.
 * Süreç göstergesi iş akışı aşamasını gösterir; vize sonucu, olasılık veya süre bildirmez.
 */

export const PROCESS_STEPS = [
  "Kayıt Oluşturuldu",
  "Evrak Yükleme",
  "Evrak İnceleme",
  "Başvuru İşlemleri",
  "Süreç Tamamlandı",
] as const;

export type StepState = "done" | "current" | "upcoming";

export type ProcessProgress =
  | {
      readonly kind: "steps";
      readonly steps: readonly { readonly label: string; readonly state: StepState }[];
      readonly revision: boolean;
    }
  /** İptal: adım göstergesi yerine nötr bilgi (sahte ilerleme yok). */
  | { readonly kind: "cancelled" };

/** BR §11.1 tablosu: tamamlanan adım sayısı ve aktif adım (aktif yoksa null). */
const STEP_MAP = {
  AWAITING_DOCUMENTS: { done: 1, current: 2 },
  UNDER_REVIEW: { done: 2, current: 3 },
  REVISION_REQUIRED: { done: 1, current: 2 },
  DOCUMENTS_APPROVED: { done: 3, current: null },
  IN_PROCESS: { done: 3, current: 4 },
  COMPLETED: { done: 5, current: null },
  CANCELLED: null,
} as const satisfies Record<ApplicationStatus, { done: number; current: number | null } | null>;

export function processProgress(status: ApplicationStatus): ProcessProgress {
  const map = STEP_MAP[status];
  if (map === null) return { kind: "cancelled" };
  return {
    kind: "steps",
    revision: status === "REVISION_REQUIRED",
    steps: PROCESS_STEPS.map((label, index) => {
      const step = index + 1;
      const state: StepState =
        step <= map.done ? "done" : step === map.current ? "current" : "upcoming";
      return { label, state };
    }),
  };
}

/** Müşteriye statü açıklaması (STATE_TRANSITIONS §1 "Açıklama (müşteriye)" sütunu). */
export const CUSTOMER_STATUS_MESSAGE = {
  AWAITING_DOCUMENTS: "Gerekli evraklarınızı yükleyip incelemeye gönderin.",
  UNDER_REVIEW: "Evraklarınız ekibimiz tarafından inceleniyor.",
  REVISION_REQUIRED: "Bazı evraklarınızın düzeltilmesi gerekiyor.",
  DOCUMENTS_APPROVED: "Evraklarınız onaylandı. Başvuru işlemlerine geçilecek.",
  IN_PROCESS: "Başvuru işlemleriniz CS Global tarafından yürütülüyor.",
  COMPLETED: "CS Global danışmanlık süreciniz tamamlandı.",
  CANCELLED: "Bu başvuru iptal edilmiştir.",
} as const satisfies Record<ApplicationStatus, string>;

/** Müşterinin evrak yükleyebildiği/gönderebildiği statüler (DESIGN_SYSTEM §7 madde 10). */
export const CUSTOMER_EDITABLE_STATUSES = [
  "AWAITING_DOCUMENTS",
  "REVISION_REQUIRED",
] as const satisfies readonly ApplicationStatus[];

export function isCustomerEditable(status: ApplicationStatus): boolean {
  return (CUSTOMER_EDITABLE_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/** Aktif dosyası olan evrak statüleri (BR-111 yaklaşımı: düzeltme bekleyen sayılmaz). */
const UPLOADED_STATUSES = [
  "UPLOADED",
  "PENDING_REVIEW",
  "APPROVED",
] as const satisfies readonly DocumentStatus[];

export type DocumentCompletion = {
  readonly total: number;
  readonly requiredTotal: number;
  readonly requiredUploaded: number;
  readonly requiredApproved: number;
  readonly requiredMissing: number;
  readonly revisionCount: number;
  /** BR-113: aşağı yuvarlanır; %100 yalnızca tam tamamlanmada; zorunlu evrak yoksa null (BR-114). */
  readonly percent: number | null;
};

export function documentCompletion(
  documents: readonly { readonly isRequired: boolean; readonly status: DocumentStatus }[],
): DocumentCompletion {
  const required = documents.filter((item) => item.isRequired);
  const requiredUploaded = required.filter((item) =>
    (UPLOADED_STATUSES as readonly DocumentStatus[]).includes(item.status),
  ).length;
  return {
    total: documents.length,
    requiredTotal: required.length,
    requiredUploaded,
    requiredApproved: required.filter((item) => item.status === "APPROVED").length,
    requiredMissing: required.length - requiredUploaded,
    revisionCount: documents.filter((item) => item.status === "REVISION_REQUIRED").length,
    percent: required.length === 0 ? null : Math.floor((requiredUploaded * 100) / required.length),
  };
}
