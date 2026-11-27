"use server";

import { fail, ok } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

import { resolveApplicationNumber } from "./queries";
import { applicationNumberLookupSchema } from "./schemas";

/**
 * Başvuru numarasını işlem geçmişi filtresi için UUID'ye çözer (PHASE 10). Numara URL'ye/geçmişe yazılmaz;
 * yalnızca UUID ile yönlendirilir. Kendi içinde `requireStaff()`.
 */
export async function resolveAuditApplicationAction(input: unknown) {
  await requireStaff();
  const parsed = applicationNumberLookupSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return fail({
      code: "VALIDATION",
      message: Object.values(fieldErrors)[0] ?? messages.auditLogs.invalidNumber,
      fieldErrors,
    });
  }
  const id = await resolveApplicationNumber(getDb(), parsed.data.applicationNumber);
  if (id === null)
    return fail({ code: "NOT_FOUND", message: messages.auditLogs.unknownApplication });
  return ok({ applicationId: id });
}
