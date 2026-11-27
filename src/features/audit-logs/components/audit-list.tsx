import { History } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import type { AuditItem } from "../queries";

const ACCOUNT_LABELS = { admin: "ADMIN", employee: "EMPLOYEE" } as const;

/**
 * Audit kayıtları — mobilde kart, geniş ekranda satır düzeni (aynı DOM). Yalnızca izinli DTO alanları;
 * ayrıntılar `describeAuditMetadata` allowlist'inden. Silinmiş başvuruya bozuk bağlantı üretilmez.
 */
export function AuditList({ items }: { readonly items: readonly AuditItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={History} title={messages.auditLogs.empty} />;
  }
  return (
    <ol className="grid gap-2" data-testid="audit-list">
      {items.map((item) => (
        <li
          key={item.id}
          data-action={item.action}
          className="grid gap-2 rounded-lg border bg-card p-3 text-sm shadow-sm lg:grid-cols-[11rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-4"
        >
          <time dateTime={item.occurredAt} className="text-muted-foreground tabular-nums">
            {formatDateTime(item.occurredAt)}
          </time>
          <div className="grid gap-1">
            <span className="font-medium text-foreground">{item.actionLabel}</span>
            <span className="text-xs text-muted-foreground">{item.resourceLabel}</span>
          </div>
          <div className="grid gap-0.5">
            <span>{item.actorLabel}</span>
            {item.staff ? (
              <span className="text-xs text-muted-foreground">
                {item.staff.username} ({ACCOUNT_LABELS[item.staff.accountType]})
              </span>
            ) : null}
          </div>
          <div className="grid gap-1">
            {item.application === null ? (
              <span className="text-muted-foreground">—</span>
            ) : item.application.number === null ? (
              <span className="text-muted-foreground">{messages.auditLogs.applicationGone}</span>
            ) : (
              <Link
                prefetch={false}
                href={`/dashboard/applications/${item.application.id}`}
                className="font-medium text-primary tabular-nums underline-offset-4 hover:underline"
              >
                {item.application.number}
                {item.application.deleting ? " (silme sürecinde)" : ""}
              </Link>
            )}
            {item.details.length > 0 ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ayrıntılar</summary>
                <dl className="mt-1 grid gap-0.5">
                  {item.details.map((detail) => (
                    <div key={detail.label} className="flex flex-wrap gap-1">
                      <dt className="font-medium">{detail.label}:</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
