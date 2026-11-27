import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import type { StaffRole } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import { applications, auditLogs, users } from "@/server/db/schema";

import {
  auditActionLabel,
  AUDIT_ACTOR_LABELS,
  AUDIT_RESOURCE_LABELS,
  describeAuditMetadata,
  type AuditDetail,
} from "./domain/labels";
import type { AuditFilters } from "./schemas";

/**
 * İşlem geçmişi okuma (PHASE 10, D-119) — salt okunur; listeleme audit'e yazılmaz (özyineleme yok).
 * Parametreli Drizzle sorgusu (ham girdiyle SQL üretilmez). Belirleyici keyset sayfalama:
 * `(occurred_at, id)` azalan; aynı zaman damgalı kayıtlar `id` ile ayrışır → tekrar/eksik yok.
 * Tarih aralığı gün bazında Europe/Istanbul'a göre yorumlanır (bitiş günü dahil).
 * DTO yalnızca izinli alanlar: ham metadata, IP/UA (zaten yok), token, serbest metin istemciye gitmez.
 */
export type AuditItem = {
  readonly id: number;
  readonly occurredAt: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly actorLabel: string;
  readonly staff: { readonly username: string; readonly accountType: StaffRole } | null;
  readonly resourceLabel: string;
  readonly application:
    | { readonly id: string; readonly number: string; readonly deleting: boolean }
    | { readonly id: string; readonly number: null; readonly deleting: false }
    | null;
  readonly details: readonly AuditDetail[];
};

export type AuditPage = {
  readonly items: readonly AuditItem[];
  readonly olderCursor: number | null;
  readonly newerCursor: number | null;
};

const ISTANBUL = "Europe/Istanbul";

function conditions(filters: AuditFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.from !== null) {
    where.push(
      sql`${auditLogs.occurredAt} >= (${filters.from}::date::timestamp AT TIME ZONE ${ISTANBUL})`,
    );
  }
  if (filters.to !== null) {
    where.push(
      sql`${auditLogs.occurredAt} < ((${filters.to}::date + 1)::timestamp AT TIME ZONE ${ISTANBUL})`,
    );
  }
  if (filters.action !== null) where.push(eq(auditLogs.action, filters.action));
  if (filters.actorType !== null) where.push(eq(auditLogs.actorType, filters.actorType));
  if (filters.staffId !== null) where.push(eq(auditLogs.actorUserId, filters.staffId));
  if (filters.resourceType !== null) where.push(eq(auditLogs.resourceType, filters.resourceType));
  if (filters.applicationId !== null)
    where.push(eq(auditLogs.applicationId, filters.applicationId));
  return where;
}

const cursorRow = (id: number) =>
  sql`(SELECT c.occurred_at, c.id FROM audit_logs c WHERE c.id = ${id})`;

export async function listAuditLogs(
  db: Pick<Database, "select">,
  filters: AuditFilters,
): Promise<AuditPage> {
  const where = conditions(filters);
  const newer = filters.before !== null;
  if (filters.after !== null) {
    where.push(sql`(${auditLogs.occurredAt}, ${auditLogs.id}) < ${cursorRow(filters.after)}`);
  } else if (filters.before !== null) {
    where.push(sql`(${auditLogs.occurredAt}, ${auditLogs.id}) > ${cursorRow(filters.before)}`);
  }
  const limit = filters.pageSize + 1;
  const rows = await db
    .select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      action: auditLogs.action,
      actorType: auditLogs.actorType,
      resourceType: auditLogs.resourceType,
      applicationId: auditLogs.applicationId,
      metadata: auditLogs.metadata,
      username: users.username,
      role: users.role,
      applicationNumber: applications.applicationNumber,
      deletionRequestedAt: applications.deletionRequestedAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(applications, eq(applications.id, auditLogs.applicationId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(
      ...(newer
        ? [asc(auditLogs.occurredAt), asc(auditLogs.id)]
        : [desc(auditLogs.occurredAt), desc(auditLogs.id)]),
    )
    .limit(limit);

  const more = rows.length > filters.pageSize;
  const page = rows.slice(0, filters.pageSize);
  if (newer) page.reverse();
  const items = page.map((row): AuditItem => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    actorLabel: AUDIT_ACTOR_LABELS[row.actorType],
    staff:
      row.actorType === "USER" && row.username !== null && row.role !== null
        ? { username: row.username, accountType: row.role }
        : null,
    resourceLabel: AUDIT_RESOURCE_LABELS[row.resourceType],
    application:
      row.applicationId === null
        ? null
        : row.applicationNumber === null
          ? { id: row.applicationId, number: null, deleting: false }
          : {
              id: row.applicationId,
              number: row.applicationNumber,
              deleting: row.deletionRequestedAt !== null,
            },
    details: describeAuditMetadata(row.metadata),
  }));
  const firstId = items[0]?.id ?? null;
  const lastId = items.at(-1)?.id ?? null;
  return newer
    ? { items, newerCursor: more ? firstId : null, olderCursor: lastId }
    : {
        items,
        olderCursor: more ? lastId : null,
        newerCursor: filters.after !== null ? firstId : null,
      };
}

/** Personel filtre seçenekleri (yalnızca iki sabit hesap — OD-24). */
export async function listStaffOptions(db: Pick<Database, "select">) {
  return db
    .select({ id: users.id, username: users.username, accountType: users.role })
    .from(users)
    .orderBy(asc(users.role), asc(users.username));
}

/** Başvuru numarası → UUID (yalnızca mevcut başvurular; silinmiş başvuru numarası çözülemez). */
export async function resolveApplicationNumber(
  db: Pick<Database, "select">,
  applicationNumber: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.applicationNumber, applicationNumber))
    .limit(1);
  return row?.id ?? null;
}

/** Başvuru UUID'si → numara (filtre etiketi için; yoksa null). */
export async function applicationNumberOf(
  db: Pick<Database, "select">,
  applicationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ number: applications.applicationNumber })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  return row?.number ?? null;
}
