import { z } from "zod";

import { SERVICE_TEXT_LIMITS as L, SEARCH_QUERY_MAX_LENGTH } from "@/config/constants";
import { messages } from "@/lib/messages";

/**
 * Hizmet ve evrak şablonu girdileri (PHASE 05). İstemci (anında geri bildirim) ve sunucu (zorunlu
 * doğrulama) aynı şemaları kullanır. Tüm nesneler `.strict()`: bilinmeyen alan (ör. `createdByUserId`,
 * `actorUserId`, `role`, `maxFileSizeBytes`) gönderilirse girdi bütünüyle reddedilir (mass assignment).
 * Uzunluklar PostgreSQL `char_length` ile aynı biçimde (Unicode kod noktası) sayılır.
 */

const v = messages.validation;
const codePoints = (value: string) => [...value].length;

// Tek satırlık ad: harf/rakam ile başlar; izinli noktalama. Kontrol karakteri yok.
const SINGLE_LINE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} \-–—().,&/'’+:]*$/u;
// Çok satırlı metin: satır sonu ve sekme dışında kontrol karakteri yok.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

function singleLine(min: number, max: number, requiredMessage: string, lengthMessage: string) {
  return z
    .string({ error: requiredMessage })
    .transform((value) => value.normalize("NFC").replace(/\s+/g, " ").trim())
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: requiredMessage });
      else if (codePoints(value) < min || codePoints(value) > max)
        ctx.addIssue({ code: "custom", message: lengthMessage });
      else if (!SINGLE_LINE_PATTERN.test(value))
        ctx.addIssue({ code: "custom", message: v.invalidCharacters });
    });
}

/** Düz metin; boşsa `null`. HTML olarak yorumlanmaz, React ile inert metin olarak gösterilir. */
function multiLine(max: number, lengthMessage: string) {
  return z
    .string()
    .transform((value) => value.normalize("NFC").replace(/\r\n?/g, "\n").trim())
    .superRefine((value, ctx) => {
      if (CONTROL_CHARACTERS.test(value))
        ctx.addIssue({ code: "custom", message: v.controlCharacters });
      else if (codePoints(value) > max) ctx.addIssue({ code: "custom", message: lengthMessage });
    })
    .transform((value) => (value === "" ? null : value));
}

const id = z.uuid();
const expectedVersion = z.number().int().min(1);

export const serviceFieldsSchema = z
  .object({
    name: singleLine(L.nameMin, L.nameMax, v.nameRequired, v.nameLength),
    description: multiLine(L.descriptionMax, v.descriptionLength),
  })
  .strict();

export const createServiceSchema = serviceFieldsSchema.extend({ isActive: z.boolean() }).strict();

export const updateServiceSchema = serviceFieldsSchema
  .extend({ serviceId: id, expectedVersion })
  .strict();

export const setServiceActiveSchema = z
  .object({ serviceId: id, isActive: z.boolean(), expectedVersion })
  .strict();

export const requirementFieldsSchema = z
  .object({
    title: singleLine(L.requirementTitleMin, L.requirementTitleMax, v.titleRequired, v.titleLength),
    description: multiLine(L.requirementDescriptionMax, v.descriptionLength),
    instructions: multiLine(L.requirementInstructionsMax, v.instructionsLength),
    isRequired: z.boolean(),
  })
  .strict();

export const createRequirementSchema = requirementFieldsSchema.extend({ serviceId: id }).strict();

export const updateRequirementSchema = requirementFieldsSchema
  .extend({ serviceId: id, requirementId: id, expectedVersion })
  .strict();

export const setRequirementActiveSchema = z
  .object({ serviceId: id, requirementId: id, isActive: z.boolean(), expectedVersion })
  .strict();

export const moveRequirementSchema = z
  .object({ serviceId: id, requirementId: id, direction: z.enum(["up", "down"]) })
  .strict();

/** Liste filtreleri (`searchParams`). Geçersiz değerler varsayılana döner. */
export const SERVICE_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUS_FILTERS)[number];

export const serviceListFiltersSchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim().slice(0, SEARCH_QUERY_MAX_LENGTH))
    .catch(""),
  status: z.enum(SERVICE_STATUS_FILTERS).catch("all"),
});
export type ServiceListFilters = z.output<typeof serviceListFiltersSchema>;

export type CreateServiceInput = z.input<typeof createServiceSchema>;
export type UpdateServiceInput = z.input<typeof updateServiceSchema>;
export type SetServiceActiveInput = z.input<typeof setServiceActiveSchema>;
export type CreateRequirementInput = z.input<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.input<typeof updateRequirementSchema>;
export type SetRequirementActiveInput = z.input<typeof setRequirementActiveSchema>;
export type MoveRequirementInput = z.input<typeof moveRequirementSchema>;

export { fieldErrorsOf } from "@/lib/field-errors";
