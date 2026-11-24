import "server-only";

import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import {
  LOGIN_RATE_LIMIT_PER_USERNAME,
  LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES,
} from "@/config/constants";
import type { Database } from "@/server/db/client";

/**
 * Personel girişi rate limiting (D-063). Postgres `rate_limit_buckets` üzerinde atomik sayaçlar:
 * serverless çoklu instance'ta tutarlıdır, bellek içi sayaç yoktur. Kullanıcı adı yalnızca HMAC'li
 * olarak anahtara girer (OD-09). Hata durumunda çağıran taraf girişi reddeder (fail-closed).
 */

type Executor = Pick<Database, "execute" | "transaction">;

/** Yalnızca var olmayan kullanıcı adlarıyla yapılan denemelerin ortak sayacı (D-068). */
export const LOGIN_UNKNOWN_USERNAMES_KEY = "login:unknown-usernames";

/**
 * - `allowed`: şifre kontrolüne geçilir.
 * - `username_limited`: bu kullanıcı adı için limit aşıldı (var olan/olmayan ayrımı yapılmaz).
 * - `unknown_usernames_limited`: bilinmeyen adların ortak limiti aşıldı; kullanıcıya genel
 *   "hatalı" mesajı gösterilir (kullanıcı adı tespiti engellenir).
 */
export type LoginAttemptDecision = "allowed" | "username_limited" | "unknown_usernames_limited";

export function loginUsernameKey(secret: string, username: string): string {
  return `login:user:${createHmac("sha256", secret).update(username).digest("hex")}`;
}

/** Sabit pencereli sayaç: süresi dolmuşsa 1'den başlar. Satır kilidi eşzamanlı artışları sıralar. */
async function hit(
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

/**
 * Bir giriş denemesini sayar ve karar verir (şifre henüz kontrol edilmemiştir).
 * Bilinmeyen kullanıcı adında önce ortak sayaç kontrol edilir; aşıldıysa kullanıcı adı başına
 * satır oluşturulmaz (tablo, rastgele adlarla sınırsız büyümez).
 */
export async function consumeLoginAttempt(
  db: Executor,
  secret: string,
  username: string,
): Promise<LoginAttemptDecision> {
  return db.transaction(async (tx) => {
    // Süresi dolmuş anahtarların sınırlı temizliği (tablo sınırsız büyümez).
    await tx.execute(sql`
      DELETE FROM rate_limit_buckets WHERE key IN (
        SELECT key FROM rate_limit_buckets WHERE expires_at < now() LIMIT 100)`);
    const known = await tx.execute(sql`SELECT 1 FROM users WHERE username = ${username}`);
    if (known.rows.length === 0) {
      const unknownCount = await hit(
        tx,
        LOGIN_UNKNOWN_USERNAMES_KEY,
        LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES.windowSeconds,
      );
      if (unknownCount > LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES.max) return "unknown_usernames_limited";
    }
    const perUsername = await hit(
      tx,
      loginUsernameKey(secret, username),
      LOGIN_RATE_LIMIT_PER_USERNAME.windowSeconds,
    );
    return perUsername <= LOGIN_RATE_LIMIT_PER_USERNAME.max ? "allowed" : "username_limited";
  });
}

/** Başarılı girişten sonra kullanıcı adı sayacını sıfırlar. */
export async function resetLoginAttempts(
  db: Pick<Database, "execute">,
  secret: string,
  username: string,
): Promise<void> {
  await db.execute(
    sql`DELETE FROM rate_limit_buckets WHERE key = ${loginUsernameKey(secret, username)}`,
  );
}
