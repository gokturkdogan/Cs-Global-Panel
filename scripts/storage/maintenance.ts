/**
 * Depolama bakımı çekirdeği (PHASE 08, D-105) — `pnpm storage:reconcile` ve `pnpm storage:cleanup`.
 * Node ile doğrudan çalışır (göreli import); integration testleri de aynı fonksiyonları kullanır.
 *
 * Güvenlik kuralları:
 * - Varsayılan dry-run; değişiklik yalnızca `apply: true` ile.
 * - Bucket genelinde toplu silme (purge) YOK. Yalnızca `applications/` önekindeki, DB'de kaydı bulunan
 *   nesneler için versiyona özgü fiziksel silme:
 *     a) `EXPIRED`/`REJECTED` (başarısız/yarım yükleme) kayıtlarının tüm fiziksel versiyonları;
 *     b) kayıtlı dosyaların (ACTIVE/SUPERSEDED/REMOVED) kayıtlı versiyon DIŞINDAKİ yinelenen versiyonları
 *        (yeniden deneme kaynaklı) — kayıtlı versiyon listede yoksa o anahtara dokunulmaz.
 * - ACTIVE/SUPERSEDED/REMOVED kayıtlı versiyonları ASLA silinmez (OD-06, BR-47).
 * - DB'de karşılığı olmayan (sahipliği doğrulanmamış) veya önek dışı nesneler yalnızca raporlanır.
 * - Liste sayfa sınırına takılırsa (eksik liste) hiçbir silme yapılmaz.
 * - Silme başarısızsa `blob_deleted_at` boş kalır → bir sonraki çalıştırma yeniden dener.
 * - Bu işlem müşteri verisi saklama/silme politikası DEĞİLDİR; başvuru silme ile karıştırılmaz.
 */
import type { StorageAdapter } from "../../src/server/storage/types.ts";

