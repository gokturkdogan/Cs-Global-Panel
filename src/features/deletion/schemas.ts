import { z } from "zod";

import { WORKFLOW_TEXT_LIMITS } from "@/config/constants";
import { plainText } from "@/features/workflow/schemas";
import { messages } from "@/lib/messages";

/**
 * Kalıcı silme girdileri (PHASE 10). `.strict()`: storage anahtarı, versiyon kimliği, "onaylandı" bayrağı,
 * aktör veya kapsam istemciden alınmaz — silinecek nesneler yalnızca sunucu envanterinden üretilir.
 * Başvuru numarası onayı sunucuda başvurunun gerçek numarasıyla karşılaştırılır (BR-151, D-118).
 */
export const deletionRequestSchema = z
  .object({
    applicationId: z.uuid(),
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
    reason: plainText(1, WORKFLOW_TEXT_LIMITS.deletionReasonMax, messages.deletion.reasonLength),
    confirmationNumber: z.string().trim().max(32),
  })
  .strict();

export const deletionStepSchema = z.object({ applicationId: z.uuid() }).strict();
