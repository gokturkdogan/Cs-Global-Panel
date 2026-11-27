import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  ALLOWED_FILE_MIME,
  MAX_CONCURRENT_UPLOADS,
  MAX_PDF_SIZE_BYTES,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from "@/config/constants";
import { messages } from "@/lib/messages";
import { getServerEnv } from "@/server/env";
import type { PdfRejection } from "@/server/pdf/pdf-checks";
import { isTrustedRequestOrigin } from "@/server/security/request-origin";

import { contentDisposition, sanitizeFilename } from "./domain/filename";
import { contentRangeHeader, unsatisfiedRangeHeader } from "./domain/byte-range";
import type { FileDisposition, OpenedFile, OpenFileFailure, UploadFailureCode } from "./service";

/**
 * Dosya Route Handler'larının ortak HTTP katmanı (PHASE 08, D-100). Proxy bu yolları kapsamaz
 * (gövde tamponlama/kesme yok — D-100); köken, içerik türü, boyut, süre ve eşzamanlılık burada
 * denetlenir. Yanıtlar `no-store`, `no-referrer`, `nosniff`; JSON gövdesi yalnızca Türkçe mesaj ve kod
 * içerir (storage anahtarı, bucket, sağlayıcı URL'si veya iç ayrıntı yok).
 */

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Frame-Options": "DENY",
} as const;

export function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

export function errorJson(status: number, code: string, message: string): NextResponse {
  return json(status, { ok: false, code, message });
}

/** Durum değiştiren istek APP_URL kökeninden mi? (Origin zorunlu — D-069; CSRF koruması) */
export function isSameOriginRequest(request: NextRequest): boolean {
  return isTrustedRequestOrigin({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    appUrl: getServerEnv().appUrl,
  });
}

export const uploadQuerySchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1).max(1_000_000) })
  .strict();

export const fileQuerySchema = z
  .object({ disposition: z.enum(["inline", "attachment"]).default("attachment") })
  .strict();

export const uuidSchema = z.uuid();

/** Dosya adı başlığı: istemci `encodeURIComponent` ile gönderir; sanitize edilir, ≤ 1024 karakter. */
export function readFilenameHeader(request: NextRequest): string | null {
  const raw = request.headers.get("x-upload-filename");
  if (raw === null || raw.length === 0 || raw.length > 1024) return null;
  try {
    return sanitizeFilename(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export type BodyCheck =
  | { readonly ok: true; readonly sizeBytes: number }
  | { readonly ok: false; readonly response: NextResponse };

/** Başlık ön kontrolü: içerik türü PDF, `Content-Length` zorunlu, 1…10 485 760 bayt. */
export function checkUploadHeaders(request: NextRequest): BodyCheck {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== ALLOWED_FILE_MIME) {
    return { ok: false, response: errorJson(415, "NOT_PDF", messages.files.notPdf) };
  }
  const declared = request.headers.get("content-length");
  if (declared === null || !/^[0-9]{1,9}$/.test(declared)) {
    return { ok: false, response: errorJson(411, "LENGTH_REQUIRED", messages.files.unavailable) };
  }
  const sizeBytes = Number(declared);
  if (sizeBytes === 0)
    return { ok: false, response: errorJson(400, "EMPTY", messages.files.empty) };
  if (sizeBytes > MAX_PDF_SIZE_BYTES) {
    return { ok: false, response: errorJson(413, "TOO_LARGE", messages.files.tooLarge) };
  }
  return { ok: true, sizeBytes };
}

export type BodyRead =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly code: "TOO_LARGE" | "LENGTH_MISMATCH" | "ABORTED" | "TIMEOUT" };

/**
 * Gövdeyi sınırlı okur: gerçekten okunan bayt sayısı 10 485 760'ı aşarsa veya beyan edilen uzunlukla
 * uyuşmazsa durur (Content-Length tek başına güvenilmez). Bellek üst sınırı beyan edilen boyuttur.
 * İstemci bağlantıyı keserse veya süre dolarsa okuma iptal edilir.
 */
export async function readBoundedBody(request: NextRequest, declared: number): Promise<BodyRead> {
  const reader = request.body?.getReader();
  if (reader === undefined) return { ok: false, code: "LENGTH_MISMATCH" };
  const buffer = new Uint8Array(declared);
  let received = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, UPLOAD_REQUEST_TIMEOUT_MS);
  try {
    for (;;) {
      if (request.signal.aborted) return { ok: false, code: "ABORTED" };
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > declared) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          code: received + value.byteLength > MAX_PDF_SIZE_BYTES ? "TOO_LARGE" : "LENGTH_MISMATCH",
        };
      }
      buffer.set(value, received);
      received += value.byteLength;
    }
  } catch {
    return { ok: false, code: timedOut ? "TIMEOUT" : "ABORTED" };
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) return { ok: false, code: "TIMEOUT" };
  if (received !== declared) return { ok: false, code: "LENGTH_MISMATCH" };
  return { ok: true, bytes: buffer };
}

/**
 * Süreç başına sınırlı eşzamanlılık (bellek: en fazla MAX_CONCURRENT_UPLOADS × 10 MB gövde + aynı sayıda
 * doğrulama worker'ı). Sınır doluysa istek sınırlı bir kuyrukta bekler (en fazla `maxWaiting` istek,
 * `waitMs` süre); aksi hâlde `null` → 503. Gövde slot alınmadan okunmaz (TCP geri basıncı).
 */
