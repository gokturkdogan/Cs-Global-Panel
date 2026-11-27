import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  DELETION_BATCH_SIZE,
  DELETION_LEASE_SECONDS,
  DELETION_LIST_MAX_PAGES,
} from "@/config/constants";
import { MANUAL_DELETION_ERRORS, type DeletionErrorCode } from "@/config/statuses";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { CONCURRENCY_ERROR_CODES, pgErrorCode } from "@/server/db/errors";
import {
  applicationAccessTokens as tokens,
  applicationDeletionObjects as objects,
  applicationDeletions as deletions,
  applicationDocumentFiles as files,
  applications,
  auditLogs,
  storageWriteAttempts as attempts,
} from "@/server/db/schema";
import { isStorageError } from "@/server/storage/errors";
import { bumpAccountingEpoch, lockStorageQuota } from "@/server/storage/quota";
import type { ObjectVersion, StorageAdapter } from "@/server/storage/types";

/**
 * Kalıcı başvuru silme (PHASE 10 — D-116, D-117; BR-150…BR-155, OD-06, OD-24; D-102 koşulu).
 *
 * PostgreSQL ile Backblaze B2 arasında dağıtık transaction yoktur. Akış bu nedenle kalıcı durum kaydı
 * (`application_deletions` + `application_deletion_objects`) üzerinden, sınırlı ve yeniden sürdürülebilir
 * adımlarla ilerler; ilerleme süreç belleğinde/tarayıcıda tutulmaz:
 *
 *  1. Talep (kısa TX): başvuru `FOR UPDATE`, `expectedVersion`, başvuru numarası onayı (sunucuda), gerekçe →
 *     `deletion_requested_at` (müşteri erişimi + tüm iş akışı/yükleme/bağlantı mutasyonları anında kapanır),
 *     aktif bağlantı iptali (`APPLICATION_DELETION`), işlem kaydı, audit `APPLICATION_DELETION_REQUESTED`.
 *     Tekrar talep (iki personel aynı anda) → mevcut tek işlem döner, ikinci audit yazılmaz.
 *  2. Bekleme kapısı (`settle_after`): talepten önce rezerve edilmiş yüklemelerin storage yazımlarının
 *     sonuçlanması beklenir (rezervasyon süresi + pay). Bu sürede storage çağrısı yapılmaz.
 *  3. Adım (kira altında; TX DIŞINDA ağ): başvuru öneki (`applications/{id}/`, sondaki ayraçla) listelenir
 *     (tüm sayfalar, sınırlı) → her versiyonun sahipliği DB dosya kaydıyla doğrulanır (bilinmeyen/başka
 *     kayda ait nesne → hiçbir şey silinmeden durur) → envantere yazılır → en fazla `DELETION_BATCH_SIZE`
 *     versiyona özgü silme (sıralı) → yeniden listeleme. `DELETED` yalnızca listelemede YOKLUĞU görülen
 *     versiyonlara yazılır; silme yanıtı veya "bulunamadı" tek başına kanıt değildir.
 *  4. Sonlandırma (kısa TX): önek tamamen boş ve liste eksiksizse — başvuru + işlem kaydı kilidi, kalan
 *     yükleme yok, dosya kayıtları `blob_deleted_at` (kota yalnızca şimdi düşer; tek kaynak metadata
 *     olduğundan iki kez düşemez), kota kilidi, başvuru satırı silinir (CASCADE; DB trigger'ı doğrulanmamış
 *     silmeyi reddeder — D-117), audit `APPLICATION_DELETED`. Audit hatası → tamamı geri alınır.
 *
 * Hata/kesinti: işlem kaydı ve envanter kalır; başvuru erişilemez kalır; personel "Silme İşlemini Sürdür"
 * ile güvenle devam eder. Arka plan işi/kuyruk/cron yoktur (sıfır maliyet).
 */

const notFound = () => fail({ code: "NOT_FOUND", message: messages.common.notFound });

type Staff = { readonly userId: string };

// ---------------------------------------------------------------- 1. Talep

export type DeletionRequestInput = {
  readonly applicationId: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly confirmationNumber: string;
};

