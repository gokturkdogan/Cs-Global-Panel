import { Download, FileText, History } from "lucide-react";

import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";
import { DocumentStatusBadge } from "@/features/applications/components/document-status-badge";
import { RequiredBadge } from "@/features/services/components/status-badges";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import { ReviewActions } from "@/features/workflow/components/review-actions";
import type { StaffReview } from "@/features/workflow/queries";

import { canRemoveFile, reviewTarget } from "../domain/document-status";
import { formatFileSize } from "../domain/filename";
import { canUploadDocument } from "../domain/upload-rules";
import type { StaffFileVersion } from "../queries";
import { PdfUpload } from "./pdf-upload";
import { PdfViewerDialog } from "./pdf-viewer/pdf-viewer-dialog";

/**
 * Personel evrak kartı (PHASE 08 §25). İki hesap aynı arayüzü görür (OD-24). Dosya listesi ve geçmiş
 * DB metadata'sından gelir; PDF yalnızca "Görüntüle/İndir" tıklandığında `/api/files/<id>` ile okunur
 * (PHASE 11: görüntüleme uygulama içi aralıklı görüntüleyiciyle — D-136).
 * Kalıcı silme, onay/ret/düzeltme ve yorum aksiyonları bu fazda yoktur (PHASE 09/10).
 */
export function StaffDocumentCard({
  index,
  requirement,
  applicationStatus,
  versions,
  reviews,
}: {
  readonly index: number;
  readonly requirement: {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly instructions: string | null;
    readonly isRequired: boolean;
    readonly status: DocumentStatus;
    readonly version: number;
  };
  readonly applicationStatus: ApplicationStatus;
  readonly versions: readonly StaffFileVersion[];
  readonly reviews: readonly StaffReview[];
}) {
  const active = versions.find((item) => item.isActive) ?? null;
  const canUpload = canUploadDocument("STAFF", applicationStatus, requirement.status);
  const endpoint = `/api/documents/${requirement.id}/file`;

  return (
    <li className="grid min-w-0 gap-3 rounded-lg border p-4" data-testid="staff-document">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-medium wrap-anywhere">
          <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
          {requirement.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <RequiredBadge isRequired={requirement.isRequired} />
          <DocumentStatusBadge status={requirement.status} />
        </div>
      </div>
      {requirement.instructions ? (
        <p className="text-sm wrap-anywhere whitespace-pre-line">{requirement.instructions}</p>
      ) : null}
      {requirement.description ? (
        <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">
          {requirement.description}
        </p>
      ) : null}

      {active ? (
        <div
          className="grid gap-2 rounded-lg border bg-muted/30 p-3"
          data-testid="staff-active-file"
        >
          <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
            <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0 wrap-anywhere" title={active.filename}>
              {active.filename}
            </span>
          </p>
          <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex gap-1">
              <dt>Versiyon:</dt>
              <dd className="tabular-nums">v{active.versionNumber}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Boyut:</dt>
              <dd className="tabular-nums">{formatFileSize(active.sizeBytes)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Yükleyen:</dt>
              <dd className="wrap-anywhere">{active.uploadedBy}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Tarih:</dt>
              <dd className="tabular-nums">
                <time dateTime={active.activatedAt}>{formatDateTime(active.activatedAt)}</time>
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{messages.files.structuralNote}</p>
          <div className="flex flex-wrap gap-2">
            <PdfViewerDialog
              url={`/api/files/${active.id}?disposition=inline`}
              downloadUrl={`/api/files/${active.id}?disposition=attachment`}
              sizeBytes={active.sizeBytes}
              title={`${requirement.title} — v${active.versionNumber}`}
            />
            <FileLink href={`/api/files/${active.id}?disposition=attachment`} kind="download" />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{messages.files.noFile}</p>
      )}

      {active ? (
        <ReviewActions
          requirementId={requirement.id}
          fileId={active.id}
          fileVersion={active.versionNumber}
          expectedVersion={requirement.version}
          canApprove={reviewTarget(applicationStatus, requirement.status, "APPROVED") !== null}
          canRequestRevision={
            reviewTarget(applicationStatus, requirement.status, "REVISION_REQUIRED") !== null
          }
          canRemove={canRemoveFile("STAFF", applicationStatus, requirement.status)}
        />
      ) : null}

      {reviews.length > 0 ? (
        <details className="group rounded-lg border p-3" data-testid="staff-review-history">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            İnceleme Geçmişi ({reviews.length})
          </summary>
          <ol className="mt-2 grid gap-2">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="grid gap-1 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                data-testid="staff-review"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <strong>
                      {review.decision === "APPROVED" ? "Onaylandı" : "Düzeltme istendi"}
                    </strong>
                    {review.fileVersion ? ` · v${review.fileVersion}` : ""} · {review.reviewer}
                  </span>
                  <time
                    dateTime={review.createdAt}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(review.createdAt)}
                  </time>
                </div>
                {review.customerMessage ? (
                  <p className="text-xs wrap-anywhere whitespace-pre-line text-muted-foreground">
                    Müşteriye: {review.customerMessage}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {canUpload ? (
        <PdfUpload
          endpoint={endpoint}
          expectedVersion={requirement.version}
          size="default"
          label={active ? messages.files.replaceButton : messages.files.uploadOnBehalf}
          {...(active
            ? {
                confirm: {
                  title: messages.files.replaceConfirmTitle,
                  description:
                    requirement.status === "APPROVED"
                      ? `${messages.files.replaceConfirmDescription} ${messages.files.replaceConfirmApprovedNote}`
                      : messages.files.replaceConfirmDescription,
                },
              }
            : {})}
        />
      ) : null}

      {versions.length > 0 ? (
        <details className="group rounded-lg border p-3" data-testid="staff-file-history">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <History aria-hidden="true" className="size-4" />
            {messages.files.history} ({versions.length})
          </summary>
          <ol className="mt-2 grid gap-2">
            {versions.map((version) => (
              <li
                key={version.id}
                className="grid gap-1 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                data-testid="staff-file-version"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 wrap-anywhere">
                    <strong className="tabular-nums">v{version.versionNumber}</strong> —{" "}
                    {version.uploadedByCustomer
                      ? "Müşteri yükledi"
                      : `Personel (${version.uploadedBy})`}
                    {version.isActive ? (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        Aktif
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {version.removed ? "Kaldırıldı" : "Önceki versiyon"}
                      </span>
                    )}
                  </span>
                  <time
                    dateTime={version.activatedAt}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(version.activatedAt)}
                  </time>
                </div>
                <span className="text-xs text-muted-foreground wrap-anywhere">
                  {version.filename} · {formatFileSize(version.sizeBytes)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <PdfViewerDialog
                    url={`/api/files/${version.id}?disposition=inline`}
                    downloadUrl={`/api/files/${version.id}?disposition=attachment`}
                    sizeBytes={version.sizeBytes}
                    title={`${requirement.title} — v${version.versionNumber}`}
                    size="compact"
                  />
                  <FileLink
                    href={`/api/files/${version.id}?disposition=attachment`}
                    kind="download"
                    compact
                  />
                </div>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

/** İndirme bağlantısı (ön-getirme yok: düz `<a download>`; Next.js `Link` değil). */
function FileLink({
  href,
  compact,
}: {
  readonly href: string;
  readonly kind: "download";
  readonly compact?: boolean;
}) {
  return (
    <a
      href={href}
      download=""
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${compact ? "min-h-9 text-xs" : "min-h-10 text-sm"}`}
    >
      <Download aria-hidden="true" className="size-4" />
      {messages.files.download}
    </a>
  );
}
