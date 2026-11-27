import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { INTERNAL_NOTES_LIST_LIMIT } from "@/config/constants";
import type { StaffRole } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import { applicationInternalNotes as notes, applications, users } from "@/server/db/schema";

/**
 * Şirket içi notlar — YALNIZCA personel sayfaları (BR-121). Müşteri modülleri bu dosyayı içe aktaramaz
 * (ESLint). Sınırlı sorgu: sayfa başına `INTERNAL_NOTES_LIST_LIMIT` not (keyset; "Daha eski notları göster"
 * ile sınırlı sayfalar halinde tümüne erişilir — PHASE 10.1) + toplam sayı. Silme sürecindeki
 * başvurunun notları okunmaz.
 */
export type InternalNoteItem = {
  readonly id: string;
  readonly body: string;
  readonly author: string;
  readonly authorAccountType: StaffRole | null;
  readonly createdAt: string;
};

export type InternalNoteList = {
  readonly items: readonly InternalNoteItem[];
  readonly total: number;
  /** Daha eski not varsa son öğenin kimliği (keyset imleci — `(created_at, id)` azalan). */
  readonly nextCursor: string | null;
};

export async function listInternalNotes(
  db: Pick<Database, "select">,
  applicationId: string,
  before: string | null = null,
): Promise<InternalNoteList> {
  const scope = and(
    eq(notes.applicationId, applicationId),
    isNull(applications.deletionRequestedAt),
  );
  const page = before
    ? and(
        scope,
        sql`(${notes.createdAt}, ${notes.id}) < (SELECT n.created_at, n.id FROM application_internal_notes n
              WHERE n.id = ${before} AND n.application_id = ${applicationId})`,
      )
    : scope;
  const rows = await db
    .select({
      id: notes.id,
      body: notes.body,
      author: users.username,
      role: users.role,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .innerJoin(applications, eq(applications.id, notes.applicationId))
    .leftJoin(users, eq(users.id, notes.authorUserId))
    .where(page)
    .orderBy(desc(notes.createdAt), desc(notes.id))
    .limit(INTERNAL_NOTES_LIST_LIMIT + 1);
  const more = rows.length > INTERNAL_NOTES_LIST_LIMIT;
  const visible = rows.slice(0, INTERNAL_NOTES_LIST_LIMIT);
  const [total] = await db
    .select({ value: count() })
    .from(notes)
    .innerJoin(applications, eq(applications.id, notes.applicationId))
    .where(scope);
  return {
    items: visible.map((row) => ({
      id: row.id,
      body: row.body,
      author: row.author ?? "Personel",
      authorAccountType: row.role ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: total?.value ?? 0,
    nextCursor: more ? (visible.at(-1)?.id ?? null) : null,
  };
}
