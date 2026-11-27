import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { AccessLinkCard } from "@/features/applications/components/access-link-card";
import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { CustomerInfoCard } from "@/features/applications/components/customer-info-card";
import { staffActions } from "@/features/applications/domain/application-status";
import { APPLICATION_STATUS_PRESENTATION } from "@/features/applications/domain/status-labels";
import { TRANSITION_HISTORY_LABELS } from "@/features/applications/domain/transition-labels";
import { getApplicationDetail, type ApplicationDetail } from "@/features/applications/queries";
import { DeletionDangerZone } from "@/features/deletion/components/deletion-danger-zone";
import { DeletionProgressCard } from "@/features/deletion/components/deletion-progress-card";
import { getDeletionProgress, type DeletionProgress } from "@/features/deletion/queries";
import { StaffDocumentCard } from "@/features/documents/components/staff-document-card";
import { RequirementSummary } from "@/features/applications/components/requirement-summary";
import { getApplicationFileVersions } from "@/features/documents/queries";
import { InternalNotesSection } from "@/features/internal-notes/components/internal-notes-section";
import { listInternalNotes, type InternalNoteList } from "@/features/internal-notes/queries";
import { CommentForm } from "@/features/workflow/components/comment-form";
import { WorkflowPanel } from "@/features/workflow/components/workflow-panel";
import { getWorkflowDetail, type WorkflowDetail } from "@/features/workflow/queries";
import { messages } from "@/lib/messages";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Başvuru Detayı | CS Global" };

type PageProps = { params: Promise<{ applicationId: string }> };
const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);

/**
 * Başvuru detayı. Geçersiz/bilinmeyen kimlik → 404. Silme sürecindeki başvuru (BR-153): yalnızca silme
 * ilerlemesi gösterilir — müşteri bilgileri, evraklar, notlar ve normal aksiyonlar okunmaz/sunulmaz.
 */
