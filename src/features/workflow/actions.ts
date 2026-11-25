"use server";

import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

import {
  applicationVersionSchema,
  commentSchema,
  removeFileSchema,
  revertForRevisionSchema,
  reviewSchema,
  transitionSchema,
} from "./schemas";
import * as workflow from "./service";

/**
 * Personel iş akışı Server Action'ları (PHASE 09). Her biri kendi içinde `requireStaff()` ile başlar
 * (layout güvenlik sınırı değildir); iki hesap aynı kontrolden geçer (OD-24; RBAC yok). Aktör yalnızca
 * oturumdan; girdiler Zod `.strict()`. Köken kontrolü: proxy (403) + Next.js.
 */

const validationFailure = (fieldErrors: Record<string, string>) =>
  fail({
    code: "VALIDATION",
    message: Object.values(fieldErrors)[0] ?? messages.common.validation,
    fieldErrors,
  });

function revalidate(applicationId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/applications");
  if (applicationId) revalidatePath(`/dashboard/applications/${applicationId}`);
}

export async function submitOnBehalfAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = applicationVersionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.submitApplication(
    getDb(),
    { kind: "STAFF", userId: staff.userId },
    parsed.data,
  );
  if (result.ok) revalidate(parsed.data.applicationId);
  return result;
}

export async function reviewDocumentAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.reviewDocument(getDb(), staff, {
    ...parsed.data,
    customerMessage:
      parsed.data.decision === "REVISION_REQUIRED" ? parsed.data.customerMessage : null,
  });
  if (result.ok) revalidate();
  return result;
}

export async function transitionApplicationAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.transitionApplication(getDb(), staff, parsed.data);
  if (result.ok) revalidate(parsed.data.applicationId);
  return result;
}

export async function revertForRevisionAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = revertForRevisionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.revertForRevision(getDb(), staff, parsed.data);
  if (result.ok) revalidate(parsed.data.applicationId);
  return result;
}

export async function removeFileAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = removeFileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.removeDocumentFile(
    getDb(),
    { kind: "STAFF", userId: staff.userId },
    parsed.data,
  );
  if (result.ok) revalidate();
  return result;
}

export async function addCommentAction(
  input: unknown,
): Promise<ActionResult<{ commentId: string; created: boolean }>> {
  const staff = await requireStaff();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await workflow.addCustomerComment(getDb(), staff, parsed.data);
  if (result.ok) revalidate(parsed.data.applicationId);
  return result;
}