export async function requestApplicationDeletion(
  db: Database,
  staff: Staff,
  input: DeletionRequestInput,
): Promise<ActionResult<{ readonly alreadyRequested: boolean }>> {
  try {
    return await db.transaction(async (tx) => {
      const [app] = await tx
        .select({
          number: applications.applicationNumber,
          version: applications.version,
          deletionRequestedAt: applications.deletionRequestedAt,
        })
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .for("update");
      if (app === undefined) return notFound();
      // İdempotent: aynı başvuru için tek mantıksal silme işlemi (Senaryo H).
      if (app.deletionRequestedAt !== null) return ok({ alreadyRequested: true });
      if (app.version !== input.expectedVersion) {
        return fail({ code: "CONFLICT", message: messages.workflow.stateChanged });
      }
      // İstemcinin "onaylandı" bayrağına güvenilmez: numara sunucuda karşılaştırılır (BR-151).
      if (input.confirmationNumber !== app.number) {
        return fail({
          code: "VALIDATION",
          message: messages.deletion.confirmMismatch,
          fieldErrors: { confirmationNumber: messages.deletion.confirmMismatch },
        });
      }

      // Talepten önce rezerve edilmiş yüklemeler: başvuru kilidi altında yeni rezervasyon oluşamaz
      // (rezervasyon başvuruyu kilitleyip silme işaretini kontrol eder) → en geç bitiş tam bilinir.
      const [versioned] = await tx
        .select({ value: count() })
        .from(files)
        .where(and(eq(files.applicationId, input.applicationId), isNotNull(files.versionNumber)));

      await tx
        .update(applications)
        .set({
          deletionRequestedAt: sql`now()`,
          deletionRequestedByUserId: staff.userId,
          updatedByUserId: staff.userId,
          version: sql`${applications.version} + 1`,
        })
        .where(eq(applications.id, input.applicationId));
      await tx.insert(deletions).values({
        applicationId: input.applicationId,
        reason: input.reason,
        requestedByUserId: staff.userId,
        // D-124: zaman artık güvenlik koşulu değildir (bilgi amaçlı talep zamanı).
        settleAfter: sql`now()`,
      });
      // D-122 yazım çiti: henüz başlamamış (ADMITTED) girişimler kalıcı olarak çitlenir → PUT gönderilemez.
      // Başlamış (IN_PROGRESS) girişimler takip edilir; sonuçları kanıtlanmadan sonlandırma yapılmaz.
      await tx
        .update(attempts)
        .set({ state: "FENCED", outcome: "FENCED_BY_DELETION", settledAt: sql`now()` })
        .where(
          and(eq(attempts.applicationId, input.applicationId), eq(attempts.state, "ADMITTED")),
        );
      // BR-104/BR-152: bağlantı iptali → tüm müşteri oturumları anında geçersiz (her istekte kontrol).
      await tx
        .update(tokens)
        .set({
          revokedAt: sql`now()`,
          revokeReason: "APPLICATION_DELETION",
          revokedByUserId: staff.userId,
        })
        .where(and(eq(tokens.applicationId, input.applicationId), isNull(tokens.revokedAt)));
      await writeAuditLog(tx, {
        action: "APPLICATION_DELETION_REQUESTED",
        actorType: "USER",
        actorUserId: staff.userId,
        resourceType: "application",
        resourceId: input.applicationId,
        applicationId: input.applicationId,
        // BR-154: yalnızca sayı; gerekçe metni, ad, telefon, e-posta, dosya adı yazılmaz.
        metadata: { fileCount: versioned?.value ?? 0 },
      });
      return ok({ alreadyRequested: false });
    });
  } catch (error) {
    const code = pgErrorCode(error);
    if (code !== undefined && CONCURRENCY_ERROR_CODES.has(code)) {
      return fail({ code: "CONFLICT", message: messages.workflow.stateChanged });
    }
    console.error("[deletion] Silme talebi kaydedilemedi", { code: code ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.deletion.unavailable });
  }
}

// ---------------------------------------------------------------- 2–4. Adım

