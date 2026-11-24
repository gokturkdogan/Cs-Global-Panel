import "server-only";

import type { Database } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

/**
 * Audit kaydı yazar (append-only — D-039). Metadata yalnızca izinli anahtarları içerebilir
 * (veritabanı CHECK'i); şifre, token, IP, user-agent, kullanıcı adı veya PII yazılmaz.
 */
export type AuditEntry = typeof auditLogs.$inferInsert;

export async function writeAuditLog(
  db: Pick<Database, "insert">,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values(entry);
}
