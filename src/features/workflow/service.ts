import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";
import {
  fixedTarget,
  submissionTransition,
  transitionBlockers,
  TRANSITIONS,
  type Blocker,
  type DocumentFacts,
  type WorkflowTransition,
} from "@/features/applications/domain/application-status";
import {
  canRemoveFile,
  documentStatusAfterRemoval,
  reviewTarget,
  type ReviewDecision,
} from "@/features/documents/domain/document-status";
import { customerStillAllowed, type FileActor } from "@/features/documents/service";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { CONCURRENCY_ERROR_CODES, pgErrorCode } from "@/server/db/errors";
import { textPayloadHash } from "@/server/idempotency/payload-hash";
import {
  applicationDocumentFiles as files,
  applicationDocumentRequirements as requirements,
  applications,
  applicationStatusHistory as history,
  documentComments as comments,
  documentReviews as reviews,
} from "@/server/db/schema";

/**
 * Başvuru ve evrak iş akışı mutasyonları (PHASE 09 — D-108…D-112; STATE_TRANSITIONS §1–§2,
 * BR-50…BR-62, BR-44, BR-120…BR-123). Her işlem tek transaction:
 *   başvuru `FOR UPDATE` (silme sürecinde değil) → müşteri: token aktif + oturum süresi (kilit altında)
 *   → sürüm (`expectedVersion`) → evraklar `FOR UPDATE` (id sırasıyla) → dosyalar → guard'lar (saf
 *   domain) → yazma → statü geçmişi → audit (aynı transaction; biri başarısızsa tamamı geri alınır).
 * Kilit sırası (BR-91, D-074): applications → application_document_requirements →
 * application_document_files. Transaction içinde storage/ağ çağrısı yok; PDF baytı okunmaz.
 * Statü geçişleri manueldir (BR-61); hedef statü istemciden alınmaz.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type WorkflowActor = FileActor;

const notFound = () => fail({ code: "NOT_FOUND", message: messages.common.notFound });
const stale = () => fail({ code: "CONFLICT", message: messages.workflow.stateChanged });
const notAllowed = (message: string = messages.workflow.notAllowed) =>
  fail({ code: "NOT_ALLOWED", message });
const accessEnded = () => fail({ code: "UNAUTHENTICATED", message: messages.workflow.accessEnded });

function blockerFailure(blockers: readonly Blocker[]) {
  return fail({
    code: "NOT_ALLOWED",
    message: blockers.map((b) => messages.workflow.blockers[b]).join(" "),
  });
}

async function guarded<T>(label: string, run: () => Promise<ActionResult<T>>) {
  try {
    return await run();
  } catch (error) {
    const code = pgErrorCode(error);
    if (code !== undefined && CONCURRENCY_ERROR_CODES.has(code)) return stale();
    console.error(`[workflow] ${label} başarısız`, { code: code ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.workflow.unavailable });
  }
}

function historyActor(actor: WorkflowActor) {
  return actor.kind === "STAFF"
    ? ({ actorType: "USER", actorUserId: actor.userId } as const)
    : ({ actorType: "CUSTOMER", actorAccessTokenId: actor.tokenId } as const);
}

function auditActor(actor: WorkflowActor) {
  return actor.kind === "STAFF"
    ? ({ actorType: "USER", actorUserId: actor.userId } as const)
    : ({ actorType: "CUSTOMER", actorAccessTokenId: actor.tokenId } as const);
}

type LockedApplication = { status: ApplicationStatus; version: number };

/** Başvuruyu kilitler; müşteri için kapsam oturumdaki başvuruyla sınırlıdır ve token yeniden doğrulanır. */
async function lockApplication(
  tx: Tx,
  actor: WorkflowActor,
  applicationId: string,
): Promise<LockedApplication | "NOT_FOUND" | "ACCESS_ENDED"> {
  if (actor.kind === "CUSTOMER" && actor.applicationId !== applicationId) return "NOT_FOUND";
  const [row] = await tx
    .select({ status: applications.status, version: applications.version })
    .from(applications)
    .where(and(eq(applications.id, applicationId), isNull(applications.deletionRequestedAt)))
    .for("update");
  if (row === undefined) return "NOT_FOUND";
  if (!(await customerStillAllowed(tx, actor))) return "ACCESS_ENDED";
  return row;
}

type LockedRequirement = {
  id: string;
  isRequired: boolean;
  status: DocumentStatus;
  version: number;
};