export type DeletionStepOutcome =
  | { readonly state: "DELETED" }
  | { readonly state: "IN_PROGRESS"; readonly error: DeletionErrorCode | null }
  | { readonly state: "BLOCKED"; readonly error: DeletionErrorCode };

export type DeletionDeps = {
  readonly db: Database;
  readonly storage: () => Promise<StorageAdapter>;
};

/** Tek adımda en fazla bu kadar listele/sil/doğrula turu (istek süresi sınırlı kalır). */
const MAX_ROUNDS = 4;

class LeaseLost extends Error {}

function storageErrorCode(error: unknown): DeletionErrorCode {
  if (isStorageError(error, "NOT_CONFIGURED")) return "STORAGE_NOT_CONFIGURED";
  if (isStorageError(error, "FORBIDDEN")) return "STORAGE_FORBIDDEN";
  if (isStorageError(error, "LIMIT")) return "STORAGE_LIMIT";
  // UNAVAILABLE / AMBIGUOUS / INTEGRITY / NOT_FOUND (listelemede) → nesne YOK sayılmaz; yeniden denenir.
  return "STORAGE_UNAVAILABLE";
}

const objectRef = (key: string, versionId: string) => `${key}\n${versionId}`;

export function applicationPrefix(applicationId: string): string {
  return `applications/${applicationId}/`;
}

/**
 * Bir sonraki sınırlı silme adımını çalıştırır. Aynı anda tek adım (kira); iki personel/sekme aynı anda
 * sürdürürse biri `CONFLICT` (meşgul) alır. Tamamlanmış silmede tekrar çağrı yan etkisiz `DELETED` döner.
 */
export async function processApplicationDeletion(
  deps: DeletionDeps,
  staff: Staff,
  input: { readonly applicationId: string },
): Promise<ActionResult<DeletionStepOutcome>> {
  const { db } = deps;
  const leaseId = randomUUID();
  let lastError: DeletionErrorCode | null;
  try {
    const rows = await db.execute<{ last_error: DeletionErrorCode | null }>(sql`
      UPDATE application_deletions d
         SET lease_id = ${leaseId},
             lease_expires_at = now() + make_interval(secs => ${DELETION_LEASE_SECONDS}),
             attempt_count = d.attempt_count + 1,
             last_attempt_at = now()
        FROM applications a
       WHERE d.application_id = ${input.applicationId}
         AND a.id = d.application_id
         AND a.deletion_requested_at IS NOT NULL
         AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= now())
      RETURNING d.last_error`);
    const row = rows.rows[0];
    if (row === undefined) return await whyNoLease(db, input.applicationId);
    lastError = row.last_error;
  } catch (error) {
    console.error("[deletion] Kira alınamadı", { code: pgErrorCode(error) ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.deletion.unavailable });
  }

  try {
    const outcome = await runStep(deps, staff, input.applicationId, leaseId, lastError);
    return ok(outcome);
  } catch (error) {
    if (error instanceof LeaseLost) {
      return fail({ code: "CONFLICT", message: messages.deletion.busy });
    }
    console.error("[deletion] Silme adımı başarısız", { code: pgErrorCode(error) ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.deletion.unavailable });
  } finally {
    await db
      .update(deletions)
      .set({ leaseId: null, leaseExpiresAt: null })
      .where(and(eq(deletions.applicationId, input.applicationId), eq(deletions.leaseId, leaseId)))
      .catch(() => undefined); // süre dolunca kendiliğinden serbest kalır
  }
}

