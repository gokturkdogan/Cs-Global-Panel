"use server";

import { revalidatePath } from "next/cache";

import { fail } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/storage/factory";

import { deletionRequestSchema, deletionStepSchema } from "./schemas";
import { processApplicationDeletion, requestApplicationDeletion } from "./service";

/**
 * Kalıcı silme Server Action'ları (PHASE 10). Her biri kendi içinde `requireStaff()`; iki hesap eşit
 * (OD-24 — `requireAdmin` yok). Talep başarılıysa ilk sınırlı adım hemen denenir; kalan adımlar personelin
 * "Silme İşlemini Sürdür" isteğiyle çalışır (arka plan işi yok).
 */
function refresh(applicationId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/applications");
  revalidatePath(`/dashboard/applications/${applicationId}`);
}

export async function requestDeletionAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = deletionRequestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return fail({
      code: "VALIDATION",
      message: Object.values(fieldErrors)[0] ?? messages.common.validation,
      fieldErrors,
    });
  }
  const db = getDb();
  const requested = await requestApplicationDeletion(db, staff, parsed.data);
  if (!requested.ok) return requested;
  const step = await processApplicationDeletion({ db, storage: getStorage }, staff, {
    applicationId: parsed.data.applicationId,
  });
  refresh(parsed.data.applicationId);
  // Talep kaydedildi; adım meşgul/başarısız olsa bile işlem kalıcıdır ve sürdürülebilir.
  return step.ok
    ? step
    : { ok: true as const, data: { state: "IN_PROGRESS" as const, error: null } };
}

export async function resumeDeletionAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = deletionStepSchema.safeParse(input);
  if (!parsed.success) return fail({ code: "VALIDATION", message: messages.common.validation });
  const result = await processApplicationDeletion(
    { db: getDb(), storage: getStorage },
    staff,
    parsed.data,
  );
  refresh(parsed.data.applicationId);
  return result;
}
