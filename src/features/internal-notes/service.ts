import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { CONCURRENCY_ERROR_CODES, pgErrorCode } from "@/server/db/errors";
import {
  applicationDocumentRequirements as requirements,
  applicationInternalNotes as notes,
  applications,
} from "@/server/db/schema";
import { textPayloadHash } from "@/server/idempotency/payload-hash";

/**
 * Şirket içi not ekleme (PHASE 10, BR-120…BR-123, D-115). Yalnızca personel; iki hesap eşit (OD-24).
 * Tek transaction: başvuru `FOR UPDATE` (silme sürecinde değil) → evrak kapsamı → idempotent INSERT
 * (`ON CONFLICT (idempotency_key) DO NOTHING`) → audit `INTERNAL_NOTE_ADDED { id }` (not metni YOK).
 * Not her başvuru statüsünde eklenebilir (BR-120…123 statü kısıtı koymaz); statü değişmez. Düzenleme ve
 * silme yoktur; notlar yalnızca kalıcı başvuru silmede başvuruyla birlikte silinir (BR-123, BR-152).
 */
export async function addInternalNote(
  db: Database,
  staff: { readonly userId: string },
  input: {
    readonly applicationId: string;
    readonly requirementId: string | null;
    readonly body: string;
    readonly idempotencyKey: string;
  },
): Promise<ActionResult<{ noteId: string; created: boolean }>> {
  const notFound = () => fail({ code: "NOT_FOUND", message: messages.common.notFound });
  try {
    return await db.transaction(async (tx) => {
      const [app] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(eq(applications.id, input.applicationId), isNull(applications.deletionRequestedAt)),
        )
        .for("update");
      if (app === undefined) return notFound();
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
      const payloadHash = textPayloadHash({ ...input, authorUserId: staff.userId });
      const [inserted] = await tx
        .insert(notes)
        .values({
          applicationId: input.applicationId,
          requirementId: input.requirementId,
          body: input.body,
          authorUserId: staff.userId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        })
        .onConflictDoNothing({ target: notes.idempotencyKey })
        .returning({ id: notes.id });
      if (inserted === undefined) {
        // Aynı anahtar: yalnızca aynı kapsam + aynı içerik mevcut sonucu döndürür; aksi genel çakışma
        // (başka notun kimliği/içeriği ifşa edilmez).
        const [existing] = await tx
          .select({ id: notes.id, payloadHash: notes.payloadHash })
          .from(notes)
          .where(eq(notes.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existing === undefined || existing.payloadHash !== payloadHash) {
          return fail({ code: "CONFLICT", message: messages.internalNotes.idempotencyConflict });
        }
        return ok({ noteId: existing.id, created: false });
      }
      await writeAuditLog(tx, {
        action: "INTERNAL_NOTE_ADDED",
        actorType: "USER",
        actorUserId: staff.userId,
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        metadata: {
          id: inserted.id,
          ...(input.requirementId ? { requirementId: input.requirementId } : {}),
        },
      });
      return ok({ noteId: inserted.id, created: true });
    });
  } catch (error) {
    const code = pgErrorCode(error);
    if (code !== undefined && CONCURRENCY_ERROR_CODES.has(code)) {
      return fail({ code: "CONFLICT", message: messages.workflow.stateChanged });
    }
    console.error("[internal-notes] Not eklenemedi", { code: code ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.internalNotes.unavailable });
  }
}
