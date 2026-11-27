import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  FILE_VIEW_AUDIT_WINDOW_SECONDS,
  MAX_RANGE_CHUNK_BYTES,
  UPLOAD_PENDING_TTL_SECONDS,
} from "@/config/constants";
import type { DocumentStatus, WriteAttemptOutcome } from "@/config/statuses";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import {
  applicationAccessTokens as tokens,
  applicationDocumentFiles as files,
  applicationDocumentRequirements as requirements,
  applications,
  storageWriteAttempts as attempts,
} from "@/server/db/schema";
import type { StorageQuota } from "@/server/env";
import type { PdfCheck, PdfRejection } from "@/server/pdf/pdf-checks";
import { hitRateLimitCounter } from "@/server/security/rate-limit-counter";
import { isStorageError } from "@/server/storage/errors";
import { exactLengthStream } from "@/server/storage/exact-length";
import {
  bumpAccountingEpoch,
  fitsQuota,
  lockStorageQuota,
  readStorageUsage,
} from "@/server/storage/quota";
import { buildObjectKey, type StorageAdapter } from "@/server/storage/types";

import {
  ifRangeAllowsPartial,
  parseRangeHeader,
  rangeLength,
  type ByteRange,
  type RangeDecision,
} from "./domain/byte-range";
import {
  canUploadDocument,
  documentStatusAfterUpload,
  invalidatesApproval,
  type UploadActor,
} from "./domain/upload-rules";

/**
 * Evrak dosyası yaşam döngüsü (PHASE 08, D-100…D-104; FILE_STORAGE §2; BR-42…BR-48, BR-70…BR-72).
 *
 * PostgreSQL transaction'ı ile storage yazımı tek bir ACID işlem değildir; akış bunu açıkça ele alır:
 *   0. Ön kontrol (kilitsiz, gövde okunmadan): kapsam, BR-44, `expectedVersion`, kota → hızlı ret.
 *   1. Doğrulama: yapısal PDF kontrolü (izole worker) + SHA-256 (sunucuda, gerçek baytlardan).
 *   2. Rezervasyon (kısa TX): başvuru → evrak → dosyalar → kota kilidi; BR-44/45 + version; devam eden
 *      yükleme; atomik kota; benzersiz fileId/anahtar; `UPLOAD_PENDING` (boyut kotaya dahil).
 *   3. Storage yazımı (TX ve kilit YOK): benzersiz anahtar, versiyon kimliği alınır. Yanıt kaybolursa
 *      kör yeniden yazma yapılmaz; HEAD ile mutabakat.
 *   4. Aktivasyon (kısa TX): aynı kilit sırası; müşteri token'ı/oturum süresi, başvuru silinmiyor,
 *      BR-44/45, version, rezervasyon kimliği yeniden doğrulanır → eski ACTIVE → SUPERSEDED, yeni
 *      ACTIVE (v+1), evrak statüsü, onay geçersizleştirme, audit — hepsi aynı transaction'da.
 *   5. Başarı yalnızca aktivasyon commit'inden sonra döner. Hata hâlinde eski aktif dosya korunur;
 *      yarım kalan nesne kayıtları (`EXPIRED`/`REJECTED`, `blob_deleted_at IS NULL`) teknik temizlikte
 *      versiyona özgü silinir (`pnpm storage:cleanup`).
 * Kilit sırası (BR-91, D-074): applications → application_document_requirements → files → storage_quota_state.
 */

export type FileActor =
  | { readonly kind: "STAFF"; readonly userId: string }
  | {
      readonly kind: "CUSTOMER";
      readonly applicationId: string;
      readonly tokenId: string;
      /** Oturumun sabit bitişi (saniye) — aktivasyonda yeniden kontrol edilir (D-089). */
      readonly sessionExpiresAt: number;
    };

export type UploadFailureCode =
  | "NOT_FOUND"
  | "NOT_ALLOWED"
  | "CONFLICT"
  | "UPLOAD_IN_PROGRESS"
  | "QUOTA_EXCEEDED"
  | "INVALID_PDF"
  | "ACCESS_ENDED"
  | "STATE_CHANGED"
  | "STORAGE_LIMIT"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL";

export type UploadResult =
  | {
      readonly ok: true;
      readonly fileId: string;
      readonly versionNumber: number;
      readonly documentStatus: DocumentStatus;
      readonly replaced: boolean;
    }
  | { readonly ok: false; readonly code: UploadFailureCode; readonly pdfReason?: PdfRejection };

export type UploadDeps = {
  readonly db: Database;
  readonly storage: StorageAdapter;
  readonly quota: StorageQuota;
  readonly validatePdf: (bytes: Uint8Array) => Promise<PdfCheck>;
  /**
   * Rezervasyon commit edildikten sonra, yazım başlatılmadan önce çağrılır (kontrollü zamanlayıcı —
   * yalnızca testler duraklatma/çökme simülasyonu için verir; production'da tanımsız). Güvenlik
   * kararını değiştirmez: başlatma her durumda kalıcı çite (`beginStorageWrite`) tabidir.
   */
  readonly beforeStorageWrite?: () => Promise<void>;
};

export type UploadRequest = {
  readonly requirementId: string;
  readonly expectedVersion: number;
  /** Sanitize edilmiş görünen ad (yalnızca metadata). */
  readonly filename: string;
  readonly bytes: Uint8Array;
};