export default async function ApplicationDetailPage({ params }: PageProps) {
  await requireStaff();
  const { applicationId } = await params;
  if (!z.uuid().safeParse(applicationId).success) notFound();

  let application: ApplicationDetail | null;
  let fileVersions: Awaited<ReturnType<typeof getApplicationFileVersions>> = new Map();
  let workflow: WorkflowDetail | null = null;
  let notes: InternalNoteList = { items: [], total: 0, nextCursor: null };
  let deletion: DeletionProgress | null = null;
  try {
    application = await getApplicationDetail(getDb(), applicationId);
    if (application === null) {
      // Silme sürecindeki başvuru: yalnızca ilerleme okunur (müşteri verisi, evrak, not okunmaz).
      deletion = await getDeletionProgress(getDb(), applicationId);
    } else {
      fileVersions = await getApplicationFileVersions(getDb(), applicationId);
      workflow = await getWorkflowDetail(getDb(), applicationId);
      notes = await listInternalNotes(getDb(), applicationId);
    }
  } catch (error) {
    console.error("[applications] Detay okunamadı", { code: pgErrorCode(error) ?? "unknown" });
    return (
      <div className="grid gap-6">
        <PageHeader
          title="Başvuru"
          breadcrumb={[
            { label: "Panel", href: "/dashboard" },
            { label: "Başvurular", href: "/dashboard/applications" },
            { label: "Başvuru" },
          ]}
        />
        <ErrorState />
      </div>
    );
  }
  if (application === null && deletion !== null) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title={deletion.applicationNumber}
          description={messages.deletion.progressTitle}
          breadcrumb={[
            { label: "Panel", href: "/dashboard" },
            { label: "Başvurular", href: "/dashboard/applications" },
            { label: deletion.applicationNumber },
          ]}
        />
        <DeletionProgressCard progress={deletion} />
      </div>
    );
  }
  if (application === null || workflow === null) notFound();

  // İzinli aksiyonlar ve engeller aynı domain kurallarından (sunucu kilit altında yeniden doğrular).
  const actions = staffActions(application.status, workflow.facts);
  const approvedDocuments = workflow.facts
    .filter((fact) => fact.status === "APPROVED" && fact.activeFileId !== null)
    .map((fact) => ({
      requirementId: fact.requirementId,
      title: fact.title,
      fileId: fact.activeFileId!,
      fileVersion: fact.activeFileVersion,
    }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={application.applicationNumber}
        description={`${application.firstName} ${application.lastName} · ${application.serviceName}`}
        breadcrumb={[
          { label: "Panel", href: "/dashboard" },
          { label: "Başvurular", href: "/dashboard/applications" },
          { label: application.applicationNumber },
        ]}
      />

      <section
        aria-labelledby="summary-title"
        className="rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="summary-title" className="sr-only">
          Başvuru özeti
        </h2>
        <dl
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[max-content_repeat(4,minmax(0,1fr))] xl:gap-x-8"
          data-testid="application-summary"
        >
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Başvuru numarası</dt>
            {/* PHASE 11: numara tire noktasında bölünmez (tek satır, tabular). */}
            <dd className="font-semibold whitespace-nowrap tabular-nums">
              {application.applicationNumber}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Durum</dt>
            <dd>
              <ApplicationStatusBadge status={application.status} />
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Hizmet (başvuru anındaki ad)</dt>
            <dd className="font-medium wrap-anywhere">{application.serviceName}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Oluşturulma</dt>
            <dd className="tabular-nums">
              <time dateTime={application.createdAt}>{formatDateTime(application.createdAt)}</time>
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Son güncelleme</dt>
            <dd className="tabular-nums">
              <time dateTime={application.updatedAt}>{formatDateTime(application.updatedAt)}</time>
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="workflow-title"
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="workflow-title" className="text-lg leading-7 font-semibold">
            Başvuru durumu ve işlemler
          </h2>
          <ApplicationStatusBadge status={application.status} />
        </div>
        {actions.length > 0 ? (
          <WorkflowPanel
            applicationId={application.id}
            version={application.version}
            actions={actions}
            approvedDocuments={approvedDocuments}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Bu durumda yapılabilecek işlem yok.</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <CustomerInfoCard
          applicationId={application.id}
          version={application.version}
          customer={{
            firstName: application.firstName,
            lastName: application.lastName,
            phone: application.phoneDisplay,
            email: application.email,
          }}
        />
        <AccessLinkCard
          applicationId={application.id}
          applicationNumber={application.applicationNumber}
          customerName={`${application.firstName} ${application.lastName}`}
          activeLink={application.activeLink}
          lastRevokedAt={application.lastRevokedAt}
        />
      </div>

      <section
        aria-labelledby="documents-title"
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="grid gap-1">
          <h2 id="documents-title" className="text-lg leading-7 font-semibold">
            Evrak gereksinimleri
          </h2>
          <p className="text-sm text-muted-foreground">
            Başvuru anında kopyalanan liste (hizmet şablonundaki sonraki değişikliklerden
            etkilenmez). Yalnızca PDF, dosya başına en fazla {MAX_PDF_MB} MB, evrak başına tek aktif
            dosya; önceki versiyonlar geçmişte korunur. Evrak kararları (onay/düzeltme) yalnızca
            &ldquo;İncelemede&rdquo; durumunda ve ekranda görünen dosya versiyonu için verilir.
          </p>
        </div>
        <RequirementSummary
          statuses={application.requirements.map((requirement) => requirement.status)}
        />
        <ol className="grid gap-3" data-testid="application-requirements">
          {application.requirements.map((requirement, index) => (
            <StaffDocumentCard
              key={requirement.id}
              index={index}
              requirement={requirement}
              applicationStatus={application.status}
              versions={fileVersions.get(requirement.id) ?? []}
              reviews={workflow.reviewsByRequirement.get(requirement.id) ?? []}
            />
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="history-title"
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-title" className="text-lg leading-7 font-semibold">
            Başvuru geçmişi
          </h2>
          <Link
            prefetch={false}
            href={`/dashboard/audit-logs?applicationId=${application.id}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            data-testid="application-audit-link"
          >
            {messages.auditLogs.applicationHistoryLink}
          </Link>
        </div>
        <ol className="grid gap-2" data-testid="application-history">
          {workflow.history.map((entry) => (
            <li
              key={entry.id}
              className="grid gap-0.5 border-b pb-2 text-sm last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {TRANSITION_HISTORY_LABELS[
                    entry.transitionCode as keyof typeof TRANSITION_HISTORY_LABELS
                  ] ?? entry.transitionCode}{" "}
                  →{" "}
                  <strong>
                    {
                      APPLICATION_STATUS_PRESENTATION[
                        entry.toStatus as keyof typeof APPLICATION_STATUS_PRESENTATION
                      ].label
                    }
                  </strong>
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.actor}
                    {entry.onBehalfOfCustomer ? " (müşteri adına)" : ""}
                  </span>
                </span>
                <time dateTime={entry.createdAt} className="text-muted-foreground tabular-nums">
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
              {entry.reason ? (
                <p className="text-xs wrap-anywhere whitespace-pre-line text-muted-foreground">
                  Gerekçe (personel içi): {entry.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="comments-title"
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="comments-title" className="text-lg leading-7 font-semibold">
          {messages.workflow.commentsTitle}
        </h2>
        {workflow.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.workflow.noComments}</p>
        ) : (
          <ol className="grid gap-2" data-testid="staff-comments">
            {workflow.comments.map((comment) => (
              <li key={comment.id} className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="wrap-anywhere whitespace-pre-line">{comment.body}</p>
                <p className="text-xs text-muted-foreground">
                  {comment.author}
                  {comment.documentTitle ? ` · ${comment.documentTitle}` : ""} ·{" "}
                  <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
        <CommentForm applicationId={application.id} />
      </section>

      <InternalNotesSection applicationId={application.id} notes={notes} />

      <DeletionDangerZone
        applicationId={application.id}
        applicationNumber={application.applicationNumber}
        version={application.version}
      />
    </div>
  );
}
