import { History, MessageSquareText } from "lucide-react";

import { APPLICATION_STATUS_PRESENTATION } from "@/features/applications/domain/status-labels";
import { formatDateTime } from "@/lib/format";

import type { CustomerPortalView } from "../queries";

/** Müşteriye görünür yorumlar (salt okunur — BR-122; yazar bilgisi yok). Düz metin. */
export function CustomerComments({
  comments,
}: {
  readonly comments: CustomerPortalView["comments"];
}) {
  if (comments.length === 0) return null;
  return (
    <section
      aria-labelledby="comments-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="portal-comments"
    >
      <h2 id="comments-title" className="flex items-center gap-2 text-lg leading-7 font-semibold">
        <MessageSquareText aria-hidden="true" className="size-5 text-primary" />
        CS Global&apos;den mesajlar
      </h2>
      <ol className="grid gap-3">
        {comments.map((comment, index) => (
          <li
            key={`${comment.createdAt}-${index}`}
            className="grid gap-1 rounded-lg border bg-muted/30 p-3"
          >
            <p className="text-base wrap-anywhere whitespace-pre-line">{comment.body}</p>
            <p className="text-sm text-muted-foreground">
              {comment.documentTitle ? `${comment.documentTitle} · ` : ""}
              <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Herkese açık süreç geçmişi: yalnızca statü + tarih (gerekçe ve aktör gösterilmez). */
export function CustomerTimeline({
  timeline,
}: {
  readonly timeline: CustomerPortalView["timeline"];
}) {
  if (timeline.length === 0) return null;
  return (
    <section
      aria-labelledby="timeline-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="portal-timeline"
    >
      <h2 id="timeline-title" className="flex items-center gap-2 text-lg leading-7 font-semibold">
        <History aria-hidden="true" className="size-5 text-primary" />
        Süreç geçmişi
      </h2>
      <ol className="grid gap-2">
        {timeline.map((entry, index) => (
          <li
            key={`${entry.at}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 text-base last:border-b-0 last:pb-0"
          >
            <span>{APPLICATION_STATUS_PRESENTATION[entry.status].label}</span>
            <time dateTime={entry.at} className="text-sm text-muted-foreground tabular-nums">
              {formatDateTime(entry.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
