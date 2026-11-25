import { Download, Eye, FileText, TriangleAlert } from "lucide-react";

import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { DocumentStatusBadge } from "@/features/applications/components/document-status-badge";
import { PdfUpload } from "@/features/documents/components/pdf-upload";
import { formatFileSize } from "@/features/documents/domain/filename";
import { RequiredBadge } from "@/features/services/components/status-badges";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import type { CustomerDocument } from "../queries";

const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);

/**
 * Evrak kartı (DESIGN_SYSTEM §7). Snapshot metinleri düz metin olarak (React metni, satır sonları
 * korunur). PHASE 08: yalnızca ACTIVE dosya gösterilir (ad, boyut, tarih, görüntüle/indir); yükleme
 * yalnızca sunucunun izin verdiği durumda (BR-44 — `canUpload`) ve oturum bağlamının uç noktasıyla.
 * PDF içeriği sayfa açılışında okunmaz; yalnızca kullanıcı "Görüntüle/İndir" dediğinde.
 */
export function DocumentCard({
  document,
  index,
  context,
  canUpload,
}: {
  readonly document: CustomerDocument;
  readonly index: number;
  readonly context: string;
  readonly canUpload: boolean;
}) {
  const file = document.activeFile;
  const fileUrl = file ? `/api/portal/${context}/files/${file.id}` : null;
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
      {file && fileUrl ? (
        <div
          className="grid gap-2 rounded-lg border bg-muted/30 p-3"
          data-testid="portal-active-file"
        >
          <p className="flex min-w-0 items-start gap-2 text-base font-medium">
            <FileText aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            <span className="min-w-0 wrap-anywhere" title={file.name}>
              {file.name}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {formatFileSize(file.sizeBytes)} · Yüklendi:{" "}
            <time dateTime={file.uploadedAt}>{formatDateTime(file.uploadedAt)}</time>
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${fileUrl}?disposition=inline`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-base font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Eye aria-hidden="true" className="size-5" />
              Görüntüle
            </a>
            <a
              href={`${fileUrl}?disposition=attachment`}
              download=""
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-base font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Download aria-hidden="true" className="size-5" />
              İndir
            </a>
          </div>
        </div>
      ) : null}
      {canUpload ? (
        <PdfUpload
          endpoint={`/api/portal/${context}/documents/${document.requirementId}/file`}
          expectedVersion={document.version}
          label={file ? messages.files.replaceButton : messages.files.uploadButton}
        />
      ) : null}
    </li>
  );
}
