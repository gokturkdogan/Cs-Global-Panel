import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanup,
  connectRuntime,
  createApplication,
  createRequirement,
  createRuntimePool,
  createService,
  createUser,
  expectPgError,
  insertFile,
  insertToken,
  newCreated,
  sleep,
} from "./helpers";

/**
 * Gerçek bağımsız bağlantılarla eşzamanlılık testleri. Senaryo: A transaction'ı satırı/index
 * anahtarını tutar, B aynı işlemi dener ve bekler; A commit edince B'nin sonucu doğrulanır.
 */
const created = newCreated();
let a: pg.Client;
let b: pg.Client;
let userId: string;
let serviceId: string;

beforeAll(async () => {
  a = await connectRuntime();
  b = await connectRuntime();
  userId = await createUser(a, created);
  ({ serviceId } = await createService(a, created, userId));
});
afterAll(async () => {
  await a.query("ROLLBACK").catch(() => undefined);
  await b.query("ROLLBACK").catch(() => undefined);
  await a.end();
  await b.end();
  await cleanup(created);
});

/** A'nın işlemi commit edilene kadar B'nin beklediğini doğrular ve B'nin sonucunu döndürür. */
async function raceAfterCommit<T>(
  first: () => Promise<unknown>,
  second: () => Promise<T>,
): Promise<{ outcome: Promise<T> }> {
  await a.query("BEGIN");
  await b.query("BEGIN");
  await first();
  let settled = false;
  const pending = second().finally(() => {
    settled = true;
  });
  pending.catch(() => undefined);
  await sleep(300);
  expect(settled, "ikinci transaction ilkini beklemeliydi").toBe(false);
  await a.query("COMMIT");
  return { outcome: pending };
}

describe("eşzamanlı yazma", () => {
  it("aynı başvuru için iki eşzamanlı aktif token: yalnızca biri oluşur (INV-02)", async () => {
    const applicationId = await createApplication(a, created, { serviceId, userId });
    const { outcome } = await raceAfterCommit(
      () => insertToken(a, { applicationId, userId }),
      () => insertToken(b, { applicationId, userId }),
    );
    await expectPgError(outcome, "23505");
    await b.query("ROLLBACK");
    const active = await a.query(
      "SELECT 1 FROM application_access_tokens WHERE application_id = $1 AND revoked_at IS NULL",
      [applicationId],
    );
    expect(active.rowCount).toBe(1);
  });

  it("aynı evrak için iki eşzamanlı ACTIVE dosya: yalnızca biri oluşur (INV-04)", async () => {
    const applicationId = await createApplication(a, created, { serviceId, userId });
    const requirementId = await createRequirement(a, applicationId);
    const { outcome } = await raceAfterCommit(
      () =>
        insertFile(a, { applicationId, requirementId, userId, status: "ACTIVE", versionNumber: 1 }),
      () =>
        insertFile(b, { applicationId, requirementId, userId, status: "ACTIVE", versionNumber: 2 }),
    );
    await expectPgError(outcome, "23505");
    await b.query("ROLLBACK");
  });

  it("aynı evrak için iki eşzamanlı aynı versiyon numarası: yalnızca biri oluşur (INV-08)", async () => {
    const applicationId = await createApplication(a, created, { serviceId, userId });
    const requirementId = await createRequirement(a, applicationId);
    const { outcome } = await raceAfterCommit(
      () =>
        insertFile(a, {
          applicationId,
          requirementId,
          userId,
          status: "SUPERSEDED",
          versionNumber: 1,
        }),
      () =>
        insertFile(b, {
          applicationId,
          requirementId,
          userId,
          status: "REMOVED",
          versionNumber: 1,
        }),
    );
    await expectPgError(outcome, "23505");
    await b.query("ROLLBACK");
  });

  it("optimistic lock: aynı versiyonla iki eşzamanlı güncellemeden ikincisi 0 satır etkiler (INV-16)", async () => {
    const applicationId = await createApplication(a, created, { serviceId, userId });
    const update = (client: pg.Client) =>
      client.query(
        "UPDATE applications SET version = version + 1, submitted_at = now() WHERE id = $1 AND version = 1",
        [applicationId],
      );
    const { outcome } = await raceAfterCommit(
      () => update(a),
      () => update(b),
    );
    expect((await outcome).rowCount).toBe(0);
    await b.query("COMMIT");
    const row = await a.query<{ version: number }>(
      "SELECT version FROM applications WHERE id = $1",
      [applicationId],
    );
    expect(row.rows[0]!.version).toBe(2);
  });

  it("SELECT … FOR UPDATE kilidi Pool üzerinden çalışır; lock_timeout ile beklemeden hata alınır", async () => {
    const applicationId = await createApplication(a, created, { serviceId, userId });
    await a.query("BEGIN");
    await a.query("SELECT id FROM applications WHERE id = $1 FOR UPDATE", [applicationId]);
    await b.query("BEGIN");
    await b.query("SET LOCAL lock_timeout = '300ms'");
    await expectPgError(
      b.query("SELECT id FROM applications WHERE id = $1 FOR UPDATE", [applicationId]),
      "55P03",
    );
    await b.query("ROLLBACK");
    await a.query("COMMIT");
  });
});

describe("başvuru numarası üretimi (D-008, BR-10/BR-11)", () => {
  const YEAR = 2999;

  async function allocate(client: pg.PoolClient, rollback = false): Promise<string> {
    await client.query("BEGIN");
    try {
      const counter = await client.query<{ value: number }>(
        `INSERT INTO application_number_counters (year, last_value) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_value = application_number_counters.last_value + 1
         RETURNING last_value AS value`,
        [YEAR],
      );
      const number = `CS-${YEAR}-${String(counter.rows[0]!.value).padStart(6, "0")}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164,
           customer_email, search_text, service_id, service_name_snapshot, created_by_user_id)
         VALUES ($1, 'Test', 'Müşteri', '+905550000001', 'test+1@example.invalid', 'test musteri', $2, 'Test Hizmeti', $3)
         RETURNING id`,
        [number, serviceId, userId],
      );
      created.applications.push(inserted.rows[0]!.id);
      await client.query(rollback ? "ROLLBACK" : "COMMIT");
      return number;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  it("10 eşzamanlı oluşturma: tümü başarılı, numaralar benzersiz; rollback çakışma yaratmaz", async () => {
    created.years.push(YEAR);
    const pool = createRuntimePool(10);
    try {
      const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
      try {
        const numbers = await Promise.all(
          clients.map((client, index) => allocate(client, index === 0)),
        );
        const committed = numbers.slice(1);
        expect(new Set(committed).size).toBe(committed.length);
        const stored = await clients[0]!.query<{ n: string }>(
          "SELECT application_number AS n FROM applications WHERE application_number LIKE $1",
          [`CS-${YEAR}-%`],
        );
        expect(stored.rows.map((row) => row.n).sort()).toEqual([...committed].sort());
      } finally {
        for (const client of clients) client.release();
      }
    } finally {
      await pool.end();
    }
  });
});
