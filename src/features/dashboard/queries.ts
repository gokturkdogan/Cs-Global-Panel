import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { applications } from "@/server/db/schema";

import {
  DASHBOARD_RECENT_LIMIT,
  DASHBOARD_REVIEW_QUEUE_LIMIT,
  DASHBOARD_STAT_STATUSES,
  type DashboardOverview,
} from "./domain";

type Executor = Pick<Database, "select">;

const visible = isNull(applications.deletionRequestedAt);
const countWhere = (statuses: readonly (typeof applications.$inferSelect.status)[]) =>
  sql<number>`count(*) filter (where ${inArray(applications.status, [...statuses])})::int`;

/**
 * Genel Bakış verisi (D-070). Yalnızca listelenen kolonlar okunur; telefon, e-posta, token ve iç
 * notlar sorgulanmaz. Tutarlı görünüm için `getDashboardOverview` tek bir salt okunur
 * REPEATABLE READ transaction'ında çalıştırır.
 */
export async function queryDashboardOverview(db: Executor): Promise<DashboardOverview> {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      awaitingDocuments: countWhere(DASHBOARD_STAT_STATUSES.awaitingDocuments),
      underReview: countWhere(DASHBOARD_STAT_STATUSES.underReview),
      completed: countWhere(DASHBOARD_STAT_STATUSES.completed),
    })
    .from(applications)
    .where(visible);

  const row = {
    applicationNumber: applications.applicationNumber,
    firstName: applications.customerFirstName,
    lastName: applications.customerLastName,
    serviceName: applications.serviceNameSnapshot,
  };

  const recent = await db
    .select({ ...row, status: applications.status, createdAt: applications.createdAt })
    .from(applications)
    .where(visible)
    // Eşit oluşturma zamanında sıra belirleyici: başvuru numarası (yıl + artan sıra).
    .orderBy(desc(applications.createdAt), desc(applications.applicationNumber))
    .limit(DASHBOARD_RECENT_LIMIT);

  const queue = await db
    .select({ ...row, waitingSince: applications.statusChangedAt })
    .from(applications)
    .where(and(visible, eq(applications.status, "UNDER_REVIEW")))
    // En uzun süredir bekleyen önce.
    .orderBy(asc(applications.statusChangedAt), asc(applications.applicationNumber))
    .limit(DASHBOARD_REVIEW_QUEUE_LIMIT);

  const customerName = (item: { firstName: string; lastName: string }) =>
    `${item.firstName} ${item.lastName}`;

  return {
    stats: stats ?? { total: 0, awaitingDocuments: 0, underReview: 0, completed: 0 },
    recentApplications: recent.map((item) => ({
      applicationNumber: item.applicationNumber,
      customerName: customerName(item),
      serviceName: item.serviceName,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    })),
    reviewQueue: queue.map((item) => ({
      applicationNumber: item.applicationNumber,
      customerName: customerName(item),
      serviceName: item.serviceName,
      waitingSince: item.waitingSince.toISOString(),
    })),
  };
}

export type DashboardOverviewResult =
  { readonly ok: true; readonly data: DashboardOverview } | { readonly ok: false };

/** Hata, boş durumdan ayrı döner; log'a yalnızca hata türü/kodu yazılır (PII/sorgu yok). */
export async function getDashboardOverview(db: Database): Promise<DashboardOverviewResult> {
  try {
    const data = await db.transaction((tx) => queryDashboardOverview(tx), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    return { ok: true, data };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.error("[dashboard] Genel bakış verisi okunamadı", {
      name: error instanceof Error ? error.name : "unknown",
      code: typeof code === "string" ? code : "unknown",
    });
    return { ok: false };
  }
}
