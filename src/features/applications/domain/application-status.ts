import type { ApplicationStatus, DocumentStatus, TransitionCode } from "@/config/statuses";

/**
 * Başvuru state machine'i (STATE_TRANSITIONS §1.2, BR-50…BR-62; PHASE 09 — D-108). Saf modül: UI
 * butonları ve sunucu mutasyonları aynı tablodan beslenir; sunucu kilit altında YENİDEN değerlendirir.
 * Hedef statü istemciden alınmaz — aksiyon kodundan (ve T8'de statü geçmişinden) sunucu belirler.
 * Matriste olmayan her geçiş reddedilir. Geçişler manueldir (BR-61): otomatik geçiş yoktur.
 */

export type WorkflowTransition = Exclude<TransitionCode, "CREATE">;

type TransitionRule = {
  readonly from: readonly ApplicationStatus[];
  /** `PREVIOUS`: iptal öncesi statü (T8) — son `→ CANCELLED` geçmiş kaydının `from_status`'u. */
  readonly to: ApplicationStatus | "PREVIOUS";
  readonly reasonRequired: boolean;
  /** Personel dışında yapabilen aktör (yalnızca gönderim). */
  readonly customer: boolean;
};

export const TRANSITIONS: Record<WorkflowTransition, TransitionRule> = {
  SUBMIT: {
    from: ["AWAITING_DOCUMENTS"],
    to: "UNDER_REVIEW",
    reasonRequired: false,
    customer: true,
  },
  RESUBMIT: {
    from: ["REVISION_REQUIRED"],
    to: "UNDER_REVIEW",
    reasonRequired: false,
    customer: true,
  },
  REQUEST_REVISION: {
    from: ["UNDER_REVIEW"],
    to: "REVISION_REQUIRED",
    reasonRequired: false,
    customer: false,
  },
  APPROVE_DOCUMENTS: {
    from: ["UNDER_REVIEW"],
    to: "DOCUMENTS_APPROVED",
    reasonRequired: false,
    customer: false,
  },
  START_PROCESSING: {
    from: ["DOCUMENTS_APPROVED"],
    to: "IN_PROCESS",
    reasonRequired: false,
    customer: false,
  },
  COMPLETE: { from: ["IN_PROCESS"], to: "COMPLETED", reasonRequired: false, customer: false },
  CANCEL: {
    from: [
      "AWAITING_DOCUMENTS",
      "UNDER_REVIEW",
      "REVISION_REQUIRED",
      "DOCUMENTS_APPROVED",
      "IN_PROCESS",
    ],
    to: "CANCELLED",
    reasonRequired: true,
    customer: false,
  },
  REOPEN_CANCELLED: { from: ["CANCELLED"], to: "PREVIOUS", reasonRequired: true, customer: false },
  REOPEN_COMPLETED: {
    from: ["COMPLETED"],
    to: "IN_PROCESS",
    reasonRequired: true,
    customer: false,
  },
  REVERT_TO_DOCUMENTS_APPROVED: {
    from: ["IN_PROCESS"],
    to: "DOCUMENTS_APPROVED",
    reasonRequired: true,
    customer: false,
  },
  REVERT_TO_REVIEW: {
    from: ["DOCUMENTS_APPROVED"],
    to: "UNDER_REVIEW",
    reasonRequired: true,
    customer: false,
  },
  REVERT_FOR_REVISION: {
    from: ["DOCUMENTS_APPROVED", "IN_PROCESS"],
    to: "REVISION_REQUIRED",
    reasonRequired: true,
    customer: false,
  },
};

/** Guard'ların değerlendirdiği evrak görünümü (kilit altında gerçek kayıtlardan üretilir). */
export type DocumentFacts = {
  readonly isRequired: boolean;
  readonly status: DocumentStatus;
  /** Doğrulanmış `ACTIVE` dosya var mı (bekleyen/başarısız/eski versiyon sayılmaz). */
  readonly hasActiveFile: boolean;
  /** Süresi dolmamış devam eden yükleme (`UPLOAD_PENDING`/`VALIDATING`). */
  readonly hasPendingUpload: boolean;
};

export type Blocker =
  | "WRONG_STATUS"
  | "MISSING_REQUIRED"
  | "UPLOAD_IN_PROGRESS"
  | "REVISION_PENDING"
  | "PENDING_REVIEW"
  | "NO_REVISION"
  | "NOT_ALL_APPROVED";

