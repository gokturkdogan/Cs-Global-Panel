import "server-only";

import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { MAX_PDF_SIZE_BYTES, PDF_VALIDATION_LIMITS } from "@/config/constants";

import type { PdfCheck, PdfLimits } from "./pdf-checks";

/**
 * Yapısal PDF doğrulamasını izole worker thread'de çalıştırır (D-099): bellek sınırı, süre sınırı
 * (aşılırsa worker sonlandırılır → RESOURCE_LIMIT) ve boş ortam değişkenleri. Worker başlatılamazsa
 * hata fırlatılır (sistem hatası — kullanıcının dosyası "geçersiz" sayılmaz).
 */

const WORKER_PATH = join(process.cwd(), "src", "server", "pdf", "validation-worker.ts");

export const PDF_LIMITS: PdfLimits = {
  maxBytes: MAX_PDF_SIZE_BYTES,
  maxPages: PDF_VALIDATION_LIMITS.maxPages,
  maxObjects: PDF_VALIDATION_LIMITS.maxObjects,
  maxInflatedBytes: PDF_VALIDATION_LIMITS.maxInflatedBytes,
  maxNestingDepth: PDF_VALIDATION_LIMITS.maxNestingDepth,
};

export class PdfValidatorUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`PDF doğrulayıcı çalıştırılamadı (${code})`);
    this.name = "PdfValidatorUnavailableError";
  }
}

export function validatePdfIsolated(
  bytes: Uint8Array,
  options: { readonly timeoutMs?: number; readonly limits?: PdfLimits } = {},
): Promise<PdfCheck> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const copy = view.buffer;
  return new Promise<PdfCheck>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const worker = new Worker(WORKER_PATH, {
      workerData: { bytes: copy, limits: options.limits ?? PDF_LIMITS },
      transferList: [copy],
      env: {},
      execArgv: [],
      stdout: true,
      stderr: true,
      resourceLimits: {
        maxOldGenerationSizeMb: PDF_VALIDATION_LIMITS.maxHeapMb,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    const timer = setTimeout(() => {
      settle(() => resolve({ ok: false, reason: "RESOURCE_LIMIT" }));
      void worker.terminate();
    }, options.timeoutMs ?? PDF_VALIDATION_LIMITS.timeoutMs);
    worker.once("message", (message: PdfCheck) => {
      settle(() => resolve(message));
      void worker.terminate();
    });
    worker.once("error", (error: Error & { code?: string }) => {
      if (error.code === "ERR_WORKER_OUT_OF_MEMORY") {
        settle(() => resolve({ ok: false, reason: "RESOURCE_LIMIT" }));
      } else {
        settle(() => reject(new PdfValidatorUnavailableError(error.code ?? error.name)));
      }
    });
    worker.once("exit", (code) => {
      settle(() => reject(new PdfValidatorUnavailableError(`exit-${code}`)));
    });
  });
}
