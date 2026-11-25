import "server-only";

import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";
import { escapeLikePattern, normalizeSearchText } from "@/lib/search";
import type { Database } from "@/server/db/client";
import {
  applicationAccessTokens as tokens,
  applicationDocumentRequirements as snapshots,
  applications,
  applicationStatusHistory as history,
  serviceDocumentRequirements as templates,
  services,
  users,
} from "@/server/db/schema";

import { formatPhoneForDisplay } from "./domain/phone";
import { asApplicationNumber, phoneDigitsQuery } from "./domain/search-text";
import { templateFingerprint } from "./domain/template-fingerprint";
import type { ApplicationListFilters } from "./schemas";

/**
 * Başvuru okuma sorguları (PHASE 06). Yalnızca runtime rolü; çağıran sayfa/action `requireStaff()`
 * yapar. Silme talepli başvurular hiçbir sorguda görünmez (BR-153). DTO'larda token hash'i,
 * şifreli kopya, oluşturan kimliği veya arama metni yoktur; düz bağlantı burada hiç üretilmez
 * (yalnızca kullanıcı aksiyonuyla `service.ts`'te).
 */

type Reader = Pick<Database, "select">;

const turkishCollator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });
const visible = isNull(applications.deletionRequestedAt);
// Dış tablo açıkça nitelenir: Drizzle tek tablolu sorguda kolonları niteliksiz yazar ve alt sorguda
// "id" iç tabloya bağlanırdı (PHASE 06'da E2E ile yakalanan hata; integration testi ile korunur).
const activeTokenId = sql<
  string | null
>`(SELECT t.id FROM application_access_tokens t WHERE t.application_id = "applications"."id" AND t.revoked_at IS NULL)`;

// ---------------------------------------------------------------- Hizmet seçimi ve önizleme

export type ServiceOption = {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
};

/** Tüm hizmetler (filtre ve form için). Sınırsız ama yalnızca ad; katalog küçüktür (sessiz kesme yok). */
export async function listServiceOptions(db: Reader): Promise<ServiceOption[]> {
  const rows = await db
    .select({ id: services.id, name: services.name, isActive: services.isActive })
    .from(services);
  return rows.sort((a, b) => turkishCollator.compare(a.name, b.name));
}

export type ServicePreview = {
  readonly service: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
  };
  readonly requirements: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly instructions: string | null;
    readonly isRequired: boolean;
  }[];
  readonly fingerprint: string;
};

/** Aktif hizmetin aktif evrakları (snapshot'a kopyalanacak sırayla) + parmak izi; değilse null. */
export async function getServicePreview(
  db: Reader,
  serviceId: string,
): Promise<ServicePreview | null> {
  const [service] = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      version: services.version,
    })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.isActive, true)))
    .limit(1);
  if (service === undefined) return null;
  const rows = await readActiveTemplates(db, serviceId);
  return {
    service: { id: service.id, name: service.name, description: service.description },
    requirements: rows.map(({ id, title, description, instructions, isRequired }) => ({
      id,
      title,
      description,
      instructions,
      isRequired,
    })),
    fingerprint: templateFingerprint(service, rows),
  };
}

/** Snapshot sözleşmesi (D-074): aktif şablonlar belirleyici sırada. */
export function readActiveTemplates(db: Reader, serviceId: string) {
  return db
    .select({
      id: templates.id,
      title: templates.title,
      description: templates.description,
      instructions: templates.instructions,
      isRequired: templates.isRequired,
      sortOrder: templates.sortOrder,
      version: templates.version,
    })
    .from(templates)
    .where(and(eq(templates.serviceId, serviceId), eq(templates.isActive, true)))
    .orderBy(asc(templates.sortOrder), asc(templates.createdAt), asc(templates.id));
}

// ---------------------------------------------------------------- Liste

export type ApplicationListItem = {
  readonly id: string;
  readonly applicationNumber: string;
  readonly customerName: string;
  readonly serviceName: string;
  readonly status: ApplicationStatus;
  readonly createdAt: string;
  /** Aktif bağlantının kimliği (gizli değildir; iptal/yenilemede eski onay kontrolü için). */
  readonly activeTokenId: string | null;
};

export type ApplicationList = {
  readonly items: readonly ApplicationListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
};

export type ApplicationQuery = ApplicationListFilters & { readonly q: string };

function searchCondition(q: string): SQL | undefined {
  const query = q.trim();
  if (query === "") return undefined;
  const conditions: SQL[] = [];
  const number = asApplicationNumber(query);
  if (number !== null) conditions.push(eq(applications.applicationNumber, number));
  const normalized = normalizeSearchText(query);
  if (normalized !== "") {
    conditions.push(
      sql`${applications.searchText} LIKE ${`%${escapeLikePattern(normalized)}%`} ESCAPE '\\'`,
    );
  }
  const digits = phoneDigitsQuery(query);
  if (digits !== null) conditions.push(sql`${applications.searchText} LIKE ${`%${digits}%`}`);
  return or(...conditions);
}