/** Gönderim aksiyonu (T1/T4): statüye göre. Gönderilemiyorsa `null`. */
export function submissionTransition(status: ApplicationStatus): "SUBMIT" | "RESUBMIT" | null {
  if (status === "AWAITING_DOCUMENTS") return "SUBMIT";
  if (status === "REVISION_REQUIRED") return "RESUBMIT";
  return null;
}

/**
 * BR-50/51: zorunlu her evrakın aktif dosyası var; hiçbir evrakta devam eden yükleme yok; hiçbir
 * evrak `REVISION_REQUIRED`'da kalmamış. İsteğe bağlı eksikler engellemez. Zorunlu evrakı olmayan
 * hizmette koşullar boş kümede sağlanır (BR-50 metni; yeni politika eklenmedi).
 */
export function submissionBlockers(
  status: ApplicationStatus,
  documents: readonly DocumentFacts[],
): Blocker[] {
  const blockers: Blocker[] = [];
  if (submissionTransition(status) === null) blockers.push("WRONG_STATUS");
  if (documents.some((d) => d.isRequired && !d.hasActiveFile)) blockers.push("MISSING_REQUIRED");
  if (documents.some((d) => d.hasPendingUpload)) blockers.push("UPLOAD_IN_PROGRESS");
  if (documents.some((d) => d.status === "REVISION_REQUIRED")) blockers.push("REVISION_PENDING");
  return blockers;
}

/** BR-59 (T2): `PENDING_REVIEW` kalmamış ve ≥1 evrak `REVISION_REQUIRED`. */
export function requestRevisionBlockers(documents: readonly DocumentFacts[]): Blocker[] {
  const blockers: Blocker[] = [];
  if (documents.some((d) => d.status === "PENDING_REVIEW")) blockers.push("PENDING_REVIEW");
  if (!documents.some((d) => d.status === "REVISION_REQUIRED")) blockers.push("NO_REVISION");
  return blockers;
}

/**
 * BR-60 (T3): `PENDING_REVIEW`/`REVISION_REQUIRED` kalmamış; tüm zorunlu evraklar aktif dosyalı ve
 * `APPROVED`; aktif dosyası olan tüm isteğe bağlı evraklar `APPROVED`.
 */
export function approveDocumentsBlockers(documents: readonly DocumentFacts[]): Blocker[] {
  const blockers: Blocker[] = [];
  if (documents.some((d) => d.status === "PENDING_REVIEW")) blockers.push("PENDING_REVIEW");
  if (documents.some((d) => d.status === "REVISION_REQUIRED")) blockers.push("REVISION_PENDING");
  const unapproved = documents.some(
    (d) =>
      (d.isRequired && (!d.hasActiveFile || d.status !== "APPROVED")) ||
      (!d.isRequired && d.hasActiveFile && d.status !== "APPROVED"),
  );
  if (unapproved) blockers.push("NOT_ALL_APPROVED");
  return blockers;
}

export function transitionBlockers(
  code: WorkflowTransition,
  status: ApplicationStatus,
  documents: readonly DocumentFacts[],
): Blocker[] {
  if (!TRANSITIONS[code].from.includes(status)) return ["WRONG_STATUS"];
  if (code === "SUBMIT" || code === "RESUBMIT") return submissionBlockers(status, documents);
  if (code === "REQUEST_REVISION") return requestRevisionBlockers(documents);
  if (code === "APPROVE_DOCUMENTS") return approveDocumentsBlockers(documents);
  if (code === "REVERT_FOR_REVISION" && !documents.some((d) => d.status === "APPROVED")) {
    return ["NOT_ALL_APPROVED"];
  }
  return [];
}

export type AvailableAction = {
  readonly code: WorkflowTransition;
  readonly enabled: boolean;
  readonly blockers: readonly Blocker[];
  readonly reasonRequired: boolean;
};

/** Personel için mevcut statüden çıkan aksiyonlar (yalnızca matristekiler; pasif olanlar nedenleriyle). */
export function staffActions(
  status: ApplicationStatus,
  documents: readonly DocumentFacts[],
): AvailableAction[] {
  return (Object.keys(TRANSITIONS) as WorkflowTransition[])
    .filter((code) => TRANSITIONS[code].from.includes(status))
    .map((code) => {
      const blockers = transitionBlockers(code, status, documents);
      return {
        code,
        enabled: blockers.length === 0,
        blockers,
        reasonRequired: TRANSITIONS[code].reasonRequired,
      };
    });
}

/** Bir aksiyonun sabit hedefi (T8 hariç). */
export function fixedTarget(code: WorkflowTransition): ApplicationStatus | null {
  const to = TRANSITIONS[code].to;
  return to === "PREVIOUS" ? null : to;
}
