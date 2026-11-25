import { TriangleAlert, Upload } from "lucide-react";

import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { DocumentStatusBadge } from "@/features/applications/components/document-status-badge";
import { RequiredBadge } from "@/features/services/components/status-badges";
import { messages } from "@/lib/messages";

import type { CustomerDocument } from "../queries";

const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);

/**
 * Evrak kartı (DESIGN_SYSTEM §7). Snapshot metinleri düz metin olarak (React metni, satır sonları
 * korunur). Yükleme alanı PHASE 08'e kadar yalnızca bilgi kutusudur: dosya seçici, storage bağlantısı
 * veya sahte başarı yoktur. Salt okunur statülerde yükleme alanı gösterilmez.
 */
export function DocumentCard({
  document,
  index,
  editable,
}: {
  readonly document: CustomerDocument;
  readonly index: number;
  readonly editable: boolean;
}) {
  return (
    <li
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="portal-document"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-lg leading-7 font-semibold wrap-anywhere">
          <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
          {document.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <RequiredBadge isRequired={document.isRequired} />
          <DocumentStatusBadge status={document.status} />
        </div>
      </div>
      {document.revisionMessage ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-base wrap-anywhere whitespace-pre-line text-warning-strong"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{document.revisionMessage}</span>
        </p>
      ) : null}
      {document.description ? (
        <p className="text-base wrap-anywhere whitespace-pre-line text-muted-foreground">
          {document.description}
        </p>
      ) : null}
      {document.instructions ? (
        <details className="group rounded-lg border bg-muted/30 p-3" open>
          <summary className="min-h-11 cursor-pointer content-center text-base font-medium text-foreground">
            Nasıl yüklemeliyim?
          </summary>
          <p
            className="mt-1 text-base wrap-anywhere whitespace-pre-line text-foreground"
            data-testid="portal-instructions"
          >
            {document.instructions}
          </p>
        </details>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Dosya türü: PDF · En fazla {MAX_PDF_MB} MB · Bu evrak için tek dosya
      </p>
      {editable && document.status !== "APPROVED" ? (
        <div
          className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-3 text-base text-muted-foreground"
          data-testid="upload-placeholder"
        >
          <Upload aria-hidden="true" className="size-5 shrink-0" />
          <span>{messages.portal.uploadSoon}</span>
        </div>
      ) : null}
    </li>
  );
}
