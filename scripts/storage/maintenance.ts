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
 * - PHASE 10 (D-120): kalıcı silme sürecindeki başvuruların nesnelerine temizlik dokunmaz (silme iş akışına
 *   aittir); başarılı ACTIVE/SUPERSEDED/REMOVED versiyonların fiziksel silinmesi yalnızca o iş akışındadır.
 * - PHASE 10.1 (D-121…D-123, D-127): başarısız/yarım kaydın `blob_deleted_at` alanı yalnızca kaydın TÜM
 *   yazım girişimleri, doğrulama listelemesi başlamadan ÖNCE çözülmüşse yazılır. Belirsiz girişim yalnızca
 *   anahtarda gözlenen sahiplenilmemiş versiyonla çözülür; süre dolması/boş liste çözüm sayılmaz. Süresi
 *   dolmuş rezervasyonun başlamamış girişimi kalıcı olarak çitlenir (bir daha PUT başlatılamaz). Yazım
 *   takibi olmayan eski kayıtlar sonlandırılmaz (kotada kalır). Böylece kota erken serbest bırakılmaz.
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

/**
 * Teknik temizliğin kapsamı (PHASE 10, D-120): kalıcı silme sürecindeki başvuruların dosyaları HARİÇ.
 * O nesneler yalnızca silme iş akışına (kira, envanter, doğrulama) aittir; UI ve CLI aynı nesneler
 * üzerinde çakışan mutasyon üretmez. Mutabakat (salt okunur sayım) tüm kayıtları kullanmaya devam eder.
 */