/** Sunucu tarafı sayfalama; sıra `created_at DESC, application_number DESC` (belirleyici). */
export async function listApplications(
  db: Reader,
  query: ApplicationQuery,
): Promise<ApplicationList> {
  const conditions: (SQL | undefined)[] = [visible, searchCondition(query.q)];
  if (query.status !== "ALL") conditions.push(eq(applications.status, query.status));
  if (query.serviceId !== "") conditions.push(eq(applications.serviceId, query.serviceId));
  const where = and(...conditions);

  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(applications)
    .where(where);
  const total = counted?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);

  const rows = await db
    .select({
      id: applications.id,
      applicationNumber: applications.applicationNumber,
      firstName: applications.customerFirstName,
      lastName: applications.customerLastName,
      serviceName: applications.serviceNameSnapshot,
      status: applications.status,
      createdAt: applications.createdAt,
      activeTokenId,
    })
    .from(applications)
    .where(where)
    .orderBy(desc(applications.createdAt), desc(applications.applicationNumber))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);

  return {
    items: rows.map((row) => ({
      id: row.id,
      applicationNumber: row.applicationNumber,
      customerName: `${row.firstName} ${row.lastName}`,
      serviceName: row.serviceName,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      activeTokenId: row.activeTokenId,
    })),
    total,
    page,
    pageSize: query.pageSize,
    pageCount,
  };
}

// ---------------------------------------------------------------- Detay

export type ApplicationDetail = {
  readonly id: string;
  readonly applicationNumber: string;
  readonly status: ApplicationStatus;
  readonly serviceName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneE164: string;
  readonly phoneDisplay: string;
  readonly email: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeLink: { readonly tokenId: string; readonly createdAt: string } | null;
  readonly lastRevokedAt: string | null;
  readonly requirements: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly instructions: string | null;
    readonly isRequired: boolean;
    readonly status: DocumentStatus;
    /** Optimistic lock — dosya yüklemesinde `expectedVersion` (BR-90). */
    readonly version: number;
  }[];
  readonly history: readonly {
    readonly id: string;
    readonly fromStatus: ApplicationStatus | null;
    readonly toStatus: ApplicationStatus;
    readonly transitionCode: string;
    readonly actorUsername: string | null;
    readonly createdAt: string;
  }[];
};

export async function getApplicationDetail(
  db: Reader,
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const [row] = await db
    .select({
      id: applications.id,
      applicationNumber: applications.applicationNumber,
      status: applications.status,
      serviceName: applications.serviceNameSnapshot,
      firstName: applications.customerFirstName,
      lastName: applications.customerLastName,
      phoneE164: applications.customerPhoneE164,
      email: applications.customerEmail,
      version: applications.version,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(and(eq(applications.id, applicationId), visible))
    .limit(1);
  if (row === undefined) return null;

  const [tokenRows, requirementRows, historyRows] = [
    await db
      .select({ id: tokens.id, createdAt: tokens.createdAt, revokedAt: tokens.revokedAt })
      .from(tokens)
      .where(eq(tokens.applicationId, applicationId))
      .orderBy(desc(tokens.createdAt)),
    await db
      .select({
        id: snapshots.id,
        title: snapshots.title,
        description: snapshots.description,
        instructions: snapshots.instructions,
        isRequired: snapshots.isRequired,
        status: snapshots.status,
        version: snapshots.version,
      })
      .from(snapshots)
      .where(eq(snapshots.applicationId, applicationId))
      .orderBy(asc(snapshots.sortOrder), asc(snapshots.createdAt), asc(snapshots.id)),
    await db
      .select({
        id: history.id,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        transitionCode: history.transitionCode,
        actorUsername: users.username,
        createdAt: history.createdAt,
      })
      .from(history)
      .leftJoin(users, eq(users.id, history.actorUserId))
      .where(eq(history.applicationId, applicationId))
      .orderBy(asc(history.createdAt), asc(history.id)),
  ];

  const active = tokenRows.find((token) => token.revokedAt === null);
  const lastRevoked = tokenRows.find((token) => token.revokedAt !== null);
  return {
    ...row,
    phoneDisplay: formatPhoneForDisplay(row.phoneE164),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activeLink: active ? { tokenId: active.id, createdAt: active.createdAt.toISOString() } : null,
    lastRevokedAt: lastRevoked?.revokedAt?.toISOString() ?? null,
    requirements: requirementRows,
    history: historyRows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
  };
}