/** Kira alınamadı: işlem başka istekte mi, tamamlanmış mı, hiç yok mu? */
async function whyNoLease(
  db: Database,
  applicationId: string,
): Promise<ActionResult<DeletionStepOutcome>> {
  const [deletion] = await db
    .select({ id: deletions.applicationId })
    .from(deletions)
    .where(eq(deletions.applicationId, applicationId))
    .limit(1);
  if (deletion !== undefined) return fail({ code: "CONFLICT", message: messages.deletion.busy });
  const [done] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.applicationId, applicationId), eq(auditLogs.action, "APPLICATION_DELETED")),
    )
    .limit(1);
  return done !== undefined ? ok({ state: "DELETED" }) : notFound();
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Kira hâlâ bu isteğe ait mi (kilit altında) — değilse yazma yapılmaz. Kira süresini uzatır. */
async function holdLease(tx: Tx, applicationId: string, leaseId: string) {
  const renewed = await tx
    .update(deletions)
    .set({ leaseExpiresAt: sql`now() + make_interval(secs => ${DELETION_LEASE_SECONDS})` })
    .where(and(eq(deletions.applicationId, applicationId), eq(deletions.leaseId, leaseId)))
    .returning({ id: deletions.applicationId });
  if (renewed.length === 0) throw new LeaseLost();
}

async function recordError(
  db: Database,
  staff: Staff,
  applicationId: string,
  leaseId: string,
  previous: DeletionErrorCode | null,
  error: DeletionErrorCode,
): Promise<void> {
  await db.transaction(async (tx) => {
    await holdLease(tx, applicationId, leaseId);
    await tx
      .update(deletions)
      .set({ lastError: error })
      .where(eq(deletions.applicationId, applicationId));
    // Yalnızca hata kategorisi değişince audit (her yeniden denemede gürültü yok).
    if (previous !== error) {
      const [pending] = await tx
        .select({ value: count() })
        .from(objects)
        .where(and(eq(objects.applicationId, applicationId), eq(objects.state, "PENDING")));
      await writeAuditLog(tx, {
        action: "APPLICATION_DELETION_FAILED",
        actorType: "USER",
        actorUserId: staff.userId,
        resourceType: "application",
        resourceId: applicationId,
        applicationId,
        metadata: { reason: error, count: pending?.value ?? 0 },
      });
    }
  });
}

type Listing = {
  readonly versions: readonly ObjectVersion[];
  readonly truncated: boolean;
  /** Listeleme çağrısından ÖNCE okunan DB saati (D-124: girişimler bundan önce çözülmüş olmalı). */
  readonly startedAt: Date;
};

async function dbClock(db: Database): Promise<Date> {
  const result = await db.execute<{ now: Date }>(sql`SELECT clock_timestamp() AS now`);
  return new Date(result.rows[0]!.now);
}

async function runStep(
  deps: DeletionDeps,
  staff: Staff,
  applicationId: string,
  leaseId: string,
  lastError: DeletionErrorCode | null,
): Promise<DeletionStepOutcome> {
  const { db } = deps;
  let storage: StorageAdapter;
  try {
    storage = await deps.storage();
  } catch (error) {
    const code = storageErrorCode(error);
    await recordError(db, staff, applicationId, leaseId, lastError, code);
    return { state: "BLOCKED", error: code };
  }

  const prefix = applicationPrefix(applicationId);
  let previousError = lastError;
  const stop = async (code: DeletionErrorCode): Promise<DeletionStepOutcome> => {
    await recordError(db, staff, applicationId, leaseId, previousError, code);
    previousError = code;
    return MANUAL_DELETION_ERRORS.includes(code)
      ? { state: "BLOCKED", error: code }
      : { state: "IN_PROGRESS", error: code };
  };

  const list = async (): Promise<Listing | DeletionErrorCode> => {
    const startedAt = await dbClock(db);
    try {
      const result = await storage.listObjectVersions(prefix, DELETION_LIST_MAX_PAGES);
      return { ...result, startedAt };
    } catch (error) {
      return storageErrorCode(error);
    }
  };

  let listing = await list();
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (typeof listing === "string") return stop(listing);
    const owned = await recordInventory(db, applicationId, leaseId, listing);
    if (owned !== null) return stop(owned);
    // Belirsiz girişimler yalnızca gözlenen (sahiplenilmemiş) versiyonla çözülür (D-123).
    await resolveAttemptsByObservation(db, applicationId, leaseId);

    if (listing.versions.length === 0 && !listing.truncated) {
      // Onaylanmış her versiyonun yokluğu versiyona özgü HEAD ile ayrıca doğrulanır (listelemeye ek kanıt).
      const found = await verifyConfirmedVersionsAbsent(db, storage, applicationId, leaseId);
      if (typeof found === "string") return stop(found);
      if (found > 0) {
        listing = await list();
        continue;
      }
      const done = await finalize(db, staff, applicationId, leaseId, listing.startedAt);
      if (done === "DELETED") return { state: "DELETED" };
      if (done === "RELIST") {
        // Bir girişim listeleme başladıktan sonra çözüldü → yeni eksiksiz listeleme gerekir.
        listing = await list();
        continue;
      }
      return stop(done);
    }

    // Sıralı, sınırlı, versiyona özgü fiziksel silme (yalnızca sahipliği doğrulanmış envanter).
    let deleteError: DeletionErrorCode | null = null;
    const batch = listing.versions.slice(0, DELETION_BATCH_SIZE);
    const attempted: ObjectVersion[] = [];
    for (const version of batch) {
      try {
        attempted.push(version);
        await storage.deleteObjectVersion(version.key, version.versionId);
      } catch (error) {
        deleteError = storageErrorCode(error);
        break;
      }
    }
    await markAttempts(db, applicationId, leaseId, attempted, deleteError);

    // Doğrulama listelemesi (bir sonraki turun envanteri). Silme yanıtı kaybolsa da sonuç buradan belirlenir.
    listing = await list();
    if (deleteError !== null) {
      if (typeof listing !== "string") {
        await recordInventory(db, applicationId, leaseId, listing);
        await resolveAttemptsByObservation(db, applicationId, leaseId);
      }
      return stop(deleteError);
    }
  }
  if (typeof listing === "string") return stop(listing);
  const owned = await recordInventory(db, applicationId, leaseId, listing);
  if (owned !== null) return stop(owned);
  await resolveAttemptsByObservation(db, applicationId, leaseId);
  await clearError(db, applicationId, leaseId);
  return { state: "IN_PROGRESS", error: null };
}

