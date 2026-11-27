import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

/**
 * PHASE 12.1 (SEC-05): süresi DOLMUŞ sayaç satırlarının sınırlı temizliği (indeksli `expires_at`; en fazla
 * `limit` satır). Etkin pencere satırlarına dokunmaz: eşzamanlı artış satırı yeni pencereye taşıdıysa
 * DELETE koşulu yeniden değerlendirilir ve satır silinmez; silinmiş satıra gelen artış 1'den başlar (süresi
 * dolmuş pencerenin olağan davranışı) → sınır aşılamaz. Silinen satır sayısını döndürür.
 */
export async function deleteExpiredRateLimitBuckets(
  executor: Pick<Database, "execute">,
  limit: number,
): Promise<number> {
  const result = await executor.execute(sql`
    DELETE FROM rate_limit_buckets WHERE key IN (
      SELECT key FROM rate_limit_buckets WHERE expires_at < now() ORDER BY expires_at LIMIT ${limit})
      AND expires_at < now()`);
  return result.rowCount ?? 0;
}
