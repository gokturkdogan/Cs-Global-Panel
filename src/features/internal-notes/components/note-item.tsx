import { formatDateTime } from "@/lib/format";

import type { InternalNoteItem } from "../queries";

const ACCOUNT_LABELS = { admin: "ADMIN", employee: "EMPLOYEE" } as const;

/** Tek not kartı (sunucu ve istemci listesi ortak). Metin React metnidir (HTML çalışmaz). */
export function NoteItem({ note }: { readonly note: InternalNoteItem }) {
  return (
    <li className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{note.author}</span>
        {note.authorAccountType ? ` (${ACCOUNT_LABELS[note.authorAccountType]})` : ""} ·{" "}
        <time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
      </p>
      <p className="wrap-anywhere whitespace-pre-line">{note.body}</p>
    </li>
  );
}