async function clearError(db: Database, applicationId: string, leaseId: string) {
  await db.transaction(async (tx) => {
    await holdLease(tx, applicationId, leaseId);
    await tx
      .update(deletions)
      .set({ lastError: null })
      .where(eq(deletions.applicationId, applicationId));
  });
}

/**
 * Gözlem ile çözüm (D-123). Her girişim en fazla bir fiziksel versiyon üretebilir (tek girişim, girişime
 * özgü anahtar). Bir anahtarda gözlenen (envantere girmiş, silme işareti olmayan) ve hiçbir girişimce
 * sahiplenilmemiş her versiyon, o anahtarın çözülmemiş bir girişimine atanır → `CONFIRMED (OBSERVED)`.
 * Versiyon sayısı çözülmemiş girişim sayısından azsa kalanlar çözülmeden kalır (Test G).
 * Silme sürecinde `ADMITTED` kalmışsa (savunma) çitlenir.
 */
async function resolveAttemptsByObservation(db: Database, applicationId: string, leaseId: string) {
  await db.transaction(async (tx) => {
    await holdLease(tx, applicationId, leaseId);
    await tx
      .update(attempts)
      .set({ state: "FENCED", outcome: "FENCED_BY_DELETION", settledAt: sql`now()` })
      .where(and(eq(attempts.applicationId, applicationId), eq(attempts.state, "ADMITTED")));
    const open = await tx
      .select({ id: attempts.id, key: attempts.objectKey })
      .from(attempts)
      .where(
        and(
          eq(attempts.applicationId, applicationId),
          inArray(attempts.state, ["IN_PROGRESS", "UNKNOWN"]),
        ),
      )
      .orderBy(asc(attempts.admittedAt), asc(attempts.id))
      .for("update");
    if (open.length > 0) await claimObservedVersions(tx, applicationId, open);
    // Girişimi çözülmüş yarım yükleme kayıtları sonuçlandırılır (çözülmemişler UPLOAD_PENDING kalır).
    await tx
      .update(files)
      .set({ status: "EXPIRED", endedAt: sql`now()` })
      .where(
        and(
          eq(files.applicationId, applicationId),
          inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
          sql`EXISTS (SELECT 1 FROM storage_write_attempts w WHERE w.file_id = ${files.id})`,
          sql`NOT EXISTS (SELECT 1 FROM storage_write_attempts w WHERE w.file_id = ${files.id}
                           AND w.state IN ('ADMITTED', 'IN_PROGRESS', 'UNKNOWN'))`,
        ),
      );
  });
}

