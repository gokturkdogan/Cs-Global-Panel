import Link from "next/link";

import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import type { DeletionProgress } from "../queries";

/** "Silme İşlemleri" — tamamlanmamış silmeler (yalnızca numara + ilerleme; kişisel veri yok). */
export function DeletionQueueCard({
  items,
  total,
}: {
  readonly items: readonly DeletionProgress[];
  readonly total: number;
}) {
  if (total === 0) return null;
  return (
    <section
      aria-labelledby="deletion-queue-title"
      className="grid gap-3 rounded-xl border border-destructive/40 bg-card p-4 shadow-sm sm:p-5"
      data-testid="deletion-queue"
    >
      <div className="grid gap-1">
        <h2 id="deletion-queue-title" className="text-lg leading-7 font-semibold">
          {messages.deletion.queueTitle} ({total})
        </h2>
        <p className="text-sm text-muted-foreground">{messages.deletion.queueDescription}</p>
      </div>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li
            key={item.applicationId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <span className="grid gap-0.5">
              <Link
                prefetch={false}
                href={`/dashboard/applications/${item.applicationId}`}
                className="font-medium text-primary tabular-nums underline-offset-4 hover:underline"
              >
                {item.applicationNumber}
              </Link>
              <span className="text-xs text-muted-foreground">
                <time dateTime={item.requestedAt}>{formatDateTime(item.requestedAt)}</time> ·{" "}
                {item.requestedBy}
              </span>
            </span>
            <span className="text-xs tabular-nums">
              {item.inventoryReady
                ? messages.deletion.physicalProgress(item.deletedObjects, item.totalObjects)
                : messages.deletion.inventoryPending}
              {item.lastError
                ? ` · ${item.manualReview ? messages.deletion.manualReview : messages.deletion.retryable}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