/** Evrakları belirleyici sırada kilitler ve dosya durumlarıyla birlikte guard girdisini üretir. */
async function lockDocuments(tx: Tx, applicationId: string) {
  const reqs: LockedRequirement[] = await tx
    .select({
      id: requirements.id,
      isRequired: requirements.isRequired,
      status: requirements.status,
      version: requirements.version,
    })
    .from(requirements)
    .where(eq(requirements.applicationId, applicationId))
    .orderBy(asc(requirements.id))
    .for("update");
  const fileRows = await tx
    .select({
      requirementId: files.requirementId,
      status: files.status,
      live: sql<boolean>`${files.uploadExpiresAt} > now()`,
    })
    .from(files)
    .where(
      and(
        eq(files.applicationId, applicationId),
        inArray(files.status, ["ACTIVE", "UPLOAD_PENDING", "VALIDATING"]),
      ),
    );
  const active = new Set(fileRows.filter((f) => f.status === "ACTIVE").map((f) => f.requirementId));
  const pending = new Set(
    fileRows.filter((f) => f.status !== "ACTIVE" && f.live).map((f) => f.requirementId),
  );
  const facts: DocumentFacts[] = reqs.map((r) => ({
    isRequired: r.isRequired,
    status: r.status,
    hasActiveFile: active.has(r.id),
    hasPendingUpload: pending.has(r.id),
  }));
  return { reqs, facts, active };
}

async function changeApplicationStatus(
  tx: Tx,
  actor: WorkflowActor,
  input: {
    applicationId: string;
    from: ApplicationStatus;
    to: ApplicationStatus;
    code: WorkflowTransition;
    reason?: string | null;
    submitted?: boolean;
  },
) {
  const [updated] = await tx
    .update(applications)
    .set({
      status: input.to,
      statusChangedAt: sql`now()`,
      version: sql`${applications.version} + 1`,
      ...(input.submitted ? { submittedAt: sql`now()` } : {}),
      ...(actor.kind === "STAFF" ? { updatedByUserId: actor.userId } : {}),
    })
    .where(eq(applications.id, input.applicationId))
    .returning({ version: applications.version });
  await tx.insert(history).values({
    applicationId: input.applicationId,
    fromStatus: input.from,
    toStatus: input.to,
    transitionCode: input.code,
    ...historyActor(actor),
    onBehalfOfCustomer: actor.kind === "STAFF" && TRANSITIONS[input.code].customer,
    reason: input.reason ?? null,
  });
  return updated!.version;
}

export type TransitionResult = { readonly status: ApplicationStatus; readonly version: number };

// ---------------------------------------------------------------- T1 / T4 — gönderim

/**
 * İncelemeye gönder / yeniden gönder (T1/T4, BR-50…BR-54). Müşteri ve personel (müşteri adına) aynı
 * guard'ları kullanır; personel eksik evrak, bekleyen yükleme veya düzeltme şartını atlayamaz.
 * BR-53: ikinci istek sürüm/statü kontrolünde reddedilir, yan etki oluşmaz.
 */
export function submitApplication(
  db: Database,
  actor: WorkflowActor,
  input: { readonly applicationId: string; readonly expectedVersion: number },
): Promise<ActionResult<TransitionResult>> {
  return guarded("gönderim", () =>
    db.transaction(async (tx) => {
      const app = await lockApplication(tx, actor, input.applicationId);
      if (app === "NOT_FOUND") return notFound();
      if (app === "ACCESS_ENDED") return accessEnded();
      const code = submissionTransition(app.status);
      if (code === null) {
        return app.status === "UNDER_REVIEW"
          ? notAllowed(messages.workflow.alreadyUnderReview)
          : notAllowed();
      }
      if (app.version !== input.expectedVersion) return stale();
      const { reqs, facts } = await lockDocuments(tx, input.applicationId);
      const blockers = transitionBlockers(code, app.status, facts);
      if (blockers.length > 0) return blockerFailure(blockers);

      // BR-52: UPLOADED → PENDING_REVIEW; APPROVED korunur; NOT_UPLOADED değişmez.
      const moving = reqs.filter((r) => r.status === "UPLOADED").map((r) => r.id);
      if (moving.length > 0) {
        await tx
          .update(requirements)
          .set({
            status: "PENDING_REVIEW",
            statusChangedAt: sql`now()`,
            version: sql`${requirements.version} + 1`,
          })
          .where(inArray(requirements.id, moving));
      }
      const version = await changeApplicationStatus(tx, actor, {
        applicationId: input.applicationId,
        from: app.status,
        to: "UNDER_REVIEW",
        code,
        submitted: true,
      });
      await writeAuditLog(tx, {
        action: code === "SUBMIT" ? "APPLICATION_SUBMITTED" : "APPLICATION_RESUBMITTED",
        ...auditActor(actor),
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        metadata: {
          from: app.status,
          to: "UNDER_REVIEW",
          transitionCode: code,
          count: moving.length,
          onBehalfOfCustomer: actor.kind === "STAFF",
        },
      });
      return ok({ status: "UNDER_REVIEW" as const, version });
    }),
  );
}

