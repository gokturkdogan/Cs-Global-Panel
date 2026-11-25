"use client";

import { Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

import { revealAccessLinkAction } from "../actions";

/**
 * Bağlantıyı yalnızca tıklamada sunucudan çözer ve panoya yazar (liste satırı). Kopyalama başarısızsa
 * bağlantı seçilebilir bir alanda gösterilir (elle kopyalama). Bağlantı önceden istemciye gelmez.
 */
export function CopyLinkButton({
  applicationId,
  applicationNumber,
  className,
}: {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly className?: string;
}) {
  const [state, setState] = useState<{
    kind: "status" | "alert";
    text: string;
    fallback?: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function copy() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await revealAccessLinkAction({ applicationId });
      if (!result.ok) return setState({ kind: "alert", text: result.error.message });
      if (result.data.accessLink === null)
        return setState({ kind: "alert", text: messages.applications.linkUnavailable });
      const copied = await copyText(result.data.accessLink);
      setState(
        copied
          ? { kind: "status", text: messages.applications.linkCopied }
          : {
              kind: "alert",
              text: messages.applications.copyFailed,
              fallback: result.data.accessLink,
            },
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className={cn("grid gap-1", className)}>
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={copy}
        disabled={pending}
        aria-label={`${applicationNumber} bağlantısını kopyala`}
      >
        <Copy aria-hidden="true" />
        {pending ? "Kopyalanıyor…" : "Bağlantıyı kopyala"}
      </Button>
      {state ? (
        <p
          role={state.kind}
          className={cn(
            "text-xs",
            state.kind === "alert" ? "text-destructive-strong" : "text-primary-dark",
          )}
        >
          {state.text}
        </p>
      ) : null}
      {state?.fallback ? (
        <input
          readOnly
          value={state.fallback}
          aria-label={`${applicationNumber} müşteri bağlantısı`}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs"
          data-sensitive="access-link"
        />
      ) : null}
    </div>
  );
}
