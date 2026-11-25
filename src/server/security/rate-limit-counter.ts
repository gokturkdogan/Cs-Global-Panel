import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

/**
 * Sabit pencereli, Postgres tabanlı atomik sayaç (D-019, D-063). Bellek içi sayaç yoktur (çoklu
 * instance'ta tutarlı). Anahtarlar yalnızca teknik değerlerdir (HMAC veya iç kimlik) — IP, kullanıcı adı
 * veya kişisel veri düz metin yazılmaz. Süresi dolmuşsa sayaç 1'den başlar; satır kilidi eşzamanlı
 * artışları sıralar.
 */
export async function hitRateLimitCounter(
  executor: Pick<Database, "execute">,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const result = await executor.execute<{ count: number }>(sql`
    INSERT INTO rate_limit_buckets (key, window_started_at, count, expires_at)
    VALUES (${key}, now(), 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.expires_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_started_at = CASE WHEN rate_limit_buckets.expires_at <= now() THEN now() ELSE rate_limit_buckets.window_started_at END,
      expires_at = CASE WHEN rate_limit_buckets.expires_at <= now()
        THEN now() + make_interval(secs => ${windowSeconds}) ELSE rate_limit_buckets.expires_at END
    RETURNING count`);
  const count = result.rows[0]?.count;
  if (typeof count !== "number") throw new Error("rate limit sayacı okunamadı");
  return count;
}
