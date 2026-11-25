"use client";

import { Copy, Eye, EyeOff, Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import { revealAccessLinkAction, revokeAccessLinkAction, rotateAccessLinkAction } from "../actions";
import { LinkStatusBadge } from "./link-status-badge";
import { WhatsAppShareDialog } from "./whatsapp-share-dialog";

type Props = {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly customerName: string;
  readonly activeLink: { readonly tokenId: string; readonly createdAt: string } | null;
  readonly lastRevokedAt: string | null;
};

type Notice = { readonly kind: "status" | "alert"; readonly text: string };

/**
 * Müşteri bağlantısı yönetimi (BR-100…BR-107). Bağlantı varsayılan olarak gizlidir; "Göster" veya
 * "Kopyala" ile yalnızca o anda sunucudan çözülür (audit'lenir). İptal/yenileme onaylıdır ve
 * istemcinin gördüğü aktif token kimliğiyle yapılır (eski onay yeni bağlantıyı etkileyemez).
 */
export function AccessLinkCard({
  applicationId,
  applicationNumber,
  customerName,
  activeLink,
  lastRevokedAt,
}: Props) {
  const [revealed, setRevealed] = useState<{ link: string; tokenId: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  // Sunucudaki aktif bağlantı değiştiyse (başka sekme/hesap) çözülmüş eski bağlantı gösterilmez.
  const shown =
    revealed !== null && activeLink !== null && revealed.tokenId === activeLink.tokenId
      ? revealed.link
      : null;

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    try {
      return await work();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function reveal(): Promise<string | null> {
    if (shown !== null) return shown;
    const result = await revealAccessLinkAction({ applicationId });
    if (!result.ok) {
      setNotice({ kind: "alert", text: result.error.message });
      return null;
    }
    if (result.data.accessLink === null) {
      setNotice({ kind: "alert", text: messages.applications.linkUnavailable });
      return null;
    }
    setRevealed({ link: result.data.accessLink, tokenId: result.data.accessTokenId });
    return result.data.accessLink;
  }

  async function copy() {
    await run(async () => {
      const link = await reveal();
      if (link === null) return;
      setNotice(
        (await copyText(link))
          ? { kind: "status", text: messages.applications.linkCopied }
          : { kind: "alert", text: messages.applications.copyFailed },
      );
    });
  }

  async function rotate(): Promise<boolean> {
    const result = await rotateAccessLinkAction({
      applicationId,
      expectedActiveTokenId: activeLink?.tokenId ?? null,
    });
    if (!result.ok) {
      setNotice({ kind: "alert", text: result.error.message });
      return false;
    }
    setRevealed({ link: result.data.accessLink, tokenId: result.data.accessTokenId });
    setNotice({
      kind: "status",
      text: result.data.previousTokenId
        ? messages.applications.linkRotated
        : messages.applications.linkCreated,
    });
    return true;
  }

  async function revoke(): Promise<boolean> {
    if (activeLink === null) return false;
    const result = await revokeAccessLinkAction({
      applicationId,
      expectedActiveTokenId: activeLink.tokenId,
    });
    if (!result.ok) {
      setNotice({ kind: "alert", text: result.error.message });
      return false;
    }
    setRevealed(null);
    setNotice({ kind: "status", text: messages.applications.linkRevoked });
    return true;
  }

  const target = (
    <p>
      Başvuru <strong className="text-foreground">{applicationNumber}</strong> · {customerName}
    </p>
  );

  return (
    <section
      aria-labelledby="access-link-title"
      className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="access-link-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="access-link-title" className="text-lg leading-7 font-semibold">
          Müşteri erişim bağlantısı
        </h2>
        <LinkStatusBadge active={activeLink !== null} />
      </div>
      <Alert variant="destructive" role="note">
        <AlertDescription>{messages.applications.portalNotReady}</AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        Bağlantı bir erişim anahtarıdır: bağlantıya sahip olan herkes başvuruya erişebilir. Yalnızca
        müşteriyle paylaşın.
      </p>

      {activeLink !== null ? (
        <>
          <p className="text-xs text-muted-foreground tabular-nums">
            Oluşturulma:{" "}
            <time dateTime={activeLink.createdAt}>{formatDateTime(activeLink.createdAt)}</time>
          </p>
          <div className="grid gap-1">
            <label htmlFor="access-link-value" className="text-sm font-medium">
              Bağlantı
            </label>
            <input
              id="access-link-value"
              readOnly
              value={shown ?? "•••••••••••••••• (gizli)"}
              onFocus={(event) => event.currentTarget.select()}
              className="h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm"
              data-sensitive="access-link"
            />
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            {shown === null ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={() => void run(reveal)}
              >
                <Eye aria-hidden="true" />
                Göster
              </Button>
            ) : (
              <Button variant="outline" className="h-11" onClick={() => setRevealed(null)}>
                <EyeOff aria-hidden="true" />
                Gizle
              </Button>
            )}
            <Button className="h-11" disabled={pending} onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              Bağlantıyı Kopyala
            </Button>
            <WhatsAppShareDialog
              applicationId={applicationId}
              applicationNumber={applicationNumber}
              trigger={
                <Button variant="outline" className="h-11" disabled={pending}>
                  <MessageCircle aria-hidden="true" />
                  WhatsApp ile Paylaş
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="h-11" disabled={pending}>
                  <RefreshCw aria-hidden="true" />
                  Bağlantıyı Yenile
                </Button>
              }
              title="Bağlantı yenilensin mi?"
              description={
                <>
                  {target}
                  <p>
                    Mevcut bağlantı hemen geçersiz olur ve yeni bağlantı oluşturulur. Yeni
                    bağlantıyı müşteriye yeniden göndermeniz gerekir. Başvuru ve evrak bilgileri
                    değişmez.
                  </p>
                </>
              }
              confirmLabel="Yenile"
              onConfirm={rotate}
            />
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="h-11" disabled={pending}>
                  <Unlink aria-hidden="true" />
                  Bağlantıyı İptal Et
                </Button>
              }
              title="Bağlantı iptal edilsin mi?"
              description={
                <>
                  {target}
                  <p>
                    İptal edilen bağlantı tekrar kullanılamaz. Başvuru ve müşteri bilgileri
                    silinmez; daha sonra yeni bağlantı oluşturabilirsiniz.
                  </p>
                </>
              }
              confirmLabel="İptal Et"
              destructive
              onConfirm={revoke}
            />
          </div>
        </>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-foreground">
            Bu başvurunun aktif bağlantısı yok.
            {lastRevokedAt ? (
              <>
                {" "}
                Son iptal: <time dateTime={lastRevokedAt}>{formatDateTime(lastRevokedAt)}</time>
              </>
            ) : null}
          </p>
          <Button className="h-11 w-fit" disabled={pending} onClick={() => void run(rotate)}>
            <Link2 aria-hidden="true" />
            Yeni bağlantı oluştur
          </Button>
        </div>
      )}
      {notice ? (
        <p
          role={notice.kind}
          className={
            notice.kind === "alert"
              ? "text-sm text-destructive-strong"
              : "text-sm text-primary-dark"
          }
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
