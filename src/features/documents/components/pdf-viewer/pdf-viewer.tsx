"use client";

import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MAX_RANGE_CHUNK_BYTES, PDF_VIEWER_CHUNK_BYTES } from "@/config/constants";
import { messages } from "@/lib/messages";

import { computeCanvasSize, MAX_CANVAS_PIXELS } from "./canvas-size";
import { createRangeFetcher, createWindowedReader, RangeFetchError } from "./range-fetch";

/**
 * Tembel yüklenen PDF görüntüleyici (PHASE 11, D-136). pdf.js yalnızca görüntüleyici açıldığında
 * yüklenir; worker yereldir. Veri yalnızca sunucunun aralık uç noktasından, gereken parçalar kadar
 * okunur (`PDFDataRangeTransport`; otomatik ön-getirme ve akış kapalı). Metin/annotation/form katmanı,
 * betik, XFA ve WebAssembly kapalı. Tuval piksel sayısı sınırlıdır. Kapatınca istekler iptal edilir,
 * belge ve worker yok edilir; PDF baytları kalıcı hiçbir yere yazılmaz.
 */

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
/** İlk 4 istekten sonra hizalı 1 MiB bloklar (dağınık yapılı PDF'lerde işlem sayısı — D-136). */
const WINDOWING = {
  threshold: 4,
  window: MAX_RANGE_CHUNK_BYTES,
  maxChunk: MAX_RANGE_CHUNK_BYTES,
} as const;

type Status = "loading" | "ready" | "error";

type Props = {
  readonly url: string;
  readonly sizeBytes: number;
  readonly downloadUrl: string;
  readonly title: string;
};

