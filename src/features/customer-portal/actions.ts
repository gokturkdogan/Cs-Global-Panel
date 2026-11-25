"use server";

import { fail } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { removeFileAsCustomer, submitAsCustomer } from "@/features/workflow/customer-entry";
import { customerRemoveSchema, customerSubmitSchema } from "@/features/workflow/schemas";

/**
 * Müşteri Server Action'ları (PHASE 09): incelemeye gönder / yeniden gönder ve dosya kaldırma. Girdi
 * yalnızca URL bağlamı + sürüm (+ dosya kimliği); `applicationId`, aktör veya statü alınmaz (Zod
 * `.strict()`). Kimlik ve kapsam `@/features/workflow/customer-entry` içinde müşteri oturumundan.
 * Köken kontrolü: proxy (403) + Next.js Server Action kontrolü.
 */

const invalid = () => fail({ code: "VALIDATION", message: messages.common.validation });

export async function submitForReviewAction(input: unknown) {
  const parsed = customerSubmitSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return submitAsCustomer(parsed.data.contextId, parsed.data.expectedVersion);
}

export async function removeOwnFileAction(input: unknown) {
  const parsed = customerRemoveSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return removeFileAsCustomer(
    parsed.data.contextId,
    parsed.data.fileId,
    parsed.data.expectedVersion,
  );
}
