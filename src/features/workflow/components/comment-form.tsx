"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { messages } from "@/lib/messages";

import { addCommentAction } from "../actions";

/** Müşteriye görünür yorum ekleme (BR-120…BR-123). Düz metin; düzenleme/silme yok; çift gönderim engeli. */
export function CommentForm({ applicationId }: { readonly applicationId: string }) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);
  // Mantıksal işlem anahtarı (D-113): aynı metnin tekrar denemesinde (ağ hatası) korunur; başarıdan veya
  // metin değişikliğinden sonra yenilenir. Sunucu aynı anahtarla tek yorum oluşturur.
  const operation = useRef<{ key: string; body: string } | null>(null);

  return (
    <form
      className="grid gap-2"
      data-testid="comment-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        if (body.trim() === "") {
          setNotice({ ok: false, text: messages.workflow.commentLength });
          return;
        }
        busy.current = true;
        setPending(true);
        if (operation.current === null || operation.current.body !== body) {
          operation.current = { key: crypto.randomUUID(), body };
        }
        try {
          const result = await addCommentAction({
            applicationId,
            body,
            idempotencyKey: operation.current.key,
          });
          if (result.ok) {
            operation.current = null;
            setBody("");
            setNotice({ ok: true, text: messages.workflow.commentAdded });
            router.refresh();
          } else {
            setNotice({ ok: false, text: result.error.message });
          }
        } catch {
          // Ağ hatası: anahtar korunur; kullanıcı tekrar gönderirse aynı işlem olarak değerlendirilir.
          setNotice({ ok: false, text: messages.workflow.unavailable });
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <label htmlFor={`${id}-body`} className="text-sm font-medium">
        {messages.workflow.commentLabel}
      </label>
      <Textarea
        id={`${id}-body`}
        value={body}
        maxLength={2000}
        aria-describedby={`${id}-hint`}
        onChange={(event) => setBody(event.target.value)}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {messages.workflow.commentHint}
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ekleniyor…" : messages.workflow.commentAdd}
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