export default function PdfViewer({ url, sizeBytes, downloadUrl, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>(messages.viewer.loadFailed);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [pageInput, setPageInput] = useState("");

  // Belge yükleme: aralık taşıyıcısı + yerel worker; kapanışta her şey iptal edilir.
  // PHASE 12.1 (REVIEW-02): her kaynak OLUŞTURULDUĞU anda serbest bırakma listesine girer (worker, ilk
  // aralık isteğinden ÖNCE). Hata, iptal, kapanış ve eski (stale) tamamlanma yollarının hepsi aynı,
  // bir kez çalışan `release`'i kullanır. pdf.js dışarıdan verilen worker'ın sahibi değildir: yükleme
  // görevi onu yok etmez, `PDFWorker.destroy()` port olarak verilen Worker'ı sonlandırmaz → açık
  // `terminate` gerekir (pdfjs-dist 6.5 `getDocument` / `PDFWorker.destroy`).
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let released = false;
    let worker: Worker | null = null;
    let pdfWorker: { destroy(): void } | null = null;
    let task: { destroy(): Promise<void> } | null = null;
    let reader: { clear(): void } | null = null;
    const release = () => {
      if (released) return;
      released = true;
      controller.abort();
      reader?.clear();
      if (task !== null) void task.destroy().catch(() => undefined);
      pdfWorker?.destroy();
      worker?.terminate();
    };

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
      const created = pdfjs.PDFWorker.create({ port: worker });
      pdfWorker = created;
      const fetchRange = createRangeFetcher(url, sizeBytes, controller.signal);
      // Küçük dosya (≤ 1 MiB): tek istekte tamamı (sağlayıcı işlem sayısı artmaz); büyük dosya: ilk parça.
      const initialEnd =
        (sizeBytes <= MAX_RANGE_CHUNK_BYTES ? sizeBytes : PDF_VIEWER_CHUNK_BYTES) - 1;
      const initial = await fetchRange(0, initialEnd);
      if (disposed) return;
      const transport = new pdfjs.PDFDataRangeTransport(sizeBytes, initial);
      const windowed = createWindowedReader(fetchRange, sizeBytes, WINDOWING);
      reader = windowed;
      transport.requestDataRange = (begin: number, end: number) => {
        windowed
          .read(begin, end)
          .then((bytes) => {
            if (!released) transport.onDataRange(begin, bytes);
          })
          .catch(() => {
            if (!disposed) {
              setErrorMessage(messages.viewer.loadFailed);
              setStatus("error");
            }
          });
      };
      const loading = pdfjs.getDocument({
        range: transport,
        worker: created,
        rangeChunkSize: PDF_VIEWER_CHUNK_BYTES,
        disableAutoFetch: true,
        disableStream: true,
        enableXfa: false,
        useWasm: false,
        isOffscreenCanvasSupported: false,
        stopAtErrors: false,
        maxImageSize: MAX_CANVAS_PIXELS,
        canvasMaxAreaInBytes: MAX_CANVAS_PIXELS * 4,
      });
      task = loading;
      const doc = await loading.promise;
      if (disposed) return;
      docRef.current = doc;
      setPageCount(doc.numPages);
      setStatus("ready");
    })().catch((error: unknown) => {
      // Yükleme başarısız: görüntüleyici bu belgeyle devam edemez → kaynaklar hemen serbest.
      release();
      if (disposed) return;
      setErrorMessage(
        error instanceof RangeFetchError && error.status === 429
          ? messages.files.rateLimited
          : error instanceof RangeFetchError && error.status === 404
            ? messages.viewer.notAvailable
            : messages.viewer.loadFailed,
      );
      setStatus("error");
    });

    return () => {
      disposed = true;
      renderRef.current?.cancel();
      docRef.current = null;
      release();
    };
  }, [url, sizeBytes]);

  // Sayfa çizimi: kapsayıcı genişliğine sığdır × yakınlaştırma; tuval pikseli sınırlı. Yeni sayfa/ölçek
  // önceki çizimi iptal eder.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (status !== "ready" || doc === null || canvas === null || frame === null) return;
    let cancelled = false;
    (async () => {
      renderRef.current?.cancel();
      // Çizim durumu DOM özniteliğinde (testler ilk sayfanın çizildiğini buradan bekler).
      canvas.dataset.rendered = "false";
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const fit = Math.max(0.1, (frame.clientWidth - 16) / base.width);
      const viewport = pdfPage.getViewport({ scale: fit * ZOOM_LEVELS[zoomIndex]! });
      // REVIEW-03: tuval belleği ayrılmadan önce kesin boyut/piksel sınırı (taban ölçek yok).
      const size = computeCanvasSize(viewport.width, viewport.height, window.devicePixelRatio);
      if (size === null) {
        setErrorMessage(messages.viewer.renderFailed);
        setStatus("error");
        return;
      }
      const { ratio } = size;
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = pdfPage.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        annotationMode: 0, // AnnotationMode.DISABLE: bağlantı/form/betik katmanı yok
      });
      renderRef.current = task;
      await task.promise;
      canvas.dataset.rendered = String(page);
    })().catch((error: unknown) => {
      if (cancelled) return;
      if ((error as { name?: string } | null)?.name === "RenderingCancelledException") return;
      setErrorMessage(messages.viewer.renderFailed);
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [status, page, zoomIndex]);

  // Klavye (PHASE 11.1): görüntüleyici açıkken ←/PageUp önceki, →/PageDown sonraki, Home/End ilk/son
  // sayfa. Odak pencerenin herhangi bir yerinde olabilir; metin alanında yazarken devre dışı.
  useEffect(() => {
    if (status !== "ready") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const targets: Record<string, number> = {
        ArrowRight: page + 1,
        PageDown: page + 1,
        ArrowLeft: page - 1,
        PageUp: page - 1,
        Home: 1,
        End: pageCount,
      };
      const target = targets[event.key];
      if (target === undefined) return;
      event.preventDefault();
      setPage(Math.min(pageCount, Math.max(1, target)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, page, pageCount]);

  if (status === "error") {
    return (
      <div className="grid place-items-center gap-4 p-6 text-center" data-testid="pdf-viewer-error">
        <p role="alert" className="max-w-sm text-base text-foreground">
          {errorMessage}
        </p>
        <a
          href={downloadUrl}
          download=""
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-base font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Download aria-hidden="true" className="size-5" />
          {messages.files.download}
        </a>
      </div>
    );
  }

  const goTo = (target: number) => {
    if (status !== "ready" || !Number.isInteger(target)) return;
    setPage(Math.min(pageCount, Math.max(1, target)));
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="pdf-viewer"
      aria-busy={status !== "ready"}
      aria-describedby="pdf-viewer-keys"
    >
      <p id="pdf-viewer-keys" className="sr-only">
        {messages.viewer.keyboardHint}
      </p>
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2"
        role="toolbar"
        aria-label={messages.viewer.toolbar}
      >
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={messages.viewer.previous}
            disabled={status !== "ready" || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p
            className="min-w-24 text-center text-sm tabular-nums"
            aria-live="polite"
            data-testid="pdf-viewer-page-indicator"
          >
            {status === "ready" ? messages.viewer.pageOf(page, pageCount) : messages.viewer.loading}
          </p>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={messages.viewer.next}
            disabled={status !== "ready" || page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {pageCount > 2 ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              goTo(Number(pageInput));
              setPageInput("");
            }}
          >
            <label htmlFor="pdf-viewer-page-input" className="sr-only">
              {messages.viewer.pageInput}
            </label>
            <input
              id="pdf-viewer-page-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={pageCount}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              placeholder={messages.viewer.pagePlaceholder}
              disabled={status !== "ready"}
              className="h-11 w-20 rounded-lg border border-input bg-background px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              data-testid="pdf-viewer-page-input"
            />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={status !== "ready" || pageInput === ""}
            >
              {messages.viewer.go}
            </Button>
          </form>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={messages.viewer.zoomOut}
            disabled={status !== "ready" || zoomIndex === 0}
            onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <p className="w-14 text-center text-sm tabular-nums" data-testid="pdf-viewer-zoom">
            %{Math.round(ZOOM_LEVELS[zoomIndex]! * 100)}
          </p>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label={messages.viewer.zoomIn}
            disabled={status !== "ready" || zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex((value) => Math.min(ZOOM_LEVELS.length - 1, value + 1))}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div ref={frameRef} className="min-h-0 flex-1 overflow-auto bg-muted p-2">
        {status === "loading" ? (
          <p className="p-6 text-center text-sm text-muted-foreground" role="status">
            {messages.viewer.loading}
          </p>
        ) : null}
        <canvas
          ref={canvasRef}
          className={`mx-auto block bg-white shadow-sm ${status === "ready" ? "" : "hidden"}`}
          role="img"
          aria-label={messages.viewer.pageImage(title, page)}
          data-testid="pdf-viewer-canvas"
          data-page={page}
        />
      </div>
    </div>
  );
}
