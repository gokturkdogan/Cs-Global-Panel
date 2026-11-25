"use client";

import { CheckCircle2, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ALLOWED_FILE_EXTENSION, MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { messages } from "@/lib/messages";

/**
 * PDF yükleme bileşeni (PHASE 08; müşteri paneli ve personel paneli ortak). Gerçek ilerleme:
 * tarayıcı → sunucu bayt aktarımı `XMLHttpRequest.upload.onprogress` ile; aktarım %100 olduğunda
 * "Sunucuda doğrulanıyor ve kaydediliyor" gösterilir — "Yüklendi" YALNIZCA sunucu aktivasyonu commit
 * edip başarı döndürdükten sonra. Sahte zamanlayıcı ilerlemesi yok. İstemci ön kontrolü (uzantı, boyut,
 * `%PDF-` imzası) yalnızca kullanıcı deneyimidir; güvenlik sınırı sunucudadır. Yükleme sırasında buton
 * pasiftir (çift gönderim yok). Başarıda sayfa sunucudan yenilenir (gerçek DB durumu).
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "uploading"; readonly percent: number }
  | { readonly kind: "processing" }
  | { readonly kind: "done" }
  | { readonly kind: "failed"; readonly message: string };

type PdfUploadProps = {
  /** Yükleme uç noktası (sunucuda üretilir; başvuru kimliği içermez — müşteri için bağlam + evrak). */
  readonly endpoint: string;
  readonly expectedVersion: number;
  readonly label: string;
  /** Değiştirme onayı (personel): eski dosyanın geçmişte korunacağı bilgisi. */
  readonly confirm?: { readonly title: string; readonly description: string };
  readonly size?: "default" | "lg";
};

const noopSubscribe = () => () => undefined;

async function precheck(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith(ALLOWED_FILE_EXTENSION)) return messages.files.notPdf;
  if (file.size === 0) return messages.files.empty;
  if (file.size > MAX_PDF_SIZE_BYTES) return messages.files.tooLarge;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") return messages.files.notPdf;
  return null;
}

export function PdfUpload({
  endpoint,
  expectedVersion,
  label,
  confirm,
  size = "lg",
}: PdfUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const statusId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Hydration tamamlanmadan seçilen dosya olayı kaybolmasın: buton yalnızca istemci hazırken etkin.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const working =
    phase.kind === "checking" || phase.kind === "uploading" || phase.kind === "processing";

  function openPicker() {
    if (!busy.current) inputRef.current?.click();
  }

  async function onFile(file: File) {
    if (busy.current) return;
    busy.current = true;
    setPhase({ kind: "checking" });
    const problem = await precheck(file);
    if (problem !== null) {
      busy.current = false;
      setPhase({ kind: "failed", message: problem });
      return;
    }
    const request = new XMLHttpRequest();
    request.open("POST", `${endpoint}?expectedVersion=${expectedVersion}`);
    request.setRequestHeader("Content-Type", "application/pdf");
    request.setRequestHeader("X-Upload-Filename", encodeURIComponent(file.name));
    request.responseType = "json";
    request.timeout = 180_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setPhase({
          kind: "uploading",
          percent: Math.min(100, Math.floor((event.loaded * 100) / event.total)),
        });
      }
    };
    // Aktarım bitti ≠ kaydedildi: sunucu doğrulama + storage + aktivasyon sürüyor.
    request.upload.onload = () => setPhase({ kind: "processing" });
    const finish = (next: Phase) => {
      busy.current = false;
      setPhase(next);
    };
    request.onload = () => {
      const body = request.response as { ok?: boolean; message?: string } | null;
      if (request.status === 200 && body?.ok === true) {
        finish({ kind: "done" });
        router.refresh();
        return;
      }
      finish({
        kind: "failed",
        message: body?.message ?? `${messages.files.unavailable} ${messages.files.keptPrevious}`,
      });
    };
    request.onerror = () => finish({ kind: "failed", message: messages.files.network });
    request.ontimeout = () => finish({ kind: "failed", message: messages.files.network });
    setPhase({ kind: "uploading", percent: 0 });
    request.send(file);
  }

  const trigger = (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={working || !hydrated}
      aria-describedby={statusId}
      onClick={confirm ? undefined : openPicker}
    >
      <Upload aria-hidden="true" />
      {label}
    </Button>
  );

  return (
    <div className="grid gap-2" data-testid="pdf-upload" data-ready={hydrated ? "true" : "false"}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="pdf-upload-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {confirm ? (
          <ConfirmDialog
            trigger={trigger}
            title={confirm.title}
            description={<p>{confirm.description}</p>}
            confirmLabel={messages.files.replaceButton}
            onConfirm={async () => {
              openPicker();
              return true;
            }}
          />
        ) : (
          trigger
        )}
      </div>
      <div
        id={statusId}
        role="status"
        aria-live="polite"
        className="grid gap-1.5 text-sm"
        data-testid="pdf-upload-status"
      >
        {phase.kind === "checking" ? (
          <span className="text-muted-foreground">{messages.files.stateChecking}</span>
        ) : null}
        {phase.kind === "uploading" ? (
          <>
            <span className="text-foreground tabular-nums">
              {messages.files.stateUploading} — %{phase.percent}
            </span>
            <progress
              className="h-2 w-full accent-primary"
              max={100}
              value={phase.percent}
              aria-label={messages.files.stateUploading}
            />
          </>
        ) : null}
        {phase.kind === "processing" ? (
          <>
            <span className="text-foreground">{messages.files.stateProcessing}</span>
            <progress
              className="h-2 w-full accent-primary"
              aria-label={messages.files.stateProcessing}
            />
          </>
        ) : null}
        {phase.kind === "done" ? (
          <span className="flex items-center gap-1.5 font-medium text-success-strong">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {messages.files.stateDone}
          </span>
        ) : null}
        {phase.kind === "failed" ? (
          <span className="flex items-start gap-1.5 text-destructive wrap-anywhere">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-medium">{messages.files.stateFailed}: </strong>
              {phase.message}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
