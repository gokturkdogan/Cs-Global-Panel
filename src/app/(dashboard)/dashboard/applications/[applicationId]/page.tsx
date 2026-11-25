import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { AccessLinkCard } from "@/features/applications/components/access-link-card";
import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { CustomerInfoCard } from "@/features/applications/components/customer-info-card";
import { DocumentStatusBadge } from "@/features/applications/components/document-status-badge";
import { APPLICATION_STATUS_PRESENTATION } from "@/features/applications/domain/status-labels";
import { getApplicationDetail, type ApplicationDetail } from "@/features/applications/queries";
import { RequiredBadge } from "@/features/services/components/status-badges";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Başvuru Detayı | CS Global" };

type PageProps = { params: Promise<{ applicationId: string }> };
const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);
const TRANSITION_LABELS: Record<string, string> = { CREATE: "Başvuru oluşturuldu" };

/** Başvuru detayı. Geçersiz/bilinmeyen/silme sürecindeki kimlik → 404 (BR-153). */
export default async function ApplicationDetailPage({ params }: PageProps) {
  await requireStaff();
  const { applicationId } = await params;
  if (!z.uuid().safeParse(applicationId).success) notFound();

  let application: ApplicationDetail | null;
  try {
    application = await getApplicationDetail(getDb(), applicationId);
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
  if (application === null) notFound();

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
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="application-summary">
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Başvuru numarası</dt>
            <dd className="font-semibold tabular-nums">{application.applicationNumber}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Durum</dt>
            <dd>
              <ApplicationStatusBadge status={application.status} />
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-xs text-muted-foreground">Hizmet (başvuru anındaki ad)</dt>
            <dd className="font-medium break-words">{application.serviceName}</dd>
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
            etkilenmez). Evrak yükleme ve inceleme sonraki aşamalarda kullanıma açılacak. Yalnızca
            PDF, dosya başına en fazla {MAX_PDF_MB} MB, evrak başına tek aktif dosya.
          </p>
        </div>
        <ol className="grid gap-3" data-testid="application-requirements">
          {application.requirements.map((requirement, index) => (
            <li key={requirement.id} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-base font-medium break-words">
                  <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
                  {requirement.title}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <RequiredBadge isRequired={requirement.isRequired} />
                  <DocumentStatusBadge status={requirement.status} />
                </div>
              </div>
              {requirement.instructions ? (
                <p className="text-sm break-words whitespace-pre-line">
                  {requirement.instructions}
                </p>
              ) : null}
              {requirement.description ? (
                <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
                  {requirement.description}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="history-title"
        className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="history-title" className="text-lg leading-7 font-semibold">
          Başvuru geçmişi
        </h2>
        <ol className="grid gap-2" data-testid="application-history">
          {application.history.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 text-sm last:border-b-0 last:pb-0"
            >
              <span>
                {TRANSITION_LABELS[entry.transitionCode] ?? entry.transitionCode} →{" "}
                <strong>{APPLICATION_STATUS_PRESENTATION[entry.toStatus].label}</strong>
                {entry.actorUsername ? (
                  <span className="text-muted-foreground"> · {entry.actorUsername}</span>
                ) : null}
              </span>
              <time dateTime={entry.createdAt} className="text-muted-foreground tabular-nums">
                {formatDateTime(entry.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
