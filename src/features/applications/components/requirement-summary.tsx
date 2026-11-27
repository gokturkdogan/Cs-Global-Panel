import { DOCUMENT_STATUSES, type DocumentStatus } from "@/config/statuses";

import { DOCUMENT_STATUS_PRESENTATION } from "../domain/document-status-labels";
import { DocumentStatusBadge } from "./document-status-badge";

/**
 * Evrak statü özeti (PHASE 11.1 — inceleme ergonomisi): personel kartları tek tek gezmeden kaç evrakın
 * onaylandığını, incelemede olduğunu, düzeltme beklediğini veya eksik olduğunu görür. Yalnızca sayfadaki
 * mevcut veriden (ek sorgu yok); sıfır olan statüler gösterilmez.
 */
export function RequirementSummary({ statuses }: { readonly statuses: readonly DocumentStatus[] }) {
  const counts = DOCUMENT_STATUSES.map((status) => ({
    status,
    count: statuses.filter((value) => value === status).length,
  })).filter((item) => item.count > 0);
  if (statuses.length === 0) return null;
  const summary = counts
    .map((item) => `${item.count} ${DOCUMENT_STATUS_PRESENTATION[item.status].label}`)
    .join(", ");
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="requirement-summary"
      aria-label={`${statuses.length} evrak: ${summary}`}
    >
      <span className="text-sm font-medium tabular-nums">{statuses.length} evrak</span>
      {counts.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1" aria-hidden="true">
          <DocumentStatusBadge status={item.status} />
          <span className="text-sm tabular-nums">{item.count}</span>
        </span>
      ))}
    </div>
  );
}