// ---------------------------------------------------------------- D4–D6 — evrak kararı

/**
 * Evrak kararı (BR-55…BR-58): yalnızca `UNDER_REVIEW`; karar istemcinin gördüğü `fileId`'ye bağlıdır ve
 * kilit altında hâlâ aktif dosya olmalıdır (BR-57) — eski versiyona verilen karar yeni dosyaya
 * uygulanmaz. Review kaydı değiştirilemez; başvuru statüsü değişmez (T2/T3 manuel — BR-61).
 */
export function reviewDocument(
  db: Database,
  staff: { readonly userId: string },
  input: {
    readonly requirementId: string;
    readonly fileId: string;
    readonly expectedVersion: number;
    readonly decision: ReviewDecision;
    readonly customerMessage: string | null;
  },
): Promise<ActionResult<{ status: DocumentStatus; version: number; reviewId: string }>> {
  const actor: WorkflowActor = { kind: "STAFF", userId: staff.userId };
  return guarded("evrak kararı", () =>
    db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ applicationId: requirements.applicationId })
        .from(requirements)
        .where(eq(requirements.id, input.requirementId))
        .limit(1);
      if (owner === undefined) return notFound();
      const app = await lockApplication(tx, actor, owner.applicationId);
      if (app === "NOT_FOUND" || app === "ACCESS_ENDED") return notFound();
      const [req] = await tx
        .select({ status: requirements.status, version: requirements.version })
        .from(requirements)
        .where(
          and(
            eq(requirements.id, input.requirementId),
            eq(requirements.applicationId, owner.applicationId),
          ),
        )
        .for("update");
      if (req === undefined) return notFound();
      const [activeFile] = await tx
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.requirementId, input.requirementId), eq(files.status, "ACTIVE")))
        .for("update");
      if (activeFile === undefined || activeFile.id !== input.fileId) {
        return fail({ code: "CONFLICT", message: messages.workflow.staleFile });
      }
      if (req.version !== input.expectedVersion) {
        return fail({ code: "CONFLICT", message: messages.workflow.staleFile });
      }
      const target = reviewTarget(app.status, req.status, input.decision);
      if (target === null) return notAllowed();

      const [review] = await tx
        .insert(reviews)
        .values({
          applicationId: owner.applicationId,
          requirementId: input.requirementId,
          fileId: input.fileId,
          decision: input.decision,
          customerMessage: input.decision === "REVISION_REQUIRED" ? input.customerMessage : null,
          reviewedByUserId: staff.userId,
        })
        .returning({ id: reviews.id });
      const [updated] = await tx
        .update(requirements)
        .set({
          status: target,
          statusChangedAt: sql`now()`,
          version: sql`${requirements.version} + 1`,
        })
        .where(eq(requirements.id, input.requirementId))
        .returning({ version: requirements.version });
      await writeAuditLog(tx, {
        action: input.decision === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REVISION_REQUESTED",
        ...auditActor(actor),
        resourceType: "document",
        resourceId: input.requirementId,
        applicationId: owner.applicationId,
        metadata: {
          requirementId: input.requirementId,
          fileId: input.fileId,
          reviewId: review!.id,
          from: req.status,
          to: target,
        },
      });
      return ok({ status: target, version: updated!.version, reviewId: review!.id });
    }),
  );
}

// ---------------------------------------------------------------- T2, T3, T5–T11 — statü geçişleri

export type StaffTransitionCode = Exclude<
  WorkflowTransition,
  "SUBMIT" | "RESUBMIT" | "REVERT_FOR_REVISION"
>;

/**
 * Personel statü geçişi. Hedef aksiyon kodundan (T8'de iptal öncesi statü geçmişten) sunucuda belirlenir.
 * T7 (iptal): devam eden yüklemeler `EXPIRED`; evrak statüleri, dosyalar, kararlar ve müşteri bağlantısı
 * değişmez. Yeniden açma/geri alma (T8–T11): veriler, versiyonlar, onaylar ve geçmiş korunur.
 */
