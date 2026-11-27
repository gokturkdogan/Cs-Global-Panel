import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  processApplicationDeletion,
  requestApplicationDeletion,
} from "@/features/deletion/service";
import { uploadDocumentFile, type FileActor } from "@/features/documents/service";
import * as schema from "@/server/db/schema";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { readStorageUsage } from "@/server/storage/quota";
import { buildObjectKey, type ObjectVersion, type StorageAdapter } from "@/server/storage/types";

import { reconcileStorage } from "../../scripts/storage/maintenance";
import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, connectRuntime, createRuntimePool, testId } from "./helpers";

/**
 * PHASE 10.2 — `storage:reconcile` ↔ kalıcı silme / yükleme yarışları (R1–R7, D-130). Gerçek izole
 * PostgreSQL (bağımsız bağlantılar, D-114 kontrollü kilit sırası) + yerel private storage + araçlı
 * sağlayıcı (sayfalar arası duraklatma, liste ortasında hata). Mutabakat yalnızca muhasebe nesli
 * (`accounting_epoch`) değişmemişse uygulanır; aksi halde bayat sonuç reddedilir.
 */
describe.runIf(isIsolatedTestDatabase())(`mutabakat ↔ silme — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(16);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let runtime: pg.Client;
  let runtime2: pg.Client;
  let root: string;
  let storage: StorageAdapter;
  let admin: string;
  const createdUsers: string[] = [];
  const pdf = fixtures.valid();
  const md5 = createHash("md5").update(pdf).digest("hex");

  beforeAll(async () => {
    owner = await connectOwner();
    runtime = await connectRuntime();
    runtime2 = await connectRuntime();
    root = await mkdtemp(join(tmpdir(), "cs-reconcile-"));
    storage = await createLocalPrivateAdapter(root);
    const existing = await owner.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
    if (existing.rows[0]) {
      admin = existing.rows[0].id;
    } else {
      admin = testId();
      await owner.query(
        "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Test', $1 || '@staff.invalid', $2, 'admin')",
        [admin, `t_${randomUUID().slice(0, 8)}`],
      );
      createdUsers.push(admin);
    }
  });
  afterAll(async () => {
    await owner.query("DELETE FROM applications WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM services WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM users WHERE id = ANY($1::text[])", [createdUsers]);
    await owner.query(
      "UPDATE storage_quota_state SET untracked_bytes = 0, reconciled_at = NULL WHERE id = 1",
    );
    await runtime.end();
    await runtime2.end();
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ yardımcılar

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await owner.query<{ n: string }>(sql, params)).rows[0]!.n);
  const quota = async () =>
    (await owner.query<{ untracked: string; epoch: string; reconciled: Date | null }>(
      "SELECT untracked_bytes AS untracked, accounting_epoch AS epoch, reconciled_at AS reconciled FROM storage_quota_state WHERE id = 1",
    ))!.rows[0]!;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(check: () => Promise<boolean>, label: string) {
    const deadline = Date.now() + 10_000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(`zaman aşımı: ${label}`);
      await sleep(20);
    }
  }
  function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    return { open, opened, arrived, reached };
  }
  const lockWaiters = () =>
    count(
      "SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND state = 'active'",
    );
  async function queued<T>(lockSql: string, ops: (() => Promise<T>)[]) {
    const holder = await connectOwner();
    try {
      await holder.query("BEGIN");
      await holder.query(lockSql);
      const running: Promise<T>[] = [];
      for (const [index, op] of ops.entries()) {
        running.push(op());
        await until(async () => (await lockWaiters()) >= index + 1, `kilit bekleyen ${index + 1}`);
      }
      await holder.query("COMMIT");
      return await Promise.all(running);
    } finally {
      await holder.end();
    }
  }
  const lockQuota = "SELECT id FROM storage_quota_state WHERE id = 1 FOR UPDATE";

  async function seed() {
    const app = await seedApplication(owner, admin, { documents: [{ title: "Pasaport" }] });
    const req = (
      await owner.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows[0]!.id;
    const customer: FileActor = {
      kind: "CUSTOMER",
      applicationId: app.applicationId,
      tokenId: app.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    return { ...app, req, customer };
  }
  const reqVersion = async (id: string) =>
    (
      await owner.query<{ version: number }>(
        "SELECT version FROM application_document_requirements WHERE id = $1",
        [id],
      )
    ).rows[0]!.version;
  async function upload(
    actor: FileActor,
    requirementId: string,
    adapter: StorageAdapter = storage,
    maxTotalBytes = 9e9,
  ) {
    return uploadDocumentFile(
      {
        db,
        storage: adapter,
        quota: { maxTotalBytes, warningBytes: Math.min(8e9, maxTotalBytes) },
        validatePdf: async () => ({ ok: true as const, pageCount: 1 }),
      },
      actor,
      {
        requirementId,
        expectedVersion: await reqVersion(requirementId),
        filename: "a.pdf",
        bytes: pdf,
      },
    );
  }
  const put = (key: string) =>
    storage.putObject({
      key,
      body: pdf,
      contentType: "application/pdf",
      sizeBytes: pdf.byteLength,
      md5Hex: md5,
    });
  /** Başvuru + yüklenmiş dosya + kayıt dışı yinelenen fiziksel versiyon (mutabakatta untracked). */
  async function appWithDuplicate() {
    const app = await seed();
    expect((await upload(app.customer, app.req)).ok).toBe(true);
    const key = (
      await owner.query<{ key: string }>(
        "SELECT blob_pathname AS key FROM application_document_files WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows[0]!.key;
    await put(key);
    return app;
  }
  async function deleteFully(applicationId: string) {
    const row = (
      await owner.query<{ version: number; application_number: string }>(
        "SELECT version, application_number FROM applications WHERE id = $1",
        [applicationId],
      )
    ).rows[0]!;
    expect(
      (
        await requestApplicationDeletion(
          db,
          { userId: admin },
          {
            applicationId,
            expectedVersion: row.version,
            reason: "Test",
            confirmationNumber: row.application_number,
          },
        )
      ).ok,
    ).toBe(true);
    return processApplicationDeletion(
      { db, storage: async () => storage },
      { userId: admin },
      {
        applicationId,
      },
    );
  }
  /** Tüm uygulama nesneleri DB'ye eşlenir hale getirildiğinde "gerçek" untracked değeri. */
  async function freshUntracked() {
    const report = await reconcileStorage(runtime, storage, { apply: true });
    expect(report.applied).toBe(true);
    return Number((await quota()).untracked);
  }

  // ================================================================== R1–R7

  it("R1: envanter alındı → duraklatıldı → silme sonlandırdı → eski envanter UYGULANMAZ (silinen nesne kotaya geri eklenmez)", async () => {
    await freshUntracked();
    const app = await appWithDuplicate();
    const baseline = await freshUntracked(); // yinelenen versiyon dahil gerçek değer
    const g = gate();
    const reconciling = reconcileStorage(runtime, storage, {
      apply: true,
      afterListing: async () => {
        g.reached();
        await g.opened;
      },
    });
    await g.arrived;
    expect(await deleteFully(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    g.open();
    const report = await reconciling;
    expect(report).toMatchObject({ applied: false, stale: true });
    expect(Number((await quota()).untracked)).toBe(baseline); // eski değer korunur, şişirilmez
    // Taze mutabakat: silinen nesneler yok → yinelenen versiyon payı düşer.
    expect(await freshUntracked()).toBe(baseline - pdf.byteLength);
  });

  it("R2: çok sayfalı tarama sırasında silme → zaman kaymalı (tutarsız) envanter güvenilir sayılmaz", async () => {
    await freshUntracked();
    const app = await appWithDuplicate();
    const before = await freshUntracked();
    const g = gate();
    const paged: StorageAdapter = {
      ...storage,
      listObjectVersions: async (prefix, pages) => {
        const first = await storage.listObjectVersions(prefix, pages); // 1. sayfa (silme öncesi)
        g.reached();
        await g.opened;
        const second = await storage.listObjectVersions(prefix, pages); // 2. sayfa (silme sonrası)
        const seen = new Set(first.versions.map((v) => `${v.key}\n${v.versionId}`));
        const versions: ObjectVersion[] = [
          ...first.versions,
          ...second.versions.filter((v) => !seen.has(`${v.key}\n${v.versionId}`)),
        ];
        return { versions, truncated: false };
      },
    };
    const reconciling = reconcileStorage(runtime, paged, { apply: true });
    await g.arrived;
    expect(await deleteFully(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    g.open();
    expect(await reconciling).toMatchObject({ applied: false, stale: true });
    expect(Number((await quota()).untracked)).toBe(before);
  });

  it("R3: belirsiz yazım + boş envanter + mutabakat sırasında geç nesne → rezervasyon serbest bırakılmaz, çift sayım yok", async () => {
    await freshUntracked();
    const app = await seed();
    const pending: Parameters<StorageAdapter["putObject"]>[0][] = [];
    const late: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        pending.push(input);
        throw new StorageError("AMBIGUOUS", "timeout");
      },
    };
    expect((await upload(app.customer, app.req, late)).ok).toBe(false);
    const usageBefore = await readStorageUsage(db);
    const g = gate();
    const reconciling = reconcileStorage(runtime, storage, {
      apply: true,
      afterListing: async () => {
        g.reached();
        await g.opened;
      },
    });
    await g.arrived;
    await storage.putObject(pending[0]!); // sağlayıcı gecikmiş yazımı tamamladı
    g.open();
    expect(await reconciling).toMatchObject({ applied: true });
    const usageAfter = await readStorageUsage(db);
    expect(usageAfter.total).toBe(usageBefore.total); // nesne yalnızca kayıt üzerinden sayılır
    expect(await freshUntracked()).toBe(0); // ikinci mutabakat da çift saymaz
    expect((await readStorageUsage(db)).total).toBe(usageBefore.total);
    expect(
      await count(
        "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
        [app.applicationId],
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM storage_write_attempts WHERE application_id = $1 AND state = 'UNKNOWN'",
        [app.applicationId],
      ),
    ).toBe(1);
  });

  it("R4: mutabakat kota güncellemesi × başka başvurunun yükleme rezervasyonu (gerçek kilit sırası, iki yön) → sınır aşılmaz", async () => {
    for (const reconcileFirst of [true, false]) {
      await freshUntracked();
      // Kayıtsız (sahipsiz) nesne: mutabakat bunu kayıt dışı kullanım olarak ekleyecek.
      const orphan = buildObjectKey(randomUUID(), randomUUID(), randomUUID());
      await put(orphan);
      const app = await seed();
      const usage = await readStorageUsage(db);
      // Sınır: yükleme ancak sahipsiz nesne HENÜZ sayılmamışsa sığar.
      const limit = usage.total + pdf.byteLength + pdf.byteLength - 1;
      const reconcile = () => reconcileStorage(runtime, storage, { apply: true });
      const reserve = () => upload(app.customer, app.req, storage, limit);
      const results = (await queued<unknown>(
        lockQuota,
        reconcileFirst ? [reconcile, reserve] : [reserve, reconcile],
      )) as [unknown, unknown];
      const [reconcileResult, uploadResult] = (
        reconcileFirst ? results : [results[1], results[0]]
      ) as [{ applied: boolean }, { ok: boolean; code?: string }];
      expect(reconcileResult.applied).toBe(true);
      if (reconcileFirst) expect(uploadResult).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
      else expect(uploadResult.ok).toBe(true);
      // Sonrasında sınır dahilinde ek yükleme kabul edilmez.
      const after = await readStorageUsage(db);
      const extra = await upload(app.customer, app.req, storage, limit);
      if (after.total + pdf.byteLength > limit) expect(extra).toMatchObject({ ok: false });
      const versions = await storage.listObjectVersions(orphan, 2);
      for (const v of versions.versions) await storage.deleteObjectVersion(v.key, v.versionId);
    }
  });

  it("R5: iki eşzamanlı mutabakat → eski sonuç yeninin üzerine yazmaz (tek uygulama, tek audit)", async () => {
    await freshUntracked();
    const auditBefore = await count(
      "SELECT count(*) AS n FROM audit_logs WHERE action = 'STORAGE_RECONCILED'",
    );
    const ga = gate();
    const gb = gate();
    const a = reconcileStorage(runtime, storage, {
      apply: true,
      afterListing: async () => {
        ga.reached();
        await ga.opened;
      },
    });
    const b = reconcileStorage(runtime2, storage, {
      apply: true,
      afterListing: async () => {
        gb.reached();
        await gb.opened;
      },
    });
    await Promise.all([ga.arrived, gb.arrived]); // ikisi de aynı nesilde envanter aldı
    ga.open();
    const first = await a;
    gb.open();
    const second = await b;
    expect(first).toMatchObject({ applied: true });
    expect(second).toMatchObject({ applied: false, stale: true });
    expect(
      await count("SELECT count(*) AS n FROM audit_logs WHERE action = 'STORAGE_RECONCILED'"),
    ).toBe(auditBefore + 1);
  });

  it("R6: envanter sayfalaması ortasında sağlayıcı hatası / eksik liste → kesin hesap sayılmaz, kota durumu değişmez", async () => {
    await freshUntracked();
    const before = await quota();
    const failing: StorageAdapter = {
      ...storage,
      listObjectVersions: async () => {
        throw new StorageError("UNAVAILABLE", "page-2");
      },
    };
    await expect(reconcileStorage(runtime, failing, { apply: true })).rejects.toThrow();
    const truncated: StorageAdapter = {
      ...storage,
      listObjectVersions: async (prefix, pages) => ({
        ...(await storage.listObjectVersions(prefix, pages)),
        truncated: true,
      }),
    };
    expect(await reconcileStorage(runtime, truncated, { apply: true })).toMatchObject({
      applied: false,
      truncated: true,
    });
    expect(await quota()).toEqual(before);
  });

  it("R7: silme sonlandırması × mutabakat uygulaması (kota kilidi, iki yön) → negatif yok, çift/eski sayım yok, metadata erken silinmez", async () => {
    for (const finalizeFirst of [true, false]) {
      await freshUntracked();
      const app = await appWithDuplicate();
      const bytes = await count(
        "SELECT coalesce(sum(size_bytes), 0) AS n FROM application_document_files WHERE application_id = $1",
        [app.applicationId],
      );
      const usageBefore = await readStorageUsage(db);
      const row = (
        await owner.query<{ version: number; application_number: string }>(
          "SELECT version, application_number FROM applications WHERE id = $1",
          [app.applicationId],
        )
      ).rows[0]!;
      expect(
        (
          await requestApplicationDeletion(
            db,
            { userId: admin },
            {
              applicationId: app.applicationId,
              expectedVersion: row.version,
              reason: "Test",
              confirmationNumber: row.application_number,
            },
          )
        ).ok,
      ).toBe(true);
      const step = () =>
        processApplicationDeletion(
          { db, storage: async () => storage },
          { userId: admin },
          {
            applicationId: app.applicationId,
          },
        );
      const reconcile = () => reconcileStorage(runtime, storage, { apply: true });
      const results = (await queued<unknown>(
        lockQuota,
        finalizeFirst ? [step, reconcile] : [reconcile, step],
      )) as unknown[];
      const stepResult = (finalizeFirst ? results[0] : results[1]) as { ok: boolean };
      const reconcileResult = (finalizeFirst ? results[1] : results[0]) as {
        applied: boolean;
      };
      expect(stepResult).toEqual({ ok: true, data: { state: "DELETED" } });
      // Silme (fiziksel silme/sonlandırma) önce kuyruğa girdiyse mutabakat bayat sayılır.
      if (finalizeFirst) expect(reconcileResult.applied).toBe(false);
      const q = await quota();
      expect(Number(q.untracked)).toBeGreaterThanOrEqual(0);
      expect(await freshUntracked()).toBe(0);
      expect((await readStorageUsage(db)).total).toBe(usageBefore.total - bytes);
      expect(
        await count("SELECT count(*) AS n FROM applications WHERE id = $1", [app.applicationId]),
      ).toBe(0);
    }
  });
});
