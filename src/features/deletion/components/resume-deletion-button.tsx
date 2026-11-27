"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { resumeDeletionAction } from "../actions";

/** Bir sonraki sınırlı silme adımını çalıştırır (arka plan işi yok; polling yok). */
export function ResumeDeletionButton({ applicationId }: { readonly applicationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);

  return (
    <div className="grid gap-2">
      <div>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          data-testid="resume-deletion"
          onClick={async () => {
            if (busy.current) return;
            busy.current = true;
            setPending(true);
            try {
              const result = await resumeDeletionAction({ applicationId });
              if (!result.ok) {
                setNotice({ ok: false, text: result.error.message });
              } else if (result.data.state === "DELETED") {
                router.replace("/dashboard/applications?deleted=1");
                return;
              } else {
                setNotice(
                  result.data.state === "IN_PROGRESS" && result.data.error === null
                    ? { ok: true, text: messages.deletion.stepDone }
                    : null,
                );
                router.refresh();
              }
            } catch {
              setNotice({ ok: false, text: messages.deletion.unavailable });
            } finally {
              busy.current = false;
              setPending(false);
            }
          }}
        >
          {pending ? messages.deletion.resuming : messages.deletion.resume}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${notice?.ok ? "text-success-strong" : "text-destructive"}`}
      >
        {notice?.text}
      </p>
    </div>
  );
}