async function claimObservedVersions(
  tx: Tx,
  applicationId: string,
  open: readonly { readonly id: string; readonly key: string }[],
) {
  {
    const keys = [...new Set(open.map((row) => row.key))];
    const observed = await tx
      .select({ key: objects.objectKey, versionId: objects.versionId })
      .from(objects)
      .where(
        and(
          eq(objects.applicationId, applicationId),
          inArray(objects.objectKey, keys),
          eq(objects.isDeleteMarker, false),
        ),
      )
      .orderBy(asc(objects.discoveredAt), asc(objects.id));
    const claimed = await tx
      .select({ key: attempts.objectKey, versionId: attempts.versionId })
      .from(attempts)
      .where(and(inArray(attempts.objectKey, keys), isNotNull(attempts.versionId)));
    const taken = new Set(claimed.map((row) => objectRef(row.key, row.versionId!)));
    for (const attempt of open) {
      const version = observed.find(
        (row) => row.key === attempt.key && !taken.has(objectRef(row.key, row.versionId)),
      );
      if (version === undefined) continue;
      taken.add(objectRef(version.key, version.versionId));
      await tx
        .update(attempts)
        .set({
          state: "CONFIRMED",
          outcome: "OBSERVED",
          versionId: version.versionId,
          settledAt: sql`now()`,
        })
        .where(eq(attempts.id, attempt.id));
    }
  }
}

/**
 * Onaylanmış her girişimin versiyonu için, envanterde yokluğu doğrulanmamışsa versiyona özgü HEAD:
 * hâlâ varsa envantere eklenir (bir sonraki tur siler). Dönüş: bulunan versiyon sayısı veya hata kodu.
 */
async function verifyConfirmedVersionsAbsent(
  db: Database,
  storage: StorageAdapter,
  applicationId: string,
  leaseId: string,
): Promise<number | DeletionErrorCode> {
  const unverified = await db
    .select({ key: attempts.objectKey, versionId: attempts.versionId, fileId: attempts.fileId })
    .from(attempts)
    .where(
      and(
        eq(attempts.applicationId, applicationId),
        eq(attempts.state, "CONFIRMED"),
        sql`NOT EXISTS (SELECT 1 FROM application_deletion_objects o
                         WHERE o.object_key = ${attempts.objectKey}
                           AND o.version_id = ${attempts.versionId} AND o.state = 'DELETED')`,
      ),
    );
  let found = 0;
  for (const row of unverified) {
    let head;
    try {
      head = await storage.headObject(row.key, row.versionId);
    } catch (error) {
      return storageErrorCode(error);
    }
    if (head === null) continue;
    found += 1;
    await db.transaction(async (tx) => {
      await holdLease(tx, applicationId, leaseId);
      await tx
        .insert(objects)
        .values({
          applicationId,
          objectKey: row.key,
          versionId: row.versionId!,
          sizeBytes: head.contentLength,
          isDeleteMarker: false,
          fileId: row.fileId,
        })
        .onConflictDoNothing({ target: [objects.objectKey, objects.versionId] });
    });
  }
  return found;
}

/**
 * Listelemeyi envantere işler. Sahiplik: anahtar tam başvuru önekinde olmalı ve bu başvurunun bir dosya
 * kaydına ait olmalı. Başka kayda ait → `OWNERSHIP_CONFLICT`; hiçbir kayda ait değil → `UNKNOWN_OBJECT`
 * (silinmez, yok sayılmaz — manuel inceleme). Liste eksiksizse, listede olmayan `PENDING` versiyonlar
 * yokluğu doğrulanmış sayılır (`DELETED`).
 */
