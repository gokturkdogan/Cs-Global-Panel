"use client";

import { Eye, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/** pdf.js ve görüntüleyici kodu yalnızca pencere ilk açıldığında indirilir (ilk sayfa yükünde yok). */
const PdfViewer = lazy(() => import("./pdf-viewer"));

type Props = {
  /** Aynı kökenli dosya uç noktası (`?disposition=inline` dahil); kimlik/kapsam sunucuda çözülür. */
  readonly url: string;
  readonly downloadUrl: string;
  readonly sizeBytes: number;
  readonly title: string;
  readonly label?: string;
  readonly size?: "default" | "compact" | "large";
};

/**
 * "Görüntüle" düğmesi + tam ekran görüntüleyici penceresi (PHASE 11, D-136). Radix Dialog: odak kapanı,
 * Escape ile kapanış, kapanınca odak düğmeye döner. Bağlantı değil düğmedir → bağlantı ön-getirmesi
 * (prefetch) ve tarayıcı geçmişine dosya adresi yazılması yoktur.
 */
export function PdfViewerDialog({ url, downloadUrl, sizeBytes, title, label, size }: Props) {
  const [open, setOpen] = useState(false);
  const triggerClass =
    size === "large"
      ? "min-h-11 px-4 text-base"
      : size === "compact"
        ? "min-h-9 px-3 text-xs"
        : "min-h-10 px-3 text-sm";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg border bg-background font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${triggerClass}`}
          data-testid="pdf-view-button"
        >
          <Eye aria-hidden="true" className={size === "large" ? "size-5" : "size-4"} />
          {label ?? messages.files.view}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-foreground/50" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col bg-background focus:outline-none sm:inset-4 sm:rounded-xl sm:border sm:shadow-md"
          data-testid="pdf-viewer-dialog"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <Dialog.Title className="min-w-0 truncate text-base font-semibold" title={title}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-lg" aria-label={messages.viewer.close}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          {open ? (
            <Suspense
              fallback={
                <p className="p-6 text-center text-sm text-muted-foreground" role="status">
                  {messages.viewer.loading}
                </p>
              }
            >
              <PdfViewer url={url} sizeBytes={sizeBytes} downloadUrl={downloadUrl} title={title} />
            </Suspense>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
