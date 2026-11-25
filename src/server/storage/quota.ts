import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { FileStatus } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import { applicationDocumentFiles as files, storageQuotaState } from "@/server/db/schema";
import type { StorageQuota } from "@/server/env";

/**
 * Depolama kotası (PHASE 08 §21, D-101). Kullanım = storage'da olabilecek her dosya kaydının boyutu
 * (`blob_deleted_at IS NULL`): aktif + önceki versiyonlar + devam eden rezervasyonlar + temizlik bekleyen
 * başarısız/yarım yüklemeler + sağlayıcı mutabakatında bulunan kayıt dışı kullanım (`untracked_bytes`).
 * Yalnızca ACTIVE toplamı kullanılmaz. Görüntüleme yalnızca DB'den (sayfa açılışında sağlayıcı çağrısı yok).
 */

type Reader = Pick<Database, "select">;

const STATUS_GROUP: Record<FileStatus, keyof Omit<StorageUsage, "untracked" | "total">> = {
  ACTIVE: "active",
  SUPERSEDED: "history",
  REMOVED: "history",
  UPLOAD_PENDING: "pending",
  VALIDATING: "pending",
  REJECTED: "cleanup",
  EXPIRED: "cleanup",
};

export type StorageUsage = {
  readonly active: number;
  readonly history: number;
  readonly pending: number;
  readonly cleanup: number;
  readonly untracked: number;
  readonly total: number;
};

export type StorageCapacity = StorageUsage & {
  readonly maxTotalBytes: number;
  readonly warningBytes: number;
  readonly remainingBytes: number;
  readonly state: "ok" | "warning" | "full";
  readonly reconciledAt: string | null;
};

export async function readStorageUsage(
  db: Reader,
): Promise<StorageUsage & { reconciledAt: Date | null }> {
  const rows = await db
    .select({
      status: files.status,
      bytes: sql<string>`coalesce(sum(${files.sizeBytes}), 0)::text`,
    })
    .from(files)
    .where(and(isNull(files.blobDeletedAt), isNotNull(files.sizeBytes)))
    .groupBy(files.status);
  const [state] = await db
    .select({
      untracked: storageQuotaState.untrackedBytes,
      reconciledAt: storageQuotaState.reconciledAt,
    })
    .from(storageQuotaState)
    .where(eq(storageQuotaState.id, 1));
  // Kota durumu satırı yoksa hesap güvenilir değildir → çağıran taraf yüklemeyi durdurur.
  if (state === undefined) throw new Error("storage_quota_state satırı yok");
  const usage = { active: 0, history: 0, pending: 0, cleanup: 0 };
  for (const row of rows) usage[STATUS_GROUP[row.status]] += Number(row.bytes);
  const total = usage.active + usage.history + usage.pending + usage.cleanup + state.untracked;
  return { ...usage, untracked: state.untracked, total, reconciledAt: state.reconciledAt };
}

export function capacityOf(
  usage: StorageUsage & { reconciledAt: Date | null },
  quota: StorageQuota,
): StorageCapacity {
  return {
    ...usage,
    maxTotalBytes: quota.maxTotalBytes,
    warningBytes: quota.warningBytes,
    remainingBytes: Math.max(0, quota.maxTotalBytes - usage.total),
    state:
      usage.total >= quota.maxTotalBytes
        ? "full"
        : usage.total >= quota.warningBytes
          ? "warning"
          : "ok",
    reconciledAt: usage.reconciledAt?.toISOString() ?? null,
  };
}

/** Yeni yükleme sığar mı? Sınır dahil: toplam tam üst sınıra eşit olabilir, aşamaz. */
export function fitsQuota(totalBytes: number, newBytes: number, quota: StorageQuota): boolean {
  return totalBytes + newBytes <= quota.maxTotalBytes;
}

/** Global kota kilidi (transaction içinde, dosya kilitlerinden SONRA alınır). */
export async function lockStorageQuota(tx: Pick<Database, "select">): Promise<void> {
  const [row] = await tx
    .select({ id: storageQuotaState.id })
    .from(storageQuotaState)
    .where(eq(storageQuotaState.id, 1))
    .for("update");
  if (row === undefined) throw new Error("storage_quota_state satırı yok");
}