export function transitionApplication(
  db: Database,
  staff: { readonly userId: string },
  input: {
    readonly applicationId: string;
    readonly expectedVersion: number;
    readonly code: StaffTransitionCode;
    readonly reason: string | null;
  },
): Promise<ActionResult<TransitionResult>> {
  const actor: WorkflowActor = { kind: "STAFF", userId: staff.userId };
  return guarded("statü geçişi", () =>
    db.transaction(async (tx) => {
      const app = await lockApplication(tx, actor, input.applicationId);
      if (app === "NOT_FOUND" || app === "ACCESS_ENDED") return notFound();
      const rule = TRANSITIONS[input.code];
      if (!rule.from.includes(app.status)) return notAllowed();
      if (app.version !== input.expectedVersion) return stale();
      if (rule.reasonRequired && (input.reason === null || input.reason.trim() === "")) {
        return fail({
          code: "VALIDATION",
          message: messages.workflow.reasonRequired,
          fieldErrors: { reason: messages.workflow.reasonRequired },
        });
      }
      const { facts } = await lockDocuments(tx, input.applicationId);
      const blockers = transitionBlockers(input.code, app.status, facts);
      if (blockers.length > 0) return blockerFailure(blockers);

      let target = fixedTarget(input.code);
      if (target === null) {
        // T8: son iptal kaydının önceki statüsü (istemci hedef seçemez).
        const [last] = await tx
          .select({ fromStatus: history.fromStatus })
          .from(history)
          .where(
            and(eq(history.applicationId, input.applicationId), eq(history.toStatus, "CANCELLED")),
          )
          .orderBy(desc(history.createdAt), desc(history.id))
          .limit(1);
        if (last?.fromStatus == null || last.fromStatus === "CANCELLED") {
          console.error("[workflow] İptal öncesi statü bulunamadı");
          return fail({ code: "INTERNAL", message: messages.workflow.unavailable });
        }
        target = last.fromStatus;
      }
      if (input.code === "CANCEL") {
        // Devam eden yüklemeler iptal (aktivasyon "gone" görür; nesne teknik temizlikte silinir).
        await tx
          .update(files)
          .set({ status: "EXPIRED", endedAt: sql`now()` })
          .where(
            and(
              eq(files.applicationId, input.applicationId),
              inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
            ),
          );
      }
      const version = await changeApplicationStatus(tx, actor, {
        applicationId: input.applicationId,
        from: app.status,
        to: target,
        code: input.code,
        reason: rule.reasonRequired ? input.reason!.trim() : null,
      });
      await writeAuditLog(tx, {
        action: "APPLICATION_STATUS_CHANGED",
        ...auditActor(actor),
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        metadata: { from: app.status, to: target, transitionCode: input.code },
      });
      return ok({ status: target, version });
    }),
  );
}

// ---------------------------------------------------------------- T12 — evrak düzeltmesi iste

/**
 * T12 (`DOCUMENTS_APPROVED`/`IN_PROCESS` → `REVISION_REQUIRED`): seçilen her evrak `APPROVED` ve
 * istemcinin gördüğü aktif dosyaya sahip olmalı; her biri için müşteriye görünür açıklamalı yeni
 * review kaydı (D10). Seçilmeyen onaylar korunur (BR-62). Gerekçe zorunlu ve personel içi.
 */
