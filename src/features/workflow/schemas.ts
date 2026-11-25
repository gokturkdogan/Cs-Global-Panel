import { z } from "zod";

import { WORKFLOW_TEXT_LIMITS } from "@/config/constants";
import { messages } from "@/lib/messages";

/**
 * İş akışı girdileri (PHASE 09). Hepsi `.strict()`: aktör, rol, statü, hedef statü, dosya yaşam döngüsü,
 * storage anahtarı veya audit metadata'sı istemciden alınmaz (mass assignment yok). Serbest metinler düz
 * metindir: satır sonları normalize edilir, kontrol karakterleri (satır sonu/sekme hariç) reddedilir;
 * HTML olarak hiçbir yerde render edilmez (React metni).
 */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/;

function plainText(min: number, max: number, lengthMessage: string) {
  return z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .refine((value) => !CONTROL.test(value), messages.workflow.controlCharacters)
    .refine((value) => value.length >= min && value.length <= max, lengthMessage);
}

const version = z.number().int().min(1).max(2_147_483_647);
const id = z.uuid();

export const reasonSchema = plainText(
  1,
  WORKFLOW_TEXT_LIMITS.reasonMax,
  messages.workflow.reasonTooLong,
);
export const revisionMessageSchema = plainText(
  WORKFLOW_TEXT_LIMITS.revisionMessageMin,
  WORKFLOW_TEXT_LIMITS.revisionMessageMax,
  messages.workflow.revisionMessageLength,
);

export const applicationVersionSchema = z
  .object({ applicationId: id, expectedVersion: version })
  .strict();

export const reviewSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("APPROVED"),
      requirementId: id,
      fileId: id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      decision: z.literal("REVISION_REQUIRED"),
      requirementId: id,
      fileId: id,
      expectedVersion: version,
      customerMessage: revisionMessageSchema,
    })
    .strict(),
]);

export const STAFF_TRANSITION_CODES = [
  "REQUEST_REVISION",
  "APPROVE_DOCUMENTS",
  "START_PROCESSING",
  "COMPLETE",
  "CANCEL",
  "REOPEN_CANCELLED",
  "REOPEN_COMPLETED",
  "REVERT_TO_DOCUMENTS_APPROVED",
  "REVERT_TO_REVIEW",
] as const;

export const transitionSchema = z
  .object({
    applicationId: id,
    expectedVersion: version,
    code: z.enum(STAFF_TRANSITION_CODES),
    reason: reasonSchema.nullable().default(null),
  })
  .strict();

export const revertForRevisionSchema = z
  .object({
    applicationId: id,
    expectedVersion: version,
    reason: reasonSchema,
    documents: z
      .array(
        z
          .object({ requirementId: id, fileId: id, customerMessage: revisionMessageSchema })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const removeFileSchema = z.object({ fileId: id, expectedVersion: version }).strict();

export const commentSchema = z
  .object({
    applicationId: id,
    requirementId: id.nullable().default(null),
    body: plainText(1, WORKFLOW_TEXT_LIMITS.commentMax, messages.workflow.commentLength),
    /** Mantıksal işlem anahtarı (istemci üretir, tekrarlarda korur — D-113). */
    idempotencyKey: id,
  })
  .strict();

/** Müşteri girdileri: başvuru kimliği YOK — yalnızca URL bağlamı (D-095). */
export const customerSubmitSchema = z
  .object({ contextId: z.string().min(1).max(64), expectedVersion: version })
  .strict();

export const customerRemoveSchema = z
  .object({ contextId: z.string().min(1).max(64), fileId: id, expectedVersion: version })
  .strict();
