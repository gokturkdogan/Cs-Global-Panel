import { Ban, Check, TriangleAlert } from "lucide-react";

import type { ApplicationStatus } from "@/config/statuses";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

import { processProgress } from "../domain/progress";

/**
 * Süreç göstergesi (BR §11.1): 5 adım; dar ekranda dikey, ≥640px yatay. Aktif adım
 * `aria-current="step"`; durum metin + ikonla (yalnızca renk değil). İptalde adım yerine bilgi kartı.
 */
export function ProcessStepper({ status }: { readonly status: ApplicationStatus }) {
  const progress = processProgress(status);
  if (progress.kind === "cancelled") {
    return (
      <section
        aria-labelledby="process-title"
        className="grid gap-2 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
        data-testid="process-cancelled"
      >
        <h2 id="process-title" className="text-lg leading-7 font-semibold">
          Başvuru süreci
        </h2>
        <p className="flex items-start gap-2 text-base text-foreground">
          <Ban aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive-strong" />
          Bu başvuru iptal edilmiştir. Sorularınız için CS Global ile iletişime geçebilirsiniz.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="process-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 id="process-title" className="text-lg leading-7 font-semibold">
        Başvuru süreci
      </h2>
      <ol className="grid gap-3 sm:grid-cols-5 sm:gap-2" data-testid="process-steps">
        {progress.steps.map((step, index) => {
          const revisionHere = progress.revision && index === 1;
          return (
            <li
              key={step.label}
              aria-current={step.state === "current" ? "step" : undefined}
              data-state={step.state}
              className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                  step.state === "done" && "border-success bg-success text-white",
                  step.state === "current" &&
                    (revisionHere
                      ? "border-warning bg-warning-soft text-warning-strong"
                      : "border-primary bg-primary text-primary-foreground"),
                  step.state === "upcoming" && "border-border bg-card text-muted-foreground",
                )}
              >
                {step.state === "done" ? (
                  <Check className="size-4" />
                ) : revisionHere ? (
                  <TriangleAlert className="size-4" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 text-base leading-snug sm:text-sm">
                <span
                  className={cn(
                    "font-medium",
                    step.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-sm text-muted-foreground sm:text-xs">
                  {step.state === "done"
                    ? "Tamamlandı"
                    : step.state === "current"
                      ? revisionHere
                        ? "Düzeltme bekleniyor"
                        : "Devam ediyor"
                      : "Sırada"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted-foreground">{messages.portal.progressDisclaimer}</p>
    </section>
  );
}
