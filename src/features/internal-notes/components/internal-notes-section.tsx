import { Lock } from "lucide-react";

import { messages } from "@/lib/messages";

import type { InternalNoteList } from "../queries";
import { InternalNoteForm } from "./internal-note-form";
import { NoteItem } from "./note-item";
import { OlderNotes } from "./older-notes";

/** "Şirket İçi Notlar" bölümü — yalnızca personel başvuru detayında (BR-121). Metin React metnidir (HTML yok). */
export function InternalNotesSection({
  applicationId,
  notes,
}: {
  readonly applicationId: string;
  readonly notes: InternalNoteList;
}) {
  return (
    <section
      aria-labelledby="internal-notes-title"
      className="grid gap-3 rounded-xl border border-dashed border-primary/40 bg-card p-4 shadow-sm sm:p-5"
      data-testid="internal-notes"
    >
      <div className="grid gap-1">
        <h2
          id="internal-notes-title"
          className="flex items-center gap-2 text-lg leading-7 font-semibold"
        >
          <Lock aria-hidden="true" className="size-4 text-primary" />
          {messages.internalNotes.title}
        </h2>
        <p className="text-sm text-muted-foreground">{messages.internalNotes.description}</p>
      </div>
      {notes.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.internalNotes.empty}</p>
      ) : (
        <ol className="grid gap-2" data-testid="internal-note-list">
          {notes.items.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ol>
      )}
      {notes.nextCursor !== null ? (
        <>
          <p className="text-xs text-muted-foreground">
            {messages.internalNotes.limited(notes.items.length)}
          </p>
          <OlderNotes applicationId={applicationId} cursor={notes.nextCursor} />
        </>
      ) : null}
      <InternalNoteForm applicationId={applicationId} />
    </section>
  );
}
