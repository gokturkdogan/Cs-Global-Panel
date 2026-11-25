"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AvailableAction } from "@/features/applications/domain/application-status";
import {
  TRANSITION_ACTION_LABELS,
  TRANSITION_CONFIRM,
} from "@/features/applications/domain/transition-labels";
import { messages } from "@/lib/messages";

import {
  revertForRevisionAction,
  submitOnBehalfAction,
  transitionApplicationAction,
} from "../actions";
import type { STAFF_TRANSITION_CODES } from "../schemas";

type ApprovedDocument = {
  readonly requirementId: string;
  readonly title: string;
  readonly fileId: string;
  readonly fileVersion: number | null;
};

/**
 * Başvuru iş akışı aksiyonları (PHASE 09). Yalnızca sunucunun matristen hesapladığı aksiyonlar
 * gösterilir (keyfî statü seçimi yok); pasif olanlar nedenleriyle. Her aksiyon onay penceresi ister;
 * T7–T12 gerekçe ister (personel içi). Asıl kontrol sunucuda kilit altında yapılır.
 */
export function WorkflowPanel({
  applicationId,
  version,
  actions,
  approvedDocuments,
}: {
  readonly applicationId: string;
  readonly version: number;
  readonly actions: readonly AvailableAction[];
  readonly approvedDocuments: readonly ApprovedDocument[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (actions.length === 0) return null;
  return (
    <div className="grid gap-3" data-testid="workflow-panel">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) =>
          action.code === "REVERT_FOR_REVISION" ? (
            <RevertForRevisionButton
              key={action.code}
              applicationId={applicationId}
              version={version}
              enabled={action.enabled}
              documents={approvedDocuments}
              onDone={(result) => {
                setNotice(result);
                router.refresh();
              }}
            />
          ) : (
            <TransitionButton
              key={action.code}
              applicationId={applicationId}
              version={version}
              action={action}
              onDone={(result) => {
                setNotice(result);
                router.refresh();
              }}
            />
          ),
        )}
      </div>
      {actions.some((action) => !action.enabled) ? (
        <ul className="grid gap-1 text-sm text-muted-foreground" data-testid="workflow-blockers">
          {[...new Set(actions.flatMap((action) => action.blockers))]
            .filter((blocker) => blocker !== "WRONG_STATUS")
            .map((blocker) => (
              <li key={blocker} className="flex items-start gap-1.5">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-warning-strong"
                />
                {messages.workflow.blockers[blocker]}
              </li>
            ))}
        </ul>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${notice?.ok ? "text-success-strong" : "text-destructive"}`}
        data-testid="workflow-status"
      >
        {notice?.text}
      </p>
    </div>
  );
}

type Done = (result: { ok: boolean; text: string }) => void;

function TransitionButton({
  applicationId,
  version,
  action,
  onDone,
}: {
  readonly applicationId: string;
  readonly version: number;
  readonly action: AvailableAction;
  readonly onDone: Done;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const label = TRANSITION_ACTION_LABELS[action.code];
  const destructive = action.code === "CANCEL";

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant={destructive ? "outline" : "default"}
          disabled={!action.enabled}
          data-action={action.code}
        >
          {label}
        </Button>
      }
      title={`${label}?`}
      description={
        <>
          <p>{TRANSITION_CONFIRM[action.code]}</p>
          {action.reasonRequired ? (
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-reason`} className="text-sm font-medium text-foreground">
                {messages.workflow.reasonLabel}
              </label>
              <Textarea
                id={`${id}-reason`}
                value={reason}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={error !== null}
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      }
      confirmLabel={label}
      destructive={destructive}
      onConfirm={async () => {
        if (action.reasonRequired && reason.trim() === "") {
          setError(messages.workflow.reasonRequired);
          return false;
        }
        const result =
          action.code === "SUBMIT" || action.code === "RESUBMIT"
            ? await submitOnBehalfAction({ applicationId, expectedVersion: version })
            : await transitionApplicationAction({
                applicationId,
                expectedVersion: version,
                code: action.code as (typeof STAFF_TRANSITION_CODES)[number],
                reason: action.reasonRequired ? reason : null,
              });
        if (!result.ok && result.error.code === "VALIDATION") {
          setError(result.error.message);
          return false;
        }
        setError(null);
        setReason("");
        onDone(
          result.ok
            ? { ok: true, text: messages.workflow.transitionDone }
            : { ok: false, text: result.error.message },
        );
        return true;
      }}
    />
  );
}

function RevertForRevisionButton({
  applicationId,
  version,
  enabled,
  documents,
  onDone,
}: {
  readonly applicationId: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly documents: readonly ApprovedDocument[];
  readonly onDone: Done;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const label = TRANSITION_ACTION_LABELS.REVERT_FOR_REVISION;

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant="outline"
          disabled={!enabled}
          data-action="REVERT_FOR_REVISION"
        >
          {label}
        </Button>
      }
      title={`${label}?`}
      description={
        <>
          <p>{TRANSITION_CONFIRM.REVERT_FOR_REVISION}</p>
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">Evraklar</legend>
            {documents.map((doc) => {
              const checked = doc.requirementId in selected;
              return (
                <div key={doc.requirementId} className="grid gap-1.5 rounded-lg border p-2">
                  <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[doc.requirementId] = "";
                          else delete next[doc.requirementId];
                          return next;
                        })
                      }
                    />
                    {doc.title} {doc.fileVersion ? `(v${doc.fileVersion})` : ""}
                  </label>
                  {checked ? (
                    <Textarea
                      aria-label={`${doc.title} — ${messages.workflow.revisionMessageLabel}`}
                      value={selected[doc.requirementId]}
                      maxLength={1000}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [doc.requirementId]: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-reason`} className="text-sm font-medium text-foreground">
              {messages.workflow.reasonLabel}
            </label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      }
      confirmLabel={label}
      onConfirm={async () => {
        const chosen = documents.filter((doc) => doc.requirementId in selected);
        if (chosen.length === 0 || reason.trim() === "") {
          setError(
            chosen.length === 0 ? "En az bir evrak seçiniz." : messages.workflow.reasonRequired,
          );
          return false;
        }
        const result = await revertForRevisionAction({
          applicationId,
          expectedVersion: version,
          reason,
          documents: chosen.map((doc) => ({
            requirementId: doc.requirementId,
            fileId: doc.fileId,
            customerMessage: selected[doc.requirementId] ?? "",
          })),
        });
        if (!result.ok && result.error.code === "VALIDATION") {
          setError(result.error.message);
          return false;
        }
        setError(null);
        onDone(
          result.ok
            ? { ok: true, text: messages.workflow.transitionDone }
            : { ok: false, text: result.error.message },
        );
        return true;
      }}
    />
  );
}