export function revertForRevision(
  db: Database,
  staff: { readonly userId: string },
  input: {
    readonly applicationId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly documents: readonly {
      readonly requirementId: string;
      readonly fileId: string;
      readonly customerMessage: string;
    }[];
  },
): Promise<ActionResult<TransitionResult>> {
  const actor: WorkflowActor = { kind: "STAFF", userId: staff.userId };
  return guarded("düzeltmeye geri gönderme", () =>
    db.transaction(async (tx) => {
      const app = await lockApplication(tx, actor, input.applicationId);
      if (app === "NOT_FOUND" || app === "ACCESS_ENDED") return notFound();
      if (!TRANSITIONS.REVERT_FOR_REVISION.from.includes(app.status)) return notAllowed();
      if (app.version !== input.expectedVersion) return stale();
      const ids = new Set(input.documents.map((d) => d.requirementId));
      if (ids.size === 0 || ids.size !== input.documents.length) return notAllowed();
      const { reqs } = await lockDocuments(tx, input.applicationId);
      const byId = new Map(reqs.map((r) => [r.id, r]));
      const activeFiles = await tx
        .select({ id: files.id, requirementId: files.requirementId })
        .from(files)
        .where(and(eq(files.applicationId, input.applicationId), eq(files.status, "ACTIVE")));
      const activeByReq = new Map(activeFiles.map((f) => [f.requirementId, f.id]));
      for (const doc of input.documents) {
        const req = byId.get(doc.requirementId);
        if (req === undefined) return notFound();
        if (req.status !== "APPROVED") return notAllowed();
        if (activeByReq.get(doc.requirementId) !== doc.fileId) {
          return fail({ code: "CONFLICT", message: messages.workflow.staleFile });
        }
      }
      for (const doc of input.documents) {
        const [review] = await tx
          .insert(reviews)
          .values({
            applicationId: input.applicationId,
            requirementId: doc.requirementId,
            fileId: doc.fileId,
            decision: "REVISION_REQUIRED",
            customerMessage: doc.customerMessage,
            reviewedByUserId: staff.userId,
          })
          .returning({ id: reviews.id });
        await tx
          .update(requirements)
          .set({
            status: "REVISION_REQUIRED",
            statusChangedAt: sql`now()`,
            version: sql`${requirements.version} + 1`,
          })
          .where(eq(requirements.id, doc.requirementId));
        await writeAuditLog(tx, {
          action: "DOCUMENT_REVISION_REQUESTED",
          ...auditActor(actor),
          resourceType: "document",
          resourceId: doc.requirementId,
          applicationId: input.applicationId,
          metadata: {
            requirementId: doc.requirementId,
            fileId: doc.fileId,
            reviewId: review!.id,
            from: "APPROVED",
            to: "REVISION_REQUIRED",
            transitionCode: "REVERT_FOR_REVISION",
          },
        });
      }
      const version = await changeApplicationStatus(tx, actor, {
        applicationId: input.applicationId,
        from: app.status,
        to: "REVISION_REQUIRED",
        code: "REVERT_FOR_REVISION",
        reason: input.reason.trim(),
      });
      await writeAuditLog(tx, {
        action: "APPLICATION_STATUS_CHANGED",
        ...auditActor(actor),
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        metadata: {
          from: app.status,
          to: "REVISION_REQUIRED",
          transitionCode: "REVERT_FOR_REVISION",
          count: input.documents.length,
        },
      });
      return ok({ status: "REVISION_REQUIRED" as const, version });
    }),
  );
}

// ---------------------------------------------------------------- D2 / D8 — dosya kaldırma

/**
 * Aktif dosyayı kaldırma (BR-44, D2/D8): dosya `ACTIVE → REMOVED` (fiziksel silme YOK; geçmişte ve
 * kotada kalır; müşteri artık erişemez, personel geçmişten erişir). `expectedVersion` evrak sürümüdür.
 */
export function removeDocumentFile(
  db: Database,
  actor: WorkflowActor,
  input: { readonly fileId: string; readonly expectedVersion: number },
): Promise<ActionResult<{ status: DocumentStatus; version: number }>> {
  return guarded("dosya kaldırma", () =>
    db.transaction(async (tx) => {
      const [file] = await tx
        .select({
          applicationId: files.applicationId,
          requirementId: files.requirementId,
        })
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      if (file === undefined) return notFound();
      const app = await lockApplication(tx, actor, file.applicationId);
      if (app === "NOT_FOUND") return notFound();
      if (app === "ACCESS_ENDED") return accessEnded();
      const [req] = await tx
        .select({
          status: requirements.status,
          version: requirements.version,
          isRequired: requirements.isRequired,
        })
        .from(requirements)
        .where(
          and(
            eq(requirements.id, file.requirementId),
            eq(requirements.applicationId, file.applicationId),
          ),
        )
        .for("update");
      if (req === undefined) return notFound();
      const [locked] = await tx
        .select({ status: files.status, versionNumber: files.versionNumber })
        .from(files)
        .where(eq(files.id, input.fileId))
        .for("update");
      if (locked?.status !== "ACTIVE") return stale();
      if (req.version !== input.expectedVersion) return stale();
      if (!canRemoveFile(actor.kind === "STAFF" ? "STAFF" : "CUSTOMER", app.status, req.status)) {
        return notAllowed();
      }
      const after = documentStatusAfterRemoval(req.status, req.isRequired);
      await tx
        .update(files)
        .set({
          status: "REMOVED",
          endedAt: sql`now()`,
          ...(actor.kind === "STAFF"
            ? { endedByActorType: "USER" as const, endedByUserId: actor.userId }
            : { endedByActorType: "CUSTOMER" as const, endedByUserId: null }),
        })
        .where(eq(files.id, input.fileId));
      const [updated] = await tx
        .update(requirements)
        .set({
          status: after,
          version: sql`${requirements.version} + 1`,
          ...(after !== req.status ? { statusChangedAt: sql`now()` } : {}),
        })
        .where(eq(requirements.id, file.requirementId))
        .returning({ version: requirements.version });
      await writeAuditLog(tx, {
        action: "DOCUMENT_DELETED",
        ...auditActor(actor),
        resourceType: "file",
        resourceId: input.fileId,
        applicationId: file.applicationId,
        metadata: {
          fileId: input.fileId,
          requirementId: file.requirementId,
          versionNumber: locked.versionNumber,
          from: req.status,
          to: after,
          ...(actor.kind === "STAFF" ? { onBehalfOfCustomer: true } : {}),
        },
      });
      return ok({ status: after, version: updated!.version });
    }),
  );
}

