import { CircleAlert } from "lucide-react";

import { messages } from "@/lib/messages";

import { RetryButton } from "./retry-button";

type ErrorStateProps = {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
};

/** Veri yüklenemedi durumu (boş durumdan ayrı): Türkçe genel mesaj + "Tekrar dene". İç ayrıntı yok. */
export function ErrorState({
  title = messages.dashboard.loadFailedTitle,
  description = messages.dashboard.loadFailedDescription,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-state="error"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-8 text-center"
    >
      <CircleAlert aria-hidden="true" className="mb-1 size-6 text-destructive-strong" />
      <p className="text-base font-medium text-destructive-strong">{title}</p>
      <p className="max-w-md text-sm text-foreground">{description}</p>
      <div className="mt-2">
        <RetryButton onRetry={onRetry} />
      </div>
    </div>
  );
}
