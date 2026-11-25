"use client";

import { Copy, MessageCircle, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { messages } from "@/lib/messages";

import { prepareWhatsAppShareAction } from "../actions";
import type { WhatsAppShare } from "../service";

type Props = {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly trigger: ReactNode;
};

/**
 * WhatsApp paylaşımı (BR-160…BR-162): mesaj yalnızca "Mesajı hazırla" ile sunucuda üretilir; alıcı
 * adı ve telefonu gösterilir; WhatsApp yalnızca kullanıcının "WhatsApp'ta aç" bağlantısına
 * tıklamasıyla açılır (otomatik gönderim, ön yükleme veya harici istek yok).
 */
export function WhatsAppShareDialog({ applicationId, applicationNumber, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<WhatsAppShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function prepare() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await prepareWhatsAppShareAction({ applicationId });
      if (result.ok) setShare(result.data);
      else setError(result.error.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Kapanınca bağlantı içeren mesaj bellekten temizlenir.
          setShare(null);
          setError(null);
          setNotice(null);
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-50 bg-foreground/40" />
        <Dialog.Content className="menu-panel fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-md focus:outline-none">
          <Dialog.Title className="pr-8 text-lg leading-7 font-semibold text-foreground">
            WhatsApp ile paylaş — {applicationNumber}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Mesaj otomatik gönderilmez. WhatsApp açılır; alıcıyı kontrol edip göndermeyi siz
            yaparsınız.
          </Dialog.Description>
          <Alert variant="destructive" role="note">
            <AlertDescription>{messages.applications.portalLimitedNotice}</AlertDescription>
          </Alert>

          {share === null ? (
            <Button onClick={prepare} disabled={pending} className="h-11">
              <MessageCircle aria-hidden="true" />
              {pending ? "Hazırlanıyor…" : "Mesajı hazırla"}
            </Button>
          ) : (
            <div className="grid gap-3">
              <dl
                className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm"
                data-testid="whatsapp-recipient"
              >
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">Alıcı:</dt>
                  <dd className="font-medium text-foreground">{share.recipientName}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">Telefon:</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {share.recipientPhone}
                  </dd>
                </div>
              </dl>
              <pre
                className="max-h-56 overflow-auto rounded-lg border bg-card p-3 font-sans text-sm whitespace-pre-wrap text-foreground"
                data-testid="whatsapp-message"
                data-sensitive="access-link"
              >
                {share.message}
              </pre>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="h-11">
                  <a href={share.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" />
                    WhatsApp&apos;ta aç
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={async () =>
                    setNotice(
                      (await copyText(share.message))
                        ? messages.applications.messageCopied
                        : messages.applications.copyFailed,
                    )
                  }
                >
                  <Copy aria-hidden="true" />
                  Mesajı kopyala
                </Button>
              </div>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-primary-dark">
              {notice}
            </p>
          ) : null}
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="absolute top-2.5 right-2"
              aria-label="Kapat"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
