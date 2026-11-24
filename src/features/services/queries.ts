import "server-only";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { SERVICE_LIST_LIMIT } from "@/config/constants";
import { escapeLikePattern, normalizeSearchText } from "@/lib/search";
import type { Database } from "@/server/db/client";
import { serviceDocumentRequirements as requirements, services } from "@/server/db/schema";

import type { ServiceListFilters } from "./schemas";

/**
 * Hizmet okuma sorguları (PHASE 05). Yalnızca runtime rolüyle (`getDb()`); çağıran sayfa
 * `requireStaff()` yapar. İstemciye yalnızca DTO gider (oluşturan/güncelleyen kimliği yok).
 */

type Reader = Pick<Database, "select">;

export type ServiceListItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly activeRequirementCount: number;
  readonly requiredRequirementCount: number;
  /** ISO 8601 (UTC). */
  readonly updatedAt: string;
};

export type ServiceList = {
  readonly items: readonly ServiceListItem[];
  /** Sonuç `SERVICE_LIST_LIMIT`'i aştı (yalnızca ilk kayıtlar döndü). */
  readonly truncated: boolean;
  /** Filtreden bağımsız olarak hiç hizmet var mı (boş katalog ≠ sonuç yok). */
  readonly catalogEmpty: boolean;
};

export type RequirementDetail = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly isRequired: boolean;
  readonly isActive: boolean;
  readonly version: number;
};

export type ServiceDetail = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly requirements: readonly RequirementDetail[];
};

/**
 * Veritabanı tarafı arama ifadesi: `normalizeSearchText` ile aynı katlama (BR-80). `lower()`
 * C.UTF-8'de `İ→i`, `I→i` üretir; `ı→i` ve diğer harfler `translate` ile katlanır, birleşik nokta
 * (U+0307) silinir.
 */
export const searchableName = sql`translate(lower(${services.name}), ${"ığüşöçâîû\u0307"}, ${"igusocaiu"})`;

/** Türkçe alfabetik sıra (veritabanı C.UTF-8 kod noktası sırası Türkçe için uygun değildir). */
const turkishCollator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });

export async function listServices(db: Reader, filters: ServiceListFilters): Promise<ServiceList> {
  const conditions: SQL[] = [];
  if (filters.status === "active") conditions.push(eq(services.isActive, true));
  if (filters.status === "inactive") conditions.push(eq(services.isActive, false));
  const query = normalizeSearchText(filters.q);
  if (query !== "") {
    conditions.push(sql`${searchableName} LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`);
  }

  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      isActive: services.isActive,
      updatedAt: services.updatedAt,
      activeRequirementCount: sql<number>`count(${requirements.id}) FILTER (WHERE ${requirements.isActive})::int`,
      requiredRequirementCount: sql<number>`count(${requirements.id}) FILTER (WHERE ${requirements.isActive} AND ${requirements.isRequired})::int`,
    })
    .from(services)
    .leftJoin(requirements, eq(requirements.serviceId, services.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(services.id)
    .orderBy(sql`lower(${services.name})`, asc(services.id))
    .limit(SERVICE_LIST_LIMIT + 1);

  const truncated = rows.length > SERVICE_LIST_LIMIT;
  const items = rows
    .slice(0, SERVICE_LIST_LIMIT)
    .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
    .sort((a, b) => turkishCollator.compare(a.name, b.name) || a.id.localeCompare(b.id));

  let catalogEmpty = false;
  if (items.length === 0) {
    const any = await db.select({ id: services.id }).from(services).limit(1);
    catalogEmpty = any.length === 0;
  }
  return { items, truncated, catalogEmpty };
}

export async function getServiceDetail(
  db: Reader,
  serviceId: string,
): Promise<ServiceDetail | null> {
  const [service] = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      isActive: services.isActive,
      version: services.version,
      createdAt: services.createdAt,
      updatedAt: services.updatedAt,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (service === undefined) return null;

  const rows = await db
    .select({
      id: requirements.id,
      title: requirements.title,
      description: requirements.description,
      instructions: requirements.instructions,
      isRequired: requirements.isRequired,
      isActive: requirements.isActive,
      version: requirements.version,
    })
    .from(requirements)
    .where(eq(requirements.serviceId, serviceId))
    .orderBy(...REQUIREMENT_ORDER);

  return {
    ...service,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
    requirements: rows,
  };
}

/** Evrak şablonlarının belirleyici sırası (snapshot ve yönetim ekranı aynı sırayı kullanır). */
export const REQUIREMENT_ORDER = [
  asc(requirements.sortOrder),
  asc(requirements.createdAt),
  asc(requirements.id),
] as const;
