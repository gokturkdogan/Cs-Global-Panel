"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { removeOwnFileAction } from "../actions";

/** Müşteri aktif dosyasını kaldırır (BR-44, D2/D8). Fiziksel silme değildir; onay gerekir. */
export function RemoveFileButton({
  contextId,
  fileId,
  expectedVersion,
}: {
  readonly contextId: string;
  readonly fileId: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <ConfirmDialog
        trigger={
          <Button type="button" size="lg" variant="ghost" className="w-fit text-destructive">
            <Trash2 aria-hidden="true" />
            {messages.workflow.removeButton}
          </Button>
        }
        title={messages.workflow.removeConfirmTitle}
        description={<p>{messages.workflow.removeConfirmDescription}</p>}
        confirmLabel={messages.workflow.removeButton}
        destructive
        onConfirm={async () => {
          const result = await removeOwnFileAction({ contextId, fileId, expectedVersion });
          setError(result.ok ? null : result.error.message);
          router.refresh();
          return true;
        }}
      />
      <p role="status" aria-live="polite" className="text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}
