"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WORKFLOW_TEXT_LIMITS } from "@/config/constants";
import { messages } from "@/lib/messages";

import { requestDeletionAction } from "../actions";

/**
 * "Tehlikeli İşlemler" (PHASE 10, BR-150/151, D-118). Normal iş akışı aksiyonlarından ayrı; tek tıklamayla
 * silme yok: onay penceresi + zorunlu gerekçe + başvuru numarasının yazılması. Tümü sunucuda yeniden
 * doğrulanır. "Silindi" mesajı yalnızca sunucu `DELETED` döndürünce gösterilir.
 */
export function DeletionDangerZone({
  applicationId,
  applicationNumber,
  version,
}: {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly version: number;
}) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="danger-title"
      className="grid gap-3 rounded-xl border border-destructive/40 bg-card p-4 shadow-sm sm:p-5"
      data-testid="danger-zone"
    >
      <div className="grid gap-1">
        <h2 id="danger-title" className="flex items-center gap-2 text-lg leading-7 font-semibold">
          <TriangleAlert aria-hidden="true" className="size-4 text-destructive" />
          {messages.deletion.sectionTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{messages.deletion.sectionDescription}</p>
      </div>
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" data-testid="delete-application">
              {messages.deletion.button}
            </Button>
          }
          title={messages.deletion.dialogTitle}
          destructive
          confirmLabel={messages.deletion.start}
          description={
            <>
              <p>
                <strong className="text-foreground tabular-nums">{applicationNumber}</strong>
              </p>
              <p>{messages.deletion.dialogScope}</p>
              <p className="font-medium text-destructive">{messages.deletion.dialogIrreversible}</p>
              <p>{messages.deletion.dialogRetention}</p>
              <p className="text-xs">{messages.deletion.dialogBackups}</p>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-reason`} className="text-sm font-medium text-foreground">
                  {messages.deletion.reasonLabel}
                </label>
                <Textarea
                  id={`${id}-reason`}
                  value={reason}
                  maxLength={WORKFLOW_TEXT_LIMITS.deletionReasonMax}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-confirm`} className="text-sm font-medium text-foreground">
                  {messages.deletion.confirmLabel(applicationNumber)}
                </label>
                <Input
                  id={`${id}-confirm`}
                  value={confirmation}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </>
          }
          onConfirm={async () => {
            if (reason.trim() === "") {
              setError(messages.deletion.reasonRequired);
              return false;
            }
            if (confirmation.trim() !== applicationNumber) {
              setError(messages.deletion.confirmMismatch);
              return false;
            }
            try {
              const result = await requestDeletionAction({
                applicationId,
                expectedVersion: version,
                reason,
                confirmationNumber: confirmation.trim(),
              });
              if (!result.ok) {
                setError(result.error.message);
                return false;
              }
              setError(null);
              if (result.data.state === "DELETED") {
                router.replace("/dashboard/applications?deleted=1");
              } else {
                router.refresh();
              }
              return true;
            } catch {
              setError(messages.deletion.unavailable);
              return false;
            }
          }}
        />
      </div>
    </section>
  );
}
