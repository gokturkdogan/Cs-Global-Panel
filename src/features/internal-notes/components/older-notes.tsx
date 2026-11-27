"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

import { listOlderInternalNotesAction } from "../actions";
import type { InternalNoteItem } from "../queries";
import { NoteItem } from "./note-item";

/** "Daha eski notları göster" — sınırlı keyset sayfaları (sınırsız sorgu yok). */
export function OlderNotes({
  applicationId,
  cursor,
}: {
  readonly applicationId: string;
  readonly cursor: string;
}) {
  const [items, setItems] = useState<InternalNoteItem[]>([]);
  const [next, setNext] = useState<string | null>(cursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      {items.length > 0 ? (
        <ol className="grid gap-2" data-testid="older-internal-notes">
          {items.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ol>
      ) : null}
      {next !== null ? (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                const result = await listOlderInternalNotesAction({ applicationId, before: next });
                if (result.ok) {
                  setItems((current) => [...current, ...result.data.items]);
                  setNext(result.data.nextCursor);
                } else {
                  setError(result.error.message);
                }
              } catch {
                setError(messages.internalNotes.unavailable);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? messages.internalNotes.loadingOlder : messages.internalNotes.loadOlder}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