async function recordInventory(
  db: Database,
  applicationId: string,
  leaseId: string,
  listing: { readonly versions: readonly ObjectVersion[]; readonly truncated: boolean },
): Promise<DeletionErrorCode | null> {
  const prefix = applicationPrefix(applicationId);
  return db.transaction(async (tx) => {
    await holdLease(tx, applicationId, leaseId);
    const known = await tx
      .select({ id: files.id, key: files.blobPathname })
      .from(files)
      .where(eq(files.applicationId, applicationId));
    const fileByKey = new Map(known.map((row) => [row.key, row.id]));

    const foreignKeys = listing.versions
      .filter((v) => !v.key.startsWith(prefix) || !fileByKey.has(v.key))
      .map((v) => v.key);
    if (foreignKeys.length > 0) {
      if (foreignKeys.some((key) => !key.startsWith(prefix))) return "OWNERSHIP_CONFLICT";
      const owners = await tx
        .select({ applicationId: files.applicationId })
        .from(files)
        .where(inArray(files.blobPathname, [...new Set(foreignKeys)]))
        .limit(1);
      return owners.length > 0 ? "OWNERSHIP_CONFLICT" : "UNKNOWN_OBJECT";
    }

    if (listing.versions.length > 0) {
      await tx
        .insert(objects)
        .values(
          listing.versions.map((v) => ({
            applicationId,
            objectKey: v.key,
            versionId: v.versionId,
            sizeBytes: v.sizeBytes,
            isDeleteMarker: v.isDeleteMarker,
            fileId: fileByKey.get(v.key)!,
          })),
        )
        .onConflictDoNothing({ target: [objects.objectKey, objects.versionId] });
    }
    if (!listing.truncated) {
      const present = new Set(listing.versions.map((v) => objectRef(v.key, v.versionId)));
      const pending = await tx
        .select({ id: objects.id, key: objects.objectKey, versionId: objects.versionId })
        .from(objects)
        .where(and(eq(objects.applicationId, applicationId), eq(objects.state, "PENDING")));
      const absent = pending.filter((row) => !present.has(objectRef(row.key, row.versionId)));
      if (absent.length > 0) {
        await tx
          .update(objects)
          .set({ state: "DELETED", deletedAt: sql`now()`, lastError: null })
          .where(
            inArray(
              objects.id,
              absent.map((row) => row.id),
            ),
          );
      }
      await tx
        .update(deletions)
        .set({ inventoryCompletedAt: sql`coalesce(${deletions.inventoryCompletedAt}, now())` })
        .where(eq(deletions.applicationId, applicationId));
    }
    return null;
  });
}

async function markAttempts(
  db: Database,
  applicationId: string,
  leaseId: string,
  attempted: readonly ObjectVersion[],
  error: DeletionErrorCode | null,
): Promise<void> {
  if (attempted.length === 0) return;
  await db.transaction(async (tx) => {
    await holdLease(tx, applicationId, leaseId);
    for (const [index, version] of attempted.entries()) {
      const failed = error !== null && index === attempted.length - 1;
      await tx
        .update(objects)
        .set({ attempts: sql`${objects.attempts} + 1`, lastError: failed ? error : null })
        .where(
          and(
            eq(objects.applicationId, applicationId),
            eq(objects.objectKey, version.key),
            eq(objects.versionId, version.versionId),
            eq(objects.state, "PENDING"),
          ),
        );
    }
    // Fiziksel silme denendi: devam eden mutabakatın envanteri bayatlar (D-130).
    await bumpAccountingEpoch(tx);
  });
}