let activeUploads = 0;
const waiters: (() => void)[] = [];

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else activeUploads -= 1;
}

export async function acquireUploadSlot(
  options: { readonly waitMs?: number; readonly maxWaiting?: number } = {},
): Promise<(() => void) | null> {
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      releaseSlot();
    }
  };
  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    activeUploads += 1;
    return release;
  }
  if (waiters.length >= (options.maxWaiting ?? 16)) return null;
  return new Promise((resolve) => {
    const grant = () => {
      clearTimeout(timer);
      resolve(release);
    };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(grant);
      if (index !== -1) waiters.splice(index, 1);
      resolve(null);
    }, options.waitMs ?? 30_000);
    waiters.push(grant);
  });
}

const PDF_MESSAGES: Record<PdfRejection, string> = {
  NOT_PDF: messages.files.notPdf,
  ACTIVE_CONTENT: messages.files.activeContent,
  EMBEDDED_FILE: messages.files.embeddedFile,
  ENCRYPTED: messages.files.encrypted,
  MALFORMED: messages.files.malformed,
  TOO_LARGE: messages.files.tooLarge,
  RESOURCE_LIMIT: messages.files.resourceLimit,
};

const FAILURES: Record<Exclude<UploadFailureCode, "INVALID_PDF">, [number, string]> = {
  NOT_FOUND: [404, messages.files.notAllowed],
  NOT_ALLOWED: [409, messages.files.notAllowed],
  CONFLICT: [409, messages.files.conflict],
  UPLOAD_IN_PROGRESS: [409, messages.files.inProgress],
  QUOTA_EXCEEDED: [507, `${messages.files.quotaFullTitle} ${messages.files.quotaFull}`],
  ACCESS_ENDED: [401, messages.files.accessEnded],
  STATE_CHANGED: [409, messages.files.stateChanged],
  STORAGE_LIMIT: [503, messages.files.providerLimit],
  STORAGE_UNAVAILABLE: [503, messages.files.unavailable],
  INTERNAL: [500, messages.files.unavailable],
};

export function uploadFailureResponse(code: UploadFailureCode, pdfReason?: PdfRejection) {
  if (code === "INVALID_PDF") {
    const reason = pdfReason ?? "MALFORMED";
    return errorJson(422, reason, `${PDF_MESSAGES[reason]} ${messages.files.keptPrevious}`);
  }
  const [status, message] = FAILURES[code];
  const keep = status === 404 || code === "ACCESS_ENDED" ? "" : ` ${messages.files.keptPrevious}`;
  return errorJson(status, code, `${message}${keep}`);
}

export function bodyFailureResponse(code: "TOO_LARGE" | "LENGTH_MISMATCH" | "ABORTED" | "TIMEOUT") {
  if (code === "TOO_LARGE") return errorJson(413, code, messages.files.tooLarge);
  return errorJson(400, code, messages.files.network);
}

/**
 * PDF yanıtı (stream; 200 tam veya 206 aralık — PHASE 11, D-135). Güvenilmeyen ad yalnızca güvenli
 * `Content-Disposition` ile. İndirmede CSP `sandbox`; satır içi görüntülemede tarayıcının yerleşik PDF
 * görüntüleyicisinin çalışabilmesi için `sandbox` yok, fakat tüm alt kaynak/çerçeve/form yüklemeleri kapalı
 * (D-104). `Accept-Ranges: bytes`; `ETag` opak güçlü doğrulayıcıdır (If-Range). Önbellek yok (`no-store`);
 * CORS başlığı yok (yalnızca aynı köken). HEAD'de gövde yoktur.
 */
export function pdfResponse(file: OpenedFile, disposition: FileDisposition): Response {
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": ALLOWED_FILE_MIME,
    "Content-Length": String(file.contentLength),
    "Content-Disposition": contentDisposition(disposition, file.filename),
    "Accept-Ranges": "bytes",
    ETag: file.etag,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy":
      disposition === "attachment"
        ? "default-src 'none'; sandbox; frame-ancestors 'none'"
        : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
  if (file.range !== null)
    headers["Content-Range"] = contentRangeHeader(file.range, file.sizeBytes);
  return new Response(file.stream, { status: file.status, headers });
}

export function openFailureResponse(code: OpenFileFailure, sizeBytes?: number) {
  if (code === "NOT_FOUND") return errorJson(404, code, messages.common.notFound);
  if (code === "RATE_LIMITED") return errorJson(429, code, messages.files.rateLimited);
  if (code === "RANGE_NOT_SATISFIABLE") {
    const response = errorJson(416, code, messages.files.rangeNotSatisfiable);
    response.headers.set("Accept-Ranges", "bytes");
    if (sizeBytes !== undefined) {
      response.headers.set("Content-Range", unsatisfiedRangeHeader(sizeBytes));
    }
    return response;
  }
  if (code === "STORAGE_LIMIT") return errorJson(503, code, messages.files.providerLimit);
  return errorJson(code === "INTEGRITY" ? 502 : 503, code, messages.files.unavailable);
}