const failure = (code: UploadFailureCode, pdfReason?: PdfRejection): UploadResult => ({
  ok: false,
  code,
  ...(pdfReason ? { pdfReason } : {}),
});

const uploadActor = (actor: FileActor): UploadActor =>
  actor.kind === "CUSTOMER" ? "CUSTOMER" : "STAFF";

function auditActor(actor: FileActor) {
  return actor.kind === "STAFF"
    ? ({ actorType: "USER", actorUserId: actor.userId } as const)
    : ({ actorType: "CUSTOMER", actorAccessTokenId: actor.tokenId } as const);
}

function uploaderColumns(actor: FileActor) {
  return actor.kind === "STAFF"
    ? ({ uploadedByActorType: "USER", uploadedByUserId: actor.userId } as const)
    : ({ uploadedByActorType: "CUSTOMER", uploadedByAccessTokenId: actor.tokenId } as const);
}

function enderColumns(actor: FileActor) {
  return actor.kind === "STAFF"
    ? ({ endedByActorType: "USER", endedByUserId: actor.userId } as const)
    : ({ endedByActorType: "CUSTOMER", endedByUserId: null } as const);
}

/** Müşteri: token hâlâ aktif mi, bu başvuruya mı ait, oturum süresi dolmadı mı (her aşamada). */
export async function customerStillAllowed(tx: Pick<Database, "select">, actor: FileActor) {
  if (actor.kind !== "CUSTOMER") return true;
  if (actor.sessionExpiresAt <= Math.floor(Date.now() / 1000)) return false;
  const [row] = await tx
    .select({ id: tokens.id })
    .from(tokens)
    .where(
      and(
        eq(tokens.id, actor.tokenId),
        eq(tokens.applicationId, actor.applicationId),
        isNull(tokens.revokedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

type Target = {
  readonly applicationId: string;
  readonly applicationStatus: (typeof applications.$inferSelect)["status"];
  readonly deletionRequested: boolean;
  readonly documentStatus: DocumentStatus;
  readonly version: number;
};

/** Evrak + başvurusu. Müşteri için kapsam oturumdaki başvuruyla sınırlıdır (başka başvuru → yok). */
async function readTarget(
  tx: Pick<Database, "select">,
  actor: FileActor,
  requirementId: string,
  lock: boolean,
): Promise<Target | null> {
  const scope =
    actor.kind === "CUSTOMER"
      ? and(eq(requirements.id, requirementId), eq(requirements.applicationId, actor.applicationId))
      : eq(requirements.id, requirementId);
  const [owner] = await tx
    .select({ applicationId: requirements.applicationId })
    .from(requirements)
    .where(scope)
    .limit(1);
  if (owner === undefined) return null;

  const appQuery = tx
    .select({ status: applications.status, deletionRequestedAt: applications.deletionRequestedAt })
    .from(applications)
    .where(eq(applications.id, owner.applicationId));
  const [application] = lock ? await appQuery.for("update") : await appQuery;
  if (application === undefined) return null;

  const reqQuery = tx
    .select({ status: requirements.status, version: requirements.version })
    .from(requirements)
    .where(
      and(eq(requirements.id, requirementId), eq(requirements.applicationId, owner.applicationId)),
    );
  const [requirement] = lock ? await reqQuery.for("update") : await reqQuery;
  if (requirement === undefined) return null;

  return {
    applicationId: owner.applicationId,
    applicationStatus: application.status,
    deletionRequested: application.deletionRequestedAt !== null,
    documentStatus: requirement.status,
    version: requirement.version,
  };
}

/**
 * Ön kontrol (gövde okunmadan önce; kilitsiz). Aynı kurallar rezervasyon ve aktivasyonda kilit altında
 * yeniden uygulanır — bu adım yalnızca gereksiz bant genişliği/işlem tüketimini önler.
 */
export async function precheckUpload(
  deps: Pick<UploadDeps, "db" | "quota">,
  actor: FileActor,
  input: {
    readonly requirementId: string;
    readonly expectedVersion: number;
    readonly sizeBytes: number;
  },
): Promise<UploadResult | null> {
  if (!(await customerStillAllowed(deps.db, actor))) return failure("ACCESS_ENDED");
  const target = await readTarget(deps.db, actor, input.requirementId, false);
  if (target === null || target.deletionRequested) return failure("NOT_FOUND");
  if (!canUploadDocument(uploadActor(actor), target.applicationStatus, target.documentStatus)) {
    return failure("NOT_ALLOWED");
  }
  if (target.version !== input.expectedVersion) return failure("CONFLICT");
  const usage = await readStorageUsage(deps.db);
  if (!fitsQuota(usage.total, input.sizeBytes, deps.quota)) return failure("QUOTA_EXCEEDED");
  return null;
}

type Reservation = {
  readonly fileId: string;
  readonly key: string;
  readonly applicationId: string;
  /** Fiziksel yazım girişiminin dayanıklı kimliği (D-121). */
  readonly attemptId: string;
};

// ---------------------------------------------------------------- Yazım girişimi (D-121…D-123)

/**
 * Yazım çiti (D-122): `ADMITTED → IN_PROGRESS` koşullu güncellemesi PUT'tan ÖNCE commit edilir. Silme
 * talebi aynı satırları başvuru kilidi altında `FENCED` yapar; satır kilidi iki işlemi sıraya koyar →
 * ya yazım başlamıştır (silme bunu takip eder) ya çitlenmiştir (PUT hiç gönderilmez). Duraklamış bir
 * işçi uyandığında çitlenmişse yazmaz. Başlatma kaydı olmadan hiçbir PUT gönderilmez.
 */
export async function beginStorageWrite(db: Database, attemptId: string): Promise<boolean> {
  const started = await db
    .update(attempts)
    .set({ state: "IN_PROGRESS", startedAt: sql`now()` })
    .where(
      and(
        eq(attempts.id, attemptId),
        eq(attempts.state, "ADMITTED"),
        sql`NOT EXISTS (SELECT 1 FROM applications a WHERE a.id = ${attempts.applicationId} AND a.deletion_requested_at IS NOT NULL)`,
      ),
    )
    .returning({ id: attempts.id });
  return started.length === 1;
}

type WriteSettlement =
  | {
      readonly state: "CONFIRMED";
      readonly outcome: WriteAttemptOutcome;
      readonly versionId: string;
    }
  | { readonly state: "FAILED"; readonly outcome: "NOT_SENT" }
  | { readonly state: "UNKNOWN"; readonly outcome: WriteAttemptOutcome };

/**
 * Girişim sonucunu kaydeder (koşullu; DB trigger'ı geçişleri ayrıca kısıtlar). Silme iş akışı versiyonu
 * daha önce gözleyip girişimi çözmüşse güncelleme yan etkisizdir. Kayıt yazılamazsa girişim
 * `IN_PROGRESS` kalır = çözülmemiş (güvenli taraf). PHASE 12.1: sonuç gerçekten kaydedildiyse `true`
 * (ör. aynı fiziksel versiyon başka girişime atanmışsa benzersizlik ihlali → `false`).
 */
export async function settleStorageWrite(
  db: Database,
  attemptId: string,
  settlement: WriteSettlement,
): Promise<boolean> {
  const from = settlement.state === "CONFIRMED" ? ["IN_PROGRESS", "UNKNOWN"] : ["IN_PROGRESS"];
  try {
    const result = await db
      .update(attempts)
      .set({
        state: settlement.state,
        outcome: settlement.outcome,
        versionId: settlement.state === "CONFIRMED" ? settlement.versionId : null,
        settledAt: settlement.state === "UNKNOWN" ? null : sql`now()`,
      })
      .where(
        and(
          eq(attempts.id, attemptId),
          inArray(attempts.state, from as ("IN_PROGRESS" | "UNKNOWN")[]),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error("[files] Yazım sonucu kaydedilemedi (girişim çözülmemiş kalır)", {
      code: pgErrorCode(error) ?? "unknown",
    });
    return false;
  }
}

async function reserve(
  deps: UploadDeps,
  actor: FileActor,
  input: UploadRequest,
  sha256: string,
): Promise<Reservation | UploadResult> {
  return deps.db.transaction(async (tx) => {
    const target = await readTarget(tx, actor, input.requirementId, true);
    if (target === null || target.deletionRequested) return failure("NOT_FOUND");
    if (!(await customerStillAllowed(tx, actor))) return failure("ACCESS_ENDED");
    if (!canUploadDocument(uploadActor(actor), target.applicationStatus, target.documentStatus)) {
      return failure("NOT_ALLOWED");
    }
    if (target.version !== input.expectedVersion) return failure("CONFLICT");

    // BR-43: evrak başına en fazla bir devam eden yükleme. Süresi dolmuş yarım yükleme iptal edilir;
    // güncel olan varsa yeni istek reddedilir (iki paralel yükleme asla iki ACTIVE üretmez).
    const inProgress = await tx
      .select({ id: files.id, expired: sql<boolean>`${files.uploadExpiresAt} <= now()` })
      .from(files)
      .where(
        and(
          eq(files.requirementId, input.requirementId),
          inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
        ),
      )
      .for("update");
    if (inProgress.some((row) => !row.expired)) return failure("UPLOAD_IN_PROGRESS");
    if (inProgress.length > 0) {
      await tx
        .update(files)
        .set({ status: "EXPIRED", endedAt: sql`now()` })
        .where(
          inArray(
            files.id,
            inProgress.map((row) => row.id),
          ),
        );
    }

    // Atomik kota: global kilit altında, rezervasyonlar ve temizlik bekleyen nesneler dahil.
    await lockStorageQuota(tx);
    const usage = await readStorageUsage(tx);
    if (!fitsQuota(usage.total, input.bytes.byteLength, deps.quota))
      return failure("QUOTA_EXCEEDED");

    const fileId = randomUUID();
    const attemptId = randomUUID();
    const key = buildObjectKey(target.applicationId, input.requirementId, fileId);
    await tx.insert(files).values({
      id: fileId,
      applicationId: target.applicationId,
      requirementId: input.requirementId,
      status: "UPLOAD_PENDING",
      blobPathname: key,
      originalFilename: input.filename,
      sizeBytes: input.bytes.byteLength,
      sha256,
      ...uploaderColumns(actor),
      uploadExpiresAt: sql`now() + make_interval(secs => ${UPLOAD_PENDING_TTL_SECONDS})`,
    });
    // Yazım kabulü (D-121): rezervasyonla aynı transaction'da, başvuru kilidi altında (silme işaretliyse
    // buraya gelinmez). Silme iş akışı bu girişimi bilir ve çözülmeden sonlandırma yapılamaz.
    await tx.insert(attempts).values({
      id: attemptId,
      applicationId: target.applicationId,
      fileId,
      objectKey: key,
    });
    return { fileId, key, applicationId: target.applicationId, attemptId };
  });
}

/** Rezervasyonu yarım olarak kapatır (nesne varsa teknik temizlik versiyona özgü siler). */
async function abandon(
  db: Database,
  actor: FileActor,
  reservation: Reservation,
  requirementId: string,
  reason: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(files)
        .set({ status: "EXPIRED", endedAt: sql`now()` })
        .where(and(eq(files.id, reservation.fileId), eq(files.status, "UPLOAD_PENDING")))
        .returning({ id: files.id });
      if (updated.length === 0) return;
      await writeAuditLog(tx, {
        action: "DOCUMENT_UPLOAD_FAILED",
        ...auditActor(actor),
        resourceType: "file",
        resourceId: reservation.fileId,
        applicationId: reservation.applicationId,
        metadata: { fileId: reservation.fileId, requirementId, reason },
      });
    });
  } catch (error) {
    // Kayıt UPLOAD_PENDING kalır; süresi dolunca teknik temizlik EXPIRED yapar.
    console.error("[files] Yarım yükleme kapatılamadı", { code: pgErrorCode(error) ?? "unknown" });
  }
}

type Activation =
  | { readonly kind: "activated"; readonly result: UploadResult }
  | { readonly kind: "rejected"; readonly code: UploadFailureCode }
  | { readonly kind: "gone" };

async function activate(
  deps: UploadDeps,
  actor: FileActor,
  input: UploadRequest,
  reservation: Reservation,
  storageVersionId: string,
): Promise<Activation> {
  return deps.db.transaction(async (tx): Promise<Activation> => {
    const [application] = await tx
      .select({
        status: applications.status,
        deletionRequestedAt: applications.deletionRequestedAt,
      })
      .from(applications)
      .where(eq(applications.id, reservation.applicationId))
      .for("update");
    const [requirement] = await tx
      .select({ status: requirements.status, version: requirements.version })
      .from(requirements)
      .where(
        and(
          eq(requirements.id, input.requirementId),
          eq(requirements.applicationId, reservation.applicationId),
        ),
      )
      .for("update");
    const [pending] = await tx
      .select({ status: files.status })
      .from(files)
      .where(eq(files.id, reservation.fileId))
      .for("update");
    if (pending === undefined || pending.status !== "UPLOAD_PENDING") return { kind: "gone" };

    // BR-45: durum arada değiştiyse dosya aktifleştirilmez (REJECTED/STATE_CHANGED, nesne temizlenir).
    const accessOk = await customerStillAllowed(tx, actor);
    const nextStatus =
      application && requirement
        ? documentStatusAfterUpload(uploadActor(actor), application.status, requirement.status)
        : null;
    const stale =
      application === undefined ||
      requirement === undefined ||
      application.deletionRequestedAt !== null ||
      !accessOk ||
      nextStatus === null ||
      requirement.version !== input.expectedVersion;
    if (stale) {
      await tx
        .update(files)
        .set({ status: "REJECTED", rejectionReason: "STATE_CHANGED", endedAt: sql`now()` })
        .where(eq(files.id, reservation.fileId));
      await writeAuditLog(tx, {
        action: "DOCUMENT_VALIDATION_REJECTED",
        ...auditActor(actor),
        resourceType: "file",
        resourceId: reservation.fileId,
        applicationId: reservation.applicationId,
        metadata: {
          fileId: reservation.fileId,
          requirementId: input.requirementId,
          reason: "STATE_CHANGED",
        },
      });
      return { kind: "rejected", code: accessOk ? "STATE_CHANGED" : "ACCESS_ENDED" };
    }

    const [previous] = await tx
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.requirementId, input.requirementId), eq(files.status, "ACTIVE")))
      .for("update");
    if (previous !== undefined) {
      await tx
        .update(files)
        .set({ status: "SUPERSEDED", endedAt: sql`now()`, ...enderColumns(actor) })
        .where(eq(files.id, previous.id));
    }
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${files.versionNumber}), 0)::int` })
      .from(files)
      .where(eq(files.requirementId, input.requirementId));
    const versionNumber = (maxRow?.max ?? 0) + 1;
    await tx
      .update(files)
      .set({
        status: "ACTIVE",
        versionNumber,
        storageVersionId,
        uploadedAt: sql`now()`,
        activatedAt: sql`now()`,
      })
      .where(eq(files.id, reservation.fileId));

    const before = requirement!.status;
    const after = nextStatus!;
    await tx
      .update(requirements)
      .set({
        status: after,
        version: sql`${requirements.version} + 1`,
        ...(before !== after ? { statusChangedAt: sql`now()` } : {}),
      })
      .where(eq(requirements.id, input.requirementId));

    await writeAuditLog(tx, {
      action: previous !== undefined ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
      ...auditActor(actor),
      resourceType: "file",
      resourceId: reservation.fileId,
      applicationId: reservation.applicationId,
      metadata: {
        fileId: reservation.fileId,
        requirementId: input.requirementId,
        versionNumber,
        from: before,
        to: after,
        ...(actor.kind === "STAFF" ? { onBehalfOfCustomer: true } : {}),
      },
    });
    if (invalidatesApproval(before, after)) {
      // BR-48: önceki onay yeni versiyona aktarılmaz; eski inceleme kayıtları değişmeden kalır.
      await writeAuditLog(tx, {
        action: "DOCUMENT_APPROVAL_INVALIDATED",
        ...auditActor(actor),
        resourceType: "document",
        resourceId: input.requirementId,
        applicationId: reservation.applicationId,
        metadata: {
          fileId: reservation.fileId,
          requirementId: input.requirementId,
          from: before,
          to: after,
        },
      });
    }
    return {
      kind: "activated",
      result: {
        ok: true,
        fileId: reservation.fileId,
        versionNumber,
        documentStatus: after,
        replaced: previous !== undefined,
      },
    };
  });
}

async function fileStatusOf(db: Database, fileId: string) {
  const [row] = await db
    .select({ status: files.status, versionNumber: files.versionNumber })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  return row;
}

async function bestEffortDelete(storage: StorageAdapter, key: string, versionId: string) {
  try {
    await storage.deleteObjectVersion(key, versionId);
    return true;
  } catch {
    return false; // teknik temizlik yeniden dener (blob_deleted_at boş kalır)
  }
}

/** Doğrulanmış PDF'i yükler ve aktifleştirir. Ön kontrol çağıran tarafta yapılmış olmalıdır. */
export async function uploadDocumentFile(
  deps: UploadDeps,
  actor: FileActor,
  input: UploadRequest,
): Promise<UploadResult> {
  // 1. Doğrulama (transaction dışı). Reddedilen dosya storage'a hiç yazılmaz.
  const check = await deps.validatePdf(input.bytes);
  if (!check.ok) {
    if (check.internal) {
      console.error("[files] PDF doğrulayıcıda beklenmeyen hata (MALFORMED sayıldı)", {
        name: check.internal,
      });
    }
    try {
      const target = await readTarget(deps.db, actor, input.requirementId, false);
      if (target !== null) {
        await writeAuditLog(deps.db, {
          action: "DOCUMENT_VALIDATION_REJECTED",
          ...auditActor(actor),
          resourceType: "document",
          resourceId: input.requirementId,
          applicationId: target.applicationId,
          metadata: { requirementId: input.requirementId, reason: check.reason },
        });
      }
    } catch (error) {
      console.error("[files] Ret audit'i yazılamadı", { code: pgErrorCode(error) ?? "unknown" });
    }
    return failure("INVALID_PDF", check.reason);
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const md5Hex = createHash("md5").update(input.bytes).digest("hex");

  // 2. Rezervasyon.
  const reserved = await reserve(deps, actor, input, sha256);
  if ("ok" in reserved) return reserved;

  // 3. Storage yazımı (transaction ve kilit yok). Önce kalıcı yazım çiti; tek fiziksel girişim (D-121…D-123).
  if (deps.beforeStorageWrite) await deps.beforeStorageWrite();
  let begun = false;
  try {
    begun = await beginStorageWrite(deps.db, reserved.attemptId);
  } catch (error) {
    console.error("[files] Yazım başlatılamadı", { code: pgErrorCode(error) ?? "unknown" });
  }
  if (!begun) {
    // Çitlendi (silme talebi / süresi dolmuş rezervasyon) veya DB hatası: PUT GÖNDERİLMEZ.
    await abandon(deps.db, actor, reserved, input.requirementId, "STATE_CHANGED");
    return failure("STATE_CHANGED");
  }

  let versionId: string | null = null;
  try {
    ({ versionId } = await deps.storage.putObject({
      key: reserved.key,
      body: input.bytes,
      contentType: "application/pdf",
      sizeBytes: input.bytes.byteLength,
      md5Hex,
    }));
  } catch (error) {
    if (isStorageError(error, "NOT_SENT")) {
      // İstek sağlayıcıya ulaşmadı → kesin başarısızlık (yazım olmadı).
      await settleStorageWrite(deps.db, reserved.attemptId, {
        state: "FAILED",
        outcome: "NOT_SENT",
      });
      await abandon(deps.db, actor, reserved, input.requirementId, "STORAGE_ERROR");
      return failure("STORAGE_UNAVAILABLE");
    }
    if (isStorageError(error, "AMBIGUOUS")) {
      // Yanıt kayboldu: yazma gerçekleşmiş olabilir → kör yeniden yazma yok; nesne kimliğiyle mutabakat.
      // Anahtar bu girişime özgü ve tek girişim olduğundan gözlenen versiyon bu girişimindir. PHASE 12.1
      // (REVIEW-06): HEAD'deki boyut/versiyon içeriği kanıtlamaz → o TEK versiyonun sınırlı bütünlük okuması
      // (SHA-256). Kanıt yoksa veya versiyon başka girişime atanmışsa UNKNOWN korunur.
      const head = await deps.storage.headObject(reserved.key, null).catch(() => null);
      const observed =
        head !== null &&
        head.versionId !== null &&
        head.contentLength === input.bytes.byteLength &&
        (await observedVersionMatches(
          deps.storage,
          reserved.key,
          head.versionId,
          input.bytes.byteLength,
          sha256,
        ));
      // Onay ancak gerçekten kaydedildiyse geçerlidir (aynı versiyon başka girişime atanmışsa benzersizlik
      // reddeder → false → UNKNOWN denemesi).
      const settled =
        observed &&
        (await settleStorageWrite(deps.db, reserved.attemptId, {
          state: "CONFIRMED",
          outcome: "OBSERVED",
          versionId: head.versionId!,
        }));
      if (settled) {
        versionId = head!.versionId;
      } else {
        await settleStorageWrite(deps.db, reserved.attemptId, {
          state: "UNKNOWN",
          outcome: "RESPONSE_LOST",
        });
        await abandon(deps.db, actor, reserved, input.requirementId, "STORAGE_AMBIGUOUS");
        return failure("STORAGE_UNAVAILABLE");
      }
    } else {
      // Sağlayıcı hata yanıtı (cap/yetki/5xx) veya bütünlük uyuşmazlığı: B2 belgeleri hata yanıtında
      // nesne oluşmadığını garanti etmez → BELİRSİZ (yalnızca gözlemle çözülür).
      const limited = isStorageError(error, "LIMIT");
      await settleStorageWrite(deps.db, reserved.attemptId, {
        state: "UNKNOWN",
        outcome: isStorageError(error, "INTEGRITY") ? "INTEGRITY_MISMATCH" : "PROVIDER_ERROR",
      });
      await abandon(
        deps.db,
        actor,
        reserved,
        input.requirementId,
        limited ? "STORAGE_LIMIT" : "STORAGE_ERROR",
      );
      console.error("[files] Storage yazımı başarısız", {
        kind: isStorageError(error) ? error.kind : "unknown",
        code: isStorageError(error) ? (error.code ?? null) : null,
      });
      return failure(limited ? "STORAGE_LIMIT" : "STORAGE_UNAVAILABLE");
    }
  }
  if (versionId === null) {
    // Sağlayıcı versiyon kimliği döndürmediyse dosya aktifleştirilmez; nesne oluşmuş olabilir → belirsiz.
    await settleStorageWrite(deps.db, reserved.attemptId, {
      state: "UNKNOWN",
      outcome: "NO_VERSION_ID",
    });
    await abandon(deps.db, actor, reserved, input.requirementId, "STORAGE_NO_VERSION");
    return failure("STORAGE_UNAVAILABLE");
  }
  await settleStorageWrite(deps.db, reserved.attemptId, {
    state: "CONFIRMED",
    outcome: "PROVIDER_CONFIRMED",
    versionId,
  });

  // 4. Aktivasyon.
  let activation: Activation;
  try {
    activation = await activate(deps, actor, input, reserved, versionId);
  } catch (error) {
    // Commit sonucu belirsiz olabilir: DB durumunu yeniden oku; aktif olabilecek nesneyi SİLME.
    console.error("[files] Aktivasyon başarısız", { code: pgErrorCode(error) ?? "unknown" });
    const status = await fileStatusOf(deps.db, reserved.fileId).catch(() => undefined);
    if (status?.status === "ACTIVE" && status.versionNumber !== null) {
      const target = await readTarget(deps.db, actor, input.requirementId, false).catch(() => null);
      return {
        ok: true,
        fileId: reserved.fileId,
        versionNumber: status.versionNumber,
        documentStatus: target?.documentStatus ?? "UPLOADED",
        replaced: status.versionNumber > 1,
      };
    }
    if (status?.status === "UPLOAD_PENDING") {
      await abandon(deps.db, actor, reserved, input.requirementId, "ACTIVATION_FAILED");
    }
    return failure("INTERNAL");
  }

  if (activation.kind === "rejected") {
    if (await bestEffortDelete(deps.storage, reserved.key, versionId)) {
      await deps.db
        .transaction(async (tx) => {
          await tx
            .update(files)
            .set({ blobDeletedAt: sql`now()` })
            .where(and(eq(files.id, reserved.fileId), eq(files.status, "REJECTED")));
          await bumpAccountingEpoch(tx); // D-130
        })
        .catch(() => undefined);
    }
    return failure(activation.code);
  }
  if (activation.kind === "gone") return failure("STATE_CHANGED");
  return activation.result;
}

// ---------------------------------------------------------------- Görüntüleme / indirme

export type FileDisposition = "inline" | "attachment";

/**
 * Dosya isteği (PHASE 11, D-135). Range/If-Range başlıkları yalnızca sözdizimi olarak gelir; aralık
 * sınırları, versiyon ve anahtar sunucudaki kayıttan hesaplanır (istemciden anahtar/versiyon alınmaz).
 */
export type FileRequest = {
  readonly fileId: string;
  readonly disposition: FileDisposition;
  readonly method: "GET" | "HEAD";
  readonly rangeHeader: string | null;
  readonly ifRange: string | null;
  readonly signal?: AbortSignal;
};

/**
 * İstek sınıfı (rate limit): `transfer` = tam dosya veya `MAX_RANGE_CHUNK_BYTES`'tan uzun aralık;
 * `chunk` = kısa aralık (görüntüleyici); `meta` = HEAD, 416 ve bulunamayan dosya (sağlayıcıya gidilmez).
 */
export type FileRequestClass = "transfer" | "chunk" | "meta";

export type OpenedFile = {
  readonly filename: string;
  /** Kayıtlı toplam dosya boyutu. */
  readonly sizeBytes: number;
  /** Opak güçlü doğrulayıcı (If-Range); storage anahtarı/versiyonu veya içerik hash'i açığa çıkarmaz. */
  readonly etag: string;
  readonly status: 200 | 206;
  readonly range: ByteRange | null;
  readonly contentLength: number;
  /** HEAD'de null (sağlayıcıya istek yapılmaz). */
  readonly stream: ReadableStream<Uint8Array> | null;
};

export type OpenFileFailure =
  | "NOT_FOUND"
  | "RANGE_NOT_SATISFIABLE"
  | "RATE_LIMITED"
  | "STORAGE_LIMIT"
  | "STORAGE_UNAVAILABLE"
  | "INTEGRITY";

export type OpenFileResult =
  | { readonly ok: true; readonly file: OpenedFile }
  | { readonly ok: false; readonly code: OpenFileFailure; readonly sizeBytes?: number };

export type OpenFileDeps = {
  readonly db: Database;
  readonly storage: () => Promise<StorageAdapter>;
  /** İstek sınıfına göre rate limit (route katmanı); verilmezse sınırsız (yalnızca testler). */
  readonly allow?: (requestClass: FileRequestClass) => Promise<boolean>;
};

/** Dosya kimliği + içerik hash'inden türetilmiş opak, güçlü ETag. Dosya kimliği değişmez içeriğe bağlıdır. */
export function fileEtag(fileId: string, sha256: string): string {
  return `"${createHash("sha256").update(`cs-file-etag:v1:${fileId}:${sha256}`).digest("hex").slice(0, 32)}"`;
}

function classify(decision: RangeDecision, method: FileRequest["method"]): FileRequestClass {
  if (method === "HEAD" || decision.kind === "unsatisfiable") return "meta";
  if (decision.kind === "partial" && rangeLength(decision.range) <= MAX_RANGE_CHUNK_BYTES) {
    return "chunk";
  }
  return "transfer";
}

/**
 * PHASE 12.1 (REVIEW-06): belirsiz yazımın gözlenen versiyonu beklenen içerikle birebir mi? Yalnızca o
 * değişmez versiyon okunur (en fazla beklenen boyut kadar; fazlası okunmadan reddedilir) ve SHA-256
 * karşılaştırılır. Normal görüntüleme/indirme akışında KULLANILMAZ (yalnızca nadir kurtarma yolu).
 * Her hata, uyuşmazlık veya doğrulanmamış kimlik `false` → çağıran UNKNOWN'ı korur.
 */
async function observedVersionMatches(
  storage: StorageAdapter,
  key: string,
  versionId: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<boolean> {
  let object;
  try {
    object = await storage.getObject(key, versionId);
  } catch {
    return false;
  }
  if (object.versionId !== versionId || object.contentLength !== expectedSize) {
    await object.body.cancel().catch(() => undefined);
    return false;
  }
  const reader = object.body.getReader();
  const hash = createHash("sha256");
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedSize) {
        await reader.cancel().catch(() => undefined);
        return false;
      }
      hash.update(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return false;
  }
  return total === expectedSize && hash.digest("hex") === expectedSha256;
}

/**
 * Parça isteklerinde görüntüleme audit'i aktör + dosya + biçim başına pencere içinde bir kez (D-135):
 * pdf.js bir görüntülemede birkaç aralık ister; her biri ayrı kayıt olsaydı audit gürültüye boğulurdu.
 * Tam/uzun istekler her seferinde kaydedilir. Pencere işareti kısa ömürlü teknik anahtardır (kişisel veri yok).
 *
 * PHASE 12.1 (REVIEW-01): işaret ve audit kaydı AYNI kısa transaction'dadır (ağ çağrısı yok). Audit
 * yazılamazsa işaret de geri alınır → sonraki deneme "pencerede zaten kaydedildi" sayılıp audit'siz teslim
 * edilemez. Eşzamanlı istekler işaret satırının kilidinde sıralanır: ilk istek commit edene kadar diğerleri
 * bekler; ilk istek geri alınırsa sıradaki kendi kaydını yazar. Bir istek ancak commit edilmiş bir audit
 * kaydına dayanarak tekilleştirilir.
 */
async function recordFileAccessAudit(
  db: Database,
  actor: FileActor,
  fileId: string,
  disposition: FileDisposition,
  windowed: boolean,
  entry: Parameters<typeof writeAuditLog>[1],
): Promise<void> {
  await db.transaction(async (tx) => {
    if (windowed) {
      const who = actor.kind === "STAFF" ? `user:${actor.userId}` : `token:${actor.tokenId}`;
      const count = await hitRateLimitCounter(
        tx,
        `files:viewed:${who}:${fileId}:${disposition}`,
        FILE_VIEW_AUDIT_WINDOW_SECONDS,
      );
      if (count !== 1) return;
    }
    await writeAuditLog(tx, entry);
  });
}

/**
 * Yetkili dosya okuma (FILE_STORAGE §3, PHASE 11 Range). Müşteri: yalnızca oturum başvurusunun ACTIVE
 * dosyası. Personel: ACTIVE/SUPERSEDED/REMOVED (BR-72). Doğrulanmamış/silinmekte olan → NOT_FOUND
 * (ayırt edilmez). Sıra: kayıt + yetki → aralık kararı (kayıtlı boyuta göre) → rate limit → (HEAD/416:
 * sağlayıcıya gidilmez) → audit (fail-closed, okumadan önce) → sağlayıcıdan YALNIZCA istenen aralık
 * (kayıtlı versiyon) → yanıt doğrulaması (versiyon, Content-Range, uzunluk) → tam uzunluk korumalı akış.
 */
export async function openDocumentFile(
  deps: OpenFileDeps,
  actor: FileActor,
  request: FileRequest,
): Promise<OpenFileResult> {
  const allowed = actor.kind === "CUSTOMER" ? ["ACTIVE"] : ["ACTIVE", "SUPERSEDED", "REMOVED"];
  const [row] = await deps.db
    .select({
      applicationId: files.applicationId,
      requirementId: files.requirementId,
      status: files.status,
      key: files.blobPathname,
      versionId: files.storageVersionId,
      sizeBytes: files.sizeBytes,
      sha256: files.sha256,
      filename: files.originalFilename,
    })
    .from(files)
    .innerJoin(applications, eq(applications.id, files.applicationId))
    .where(
      and(
        eq(files.id, request.fileId),
        isNull(applications.deletionRequestedAt),
        isNull(files.blobDeletedAt),
        ...(actor.kind === "CUSTOMER" ? [eq(files.applicationId, actor.applicationId)] : []),
      ),
    )
    .limit(1);
  if (
    row === undefined ||
    !allowed.includes(row.status) ||
    row.versionId === null ||
    row.sizeBytes === null ||
    row.sha256 === null ||
    !(await customerStillAllowed(deps.db, actor))
  ) {
    // Bulunamayan istekler de sayılır (kimlik taraması sınırlı kalır); sonuç ayırt edilmez.
    if (deps.allow) await deps.allow("meta");
    return { ok: false, code: "NOT_FOUND" };
  }
  const size = row.sizeBytes;
  const etag = fileEtag(request.fileId, row.sha256);
  const decision: RangeDecision =
    request.method === "HEAD" || !ifRangeAllowsPartial(request.ifRange, etag)
      ? { kind: "full" }
      : parseRangeHeader(request.rangeHeader, size);
  if (deps.allow && !(await deps.allow(classify(decision, request.method)))) {
    return { ok: false, code: "RATE_LIMITED" };
  }
  const base = { filename: row.filename, sizeBytes: size, etag };
  if (request.method === "HEAD") {
    return {
      ok: true,
      file: { ...base, status: 200, range: null, contentLength: size, stream: null },
    };
  }
  if (decision.kind === "unsatisfiable") {
    return { ok: false, code: "RANGE_NOT_SATISFIABLE", sizeBytes: size };
  }
  const range = decision.kind === "partial" ? decision.range : null;

  // Audit fail-closed ve sağlayıcı okumasından ÖNCE commit edilir (hata → teslim yok, GET yok).
  await recordFileAccessAudit(
    deps.db,
    actor,
    request.fileId,
    request.disposition,
    range !== null && rangeLength(range) <= MAX_RANGE_CHUNK_BYTES,
    {
      action: request.disposition === "inline" ? "DOCUMENT_VIEWED" : "DOCUMENT_DOWNLOADED",
      ...auditActor(actor),
      resourceType: "file",
      resourceId: request.fileId,
      applicationId: row.applicationId,
      metadata: { fileId: request.fileId, requirementId: row.requirementId },
    },
  );

  try {
    const storage = await deps.storage();
    const object = await storage.getObject(row.key, row.versionId, {
      ...(range ? { range } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const expectedLength = range === null ? size : rangeLength(range);
    const rangeOk =
      range === null
        ? object.contentRange === null
        : object.contentRange !== null &&
          object.contentRange.start === range.start &&
          object.contentRange.end === range.end &&
          object.contentRange.total === size;
    if (object.contentLength !== expectedLength || !rangeOk || object.versionId !== row.versionId) {
      await object.body.cancel().catch(() => undefined);
      console.error("[files] Storage bütünlük uyuşmazlığı", { fileId: request.fileId });
      return { ok: false, code: "INTEGRITY" };
    }
    return {
      ok: true,
      file: {
        ...base,
        status: range === null ? 200 : 206,
        range,
        contentLength: expectedLength,
        stream: exactLengthStream(object.body, expectedLength),
      },
    };
  } catch (error) {
    if (isStorageError(error, "NOT_FOUND")) {
      console.error("[files] Kayıtlı nesne storage'da yok", { fileId: request.fileId });
      return { ok: false, code: "INTEGRITY" };
    }
    if (isStorageError(error, "INTEGRITY")) {
      console.error("[files] Storage yanıtı doğrulanamadı", { fileId: request.fileId });
      return { ok: false, code: "INTEGRITY" };
    }
    return {
      ok: false,
      code: isStorageError(error, "LIMIT") ? "STORAGE_LIMIT" : "STORAGE_UNAVAILABLE",
    };
  }
}
