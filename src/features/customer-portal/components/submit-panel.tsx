"use client";

import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { submitForReviewAction } from "../actions";

/**
 * İncelemeye gönder / yeniden gönder (T1/T4, PHASE 09). Butonun durumu sunucuda aynı domain
 * kuralıyla (BR-50) hesaplanan engellerden gelir; asıl kontrol sunucuda kilit altında yapılır.
 * "Gönderildi" yalnızca başarılı yanıttan sonra; ardından sayfa sunucudan yenilenir (PDF indirilmez).
 */
export function SubmitPanel({
  contextId,
  expectedVersion,
  kind,
  blockers,
}: {
  readonly contextId: string;
  readonly expectedVersion: number;
  readonly kind: "SUBMIT" | "RESUBMIT";
  readonly blockers: readonly string[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const label =
    kind === "SUBMIT" ? messages.workflow.submitButton : messages.workflow.resubmitButton;
  const disabled = blockers.length > 0;

  return (
    <section
      aria-labelledby="submit-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="submit-panel"
    >
      <h2 id="submit-title" className="text-lg leading-7 font-semibold">
        {kind === "SUBMIT" ? "İncelemeye gönder" : "Yeniden incelemeye gönder"}
      </h2>
      {disabled ? (
        <ul
          id="submit-blockers"
          className="grid gap-1.5 text-base text-muted-foreground"
          data-testid="submit-blockers"
        >
          {blockers.map((text) => (
            <li key={text} className="flex items-start gap-2">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-warning-strong"
              />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted-foreground">
          Zorunlu evraklarınız tamam. Gönderdiğinizde danışmanlarımız inceleyecektir.
        </p>
      )}
      <ConfirmDialog
        trigger={
          <Button
            size="lg"
            className="w-full"
            disabled={disabled}
            aria-describedby={disabled ? "submit-blockers" : undefined}
          >
            <Send aria-hidden="true" />
            {label}
          </Button>
        }
        title={messages.workflow.submitConfirmTitle}
        description={<p>{messages.workflow.submitConfirmDescription}</p>}
        confirmLabel={label}
        onConfirm={async () => {
          const result = await submitForReviewAction({ contextId, expectedVersion });
          if (result.ok) {
            setNotice({ ok: true, text: messages.workflow.submitted });
            router.refresh();
          } else {
            setNotice({ ok: false, text: result.error.message });
            router.refresh();
          }
          return true;
        }}
      />
      <div role="status" aria-live="polite" data-testid="submit-status">
        {notice ? (
          <p
            className={`flex items-start gap-2 text-base ${notice.ok ? "text-success-strong" : "text-destructive"}`}
          >
            {notice.ok ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            ) : (
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            )}
            <span>{notice.text}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
