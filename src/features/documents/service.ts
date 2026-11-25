import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { UPLOAD_PENDING_TTL_SECONDS } from "@/config/constants";
import type { DocumentStatus } from "@/config/statuses";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import {
  applicationAccessTokens as tokens,
  applicationDocumentFiles as files,
  applicationDocumentRequirements as requirements,
  applications,
} from "@/server/db/schema";
import type { StorageQuota } from "@/server/env";
import type { PdfCheck, PdfRejection } from "@/server/pdf/pdf-checks";
import { isStorageError } from "@/server/storage/errors";
import { fitsQuota, lockStorageQuota, readStorageUsage } from "@/server/storage/quota";
import { buildObjectKey, type StorageAdapter } from "@/server/storage/types";

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
};

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
    return { fileId, key, applicationId: target.applicationId };
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

  // 3. Storage yazımı (transaction ve kilit yok).
  let versionId: string | null;
  try {
    ({ versionId } = await deps.storage.putObject({
      key: reserved.key,
      body: input.bytes,
      contentType: "application/pdf",
      sizeBytes: input.bytes.byteLength,
      md5Hex,
    }));
  } catch (error) {
    if (isStorageError(error, "AMBIGUOUS")) {
      // Yanıt kayboldu: yazma gerçekleşmiş olabilir → kör yeniden yazma yok; nesne kimliğiyle mutabakat.
      const head = await deps.storage.headObject(reserved.key, null).catch(() => null);
      versionId =
        head !== null && head.contentLength === input.bytes.byteLength ? head.versionId : null;
      if (versionId === null) {
        await abandon(deps.db, actor, reserved, input.requirementId, "STORAGE_AMBIGUOUS");
        return failure("STORAGE_UNAVAILABLE");
      }
    } else {
      const limited = isStorageError(error, "LIMIT");
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
    // Sağlayıcı versiyon kimliği döndürmediyse dosya aktifleştirilmez (versiyona özgü silme şartı).
    await abandon(deps.db, actor, reserved, input.requirementId, "STORAGE_NO_VERSION");
    return failure("STORAGE_UNAVAILABLE");
  }

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
        .update(files)
        .set({ blobDeletedAt: sql`now()` })
        .where(and(eq(files.id, reserved.fileId), eq(files.status, "REJECTED")))
        .catch(() => undefined);
    }
    return failure(activation.code);
  }
  if (activation.kind === "gone") return failure("STATE_CHANGED");
  return activation.result;
}

// ---------------------------------------------------------------- Görüntüleme / indirme

export type FileDisposition = "inline" | "attachment";

export type OpenedFile = {
  readonly filename: string;
  readonly sizeBytes: number;
  readonly stream: ReadableStream<Uint8Array>;
};

export type OpenFileResult =
  | { readonly ok: true; readonly file: OpenedFile }
  | {
      readonly ok: false;
      readonly code: "NOT_FOUND" | "STORAGE_LIMIT" | "STORAGE_UNAVAILABLE" | "INTEGRITY";
    };

/**
 * Yetkili dosya okuma (FILE_STORAGE §3). Müşteri: yalnızca oturum başvurusunun ACTIVE dosyası.
 * Personel: ACTIVE/SUPERSEDED/REMOVED (BR-72). Doğrulanmamış/silinmekte olan → NOT_FOUND (ayırt edilmez).
 * Storage çağrısı yalnızca yetki geçtikten sonra yapılır; yanıt boyutu kayıtla eşleşmezse sunulmaz.
 * Audit (`DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED`) storage okumasından önce yazılır (fail-closed).
 */
export async function openDocumentFile(
  deps: { readonly db: Database; readonly storage: () => Promise<StorageAdapter> },
  actor: FileActor,
  fileId: string,
  disposition: FileDisposition,
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
      filename: files.originalFilename,
    })
    .from(files)
    .innerJoin(applications, eq(applications.id, files.applicationId))
    .where(
      and(
        eq(files.id, fileId),
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
    row.sizeBytes === null
  ) {
    return { ok: false, code: "NOT_FOUND" };
  }
  if (!(await customerStillAllowed(deps.db, actor))) return { ok: false, code: "NOT_FOUND" };

  await writeAuditLog(deps.db, {
    action: disposition === "inline" ? "DOCUMENT_VIEWED" : "DOCUMENT_DOWNLOADED",
    ...auditActor(actor),
    resourceType: "file",
    resourceId: fileId,
    applicationId: row.applicationId,
    metadata: { fileId, requirementId: row.requirementId },
  });

  try {
    const storage = await deps.storage();
    const object = await storage.getObject(row.key, row.versionId);
    if (object.contentLength !== row.sizeBytes) {
      await object.body.cancel().catch(() => undefined);
      console.error("[files] Storage bütünlük uyuşmazlığı", { fileId });
      return { ok: false, code: "INTEGRITY" };
    }
    return {
      ok: true,
      file: { filename: row.filename, sizeBytes: row.sizeBytes, stream: object.body },
    };
  } catch (error) {
    if (isStorageError(error, "NOT_FOUND")) {
      console.error("[files] Kayıtlı nesne storage'da yok", { fileId });
      return { ok: false, code: "INTEGRITY" };
    }
    return {
      ok: false,
      code: isStorageError(error, "LIMIT") ? "STORAGE_LIMIT" : "STORAGE_UNAVAILABLE",
    };
  }
}
