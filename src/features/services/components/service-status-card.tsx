"use client";

import { Power, PowerOff } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { setServiceActiveAction } from "../actions";
import { ActiveStatusBadge } from "./status-badges";

type Props = {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly isActive: boolean;
  readonly version: number;
  readonly activeRequirementCount: number;
};

/** Hizmet durumu: pasifleştirme onaylıdır; aktifleştirme doğrudan (aktif evrak yoksa uyarı). */
export function ServiceStatusCard({
  serviceId,
  serviceName,
  isActive,
  version,
  activeRequirementCount,
}: Props) {
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  async function change(next: boolean): Promise<boolean> {
    const result = await setServiceActiveAction({
      serviceId,
      isActive: next,
      expectedVersion: version,
    });
    if (!result.ok) {
      setMessage({ kind: "alert", text: result.error.message });
      return false;
    }
    setMessage({
      kind: "status",
      text: next ? messages.services.activated : messages.services.deactivated,
    });
    return true;
  }

  return (
    <section
      aria-labelledby="service-status-title"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="service-status-title" className="text-lg leading-7 font-semibold text-foreground">
            Durum
          </h2>
          <p className="text-sm text-muted-foreground">
            Pasif hizmet yeni başvurularda seçilemez. Mevcut başvurular etkilenmez.
          </p>
        </div>
        <ActiveStatusBadge isActive={isActive} />
      </div>

      {isActive && activeRequirementCount === 0 ? (
        <Alert variant="destructive" role="note">
          <AlertDescription>{messages.services.noActiveRequirementWarning}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        {isActive ? (
          <ConfirmDialog
            trigger={
              <Button variant="outline">
                <PowerOff aria-hidden="true" />
                Hizmeti pasifleştir
              </Button>
            }
            title="Hizmet pasifleştirilsin mi?"
            description={
              <>
                <p>
                  <strong className="text-foreground">{serviceName}</strong> yeni başvurularda
                  seçilemeyecek.
                </p>
                <p>
                  Mevcut başvurular, evrak listeleri ve geçmiş kayıtlar silinmez veya değişmez.
                  Hizmeti daha sonra yeniden aktifleştirebilirsiniz.
                </p>
              </>
            }
            confirmLabel="Pasifleştir"
            destructive
            onConfirm={() => change(false)}
          />
        ) : (
          <Button
            disabled={pending}
            onClick={() => {
              if (busy.current) return;
              busy.current = true;
              startTransition(async () => {
                try {
                  await change(true);
                } finally {
                  busy.current = false;
                }
              });
            }}
          >
            <Power aria-hidden="true" />
            {pending ? "İşleniyor…" : "Hizmeti aktifleştir"}
          </Button>
        )}
      </div>

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
    </section>
  );
}
