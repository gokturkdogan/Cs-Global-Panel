import { Inbox } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { formatDateTime } from "@/lib/format";

import type { DashboardApplicationRow } from "../domain";
import { SectionCard } from "./section-card";

/**
 * Son 5 başvuru; başvuru numarası detaya bağlantıdır (PHASE 06). ≥768px tablo, altında kart listesi.
 */
export function RecentApplications({
  rows,
}: {
  readonly rows: readonly DashboardApplicationRow[];
}) {
  return (
    <SectionCard
      id="recent-applications-title"
      title="Son Başvurular"
      className="xl:col-span-2"
      link={{ href: "/dashboard/applications", label: "Tümünü Gör" }}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Henüz başvuru bulunmuyor."
          description="Oluşturulan başvurular burada görüntülenecektir."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm" data-testid="recent-applications-table">
              <caption className="sr-only">Son oluşturulan 5 başvuru</caption>
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {["Başvuru No", "Müşteri", "Hizmet", "Durum", "Oluşturulma Tarihi"].map(
                    (heading) => (
                      <th key={heading} scope="col" className="px-5 py-3 font-medium">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium whitespace-nowrap tabular-nums">
                      <Link
                        href={`/dashboard/applications/${row.id}`}
                        className="text-primary-dark hover:underline"
                      >
                        {row.applicationNumber}
                      </Link>
                    </td>
                    <td className="max-w-48 truncate px-5 py-3">{row.customerName}</td>
                    <td className="max-w-48 truncate px-5 py-3 text-muted-foreground">
                      {row.serviceName}
                    </td>
                    <td className="px-5 py-3">
                      <ApplicationStatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden" data-testid="recent-applications-list">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/applications/${row.id}`}
                    className="text-sm font-medium text-primary-dark tabular-nums hover:underline"
                  >
                    {row.applicationNumber}
                  </Link>
                  <ApplicationStatusBadge status={row.status} />
                </div>
                <p className="truncate text-sm text-foreground">{row.customerName}</p>
                <p className="truncate text-sm text-muted-foreground">{row.serviceName}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Oluşturulma: <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
