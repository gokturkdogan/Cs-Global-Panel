"use client";

import { CheckCircle2, MessageSquareWarning, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { messages } from "@/lib/messages";

import { removeFileAction, reviewDocumentAction } from "../actions";

/**
 * Evrak kararı (D4–D6, BR-57): karar, ekranda gösterilen dosya versiyonuna (`fileId`) bağlıdır; dosya
 * bu sırada değiştiyse sunucu reddeder. Düzeltme açıklaması müşteriye görünür (10–1000).
 */
export function ReviewActions({
  requirementId,
  fileId,
  fileVersion,
  expectedVersion,
  canApprove,
  canRequestRevision,
  canRemove,
}: {
  readonly requirementId: string;
  readonly fileId: string;
  readonly fileVersion: number;
  readonly expectedVersion: number;
  readonly canApprove: boolean;
  readonly canRequestRevision: boolean;
  readonly canRemove: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canApprove && !canRequestRevision && !canRemove) return null;
  const finish = (
    result: { ok: true } | { ok: false; error: { message: string } },
    success: string,
  ) => {
    setNotice(result.ok ? { ok: true, text: success } : { ok: false, text: result.error.message });
    router.refresh();
  };

  return (
    <div className="grid gap-2" data-testid="review-actions">
      <p className="text-xs text-muted-foreground">
        İncelenen dosya: <strong className="tabular-nums">v{fileVersion}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm">
                <CheckCircle2 aria-hidden="true" />
                {messages.workflow.approve}
              </Button>
            }
            title={messages.workflow.approveConfirmTitle}
            description={
              <p>Karar dosya versiyonu v{fileVersion} için kaydedilir ve geçmişte korunur.</p>
            }
            confirmLabel={messages.workflow.approve}
            onConfirm={async () => {
              const result = await reviewDocumentAction({
                decision: "APPROVED",
                requirementId,
                fileId,
                expectedVersion,
              });
              finish(result, messages.workflow.approved);
              return true;
            }}
          />
        ) : null}
        {canRequestRevision ? (
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="outline">
                <MessageSquareWarning aria-hidden="true" />
                {messages.workflow.requestRevision}
              </Button>
            }
            title={messages.workflow.revisionDialogTitle}
            description={
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-msg`} className="text-sm font-medium text-foreground">
                  {messages.workflow.revisionMessageLabel} (v{fileVersion})
                </label>
                <Textarea
                  id={`${id}-msg`}
                  value={message}
                  maxLength={1000}
                  aria-invalid={error !== null}
                  aria-describedby={`${id}-hint`}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                  {messages.workflow.revisionMessageHint}
                </p>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            }
            confirmLabel={messages.workflow.requestRevision}
            onConfirm={async () => {
              if (message.trim().length < 10) {
                setError(messages.workflow.revisionMessageLength);
                return false;
              }
              const result = await reviewDocumentAction({
                decision: "REVISION_REQUIRED",
                requirementId,
                fileId,
                expectedVersion,
                customerMessage: message,
              });
              if (!result.ok && result.error.code === "VALIDATION") {
                setError(result.error.message);
                return false;
              }
              setError(null);
              setMessage("");
              finish(result, messages.workflow.revisionRequested);
              return true;
            }}
          />
        ) : null}
        {canRemove ? (
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="ghost" className="text-destructive">
                <Trash2 aria-hidden="true" />
                {messages.workflow.removeButton}
              </Button>
            }
            title={messages.workflow.removeConfirmTitle}
            description={<p>{messages.workflow.removeConfirmStaffDescription}</p>}
            confirmLabel={messages.workflow.removeButton}
            destructive
            onConfirm={async () => {
              const result = await removeFileAction({ fileId, expectedVersion });
              finish(result, messages.workflow.removed);
              return true;
            }}
          />
        ) : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${notice?.ok ? "text-success-strong" : "text-destructive"}`}
      >
        {notice?.text}
      </p>
    </div>
  );
}
