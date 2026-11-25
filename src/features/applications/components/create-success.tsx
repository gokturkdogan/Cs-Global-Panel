"use client";

import { CircleCheck, Copy, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { messages } from "@/lib/messages";

import { APPLICATION_STATUS_PRESENTATION } from "../domain/status-labels";
import type { CreatedApplication } from "../service";
import { WhatsAppShareDialog } from "./whatsapp-share-dialog";

/**
 * Başvuru oluşturma sonucu (API_CONTRACTS §2.1). Bağlantı yalnızca bu yanıtta ve bu ekranda tutulur
 * (URL'ye, depolamaya yazılmaz); "Yeni başvuru" ile bellekten silinir.
 */
export function CreateSuccess({
  result,
  onNew,
}: {
  readonly result: CreatedApplication;
  readonly onNew: () => void;
}) {
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);

  return (
    <section
      aria-labelledby="create-success-title"
      className="grid gap-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      <div role="status" className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-success-strong" />
        <div className="grid gap-1">
          <h2 id="create-success-title" className="text-xl leading-7 font-semibold text-foreground">
            {messages.applications.created}
          </h2>
          {result.replayed ? (
            <p className="text-sm text-muted-foreground">
              Bu form daha önce gönderilmişti; yeni kayıt oluşturulmadı, mevcut başvuru
              gösteriliyor.
            </p>
          ) : null}
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2" data-testid="create-success-summary">
        {[
          ["Başvuru numarası", result.applicationNumber],
          ["Müşteri", result.customerFullName],
          ["Hizmet", result.serviceName],
          ["Durum", APPLICATION_STATUS_PRESENTATION[result.status].label],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words text-foreground tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {result.accessLink !== null ? (
        <div className="grid gap-2">
          <label htmlFor="created-link" className="text-sm font-medium">
            Müşteri bağlantısı
          </label>
          <input
            id="created-link"
            readOnly
            value={result.accessLink}
            onFocus={(event) => event.currentTarget.select()}
            className="h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm"
            data-sensitive="access-link"
          />
          <Alert variant="destructive" role="note">
            <AlertDescription>{messages.applications.portalNotReady}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {result.accessLink !== null ? (
          <>
            <Button
              className="h-11"
              onClick={async () => {
                const copied = await copyText(result.accessLink ?? "");
                setNotice(
                  copied
                    ? { kind: "status", text: messages.applications.linkCopied }
                    : { kind: "alert", text: messages.applications.copyFailed },
                );
              }}
            >
              <Copy aria-hidden="true" />
              Bağlantıyı Kopyala
            </Button>
            <WhatsAppShareDialog
              applicationId={result.applicationId}
              applicationNumber={result.applicationNumber}
              trigger={
                <Button variant="outline" className="h-11">
                  <MessageCircle aria-hidden="true" />
                  WhatsApp ile Paylaş
                </Button>
              }
            />
          </>
        ) : null}
        <Button asChild variant="outline" className="h-11">
          <Link href={`/dashboard/applications/${result.applicationId}`}>Başvuru Detayına Git</Link>
        </Button>
        <Button variant="ghost" className="h-11" onClick={onNew}>
          <Plus aria-hidden="true" />
          Yeni başvuru oluştur
        </Button>
      </div>
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
