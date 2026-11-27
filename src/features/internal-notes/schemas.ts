import { z } from "zod";

import { WORKFLOW_TEXT_LIMITS } from "@/config/constants";
import { plainText } from "@/features/workflow/schemas";
import { messages } from "@/lib/messages";

/**
 * Şirket içi not girdisi (PHASE 10, BR-120…BR-123, D-115). `.strict()`: yazar, görünürlük, statü veya audit
 * alanı istemciden alınmaz — müşteriye görünürlük istemci bayrağıyla değil, ayrı tablo ve modül sınırıyla
 * belirlenir. Metin düz metindir (kontrol karakteri yok, satır sonları normalize).
 */
export const internalNoteSchema = z
  .object({
    applicationId: z.uuid(),
    requirementId: z.uuid().nullable().default(null),
    body: plainText(1, WORKFLOW_TEXT_LIMITS.internalNoteMax, messages.internalNotes.length),
    /** Mantıksal işlem anahtarı (istemci üretir, ağ tekrarlarında korur — D-115). */
    idempotencyKey: z.uuid(),
  })
  .strict();

export type InternalNoteInput = z.input<typeof internalNoteSchema>;

/** Daha eski notlar (keyset imleci = son görülen notun kimliği). */
export const olderInternalNotesSchema = z
  .object({ applicationId: z.uuid(), before: z.uuid() })
  .strict();
