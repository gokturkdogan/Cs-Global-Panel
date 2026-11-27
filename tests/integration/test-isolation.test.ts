import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { guardSharedDatabaseClient, SharedDatabaseWriteError } from "../support/db-guard";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { connectRuntime } from "./helpers";

/**
 * PHASE 10.2 (D-129) — ortak veritabanı korumasının GERÇEK PostgreSQL'de negatif testi. Koruma burada
 * izole bağlantıya bilinçli olarak uygulanır (Neon'da yazma denemesi yapılmaz): korunan istemciyle yapılan
 * yazmalar kalıcı olmamalıdır.
 */
describe.runIf(isIsolatedTestDatabase())(
  `test izolasyonu koruması — ${ISOLATION_SKIP_REASON}`,
  () => {
    let raw: pg.Client;
    let guarded: pg.Client;
    beforeAll(async () => {
      raw = await connectRuntime();
      guarded = guardSharedDatabaseClient(await connectRuntime());
    });
    afterAll(async () => {
      await raw.end();
      await guarded.end();
    });
    const auditCount = async () =>
      Number((await raw.query<{ n: string }>("SELECT count(*) AS n FROM audit_logs")).rows[0]!.n);

    it("transaction dışı INSERT kalıcı olmaz; yazma içeren COMMIT reddedilir; okuma etkilenmez", async () => {
      const before = await auditCount();
      await guarded.query(
        "INSERT INTO audit_logs (action, actor_type, resource_type, metadata) VALUES ('TEST_EVENT', 'SYSTEM', 'session', '{}'::jsonb)",
      );
      expect(await auditCount()).toBe(before);

      await guarded.query("BEGIN");
      await guarded.query(
        "INSERT INTO audit_logs (action, actor_type, resource_type, metadata) VALUES ('TEST_EVENT', 'SYSTEM', 'session', '{}'::jsonb)",
      );
      await expect(guarded.query("COMMIT")).rejects.toBeInstanceOf(SharedDatabaseWriteError);
      expect(await auditCount()).toBe(before);

      // Yetki hatası davranışı korunur (42501), bağlantı kullanılabilir kalır.
      await expect(guarded.query("DELETE FROM audit_logs")).rejects.toMatchObject({
        code: "42501",
      });
      expect((await guarded.query<{ one: number }>("SELECT 1 AS one")).rows[0]!.one).toBe(1);
    });
  },
);
