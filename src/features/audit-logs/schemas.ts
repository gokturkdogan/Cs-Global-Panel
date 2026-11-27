import { z } from "zod";

import { AUDIT_PAGE_SIZES } from "@/config/constants";
import { AUDIT_ACTOR_TYPES, AUDIT_RESOURCE_TYPES } from "@/config/statuses";
import { messages } from "@/lib/messages";

import { isKnownAuditAction } from "./domain/labels";

/**
 * İşlem geçmişi filtreleri (PHASE 10, D-119). URL'de yalnızca kişisel veri içermeyen değerler bulunur:
 * tarih, işlem kodu, aktör türü, personel kimliği, kaynak türü, başvuru UUID'si, imleç ve sayfa boyutu.
 * Ad/telefon/e-posta/serbest metin araması YOKTUR (audit bir kişisel veri araştırma aracı değildir).
 * Başvuru numarası yalnızca Server Action ile UUID'ye çözülür (numara URL'ye yazılmaz).
 * Geçersiz değerler yok sayılır (güvenli varsayılan); tarih hataları kullanıcıya bildirilir.
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type AuditFilters = {
  readonly from: string | null;
  readonly to: string | null;
  readonly action: string | null;
  readonly actorType: (typeof AUDIT_ACTOR_TYPES)[number] | null;
  readonly staffId: string | null;
  readonly resourceType: (typeof AUDIT_RESOURCE_TYPES)[number] | null;
  readonly applicationId: string | null;
  /** Bu kayıttan daha ESKİ kayıtlar (sonraki sayfa). */
  readonly after: number | null;
  /** Bu kayıttan daha YENİ kayıtlar (önceki sayfa). */
  readonly before: number | null;
  readonly pageSize: (typeof AUDIT_PAGE_SIZES)[number];
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const cursor = (value: string) =>
  /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export function parseAuditFilters(params: RawParams): {
  readonly filters: AuditFilters;
  readonly error: string | null;
} {
  let error: string | null = null;
  const date = (value: string) => {
    if (value === "") return null;
    if (!isRealDate(value)) {
      error = messages.auditLogs.invalidDate;
      return null;
    }
    return value;
  };
  let from = date(first(params.from));
  let to = date(first(params.to));
  if (from !== null && to !== null && from > to) {
    error = messages.auditLogs.invalidRange;
    from = null;
    to = null;
  }
  const action = first(params.action);
  const actorType = first(params.actorType);
  const resourceType = first(params.resourceType);
  const staffId = first(params.staffId);
  const applicationId = first(params.applicationId);
  const pageSize = Number(first(params.pageSize));
  const after = cursor(first(params.after));
  return {
    filters: {
      from,
      to,
      action: isKnownAuditAction(action) ? action : null,
      actorType: (AUDIT_ACTOR_TYPES as readonly string[]).includes(actorType)
        ? (actorType as AuditFilters["actorType"])
        : null,
      staffId: /^[A-Za-z0-9_-]{1,64}$/.test(staffId) ? staffId : null,
      resourceType: (AUDIT_RESOURCE_TYPES as readonly string[]).includes(resourceType)
        ? (resourceType as AuditFilters["resourceType"])
        : null,
      applicationId: z.uuid().safeParse(applicationId).success ? applicationId : null,
      after,
      before: after === null ? cursor(first(params.before)) : null,
      pageSize: (AUDIT_PAGE_SIZES as readonly number[]).includes(pageSize)
        ? (pageSize as AuditFilters["pageSize"])
        : 20,
    },
    error,
  };
}

/** Başvuru numarası → UUID çözümleme girdisi (Server Action gövdesi; URL'ye yazılmaz). */
export const applicationNumberLookupSchema = z
  .object({
    applicationNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^CS-[0-9]{4}-[0-9]{6,}$/, messages.auditLogs.invalidNumber)
      .max(32),
  })
  .strict();
