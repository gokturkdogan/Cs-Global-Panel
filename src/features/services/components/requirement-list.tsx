"use client";

import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { moveRequirementAction, setRequirementActiveAction } from "../actions";
import type { RequirementDetail } from "../queries";
import { RequirementForm } from "./requirement-form";
import { ActiveStatusBadge, RequiredBadge } from "./status-badges";

type Props = { readonly serviceId: string; readonly requirements: readonly RequirementDetail[] };

/**
 * Evrak gereksinimleri: tek sıralı liste (aktif + pasif). Sıralama "Yukarı/Aşağı taşı" ile
 * (klavye ve mobil uyumlu; sürükle-bırak yok). Talimatlar React metni olarak gösterilir (inert).
 */
export function RequirementList({ serviceId, requirements }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const [focusAfterMove, setFocusAfterMove] = useState<{
    id: string;
    direction: "up" | "down";
  } | null>(null);
  const [pending, startTransition] = useTransition();
  // Render beklenmeden gelen ikinci tıklamaya karşı kilit (çift taşıma/aktifleştirme yok).
  const busy = useRef(false);

  // Taşıma sonrası odak, taşınan evrakın aynı yöndeki butonunda kalır (uçtaysa diğer yönde).
  useEffect(() => {
    if (focusAfterMove === null) return;
    const { id, direction } = focusAfterMove;
    const preferred = document.getElementById(
      `move-${direction}-${id}`,
    ) as HTMLButtonElement | null;
    const fallback = document.getElementById(
      `move-${direction === "up" ? "down" : "up"}-${id}`,
    ) as HTMLButtonElement | null;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [requirements, focusAfterMove]);

  function closeForm(focusId: string) {
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }

  function move(requirement: RequirementDetail, direction: "up" | "down") {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await moveRequirementAction({
          serviceId,
          requirementId: requirement.id,
          direction,
        });
        if (!result.ok) setMessage({ kind: "alert", text: result.error.message });
        else {
          setMessage({ kind: "status", text: messages.services.requirementMoved });
          setFocusAfterMove({ id: requirement.id, direction });
        }
      } finally {
        busy.current = false;
      }
    });
  }

  function activate(requirement: RequirementDetail) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        await setActive(requirement, true);
      } finally {
        busy.current = false;
      }
    });
  }

  async function setActive(requirement: RequirementDetail, isActive: boolean): Promise<boolean> {
    const result = await setRequirementActiveAction({
      serviceId,
      requirementId: requirement.id,
      isActive,
      expectedVersion: requirement.version,
    });
    if (!result.ok) {
      setMessage({ kind: "alert", text: result.error.message });
      return false;
    }
    setMessage({
      kind: "status",
      text: isActive
        ? messages.services.requirementActivated
        : messages.services.requirementDeactivated,
    });
    return true;
  }

  return (
    <section
      aria-labelledby="requirements-title"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="requirements-title" className="text-lg leading-7 font-semibold text-foreground">
            Evrak gereksinimleri
          </h2>
          <p className="text-sm text-muted-foreground">
            Yeni başvurularda yalnızca aktif evraklar bu sırayla müşteriye istenir.
          </p>
        </div>
        {editing !== "new" ? (
          <Button id="add-requirement" onClick={() => setEditing("new")} disabled={pending}>
            <Plus aria-hidden="true" />
            Yeni Evrak Ekle
          </Button>
        ) : null}
      </div>

      <div>
        {message ? (
          <p
            role={message.kind}
            className={
              message.kind === "alert"
                ? "text-sm text-destructive-strong"
                : "text-sm text-primary-dark"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>

      {requirements.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={FileText}
          title={messages.services.requirementsEmpty}
          description="Yeni Evrak Ekle ile ilk evrak gereksinimini ekleyin."
        />
      ) : (
        <ol className="grid gap-3" data-testid="requirement-list">
          {requirements.map((requirement, index) => (
            <li
              key={requirement.id}
              className={`grid gap-3 rounded-lg border p-4 ${requirement.isActive ? "bg-card" : "bg-muted/50"}`}
              data-testid="requirement-item"
            >
              {editing === requirement.id ? (
                <RequirementForm
                  serviceId={serviceId}
                  requirement={requirement}
                  onCancel={() => closeForm(`edit-${requirement.id}`)}
                  onDone={(text) => {
                    setMessage({ kind: "status", text });
                    closeForm(`edit-${requirement.id}`);
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 text-base font-medium wrap-anywhere text-foreground">
                      <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
                      {requirement.title}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      <RequiredBadge isRequired={requirement.isRequired} />
                      <ActiveStatusBadge isActive={requirement.isActive} />
                    </div>
                  </div>
                  {requirement.instructions ? (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Yükleme talimatı
                      </span>
                      <p
                        className="text-sm wrap-anywhere whitespace-pre-line text-foreground"
                        data-testid="requirement-instructions"
                      >
                        {requirement.instructions}
                      </p>
                    </div>
                  ) : null}
                  {requirement.description ? (
                    <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">
                      {requirement.description}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      id={`move-up-${requirement.id}`}
                      variant="outline"
                      size="icon-lg"
                      disabled={pending || index === 0}
                      onClick={() => move(requirement, "up")}
                      aria-label={`${requirement.title} evrakını yukarı taşı`}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      id={`move-down-${requirement.id}`}
                      variant="outline"
                      size="icon-lg"
                      disabled={pending || index === requirements.length - 1}
                      onClick={() => move(requirement, "down")}
                      aria-label={`${requirement.title} evrakını aşağı taşı`}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      id={`edit-${requirement.id}`}
                      variant="outline"
                      className="h-11"
                      disabled={pending}
                      onClick={() => setEditing(requirement.id)}
                      aria-label={`${requirement.title} evrakını düzenle`}
                    >
                      <Pencil aria-hidden="true" />
                      Düzenle
                    </Button>
                    {requirement.isActive ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="outline"
                            className="h-11"
                            disabled={pending}
                            aria-label={`${requirement.title} evrakını pasifleştir`}
                          >
                            <PowerOff aria-hidden="true" />
                            Pasifleştir
                          </Button>
                        }
                        title="Evrak pasifleştirilsin mi?"
                        description={
                          <>
                            <p>
                              <strong className="text-foreground">{requirement.title}</strong> yeni
                              başvurulara eklenmeyecek.
                            </p>
                            <p>
                              Mevcut başvurulardaki evrak kayıtları silinmez veya değişmez. Evrakı
                              daha sonra yeniden aktifleştirebilirsiniz.
                            </p>
                          </>
                        }
                        confirmLabel="Pasifleştir"
                        destructive
                        onConfirm={() => setActive(requirement, false)}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        className="h-11"
                        disabled={pending}
                        onClick={() => activate(requirement)}
                        aria-label={`${requirement.title} evrakını aktifleştir`}
                      >
                        <Power aria-hidden="true" />
                        Aktifleştir
                      </Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {editing === "new" ? (
        <RequirementForm
          serviceId={serviceId}
          onCancel={() => closeForm("add-requirement")}
          onDone={(text) => {
            setMessage({ kind: "status", text });
            closeForm("add-requirement");
          }}
        />
      ) : null}
    </section>
  );
}
