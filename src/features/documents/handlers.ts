import "server-only";

import type { NextRequest } from "next/server";

import { FILE_DOWNLOAD_RATE_LIMIT, FILE_UPLOAD_RATE_LIMIT } from "@/config/constants";
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
import { openDocumentFile, precheckUpload, uploadDocumentFile, type FileActor } from "./service";

/**
 * Personel ve müşteri dosya route'larının ortak akışı (PHASE 08). Kimlik ÇAĞIRAN route'ta çözülür
 * (`getCurrentStaff()` veya `requireCustomerAccess(context)`); burada aktör yalnızca bu sonuçtan gelir —
 * istemciden aktör, rol veya başvuru kimliği alınmaz.
 */

function actorKey(actor: FileActor, kind: "upload" | "download") {
  return actor.kind === "STAFF"
    ? `files:${kind}:user:${actor.userId}`
    : `files:${kind}:token:${actor.tokenId}`;
}

async function withinRateLimit(actor: FileActor, kind: "upload" | "download"): Promise<boolean> {
  const limit = kind === "upload" ? FILE_UPLOAD_RATE_LIMIT : FILE_DOWNLOAD_RATE_LIMIT;
  const count = await hitRateLimitCounter(getDb(), actorKey(actor, kind), limit.windowSeconds);
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
    if (!(await withinRateLimit(actor, "upload"))) {
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

export async function handleOpen(
  request: NextRequest,
  actor: FileActor,
  fileIdRaw: string,
): Promise<Response> {
  const fileId = uuidSchema.safeParse(fileIdRaw);
  if (!fileId.success) return openFailureResponse("NOT_FOUND");
  const query = fileQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return openFailureResponse("NOT_FOUND");
  try {
    if (!(await withinRateLimit(actor, "download"))) {
      return errorJson(429, "RATE_LIMITED", messages.files.rateLimited);
    }
    const result = await openDocumentFile(
      { db: getDb(), storage: getStorage },
      actor,
      fileId.data,
      query.data.disposition,
    );
    if (!result.ok) return openFailureResponse(result.code);
    return pdfResponse(result.file, query.data.disposition);
  } catch (error) {
    if (isStorageError(error, "NOT_CONFIGURED")) return openFailureResponse("STORAGE_UNAVAILABLE");
    console.error("[files] Dosya açılamadı", {
      code: pgErrorCode(error) ?? (error instanceof Error ? error.name : "unknown"),
    });
    return openFailureResponse("STORAGE_UNAVAILABLE");
  }
}
