"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WORKFLOW_TEXT_LIMITS } from "@/config/constants";
import { messages } from "@/lib/messages";

import { addInternalNoteAction } from "../actions";

/**
 * Şirket içi not formu (PHASE 10, D-115). Mantıksal işlem anahtarı ağ hatasında ve aynı metnin tekrarında
 * korunur; başarıdan veya metin değişikliğinden sonra yenilenir. Başarısız istekte metin silinmez.
 * İstemci çift tıklama koruması yalnızca kolaylıktır; tekilleştirme sunucu + veritabanındadır.
 */
export function InternalNoteForm({ applicationId }: { readonly applicationId: string }) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);
  const operation = useRef<{ key: string; body: string } | null>(null);

  return (
    <form
      className="grid gap-2"
      data-testid="internal-note-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        if (body.trim() === "") {
          setNotice({ ok: false, text: messages.internalNotes.length });
          return;
        }
        busy.current = true;
        setPending(true);
        if (operation.current === null || operation.current.body !== body) {
          operation.current = { key: crypto.randomUUID(), body };
        }
        try {
          const result = await addInternalNoteAction({
            applicationId,
            body,
            idempotencyKey: operation.current.key,
          });
          if (result.ok) {
            operation.current = null;
            setBody("");
            setNotice({ ok: true, text: messages.internalNotes.added });
            router.refresh();
          } else {
            setNotice({ ok: false, text: result.error.message });
          }
        } catch {
          setNotice({ ok: false, text: messages.internalNotes.unavailable });
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <label htmlFor={`${id}-body`} className="text-sm font-medium">
        {messages.internalNotes.label}
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        maxLength={WORKFLOW_TEXT_LIMITS.internalNoteMax}
        aria-describedby={`${id}-hint`}
        onChange={(event) => setBody(event.target.value)}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {messages.internalNotes.sensitiveHint} ({body.length}/{WORKFLOW_TEXT_LIMITS.internalNoteMax}
        )
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? messages.internalNotes.adding : messages.internalNotes.add}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${notice?.ok ? "text-success-strong" : "text-destructive"}`}
      >
        {notice?.text}
      </p>
    </form>
  );
}
