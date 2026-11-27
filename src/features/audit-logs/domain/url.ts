import type { AuditFilters } from "../schemas";

/** URL'ye yalnızca kişisel veri içermeyen filtreleri yazar; başvuru numarası sunucuda UUID'ye çözülür. */
export function auditUrl(filters: Partial<Record<keyof AuditFilters, string | number | null>>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "pageSize" && value === 20) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query === "" ? "/dashboard/audit-logs" : `/dashboard/audit-logs?${query}`;
}
