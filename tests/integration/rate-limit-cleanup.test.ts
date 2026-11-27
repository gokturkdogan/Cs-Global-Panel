import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hitRateLimitCounter } from "@/server/security/rate-limit-counter";

import { cleanupExpiredRateLimits } from "../../scripts/ops/rate-limit-cleanup";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { connectOwner, createRuntimePool } from "./helpers";

/**
 * PHASE 12.1 (SEC-05) — süresi dolmuş rate-limit satırlarının sınırlı temizliği. YALNIZCA izole veritabanı
 * (sentetik anahtarlar; gerçek Neon'da temizlik komutu kendiliğinden çalıştırılmaz).
 */
describe.runIf(isIsolatedTestDatabase())(`rate-limit temizliği — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(4);
  const db = drizzle({ client: pool });
  let owner: pg.Client;
  const prefix = `test:cleanup:${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    owner = await connectOwner();
  });
  afterAll(async () => {
    await owner.query("DELETE FROM rate_limit_buckets WHERE key LIKE $1", [`${prefix}%`]);
    await owner.end();
    await pool.end();
  });

  const count = async () =>
    (
      await owner.query<{ expired: number; active: number }>(
        `SELECT count(*) FILTER (WHERE expires_at < now())::int AS expired,
                count(*) FILTER (WHERE expires_at >= now())::int AS active
           FROM rate_limit_buckets WHERE key LIKE $1`,
        [`${prefix}%`],
      )
    ).rows[0]!;

  async function seed(expired: number, active: number) {
    for (let i = 0; i < expired; i += 1) {
      await owner.query(
        `INSERT INTO rate_limit_buckets (key, window_started_at, count, expires_at)
         VALUES ($1, now() - interval '2 hours', 5, now() - interval '1 hour')`,
        [`${prefix}:old:${i}`],
      );
    }
    for (let i = 0; i < active; i += 1) {
      await owner.query(
        `INSERT INTO rate_limit_buckets (key, window_started_at, count, expires_at)
         VALUES ($1, now(), 7, now() + interval '1 hour')`,
        [`${prefix}:live:${i}`],
      );
    }
  }

  it("dry-run hiçbir satırı silmez; --apply yalnızca süresi dolmuşları siler, etkin pencereler kalır", async () => {
    await seed(25, 3);
    const dry = await cleanupExpiredRateLimits(db, false, count);
    expect(dry).toMatchObject({ expiredBefore: 25, active: 3, deleted: 0, applied: false });
    expect(await count()).toEqual({ expired: 25, active: 3 });
    const applied = await cleanupExpiredRateLimits(db, true, count);
    expect(applied.deleted).toBeGreaterThanOrEqual(25);
    expect(await count()).toEqual({ expired: 0, active: 3 });
    const live = await owner.query<{ count: number }>(
      "SELECT count FROM rate_limit_buckets WHERE key = $1",
      [`${prefix}:live:0`],
    );
    expect(live.rows[0]!.count).toBe(7); // etkin sayaç değişmedi
  });

  it("eşzamanlı temizlik + artış sınırı aşamaz: etkin sayaç sürer, süresi dolmuş sayaç 1'den başlar", async () => {
    await seed(40, 0);
    const activeKey = `${prefix}:race:active`;
    const expiredKey = `${prefix}:old:0`;
    await owner.query(
      `INSERT INTO rate_limit_buckets (key, window_started_at, count, expires_at)
       VALUES ($1, now(), 10, now() + interval '1 hour')`,
      [activeKey],
    );
    const [, activeCounts, expiredCounts] = await Promise.all([
      cleanupExpiredRateLimits(db, true, count),
      Promise.all(Array.from({ length: 5 }, () => hitRateLimitCounter(db, activeKey, 3600))),
      Promise.all(Array.from({ length: 3 }, () => hitRateLimitCounter(db, expiredKey, 3600))),
    ]);
    // Etkin pencere sayacı 10'dan devam eder (sıfırlanmaz → limit aşımı açılmaz).
    expect([...activeCounts].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15]);
    // Süresi dolmuş pencere: silinse de silinmese de yeni pencere 1'den başlar (olağan davranış).
    expect([...expiredCounts].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