// ---------------------------------------------------------------- Müşteriye görünür yorum

/** Yorum işleminin içerik özeti (kapsam + metin) — aynı anahtarın farklı istekte kullanımını yakalar. */
export const commentPayloadHash = textPayloadHash;

/**
 * Müşteriye görünür yorum (BR-120…BR-123): yalnızca personel; düz metin; düzenleme/silme yok; statü
 * değiştirmez. Silme sürecindeki başvuruya eklenemez. Audit metadata'sına yorum metni yazılmaz.
 *
 * Idempotency (PHASE 09.1, D-113): istemci her mantıksal yorum işlemi için bir `idempotencyKey` üretir ve
 * tekrarlarda korur. Yetki/başvuru kontrolü HER istekte önce yapılır; ardından `INSERT … ON CONFLICT
 * (idempotency_key) DO NOTHING` — eşzamanlı tekrarlar veritabanında tek satıra iner. Anahtar zaten
 * kullanılmışsa: aynı kapsam + aynı metin → mevcut sonuç (`created: false`, yeni yorum/audit yok);
 * farklı kapsam veya metin → genel `CONFLICT` (başka işlemin sonucu ifşa edilmez). Metin üzerinden
 * global tekilleştirme yapılmaz: aynı metin yeni anahtarla yeni yorumdur.
 */
export function addCustomerComment(
  db: Database,
  staff: { readonly userId: string },
  input: {
    readonly applicationId: string;
    readonly requirementId: string | null;
    readonly body: string;
    readonly idempotencyKey: string;
  },
): Promise<ActionResult<{ commentId: string; created: boolean }>> {
  const actor: WorkflowActor = { kind: "STAFF", userId: staff.userId };
  return guarded<{ commentId: string; created: boolean }>("yorum ekleme", () =>
    db.transaction(async (tx) => {
      const app = await lockApplication(tx, actor, input.applicationId);
      if (app === "NOT_FOUND" || app === "ACCESS_ENDED") return notFound();
      if (input.requirementId !== null) {
        const [req] = await tx
          .select({ id: requirements.id })
          .from(requirements)
          .where(
            and(
              eq(requirements.id, input.requirementId),
              eq(requirements.applicationId, input.applicationId),
            ),
          )
          .limit(1);
        if (req === undefined) return notFound();
      }
      const payloadHash = commentPayloadHash({ ...input, authorUserId: staff.userId });
      const [inserted] = await tx
        .insert(comments)
        .values({
          applicationId: input.applicationId,
          requirementId: input.requirementId,
          body: input.body,
          authorUserId: staff.userId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        })
        .onConflictDoNothing({ target: comments.idempotencyKey })
        .returning({ id: comments.id });
      if (inserted === undefined) {
        const [existing] = await tx
          .select({ id: comments.id, payloadHash: comments.payloadHash })
          .from(comments)
          .where(eq(comments.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existing === undefined || existing.payloadHash !== payloadHash) {
          return fail({ code: "CONFLICT", message: messages.workflow.idempotencyConflict });
        }
        return ok({ commentId: existing.id, created: false });
      }
      await writeAuditLog(tx, {
        action: "DOCUMENT_COMMENT_ADDED",
        ...auditActor(actor),
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        metadata: {
          id: inserted.id,
          ...(input.requirementId ? { requirementId: input.requirementId } : {}),
        },
      });
      return ok({ commentId: inserted.id, created: true });
    }),
  );
}
