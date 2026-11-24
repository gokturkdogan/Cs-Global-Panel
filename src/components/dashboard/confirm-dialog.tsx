"use client";

import { AlertDialog } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  /** Diyaloğu açan buton (Radix `asChild`). */
  readonly trigger: ReactNode;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly destructive?: boolean;
  /** `true` dönerse diyalog kapanır; hata durumunda açık kalır (mesaj çağıran tarafta). */
  readonly onConfirm: () => Promise<boolean>;
};

/**
 * Onay penceresi (Radix AlertDialog): odak kapanı, Escape ile iptal, kapanınca odak tetikleyiciye
 * döner; onay sürerken butonlar pasif (çift gönderim yok). İlk odak "Vazgeç" üzerindedir.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-foreground/40" />
        <AlertDialog.Content className="menu-panel fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-5 shadow-md focus:outline-none">
          <AlertDialog.Title className="text-lg leading-7 font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="grid gap-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Vazgeç
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={async () => {
                if (busy.current) return; // render beklenmeden gelen ikinci tıklama
                busy.current = true;
                setPending(true);
                try {
                  if (await onConfirm()) setOpen(false);
                } finally {
                  busy.current = false;
                  setPending(false);
                }
              }}
            >
              {pending ? "İşleniyor…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
