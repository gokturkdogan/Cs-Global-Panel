import { ShieldAlert } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import type { DeletionProgress } from "../queries";
import { ResumeDeletionButton } from "./resume-deletion-button";

/**
 * Silme ilerlemesi (PHASE 10). Değerler yalnızca kalıcı DB durumundan; envanter tamamlanmadan toplam
 * kesinmiş gibi gösterilmez. Müşteri kişisel bilgisi ve normal başvuru aksiyonları bu görünümde yoktur.
 */
export function DeletionProgressCard({ progress }: { readonly progress: DeletionProgress }) {
  const physical = progress.inventoryReady
    ? messages.deletion.physicalProgress(progress.deletedObjects, progress.totalObjects)
    : messages.deletion.inventoryPending;
  return (
    <section
      aria-labelledby="deletion-progress-title"
      className="grid gap-4 rounded-xl border border-destructive/40 bg-card p-4 shadow-sm sm:p-5"
      data-testid="deletion-progress"
    >
      <div className="grid gap-1">
        <h2
          id="deletion-progress-title"
          className="flex items-center gap-2 text-lg leading-7 font-semibold"
        >
          <ShieldAlert aria-hidden="true" className="size-5 text-destructive" />
          {messages.deletion.progressTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{messages.deletion.accessClosed}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Silme talebi</dt>
          <dd>
            <time dateTime={progress.requestedAt}>{formatDateTime(progress.requestedAt)}</time> ·{" "}
            {progress.requestedBy}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Dosya envanteri</dt>
          <dd data-testid="deletion-inventory">
            {progress.inventoryReady
              ? messages.deletion.inventoryReady
              : messages.deletion.inventoryPending}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Fiziksel silme</dt>
          <dd data-testid="deletion-physical" className="tabular-nums">
            {physical}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">Veritabanı temizliği</dt>
          <dd>{messages.deletion.databasePending}</dd>
        </div>
      </dl>
      {progress.unresolvedWrites > 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm" data-testid="deletion-unresolved-writes">
          {messages.deletion.unresolvedWrites(progress.unresolvedWrites)}
        </p>
      ) : null}
      {progress.lastError ? (
        <div
          role="alert"
          className="grid gap-1 rounded-lg border border-destructive/40 p-3 text-sm"
          data-testid="deletion-error"
          data-error={progress.lastError}
        >
          <p className="font-medium">
            {progress.manualReview ? messages.deletion.manualReview : messages.deletion.retryable}
          </p>
          <p>{messages.deletion.errors[progress.lastError]}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{messages.deletion.noBackground}</p>
      <ResumeDeletionButton applicationId={progress.applicationId} />
    </section>
  );
}
