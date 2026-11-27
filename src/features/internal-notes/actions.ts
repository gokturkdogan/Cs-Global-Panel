"use server";

import { revalidatePath } from "next/cache";

import { fail, ok } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

import { listInternalNotes } from "./queries";
import { internalNoteSchema, olderInternalNotesSchema } from "./schemas";
import { addInternalNote } from "./service";

/**
 * Şirket içi not Server Action'ı (PHASE 10). Kendi içinde `requireStaff()` (layout güvenlik sınırı değildir);
 * iki hesap aynı kontrol (OD-24). Yanıt yalnızca `{ noteId, created }` — not metni geri gönderilmez.
 */
export async function addInternalNoteAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = internalNoteSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return fail({
      code: "VALIDATION",
      message: Object.values(fieldErrors)[0] ?? messages.common.validation,
      fieldErrors,
    });
  }
  const result = await addInternalNote(getDb(), staff, parsed.data);
  if (result.ok) revalidatePath(`/dashboard/applications/${parsed.data.applicationId}`);
  return result;
}

/** Daha eski şirket içi notlar (sınırlı sayfa; salt okunur, audit'lenmez). Kendi içinde `requireStaff()`. */
export async function listOlderInternalNotesAction(input: unknown) {
  await requireStaff();
  const parsed = olderInternalNotesSchema.safeParse(input);
  if (!parsed.success) return fail({ code: "VALIDATION", message: messages.common.validation });
  try {
    const page = await listInternalNotes(getDb(), parsed.data.applicationId, parsed.data.before);
    return ok({ items: page.items, nextCursor: page.nextCursor });
  } catch {
    return fail({ code: "INTERNAL", message: messages.internalNotes.unavailable });
  }
}
