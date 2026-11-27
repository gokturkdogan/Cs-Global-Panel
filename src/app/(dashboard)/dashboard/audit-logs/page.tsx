import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { AuditFiltersForm } from "@/features/audit-logs/components/audit-filters";
import { AuditList } from "@/features/audit-logs/components/audit-list";
import { auditUrl } from "@/features/audit-logs/domain/url";
import {
  applicationNumberOf,
  listAuditLogs,
  listStaffOptions,
  type AuditPage,
} from "@/features/audit-logs/queries";
import { parseAuditFilters, type AuditFilters } from "@/features/audit-logs/schemas";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "İşlem Geçmişi | CS Global" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Merkezi işlem geçmişi (PHASE 10, D-119) — iki hesap aynı ekranı görür (OD-24; admin'e özel route yok).
 * Salt okunur: değiştirme/silme/temizleme/dışa aktarma aksiyonu yoktur; görüntüleme audit'e yazılmaz.
 */
export default async function AuditLogsPage({ searchParams }: PageProps) {
  await requireStaff();
  const { filters, error } = parseAuditFilters(await searchParams);

  let page: AuditPage | null = null;
  let staff: Awaited<ReturnType<typeof listStaffOptions>> = [];
  let applicationNumber: string | null = null;
  try {
    const db = getDb();
    page = await listAuditLogs(db, filters);
    staff = await listStaffOptions(db);
    if (filters.applicationId !== null) {
      applicationNumber = await applicationNumberOf(db, filters.applicationId);
    }
  } catch (err) {
    console.error("[audit-logs] Liste okunamadı", { code: pgErrorCode(err) ?? "unknown" });
  }

  const base: Partial<Record<keyof AuditFilters, string | number | null>> = {
    from: filters.from,
    to: filters.to,
    action: filters.action,
    actorType: filters.actorType,
    staffId: filters.staffId,
    resourceType: filters.resourceType,
    applicationId: filters.applicationId,
    pageSize: filters.pageSize,
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={messages.auditLogs.title}
        description={messages.auditLogs.description}
        breadcrumb={[{ label: "Panel", href: "/dashboard" }, { label: messages.auditLogs.title }]}
      />
      <AuditFiltersForm
        key={JSON.stringify(base)}
        filters={filters}
        staff={staff}
        applicationNumber={applicationNumber}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {filters.applicationId !== null ? (
        <p className="text-sm text-muted-foreground" data-testid="audit-application-filter">
          Başvuru filtresi:{" "}
          <span className="font-medium text-foreground">
            {applicationNumber ?? messages.auditLogs.applicationGone}
          </span>
        </p>
      ) : null}
      {page === null ? (
        <ErrorState />
      ) : (
        <>
          <AuditList items={page.items} />
          <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-2">
            {page.newerCursor !== null ? (
              <Button asChild variant="outline">
                <Link prefetch={false} href={auditUrl({ ...base, before: page.newerCursor })}>
                  <ChevronLeft aria-hidden="true" />
                  Daha yeni kayıtlar
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {page.olderCursor !== null ? (
              <Button asChild variant="outline">
                <Link prefetch={false} href={auditUrl({ ...base, after: page.olderCursor })}>
                  Daha eski kayıtlar
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
