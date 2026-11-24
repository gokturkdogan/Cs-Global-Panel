import { Search } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { formatDateTime } from "@/lib/format";

import { DASHBOARD_REVIEW_QUEUE_LIMIT, type DashboardReviewRow } from "../domain";
import { SectionCard } from "./section-card";

/** İncelemedeki başvurular (en uzun bekleyen önce, en fazla 5). İnceleme işlemi PHASE 09. */
export function ReviewQueue({ rows }: { readonly rows: readonly DashboardReviewRow[] }) {
  return (
    <SectionCard
      id="review-queue-title"
      title="İnceleme Bekleyenler"
      description={`En uzun süredir bekleyen ${DASHBOARD_REVIEW_QUEUE_LIMIT} başvuru`}
    >
      {rows.length === 0 ? (
        <EmptyState icon={Search} title="İnceleme bekleyen başvuru bulunmuyor." />
      ) : (
        <ul className="divide-y" data-testid="review-queue-list">
          {rows.map((row) => (
            <li key={row.applicationNumber} className="grid gap-1 px-4 py-3 sm:px-5">
              <span className="text-sm font-medium tabular-nums">{row.applicationNumber}</span>
              <span className="truncate text-sm text-foreground">{row.customerName}</span>
              <span className="truncate text-sm text-muted-foreground">{row.serviceName}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                İncelemede:{" "}
                <time dateTime={row.waitingSince}>{formatDateTime(row.waitingSince)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
