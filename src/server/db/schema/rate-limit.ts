import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./helpers";

/**
 * Kısa ömürlü rate limit sayaçları (D-019, DATABASE_SCHEMA §4.12). Anahtarlar HMAC'lenmiş teknik
 * değerlerdir; IP veya kullanıcı adı düz metin olarak yazılmaz. Kullanımı PHASE 03'te başlar.
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamptz("window_started_at").notNull(),
    count: integer("count").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [
    index("rate_limit_buckets_expires_at_idx").on(t.expiresAt),
    check("rate_limit_buckets_key_check", sql`char_length(${t.key}) BETWEEN 1 AND 200`),
    check("rate_limit_buckets_count_check", sql`${t.count} >= 0`),
    check("rate_limit_buckets_window_check", sql`${t.expiresAt} > ${t.windowStartedAt}`),
  ],
);
