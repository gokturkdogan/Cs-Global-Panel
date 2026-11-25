import { z } from "zod";

import { SEARCH_QUERY_MAX_LENGTH } from "@/config/constants";
import { APPLICATION_STATUSES } from "@/config/statuses";
import { messages } from "@/lib/messages";

/**
 * Başvuru girdileri (PHASE 06). İstemci ve sunucu ortak; sunucu doğrulaması zorunludur. Telefonun
 * geçerliliği ve E.164 normalizasyonu yalnızca sunucuda (`domain/phone.ts`, libphonenumber-js) yapılır.
 * Tüm nesneler `.strict()`: statü, hizmet snapshot'ı, evrak listesi, aktör, token alanı gönderilirse
 * girdi bütünüyle reddedilir (mass assignment).
 */

const m = messages.applications.validation;
const codePoints = (value: string) => [...value].length;

// Ad/soyad: Türkçe ve uluslararası harfler, birleşik işaretler, boşluk, kesme, tire, nokta.
const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M} '’.-]*$/u;

function personName(required: string, invalid: string) {
  return z
    .string({ error: required })
    .transform((value) => value.normalize("NFC").replace(/\s+/g, " ").trim())
    .superRefine((value, ctx) => {
      if (value === "") ctx.addIssue({ code: "custom", message: required });
      else if (codePoints(value) > 100) ctx.addIssue({ code: "custom", message: m.nameLength });
      else if (!PERSON_NAME_PATTERN.test(value)) ctx.addIssue({ code: "custom", message: invalid });
    });
}

const phoneInput = z
  .string({ error: m.phoneRequired })
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (value === "") ctx.addIssue({ code: "custom", message: m.phoneRequired });
    else if (value.length > 32 || !/^[0-9+()\-.\s]+$/.test(value))
      ctx.addIssue({ code: "custom", message: m.phoneInvalid });
  });

const emailInput = z
  .string({ error: m.emailRequired })
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value === "") ctx.addIssue({ code: "custom", message: m.emailRequired });
    else if (
      value.length > 254 ||
      !z.email().safeParse(value).success ||
      !/^[^@\s]+@[^@\s]+$/.test(value)
    )
      ctx.addIssue({ code: "custom", message: m.emailInvalid });
  });

const id = z.uuid();

export const customerFieldsSchema = z
  .object({
    firstName: personName(m.firstNameRequired, m.nameInvalid),
    lastName: personName(m.lastNameRequired, m.nameInvalid),
    phone: phoneInput,
    email: emailInput,
  })
  .strict();

export const createApplicationSchema = customerFieldsSchema
  .extend({
    /** Formun tekrar gönderiminde (çift tıklama, ağ hatası) aynı başvuruyu döndürmek için. */
    idempotencyKey: id,
    serviceId: z.uuid({ error: m.serviceRequired }),
    /** Önizlenen şablonun parmak izi (sunucu doğrular; uyuşmazlıkta oluşturulmaz). */
    templateFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const updateCustomerSchema = customerFieldsSchema
  .extend({ applicationId: id, expectedVersion: z.number().int().min(1) })
  .strict();

export const applicationRefSchema = z.object({ applicationId: id }).strict();

/** İptal/yenileme: istemcinin gördüğü aktif token kimliği (yoksa null) — eski onay yeni bağlantıyı iptal edemez. */
export const accessLinkMutationSchema = z
  .object({ applicationId: id, expectedActiveTokenId: id.nullable() })
  .strict();

export const servicePreviewSchema = z.object({ serviceId: id }).strict();

export const APPLICATION_PAGE_SIZES = [10, 20, 50] as const;
export const APPLICATION_STATUS_FILTERS = ["ALL", ...APPLICATION_STATUSES] as const;

/** URL'de tutulan, kişisel veri içermeyen filtreler. Geçersiz değerler varsayılana döner. */
export const applicationListFiltersSchema = z.object({
  status: z.enum(APPLICATION_STATUS_FILTERS).catch("ALL"),
  serviceId: z.uuid().or(z.literal("")).catch(""),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce
    .number()
    .refine((value): value is (typeof APPLICATION_PAGE_SIZES)[number] =>
      (APPLICATION_PAGE_SIZES as readonly number[]).includes(value),
    )
    .catch(20),
});
export type ApplicationListFilters = z.output<typeof applicationListFiltersSchema>;

/** Arama (kişisel veri içerebilir): URL'ye yazılmaz, Server Action gövdesinde gelir. */
export const applicationSearchSchema = z
  .object({
    q: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(SEARCH_QUERY_MAX_LENGTH)),
    status: z.enum(APPLICATION_STATUS_FILTERS),
    serviceId: z.uuid().or(z.literal("")),
    page: z.number().int().min(1).max(100_000),
    pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]),
  })
  .strict();

export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;
export type ApplicationSearchInput = z.input<typeof applicationSearchSchema>;
