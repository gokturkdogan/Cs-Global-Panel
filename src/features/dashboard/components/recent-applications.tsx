import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { formatDateTime } from "@/lib/format";

import type { DashboardApplicationRow } from "../domain";
import { SectionCard } from "./section-card";

/**
 * Son 5 başvuru. Satırlar bağlantı değildir (başvuru detayı PHASE 06). ≥768px tablo, altında kart
 * listesi (yatay kaydırma yok).
 */
export function RecentApplications({
  rows,
}: {
  readonly rows: readonly DashboardApplicationRow[];
}) {
  return (
    <SectionCard id="recent-applications-title" title="Son Başvurular" className="xl:col-span-2">
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Henüz başvuru bulunmuyor."
          description="Oluşturulan başvurular burada görüntülenecektir."
        />
      ) : (
        <>
          <div className="hidden md:block">
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
                  <tr key={row.applicationNumber}>
                    <td className="px-5 py-3 font-medium whitespace-nowrap tabular-nums">
                      {row.applicationNumber}
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
              <li key={row.applicationNumber} className="grid gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium tabular-nums">{row.applicationNumber}</span>
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
