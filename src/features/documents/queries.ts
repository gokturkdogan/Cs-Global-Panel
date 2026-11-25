import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { applicationDocumentFiles as files, users } from "@/server/db/schema";
import { getStorageQuota } from "@/server/storage/factory";
import { capacityOf, readStorageUsage, type StorageCapacity } from "@/server/storage/quota";

/**
 * Personel dosya okumaları (PHASE 08). Yalnızca PostgreSQL metadata'sı — sayfa açılışında storage'a
 * istek yapılmaz (bant genişliği / Class B-C işlem kotası, PHASE 08 §22). Yalnızca doğrulanmış
 * versiyonlar (ACTIVE/SUPERSEDED/REMOVED); başarısız/yarım yüklemeler belge geçmişi olarak gösterilmez.
 */

export type StaffFileVersion = {
  readonly id: string;
  readonly versionNumber: number;
  readonly isActive: boolean;
  /** Aktif olmayan geçerli versiyon: değiştirildi (SUPERSEDED) veya kaldırıldı (REMOVED — PHASE 09). */
  readonly removed: boolean;
  readonly filename: string;
  readonly sizeBytes: number;
  /** "Müşteri" veya personel kullanıcı adı (iki hesap eşittir; yalnızca tanımlama). */
  readonly uploadedBy: string;
  readonly uploadedByCustomer: boolean;
  readonly activatedAt: string;
};

export async function getApplicationFileVersions(
  db: Pick<Database, "select">,
  applicationId: string,
): Promise<ReadonlyMap<string, readonly StaffFileVersion[]>> {
  const rows = await db
    .select({
      id: files.id,
      requirementId: files.requirementId,
      status: files.status,
      versionNumber: files.versionNumber,
      filename: files.originalFilename,
      sizeBytes: files.sizeBytes,
      actorType: files.uploadedByActorType,
      username: users.username,
      activatedAt: files.activatedAt,
    })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedByUserId))
    .where(
      and(
        eq(files.applicationId, applicationId),
        inArray(files.status, ["ACTIVE", "SUPERSEDED", "REMOVED"]),
      ),
    )
    .orderBy(files.requirementId, desc(files.versionNumber));
  const result = new Map<string, StaffFileVersion[]>();
  for (const row of rows) {
    if (row.versionNumber === null || row.sizeBytes === null || row.activatedAt === null) continue;
    const list = result.get(row.requirementId) ?? [];
    list.push({
      id: row.id,
      versionNumber: row.versionNumber,
      isActive: row.status === "ACTIVE",
      removed: row.status === "REMOVED",
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      uploadedBy: row.actorType === "CUSTOMER" ? "Müşteri" : (row.username ?? "Personel"),
      uploadedByCustomer: row.actorType === "CUSTOMER",
      activatedAt: row.activatedAt.toISOString(),
    });
    result.set(row.requirementId, list);
  }
  return result;
}

/** Dashboard kapasite bileşeni (yalnızca DB; yapılandırma yoksa `null`). */
export async function getStorageCapacity(
  db: Pick<Database, "select">,
): Promise<StorageCapacity | null> {
  let quota;
  try {
    quota = getStorageQuota();
  } catch {
    return null;
  }
  return capacityOf(await readStorageUsage(db), quota);
}
