/**
 * PDF doğrulama worker'ı (PHASE 08, D-099). Ana süreçten ayrı bir V8 izolatında, bellek sınırı
 * (`resourceLimits`) ve süre sınırıyla (ana taraf `terminate`) çalışır. Ortam değişkenleri boştur
 * (`env: {}`): ayrıştırıcı hiçbir secret'ı göremez. Ağ erişimi, PDF JavaScript'i veya harici program
 * çalıştırma yoktur (pdf.js yalnızca bellekteki baytları ayrıştırır).
 * Node.js tip ayıklama (type stripping) ile doğrudan `.ts` olarak çalışır; Next.js paketine girmez.
 */
import { parentPort, workerData } from "node:worker_threads";

import { validatePdf, type PdfjsModule, type PdfLimits } from "./pdf-checks.ts";

// pdf.js yükleme sırasında (ör. canvas paketi yok) konsola uyarı yazar; worker çıktısı sessizdir.
const silent = () => undefined;
console.log = silent;
console.warn = silent;
console.info = silent;
console.error = silent;

const input = workerData as { readonly bytes: ArrayBuffer; readonly limits: PdfLimits };

// pdf.js "fake worker"ı aynı thread'de kullanır: worker modülü açıkça yüklenir (dinamik göreli yol
// çözümlemesine — paketleyici çıktısında kırılabilir — bağımlı kalınmaz).
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker =
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

const result = await validatePdf(
  new Uint8Array(input.bytes),
  input.limits,
  async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule,
);
parentPort?.postMessage(result);