export type Queryable = {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

type FileRow = {
  id: string;
  application_id: string;
  status: string;
  key: string;
  version_id: string | null;
  size_bytes: number | null;
};

const VERSIONED = new Set(["ACTIVE", "SUPERSEDED", "REMOVED"]);
const FAILED = new Set(["EXPIRED", "REJECTED"]);
const MAX_LIST_PAGES = 50;

async function liveFileRows(db: Queryable): Promise<FileRow[]> {
  const { rows } = await db.query<FileRow>(
    `SELECT id, application_id, status, blob_pathname AS key, storage_version_id AS version_id, size_bytes
       FROM application_document_files WHERE blob_deleted_at IS NULL`,
  );
  return rows;
}

export type ReconcileReport = {
  readonly providerObjects: number;
  readonly providerBytes: number;
  readonly trackedBytes: number;
  readonly untrackedBytes: number;
  readonly orphanKeys: number;
  readonly unknownPrefixObjects: number;
  readonly duplicateVersions: number;
  readonly deleteMarkers: number;
  readonly missingRecordedObjects: number;
  readonly truncated: boolean;
  readonly applied: boolean;
};

/**
 * Sağlayıcı ↔ DB mutabakatı. Kayıt dışı fiziksel kullanım (`untracked_bytes`) = DB'deki canlı bir kayda
 * eşlenemeyen tüm versiyonların boyutu (sahipsiz, önek dışı, yinelenen). `apply` → kota durumuna yazılır;
 * kota hesabı bilinmeyen kullanımı yok saymaz. Liste eksikse değer yazılmaz.
 */
export async function reconcileStorage(
  db: Queryable,
  storage: StorageAdapter,
  options: { readonly apply: boolean },
): Promise<ReconcileReport> {
  const listing = await storage.listObjectVersions("", MAX_LIST_PAGES);
  const rows = await liveFileRows(db);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const firstUnrecordedMatched = new Set<string>();
  const recordedSeen = new Set<string>();

  let providerBytes = 0;
  let trackedBytes = 0;
  let untrackedBytes = 0;
  let orphanKeys = 0;
  let unknownPrefixObjects = 0;
  let duplicateVersions = 0;
  let deleteMarkers = 0;
  const orphanSet = new Set<string>();

  for (const version of listing.versions) {
    if (version.isDeleteMarker) {
      deleteMarkers += 1;
      continue;
    }
    providerBytes += version.sizeBytes;
    const row = byKey.get(version.key);
    if (row === undefined) {
      untrackedBytes += version.sizeBytes;
      if (version.key.startsWith("applications/")) orphanSet.add(version.key);
      else if (!version.key.startsWith("_verification/")) unknownPrefixObjects += 1;
      continue;
    }
    const tracked =
      row.version_id !== null
        ? row.version_id === version.versionId
        : !firstUnrecordedMatched.has(row.key) && (firstUnrecordedMatched.add(row.key), true);
    if (tracked) {
      trackedBytes += version.sizeBytes;
      if (row.version_id !== null) recordedSeen.add(row.key);
    } else {
      duplicateVersions += 1;
      untrackedBytes += version.sizeBytes;
    }
  }
  orphanKeys = orphanSet.size;
  const missingRecordedObjects = rows.filter(
    (row) => VERSIONED.has(row.status) && row.version_id !== null && !recordedSeen.has(row.key),
  ).length;

  const applied = options.apply && !listing.truncated;
  if (applied) {
    await db.query(
      `UPDATE storage_quota_state SET untracked_bytes = $1, reconciled_at = now() WHERE id = 1`,
      [untrackedBytes],
    );
    await db.query(
      `INSERT INTO audit_logs (action, actor_type, resource_type, metadata)
       VALUES ('STORAGE_RECONCILED', 'SYSTEM', 'file', $1::jsonb)`,
      [
        JSON.stringify({
          counts: {
            providerObjects: listing.versions.length,
            orphanKeys,
            duplicateVersions,
            missingRecordedObjects,
          },
        }),
      ],
    );
  }
  return {
    providerObjects: listing.versions.length,
    providerBytes,
    trackedBytes,
    untrackedBytes,
    orphanKeys,
    unknownPrefixObjects,
    duplicateVersions,
    deleteMarkers,
    missingRecordedObjects,
    truncated: listing.truncated,
    applied,
  };
}

export type CleanupReport = {
  readonly stalePendingExpired: number;
  readonly failedObjectsDeleted: number;
  readonly failedRowsFinalized: number;
  readonly duplicateVersionsDeleted: number;
  readonly orphanKeysReported: number;
  readonly deleteFailures: number;
  readonly truncated: boolean;
  readonly planned: {
    readonly stalePending: number;
    readonly failedKeys: number;
    readonly duplicateVersions: number;
  };
  readonly applied: boolean;
};

export async function cleanupStorage(
  db: Queryable,
  storage: StorageAdapter,
  options: { readonly apply: boolean },
): Promise<CleanupReport> {
  // a) Süresi dolmuş yarım yüklemeler → EXPIRED (atomik koşullu güncelleme; aktivasyonla yarışta güvenli).
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM application_document_files
      WHERE status = 'UPLOAD_PENDING' AND upload_expires_at < now()`,
  );
  let stalePendingExpired = 0;
  if (options.apply && stale.rows.length > 0) {
    const updated = await db.query<{ id: string }>(
      `UPDATE application_document_files SET status = 'EXPIRED', ended_at = now()
        WHERE status = 'UPLOAD_PENDING' AND upload_expires_at < now() RETURNING id`,
    );
    stalePendingExpired = updated.rows.length;
  }

  const listing = await storage.listObjectVersions("applications/", MAX_LIST_PAGES);
  const versionsByKey = new Map<string, { versionId: string }[]>();
  for (const version of listing.versions) {
    const list = versionsByKey.get(version.key) ?? [];
    list.push({ versionId: version.versionId });
    versionsByKey.set(version.key, list);
  }
  const rows = await liveFileRows(db);
  const failedRows = rows.filter((row) => FAILED.has(row.status));
  const knownKeys = new Set(rows.map((row) => row.key));
  const allKeys = await db.query<{ key: string }>(
    `SELECT blob_pathname AS key FROM application_document_files`,
  );
  const everKnown = new Set(allKeys.rows.map((row) => row.key));
  const orphanKeysReported = [...versionsByKey.keys()].filter((key) => !everKnown.has(key)).length;

  const duplicates: { key: string; versionId: string }[] = [];
  for (const row of rows) {
    if (!VERSIONED.has(row.status) || row.version_id === null) continue;
    const versions = versionsByKey.get(row.key) ?? [];
    if (!versions.some((v) => v.versionId === row.version_id)) continue; // kayıtlı versiyon yok → dokunma
    for (const v of versions)
      if (v.versionId !== row.version_id) duplicates.push({ key: row.key, versionId: v.versionId });
  }

  const planned = {
    stalePending: stale.rows.length,
    failedKeys: failedRows.length,
    duplicateVersions: duplicates.length,
  };
  let failedObjectsDeleted = 0;
  let failedRowsFinalized = 0;
  let duplicateVersionsDeleted = 0;
  let deleteFailures = 0;
  const applied = options.apply && !listing.truncated;

  if (applied) {
    for (const row of failedRows) {
      try {
        for (const v of versionsByKey.get(row.key) ?? []) {
          await storage.deleteObjectVersion(row.key, v.versionId);
          failedObjectsDeleted += 1;
        }
        // Silindiği doğrulanmadan kayıt sonlandırılmaz.
        const remaining = await storage.listObjectVersions(row.key, 2);
        if (remaining.truncated || remaining.versions.some((v) => v.key === row.key)) {
          deleteFailures += 1;
          continue;
        }
        const finalized = await db.query(
          `UPDATE application_document_files SET blob_deleted_at = now()
            WHERE id = $1 AND status IN ('EXPIRED', 'REJECTED') AND blob_deleted_at IS NULL RETURNING id`,
          [row.id],
        );
        failedRowsFinalized += finalized.rows.length;
      } catch {
        deleteFailures += 1;
      }
    }
    for (const duplicate of duplicates) {
      if (!knownKeys.has(duplicate.key)) continue;
      try {
        await storage.deleteObjectVersion(duplicate.key, duplicate.versionId);
        duplicateVersionsDeleted += 1;
      } catch {
        deleteFailures += 1;
      }
    }
    await db.query(
      `INSERT INTO audit_logs (action, actor_type, resource_type, metadata)
       VALUES ('TECHNICAL_CLEANUP_EXECUTED', 'SYSTEM', 'file', $1::jsonb)`,
      [
        JSON.stringify({
          counts: {
            stalePendingExpired,
            failedObjectsDeleted,
            failedRowsFinalized,
            duplicateVersionsDeleted,
            deleteFailures,
            orphanKeysReported,
          },
        }),
      ],
    );
  }

  return {
    stalePendingExpired,
    failedObjectsDeleted,
    failedRowsFinalized,
    duplicateVersionsDeleted,
    orphanKeysReported,
    deleteFailures,
    truncated: listing.truncated,
    planned,
    applied,
  };
}