/** Kısa sonlandırma transaction'ı — yalnızca önek boş + liste eksiksiz doğrulandıktan sonra çağrılır. */
async function finalize(
  db: Database,
  staff: Staff,
  applicationId: string,
  leaseId: string,
  listingStartedAt: Date,
): Promise<"DELETED" | "RELIST" | DeletionErrorCode> {
  try {
    return await db.transaction(async (tx) => {
      const [app] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.id, applicationId), isNotNull(applications.deletionRequestedAt)))
        .for("update");
      if (app === undefined) return "DELETED" as const;
      const [deletion] = await tx
        .select({ id: deletions.applicationId })
        .from(deletions)
        .where(and(eq(deletions.applicationId, applicationId), eq(deletions.leaseId, leaseId)))
        .for("update");
      if (deletion === undefined) throw new LeaseLost();

      // D-124: süreye değil kanıta dayalı. Çözülmemiş yazım girişimi varsa (zaman ne kadar geçmiş olursa
      // olsun) sonlandırma YOK; girişim kaydı ve dosya metadata'sı korunur.
      const [unsettled] = await tx
        .select({ value: count() })
        .from(attempts)
        .where(
          and(
            eq(attempts.applicationId, applicationId),
            inArray(attempts.state, ["ADMITTED", "IN_PROGRESS", "UNKNOWN"]),
          ),
        );
      if ((unsettled?.value ?? 0) > 0) return "UPLOAD_OUTCOME_UNKNOWN" as const;
      // D-126: yazım takibi olmayan (migration 0008 öncesi) dosya kaydı → kanıt yok, teknik inceleme.
      const [legacy] = await tx
        .select({ value: count() })
        .from(files)
        .where(
          and(
            eq(files.applicationId, applicationId),
            sql`NOT EXISTS (SELECT 1 FROM storage_write_attempts w WHERE w.file_id = ${files.id})`,
          ),
        );
      if ((legacy?.value ?? 0) > 0) return "LEGACY_UNVERIFIED" as const;
      // Her girişim, boş listeleme BAŞLAMADAN önce çözülmüş olmalı (aksi halde yeniden listele).
      const [late] = await tx
        .select({ value: count() })
        .from(attempts)
        .where(
          and(
            eq(attempts.applicationId, applicationId),
            sql`${attempts.settledAt} >= ${listingStartedAt.toISOString()}::timestamptz`,
          ),
        );
      if ((late?.value ?? 0) > 0) return "RELIST" as const;

      const [inFlight] = await tx
        .select({ value: count() })
        .from(files)
        .where(
          and(
            eq(files.applicationId, applicationId),
            inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
          ),
        );
      const [pending] = await tx
        .select({ value: count() })
        .from(objects)
        .where(and(eq(objects.applicationId, applicationId), eq(objects.state, "PENDING")));
      if ((inFlight?.value ?? 0) > 0 || (pending?.value ?? 0) > 0) {
        return "VERIFICATION_PENDING" as const;
      }

      const [versioned] = await tx
        .select({ value: count() })
        .from(files)
        .where(and(eq(files.applicationId, applicationId), isNotNull(files.versionNumber)));
      const [physical] = await tx
        .select({ value: count() })
        .from(objects)
        .where(and(eq(objects.applicationId, applicationId), eq(objects.isDeleteMarker, false)));

      // Kota: kullanım dosya metadata'sından hesaplanır; fiziksel yokluk doğrulandıktan sonra düşer.
      await tx
        .update(files)
        .set({ blobDeletedAt: sql`now()` })
        .where(and(eq(files.applicationId, applicationId), isNull(files.blobDeletedAt)));
      await lockStorageQuota(tx);
      await bumpAccountingEpoch(tx);
      await tx
        .update(deletions)
        .set({
          storageVerifiedAt: sql`now()`,
          finalListingStartedAt: sql`${listingStartedAt.toISOString()}::timestamptz`,
        })
        .where(eq(deletions.applicationId, applicationId));
      // CASCADE: evraklar, dosya kayıtları, kararlar, yorumlar, iç notlar, statü geçmişi, token'lar,
      // silme kaydı ve envanter. audit_logs FK içermez → kalır (PII yok, BR-154).
      await tx.delete(applications).where(eq(applications.id, applicationId));
      await writeAuditLog(tx, {
        action: "APPLICATION_DELETED",
        actorType: "USER",
        actorUserId: staff.userId,
        resourceType: "application",
        resourceId: applicationId,
        applicationId,
        metadata: { fileCount: versioned?.value ?? 0, count: physical?.value ?? 0 },
      });
      return "DELETED" as const;
    });
  } catch (error) {
    if (error instanceof LeaseLost) throw error;
    console.error("[deletion] Sonlandırma başarısız", { code: pgErrorCode(error) ?? "unknown" });
    return "FINALIZATION_FAILED";
  }
}