async function cleanupFileRows(db: Queryable): Promise<FileRow[]> {
  const { rows } = await db.query<FileRow>(
    `SELECT f.id, f.application_id, f.status, f.blob_pathname AS key,
            f.storage_version_id AS version_id, f.size_bytes
       FROM application_document_files f
       JOIN applications a ON a.id = f.application_id
      WHERE f.blob_deleted_at IS NULL AND a.deletion_requested_at IS NULL`,
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
  /** Envanter alınırken muhasebe nesli değişti (silme/sonlandırma/başka mutabakat) → uygulanmadı (D-130). */
  readonly stale: boolean;
};

/**
 * Sağlayıcı ↔ DB mutabakatı. Kayıt dışı fiziksel kullanım (`untracked_bytes`) = DB'deki canlı bir kayda
 * eşlenemeyen tüm versiyonların boyutu (sahipsiz, önek dışı, yinelenen). `apply` → kota durumuna yazılır;
 * kota hesabı bilinmeyen kullanımı yok saymaz. Liste eksikse değer yazılmaz.
 */
export async function reconcileStorage(
  db: Queryable,
  storage: StorageAdapter,
  options: {
    readonly apply: boolean;
    /** Kontrollü test zamanlayıcısı (envanter alındıktan sonra); production'da tanımsız. */
    readonly afterListing?: () => Promise<void>;
  },
): Promise<ReconcileReport> {
  // D-130: nesil envanterden ÖNCE okunur; uygulama yalnızca nesil değişmemişse yapılır.
  const epochRow = await db.query<{ epoch: string }>(
    "SELECT accounting_epoch::text AS epoch FROM storage_quota_state WHERE id = 1",
  );
  const epoch = epochRow.rows[0]?.epoch;
  if (epoch === undefined) throw new Error("storage_quota_state satırı yok");
  const listing = await storage.listObjectVersions("", MAX_LIST_PAGES);
  if (options.afterListing) await options.afterListing();
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

  let applied = false;
  let stale = false;
  if (options.apply && !listing.truncated) {
    // Koşullu tek ifade (kısa satır kilidi; ağ çağrısı yok): bayat envanter veya eski eşzamanlı mutabakat
    // yeni değerin üzerine yazamaz. Uygulama neslin kendisini de artırır.
    const updated = await db.query(
      `UPDATE storage_quota_state
          SET untracked_bytes = $1, reconciled_at = now(), accounting_epoch = accounting_epoch + 1
        WHERE id = 1 AND accounting_epoch = $2::bigint RETURNING id`,
      [untrackedBytes, epoch],
    );
    applied = updated.rows.length === 1;
    stale = !applied;
  }
  if (applied) {
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
    stale,
  };
}

export type CleanupReport = {
  readonly stalePendingExpired: number;
  readonly reservationsFenced: number;
  readonly attemptsResolved: number;
  readonly unresolvedWrites: number;
  readonly legacyUnverified: number;
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
    `SELECT f.id FROM application_document_files f JOIN applications a ON a.id = f.application_id
      WHERE f.status = 'UPLOAD_PENDING' AND f.upload_expires_at < now() AND a.deletion_requested_at IS NULL`,
  );
  let stalePendingExpired = 0;
  let reservationsFenced = 0;
  if (options.apply && stale.rows.length > 0) {
    // Çit önce: süresi dolmuş rezervasyonun başlamamış girişimi bir daha başlatılamaz (D-122).
    const fenced = await db.query<{ id: string }>(
      `UPDATE storage_write_attempts w
          SET state = 'FENCED', outcome = 'RESERVATION_EXPIRED', settled_at = now()
         FROM application_document_files f, applications a
        WHERE w.file_id = f.id AND a.id = f.application_id AND a.deletion_requested_at IS NULL
          AND w.state = 'ADMITTED' AND f.status = 'UPLOAD_PENDING' AND f.upload_expires_at < now()
        RETURNING w.id`,
    );
    reservationsFenced = fenced.rows.length;
    const updated = await db.query<{ id: string }>(
      `UPDATE application_document_files f SET status = 'EXPIRED', ended_at = now()
         FROM applications a
        WHERE a.id = f.application_id AND a.deletion_requested_at IS NULL
          AND f.status = 'UPLOAD_PENDING' AND f.upload_expires_at < now() RETURNING f.id`,
    );
    stalePendingExpired = updated.rows.length;
  }

  const listStartedAt = (await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!
    .now;
  const listing = await storage.listObjectVersions("applications/", MAX_LIST_PAGES);
  const versionsByKey = new Map<string, { versionId: string }[]>();
  for (const version of listing.versions) {
    const list = versionsByKey.get(version.key) ?? [];
    list.push({ versionId: version.versionId });
    versionsByKey.set(version.key, list);
  }
  const rows = await cleanupFileRows(db);
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
  let attemptsResolved = 0;
  let unresolvedWrites = 0;
  let legacyUnverified = 0;
  let failedRowsFinalized = 0;
  let duplicateVersionsDeleted = 0;
  let deleteFailures = 0;
  const applied = options.apply && !listing.truncated;

  if (applied) {
    for (const row of failedRows) {
      try {
        // Gözlem ile çözüm: anahtarda sahiplenilmemiş her versiyon, çözülmemiş bir girişime atanır.
        const rowAttempts = await db.query<{
          id: string;
          state: string;
          version_id: string | null;
        }>(
          `SELECT id, state, version_id FROM storage_write_attempts
            WHERE file_id = $1 ORDER BY admitted_at, id`,
          [row.id],
        );
        const claimed = new Set(
          rowAttempts.rows.map((a) => a.version_id).filter((v): v is string => v !== null),
        );
        const unclaimed = (versionsByKey.get(row.key) ?? []).filter(
          (v) => !claimed.has(v.versionId),
        );
        for (const attempt of rowAttempts.rows) {
          if (attempt.state !== "IN_PROGRESS" && attempt.state !== "UNKNOWN") continue;
          const version = unclaimed.shift();
          if (version === undefined) break;
          const resolved = await db.query(
            `UPDATE storage_write_attempts
                SET state = 'CONFIRMED', outcome = 'OBSERVED', version_id = $2, settled_at = now()
              WHERE id = $1 AND state IN ('IN_PROGRESS', 'UNKNOWN') RETURNING id`,
            [attempt.id, version.versionId],
          );
          attemptsResolved += resolved.rows.length;
        }
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
        if (rowAttempts.rows.length === 0) {
          legacyUnverified += 1; // yazım takibi yok → sonlandırılmaz (D-126)
          continue;
        }
        // Tüm girişimler listeleme başlamadan önce çözülmüş olmalı; aksi halde kayıt kotada kalır.
        const finalized = await db.query(
          `UPDATE application_document_files f SET blob_deleted_at = now()
            WHERE f.id = $1 AND f.status IN ('EXPIRED', 'REJECTED') AND f.blob_deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM storage_write_attempts w
                 WHERE w.file_id = f.id
                   AND (w.state NOT IN ('CONFIRMED', 'FAILED', 'FENCED') OR w.settled_at >= $2))
            RETURNING f.id`,
          [row.id, listStartedAt],
        );
        if (finalized.rows.length === 0) unresolvedWrites += 1;
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
    // D-130: fiziksel silme/kayıt sonlandırma devam eden mutabakatı bayatlatır.
    if (failedObjectsDeleted + failedRowsFinalized + duplicateVersionsDeleted > 0) {
      await db.query(
        "UPDATE storage_quota_state SET accounting_epoch = accounting_epoch + 1 WHERE id = 1",
      );
    }
    await db.query(
      `INSERT INTO audit_logs (action, actor_type, resource_type, metadata)
       VALUES ('TECHNICAL_CLEANUP_EXECUTED', 'SYSTEM', 'file', $1::jsonb)`,
      [
        JSON.stringify({
          counts: {
            stalePendingExpired,
            reservationsFenced,
            attemptsResolved,
            unresolvedWrites,
            legacyUnverified,
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
    reservationsFenced,
    attemptsResolved,
    unresolvedWrites,
    legacyUnverified,
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
