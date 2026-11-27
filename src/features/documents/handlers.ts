import "server-only";

import type { NextRequest } from "next/server";

import {
  FILE_DOWNLOAD_RATE_LIMIT,
  FILE_RANGE_RATE_LIMIT,
  FILE_UPLOAD_RATE_LIMIT,
} from "@/config/constants";
import { messages } from "@/lib/messages";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { validatePdfIsolated } from "@/server/pdf/validate";
import { hitRateLimitCounter } from "@/server/security/rate-limit-counter";
import { isStorageError } from "@/server/storage/errors";
import { getStorage, getStorageQuota } from "@/server/storage/factory";

import {
  acquireUploadSlot,
  bodyFailureResponse,
  checkUploadHeaders,
  errorJson,
  fileQuerySchema,
  isSameOriginRequest,
  json,
  openFailureResponse,
  pdfResponse,
  readBoundedBody,
  readFilenameHeader,
  uploadFailureResponse,
  uploadQuerySchema,
  uuidSchema,
} from "./http";
import {
  openDocumentFile,
  precheckUpload,
  uploadDocumentFile,
  type FileActor,
  type FileRequestClass,
} from "./service";

/**
 * Personel ve müşteri dosya route'larının ortak akışı (PHASE 08). Kimlik ÇAĞIRAN route'ta çözülür
 * (`getCurrentStaff()` veya `requireCustomerAccess(context)`); burada aktör yalnızca bu sonuçtan gelir —
 * istemciden aktör, rol veya başvuru kimliği alınmaz.
 */

function actorKey(actor: FileActor, kind: "upload" | "download" | "range") {
  return actor.kind === "STAFF"
    ? `files:${kind}:user:${actor.userId}`
    : `files:${kind}:token:${actor.tokenId}`;
}

async function withinUploadRateLimit(actor: FileActor): Promise<boolean> {
  const limit = FILE_UPLOAD_RATE_LIMIT;
  const count = await hitRateLimitCounter(getDb(), actorKey(actor, "upload"), limit.windowSeconds);
  return count <= limit.max;
}

export async function handleUpload(
  request: NextRequest,
  actor: FileActor,
  requirementIdRaw: string,
): Promise<Response> {
  if (!isSameOriginRequest(request)) return errorJson(403, "FORBIDDEN", "İstek reddedildi.");
  const requirementId = uuidSchema.safeParse(requirementIdRaw);
  if (!requirementId.success) return errorJson(404, "NOT_FOUND", messages.common.notFound);
  const query = uploadQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorJson(400, "VALIDATION", messages.common.validation);
  const filename = readFilenameHeader(request);
  if (filename === null) return errorJson(415, "NOT_PDF", messages.files.notPdf);
  const headers = checkUploadHeaders(request);
  if (!headers.ok) return headers.response;

  let release: (() => void) | null = null;
  try {
    const db = getDb();
    if (!(await withinUploadRateLimit(actor))) {
      return errorJson(429, "RATE_LIMITED", messages.files.rateLimited);
    }
    const storage = await getStorage();
    const quota = getStorageQuota();
    const early = await precheckUpload({ db, quota }, actor, {
      requirementId: requirementId.data,
      expectedVersion: query.data.expectedVersion,
      sizeBytes: headers.sizeBytes,
    });
    if (early !== null && !early.ok) return uploadFailureResponse(early.code, early.pdfReason);

    release = await acquireUploadSlot();
    if (release === null) return errorJson(503, "BUSY", messages.files.busy);
    const body = await readBoundedBody(request, headers.sizeBytes);
    if (!body.ok) return bodyFailureResponse(body.code);

    const result = await uploadDocumentFile(
      { db, storage, quota, validatePdf: (bytes) => validatePdfIsolated(bytes) },
      actor,
      {
        requirementId: requirementId.data,
        expectedVersion: query.data.expectedVersion,
        filename,
        bytes: body.bytes,
      },
    );
    if (!result.ok) return uploadFailureResponse(result.code, result.pdfReason);
    return json(200, {
      ok: true,
      message: messages.files.stateDone,
      fileId: result.fileId,
      versionNumber: result.versionNumber,
      documentStatus: result.documentStatus,
    });
  } catch (error) {
    if (isStorageError(error, "NOT_CONFIGURED")) {
      return errorJson(503, "STORAGE_NOT_CONFIGURED", messages.files.unavailable);
    }
    console.error("[files] Yükleme işlenemedi", {
      code: pgErrorCode(error) ?? (error instanceof Error ? error.name : "unknown"),
    });
    return errorJson(
      500,
      "INTERNAL",
      `${messages.files.unavailable} ${messages.files.keptPrevious}`,
    );
  } finally {
    release?.();
  }
}

/** İstek sınıfına göre aktör başına rate limit (PHASE 11, D-135). */
function fileRateLimiter(actor: FileActor) {
  return async (requestClass: FileRequestClass) => {
    const [kind, limit] =
      requestClass === "transfer"
        ? (["download", FILE_DOWNLOAD_RATE_LIMIT] as const)
        : (["range", FILE_RANGE_RATE_LIMIT] as const);
    const count = await hitRateLimitCounter(getDb(), actorKey(actor, kind), limit.windowSeconds);
    return count <= limit.max;
  };
}

/**
 * Dosya okuma (GET/HEAD). Kimlik ÇAĞIRAN route'ta çözülmüştür; burada yalnızca kimlik/sorgu biçimi,
 * Range/If-Range başlıkları (sözdizimi) ve iptal sinyali servise geçer. Bulunamayan, yetkisiz ve kapsam
 * dışı istekler ayırt edilmez (404) ve sağlayıcıya hiç gidilmez.
 */
export async function handleOpen(
  request: NextRequest,
  actor: FileActor,
  fileIdRaw: string,
): Promise<Response> {
  const fileId = uuidSchema.safeParse(fileIdRaw);
  if (!fileId.success) return openFailureResponse("NOT_FOUND");
  const query = fileQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return openFailureResponse("NOT_FOUND");
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  try {
    const result = await openDocumentFile(
      { db: getDb(), storage: getStorage, allow: fileRateLimiter(actor) },
      actor,
      {
        fileId: fileId.data,
        disposition: query.data.disposition,
        method,
        rangeHeader: request.headers.get("range"),
        ifRange: request.headers.get("if-range"),
        signal: request.signal,
      },
    );
    if (!result.ok) return openFailureResponse(result.code, result.sizeBytes);
    return pdfResponse(result.file, query.data.disposition);
  } catch (error) {
    if (isStorageError(error, "NOT_CONFIGURED")) return openFailureResponse("STORAGE_UNAVAILABLE");
    console.error("[files] Dosya açılamadı", {
      code: pgErrorCode(error) ?? (error instanceof Error ? error.name : "unknown"),
    });
    return openFailureResponse("STORAGE_UNAVAILABLE");
  }
}
