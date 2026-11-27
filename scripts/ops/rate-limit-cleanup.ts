/**
 * pnpm ops:rate-limit-cleanup [--apply]
 *
 * PHASE 12.1 (SEC-05): `rate_limit_buckets` tablosunda süresi DOLMUŞ satırların sınırlı temizliği. Giriş
 * denemesindeki 100 satırlık temizlik yalnızca giriş olduğunda çalışır; dosya/bağlantı sayaçları ve görüntüleme
 * işaretleri giriş olmadan da birikebilir. Bu komut elle/planlı bakımda çalıştırılır (ücretli cron/worker yok).
 * Varsayılan dry-run (yalnızca sayar). `--apply`: 1000'lik partilerle, en fazla 50 parti. Etkin pencere
 * satırlarına dokunulmaz. Anahtarlar yazdırılmaz (yalnızca sayılar). Çalışma zamanı rolüyle çalışır.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "../db/lib.ts";
import { deleteExpiredRateLimitBuckets } from "../../src/server/security/rate-limit-maintenance.ts";

const BATCH = 1000;
const MAX_BATCHES = 50;

export async function cleanupExpiredRateLimits(
  db: Parameters<typeof deleteExpiredRateLimitBuckets>[0],
  apply: boolean,
  count: () => Promise<{ expired: number; active: number }>,
): Promise<{ expiredBefore: number; active: number; deleted: number; applied: boolean }> {
  const before = await count();
  let deleted = 0;
  if (apply) {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const removed = await deleteExpiredRateLimitBuckets(db, BATCH);
      deleted += removed;
      if (removed < BATCH) break;
    }
  }
  return { expiredBefore: before.expired, active: before.active, deleted, applied: apply };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli("ops:rate-limit-cleanup", async () => {
    loadLocalEnv();
    const apply = process.argv.slice(2).includes("--apply");
    const client = await connect(resolveDatabaseUrls().runtime, "cs-global-rate-limit-cleanup");
    try {
      const report = await cleanupExpiredRateLimits(drizzle({ client }), apply, async () => {
        const row = (
          await client.query<{ expired: number; active: number }>(
            `SELECT count(*) FILTER (WHERE expires_at < now())::int AS expired,
                    count(*) FILTER (WHERE expires_at >= now())::int AS active
               FROM rate_limit_buckets`,
          )
        ).rows[0]!;
        return row;
      });
      console.log(JSON.stringify(report));
    } finally {
      await client.end();
    }
  });
}
