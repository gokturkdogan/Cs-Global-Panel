import "server-only";

import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";

import { DELETION_QUEUE_LIMIT } from "@/config/constants";
import { MANUAL_DELETION_ERRORS, type DeletionErrorCode } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import {
  applicationDeletionObjects as objects,
  applicationDeletions as deletions,
  applications,
  users,
} from "@/server/db/schema";

/**
 * Silme ilerlemesi — yalnızca kalıcı DB durumundan (sahte ilerleme yok; sayfa açılışında sağlayıcı çağrısı
 * yok). Müşteri kişisel bilgileri (ad, telefon, e-posta) ve silme gerekçesi bu görünümlere alınmaz.
 */
export type DeletionProgress = {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  /** Sonucu kanıtlanmamış yazım girişimi sayısı (D-124) — sıfır olmadan sonlandırma yapılamaz. */
  readonly unresolvedWrites: number;
  readonly inventoryReady: boolean;
  readonly totalObjects: number;
  readonly deletedObjects: number;
  readonly lastError: DeletionErrorCode | null;
  readonly manualReview: boolean;
  readonly lastAttemptAt: string | null;
  readonly attemptCount: number;
  readonly busy: boolean;
};

type Reader = Pick<Database, "select">;

const objectCounts = (db: Reader) =>
  db
    .select({
      applicationId: objects.applicationId,
      total: count().as("total"),
      deleted: sql<number>`count(*) FILTER (WHERE ${objects.state} = 'DELETED')::int`.as("deleted"),
    })
    .from(objects)
    .groupBy(objects.applicationId)
    .as("object_counts");

async function readProgress(db: Reader, where: ReturnType<typeof and>, limit: number) {
  const counts = objectCounts(db);
  const rows = await db
    .select({
      applicationId: applications.id,
      applicationNumber: applications.applicationNumber,
      requestedAt: applications.deletionRequestedAt,
      requestedBy: users.username,
      unresolvedWrites: sql<number>`(SELECT count(*)::int FROM storage_write_attempts w
        WHERE w.application_id = ${deletions.applicationId}
          AND w.state IN ('ADMITTED', 'IN_PROGRESS', 'UNKNOWN'))`,
      inventoryCompletedAt: deletions.inventoryCompletedAt,
      total: counts.total,
      deleted: counts.deleted,
      lastError: deletions.lastError,
      lastAttemptAt: deletions.lastAttemptAt,
      attemptCount: deletions.attemptCount,
      busy: sql<boolean>`coalesce(${deletions.leaseExpiresAt} > now(), false)`,
    })
    .from(deletions)
    .innerJoin(applications, eq(applications.id, deletions.applicationId))
    .leftJoin(users, eq(users.id, deletions.requestedByUserId))
    .leftJoin(counts, eq(counts.applicationId, deletions.applicationId))
    .where(where)
    .orderBy(asc(applications.deletionRequestedAt), asc(applications.id))
    .limit(limit);
  return rows.map((row): DeletionProgress => ({
    applicationId: row.applicationId,
    applicationNumber: row.applicationNumber,
    requestedAt: row.requestedAt!.toISOString(),
    requestedBy: row.requestedBy ?? "Personel",
    unresolvedWrites: Number(row.unresolvedWrites),
    inventoryReady: row.inventoryCompletedAt !== null,
    totalObjects: Number(row.total ?? 0),
    deletedObjects: Number(row.deleted ?? 0),
    lastError: row.lastError,
    manualReview: row.lastError !== null && MANUAL_DELETION_ERRORS.includes(row.lastError),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    attemptCount: row.attemptCount,
    busy: row.busy,
  }));
}

export async function getDeletionProgress(
  db: Reader,
  applicationId: string,
): Promise<DeletionProgress | null> {
  const [row] = await readProgress(
    db,
    and(eq(deletions.applicationId, applicationId), isNotNull(applications.deletionRequestedAt)),
    1,
  );
  return row ?? null;
}

/** Tamamlanmamış silme işlemleri (en eski önce, sınırlı) + toplam sayı. */
export async function listDeletionQueue(db: Reader) {
  const items = await readProgress(
    db,
    and(isNotNull(applications.deletionRequestedAt)),
    DELETION_QUEUE_LIMIT,
  );
  const [total] = await db
    .select({ value: count() })
    .from(deletions)
    .innerJoin(applications, eq(applications.id, deletions.applicationId));
  return { items, total: total?.value ?? 0 };
}
