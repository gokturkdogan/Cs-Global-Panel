import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as applications from "@/features/applications/service";
import { getDeletionProgress } from "@/features/deletion/queries";
import {
  applicationPrefix,
  processApplicationDeletion,
  requestApplicationDeletion,
} from "@/features/deletion/service";
import {
  beginStorageWrite,
  uploadDocumentFile,
  type FileActor,
  type UploadDeps,
} from "@/features/documents/service";
import { addInternalNote } from "@/features/internal-notes/service";
import * as workflow from "@/features/workflow/service";
import * as schema from "@/server/db/schema";
import { parseAccessTokenEnv } from "@/server/env";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { readStorageUsage } from "@/server/storage/quota";
import type { PutObjectInput, StorageAdapter } from "@/server/storage/types";

import { cleanupStorage } from "../../scripts/storage/maintenance";
import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, connectRuntime, createRuntimePool, expectPgError, testId } from "./helpers";

/**
 * PHASE 10.1 — silme ↔ gecikmiş storage yazımı güvenliği (D-121…D-128). Gerçek izole PostgreSQL
 * (bağımsız bağlantılar, D-114 kontrollü araya girme) + yerel private storage üzerinde araçlı sağlayıcı:
 * PUT'u duraklatma, "zaman aşımı + sonradan gerçekleşen yazım", "yazdı ama yanıt vermeden çöktü",
 * aynı anahtarda birden fazla belirsiz girişim. Gerçek zaman beklenmez: "süre geçti" durumu DB'deki
 * zaman alanları geriye alınarak üretilir — sistem süreye dayanmadığı için sonuç değişmemelidir.
 */
describe.runIf(isIsolatedTestDatabase())(`silme ↔ geç yazım — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(20);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let runtime: pg.Client;
  let root: string;
  let storage: StorageAdapter;
  let admin: string;
  let employee: string;
  const createdUsers: string[] = [];
  const tokenEnv = parseAccessTokenEnv(process.env);
  const pdf = fixtures.valid();
  const md5 = createHash("md5").update(pdf).digest("hex");

  beforeAll(async () => {
    owner = await connectOwner();
    runtime = await connectRuntime();
    root = await mkdtemp(join(tmpdir(), "cs-write-safety-"));
    storage = await createLocalPrivateAdapter(root);
    const ensure = async (role: "admin" | "employee") => {
      const existing = await owner.query<{ id: string }>("SELECT id FROM users WHERE role = $1", [
        role,
      ]);
      if (existing.rows[0]) return existing.rows[0].id;
      const id = testId();
      await owner.query(
        "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Test', $1 || '@staff.invalid', $2, $3)",
        [id, `t_${randomUUID().slice(0, 8)}`, role],
      );
      createdUsers.push(id);
      return id;
    };
    admin = await ensure("admin");
    employee = await ensure("employee");
  });
  afterAll(async () => {
    await owner.query("DELETE FROM applications WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM services WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM users WHERE id = ANY($1::text[])", [createdUsers]);
    await runtime.end();
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ yardımcılar

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await owner.query<{ n: string }>(sql, params)).rows[0]!.n);
  const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await owner.query<T>(sql, params)).rows[0];
  const reqVersion = async (id: string) =>
    (await one<{ version: number }>(
      "SELECT version FROM application_document_requirements WHERE id = $1",
      [id],
    ))!.version;
  const appVersion = async (id: string) =>
    (await one<{ version: number }>("SELECT version FROM applications WHERE id = $1", [id]))!
      .version;
  const attemptsOf = async (applicationId: string) =>
    (
      await owner.query<{ id: string; state: string; outcome: string | null }>(
        "SELECT id, state, outcome FROM storage_write_attempts WHERE application_id = $1 ORDER BY admitted_at, id",
        [applicationId],
      )
    ).rows;
  const prefixVersions = async (applicationId: string) =>
    (await storage.listObjectVersions(applicationPrefix(applicationId), 10)).versions;
  const exists = async (applicationId: string) =>
    (await count("SELECT count(*) AS n FROM applications WHERE id = $1", [applicationId])) === 1;
  const deletedAudits = (applicationId: string) =>
    count(
      "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETED'",
      [applicationId],
    );
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(check: () => Promise<boolean>, label: string) {
    const deadline = Date.now() + 10_000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(`zaman aşımı: ${label}`);
      await sleep(20);
    }
  }

  async function seed() {
    const app = await seedApplication(owner, admin, {
      documents: [{ title: "Pasaport" }, { title: "Banka Dökümü" }],
    });
    const reqs = await owner.query<{ id: string }>(
      "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
      [app.applicationId],
    );
    const customer: FileActor = {
      kind: "CUSTOMER",
      applicationId: app.applicationId,
      tokenId: app.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    return { ...app, reqIds: reqs.rows.map((r) => r.id), customer };
  }

  function deps(adapter: StorageAdapter, extra: Partial<UploadDeps> = {}): UploadDeps {
    return {
      db,
      storage: adapter,
      quota: { maxTotalBytes: 9e9, warningBytes: 8e9 },
      validatePdf: async () => ({ ok: true as const, pageCount: 1 }),
      ...extra,
    };
  }
  async function upload(
    actor: FileActor,
    requirementId: string,
    adapter: StorageAdapter = storage,
    extra: Partial<UploadDeps> = {},
  ) {
    return uploadDocumentFile(deps(adapter, extra), actor, {
      requirementId,
      expectedVersion: await reqVersion(requirementId),
      filename: "a.pdf",
      bytes: pdf,
    });
  }

  async function requestDeletion(applicationId: string, by = admin) {
    const row = (await one<{ version: number; application_number: string }>(
      "SELECT version, application_number FROM applications WHERE id = $1",
      [applicationId],
    ))!;
    return requestApplicationDeletion(
      db,
      { userId: by },
      {
        applicationId,
        expectedVersion: row.version,
        reason: "Test silme gerekçesi",
        confirmationNumber: row.application_number,
      },
    );
  }
  const step = (applicationId: string, adapter: StorageAdapter = storage, by = admin) =>
    processApplicationDeletion(
      { db, storage: async () => adapter },
      { userId: by },
      { applicationId },
    );

  /** "Süre geçti": tüm zaman alanları 1 gün geriye (sistem süreye dayanmamalı). */
  async function timeTravel(applicationId: string) {
    await owner.query(
      "UPDATE application_document_files SET upload_expires_at = now() - interval '1 day' WHERE application_id = $1",
      [applicationId],
    );
    await owner.query(
      `UPDATE application_deletions SET settle_after = now() - interval '1 day',
         lease_id = NULL, lease_expires_at = NULL WHERE application_id = $1`,
      [applicationId],
    );
  }

  /** PUT'u duraklatan sağlayıcı (yazım IN_PROGRESS). Yükleme yolunun en iyi çaba silmesi başarısız. */
  function gatedProvider() {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let reached!: () => void;
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    const control = { puts: 0 };
    const adapter: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        control.puts += 1;
        reached();
        await released;
        return storage.putObject(input);
      },
      deleteObjectVersion: async () => {
        throw new StorageError("UNAVAILABLE", "test");
      },
    };
    return { adapter, release, arrived, control };
  }

  /** Zaman aşımı döndüren, yazımı SONRADAN gerçekleştiren sağlayıcı (Test B/G/H/I/J/K). */
  function lateProvider() {
    const pending: PutObjectInput[] = [];
    const adapter: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        pending.push(input);
        throw new StorageError("AMBIGUOUS", "timeout");
      },
    };
    const land = async () => {
      const input = pending.shift();
      if (input === undefined) throw new Error("bekleyen yazım yok");
      await storage.putObject(input);
    };
    return { adapter, land, pending };
  }

  async function putVersion(key: string) {
    return storage.putObject({
      key,
      body: pdf,
      contentType: "application/pdf",
      sizeBytes: pdf.byteLength,
      md5Hex: md5,
    });
  }

  const lockWaiters = () =>
    count(
      "SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND state = 'active'",
    );

  /**
   * D-114: tutucu bağlantı satırı kilitler; işlemler SIRAYLA başlatılır ve her biri gerçekten kilit
   * beklerken (pg_stat_activity) bir sonraki başlatılır → kilit kuyruğu sırası belirlenir; sonra bırakılır.
   * Sonuç vaatleri döndürülür (beklenmez).
   */
  async function queued<T>(lockSql: string, params: unknown[], ops: (() => Promise<T>)[]) {
    const holder = await connectOwner();
    try {
      await holder.query("BEGIN");
      await holder.query(lockSql, params);
      const running: Promise<T>[] = [];
      for (const [index, op] of ops.entries()) {
        running.push(op());
        await until(async () => (await lockWaiters()) >= index + 1, `kilit bekleyen ${index + 1}`);
      }
      await holder.query("COMMIT");
      return running;
    } finally {
      await holder.end();
    }
  }
  const ordered = async <T>(lockSql: string, params: unknown[], ops: (() => Promise<T>)[]) =>
    Promise.all(await queued(lockSql, params, ops));
  const lockApp = "SELECT id FROM applications WHERE id = $1 FOR UPDATE";

  async function expectDeleted(applicationId: string) {
    expect(await exists(applicationId)).toBe(false);
    expect(await prefixVersions(applicationId)).toEqual([]);
    expect(await deletedAudits(applicationId)).toBe(1);
    expect(
      await count("SELECT count(*) AS n FROM storage_write_attempts WHERE application_id = $1", [
        applicationId,
      ]),
    ).toBe(0);
  }
  const waiting = { ok: true, data: { state: "IN_PROGRESS", error: "UPLOAD_OUTCOME_UNKNOWN" } };

  // ================================================================== A–K

  it("A: PUT duraklarken silme + süre geçmesi → sonlandırma reddedilir; yazım bitince güvenle silinir", async () => {
    const app = await seed();
    const gate = gatedProvider();
    const uploading = upload(app.customer, app.reqIds[0]!, gate.adapter);
    await gate.arrived; // rezervasyon + yazım çiti commit edildi, PUT sağlayıcıda
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "IN_PROGRESS" }]);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    await timeTravel(app.applicationId);
    expect(await step(app.applicationId)).toEqual(waiting);
    expect(await exists(app.applicationId)).toBe(true);
    expect(
      await count(
        "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
        [app.applicationId],
      ),
    ).toBe(1);
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "IN_PROGRESS" }]);
    expect(await deletedAudits(app.applicationId)).toBe(0);

    gate.release();
    expect((await uploading).ok).toBe(false); // aktivasyon silme işaretini görür
    expect(await prefixVersions(app.applicationId)).toHaveLength(1); // gecikmiş yazım storage'da
    expect(await attemptsOf(app.applicationId)).toMatchObject([
      { state: "CONFIRMED", outcome: "PROVIDER_CONFIRMED" },
    ]);
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("B: zaman aşımı + ilk LIST boş + sağlayıcı sonradan yazar → boş listeyle sonlandırma YOK", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    expect(await attemptsOf(app.applicationId)).toMatchObject([
      { state: "UNKNOWN", outcome: "RESPONSE_LOST" },
    ]);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    expect(await step(app.applicationId)).toEqual(waiting);
    expect(await prefixVersions(app.applicationId)).toEqual([]); // liste boştu
    expect(await exists(app.applicationId)).toBe(true);
    await late.land(); // sağlayıcı gecikmiş yazımı tamamladı
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("C: kabul commit edildi, PUT başlamadan süreç çöktü → süre/kira ile çözülmez; silme çitler, uyanan işçi yazamaz", async () => {
    const app = await seed();
    await expect(
      upload(app.customer, app.reqIds[0]!, storage, {
        beforeStorageWrite: async () => {
          throw new Error("süreç çöktü (simülasyon)");
        },
      }),
    ).rejects.toThrow();
    const [attempt] = await attemptsOf(app.applicationId);
    expect(attempt).toMatchObject({ state: "ADMITTED" });
    await owner.query(
      "UPDATE application_document_files SET upload_expires_at = now() - interval '1 day' WHERE application_id = $1",
      [app.applicationId],
    );
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "ADMITTED" }]);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    expect(await attemptsOf(app.applicationId)).toMatchObject([
      { state: "FENCED", outcome: "FENCED_BY_DELETION" },
    ]);
    expect(await beginStorageWrite(db, attempt!.id)).toBe(false); // uyanan işçi PUT başlatamaz
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("C2: PUT başladı, süreç çöktü (IN_PROGRESS) → kira/süre dolması çözüm sayılmaz", async () => {
    const app = await seed();
    const gate = gatedProvider();
    void upload(app.customer, app.reqIds[0]!, gate.adapter); // hiç bırakılmaz (çöken işçi)
    await gate.arrived;
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      await timeTravel(app.applicationId);
      expect(await step(app.applicationId)).toEqual(waiting);
    }
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "IN_PROGRESS" }]);
    expect(await exists(app.applicationId)).toBe(true);
  });

  it("D: sağlayıcı yazdı, DB sonucu yazılmadan çöktü → metadata korunur; gözlemle çözülür ve silinir", async () => {
    const app = await seed();
    const crashing: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        await storage.putObject(input);
        return new Promise(() => undefined); // yanıt hiç dönmez (süreç öldü)
      },
    };
    void upload(app.customer, app.reqIds[0]!, crashing);
    await until(async () => (await prefixVersions(app.applicationId)).length === 1, "yazım");
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "IN_PROGRESS" }]);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    expect(
      await count(
        "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND status = 'UPLOAD_PENDING'",
        [app.applicationId],
      ),
    ).toBe(1);
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("E: yazım kabulü ↔ silme talebi (gerçek kilit sırası, iki yön) → sahipsiz nesne yok", async () => {
    // Yön 1: silme önce → yeni kabul reddedilir, girişim oluşmaz.
    const first = await seed();
    const gate1 = gatedProvider();
    gate1.release();
    const [deleted1, upload1] = await ordered<{ ok: boolean }>(
      lockApp,
      [first.applicationId],
      [
        () => requestDeletion(first.applicationId),
        () => upload(first.customer, first.reqIds[0]!, gate1.adapter),
      ],
    );
    expect(deleted1!.ok).toBe(true);
    expect(upload1!.ok).toBe(false);
    expect(await attemptsOf(first.applicationId)).toEqual([]);
    expect(gate1.control.puts).toBe(0);
    expect(await step(first.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });

    // Yön 2: kabul önce → silme girişimi takip eder (çitler veya sonucunu bekler).
    const second = await seed();
    const gate2 = gatedProvider();
    const [uploading2, deleting2] = await queued<unknown>(
      lockApp,
      [second.applicationId],
      [
        () => upload(second.customer, second.reqIds[0]!, gate2.adapter),
        () => requestDeletion(second.applicationId),
      ],
    );
    expect(await deleting2).toMatchObject({ ok: true });
    const [attempt] = await attemptsOf(second.applicationId);
    expect(["FENCED", "IN_PROGRESS"]).toContain(attempt!.state);
    if (attempt!.state === "IN_PROGRESS") {
      expect(await step(second.applicationId)).toEqual(waiting);
    }
    gate2.release();
    expect(await uploading2).toMatchObject({ ok: false });
    await until(
      async () =>
        (await attemptsOf(second.applicationId)).every((a) =>
          ["CONFIRMED", "FENCED"].includes(a.state),
        ),
      "girişim çözüldü",
    );
    expect(await step(second.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(second.applicationId);
  });

  it("F: kabulden sonra duraklayan işçi silmeden sonra uyanır → PUT gönderilmez, sahipsiz dosya yok", async () => {
    const app = await seed();
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => (resume = resolve));
    const control = { puts: 0 };
    const counting: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        control.puts += 1;
        return storage.putObject(input);
      },
    };
    const uploading = upload(app.customer, app.reqIds[0]!, counting, {
      beforeStorageWrite: () => resumed,
    });
    await until(async () => (await attemptsOf(app.applicationId)).length === 1, "kabul");
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    resume();
    expect(await uploading).toMatchObject({ ok: false, code: "STATE_CHANGED" });
    expect(control.puts).toBe(0);
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "FENCED" }]);
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("G: aynı anahtarda iki belirsiz girişim → bilinen versiyonun silinmesi diğerini çözmez", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    const [first] = (
      await owner.query<{ file_id: string; object_key: string }>(
        "SELECT file_id, object_key FROM storage_write_attempts WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    // Gizli yeniden deneme / eski kayıt benzetimi: aynı anahtarda ikinci belirsiz fiziksel girişim.
    await owner.query(
      `INSERT INTO storage_write_attempts (application_id, file_id, object_key, state, outcome, started_at)
       VALUES ($1, $2, $3, 'UNKNOWN', 'RESPONSE_LOST', now())`,
      [app.applicationId, first!.file_id, first!.object_key],
    );
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    await late.land(); // birinci girişimin versiyonu
    expect(await step(app.applicationId)).toEqual(waiting);
    expect(await prefixVersions(app.applicationId)).toEqual([]); // bilinen versiyon silindi
    expect((await attemptsOf(app.applicationId)).map((a) => a.state).sort()).toEqual([
      "CONFIRMED",
      "UNKNOWN",
    ]);
    expect(await exists(app.applicationId)).toBe(true);
    await putVersion(first!.object_key); // ikinci girişim de sonradan yazdı
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("H: teknik temizlik ↔ silme adımı eşzamanlı → bekleyen girişim/metadata kaybolmaz", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    // Gerçek araya girme: silme adımı işlem kaydı kilidinde beklerken temizlik baştan sona çalışır.
    const holder = await connectOwner();
    let stepping: Promise<Awaited<ReturnType<typeof step>>>;
    let report: unknown;
    try {
      await holder.query("BEGIN");
      await holder.query(
        "SELECT application_id FROM application_deletions WHERE application_id = $1 FOR UPDATE",
        [app.applicationId],
      );
      stepping = step(app.applicationId);
      await until(async () => (await lockWaiters()) >= 1, "adım bekliyor");
      report = await cleanupStorage(runtime, storage, { apply: true });
      await holder.query("COMMIT");
    } finally {
      await holder.end();
    }
    const result = await stepping!;
    expect(report).toMatchObject({ applied: true });
    expect(result).toEqual(waiting);
    expect(await attemptsOf(app.applicationId)).toMatchObject([{ state: "UNKNOWN" }]);
    expect(
      await count(
        "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
        [app.applicationId],
      ),
    ).toBe(1);
    await late.land();
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    await expectDeleted(app.applicationId);
  });

  it("H2: silme dışı teknik temizlik belirsiz girişimli kaydı sonlandırmaz; gözlem → çözüm → sonraki turda sonlandırır", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    const fileId = (await one<{ id: string }>(
      "SELECT id FROM application_document_files WHERE application_id = $1",
      [app.applicationId],
    ))!.id;
    const blobDeleted = async () =>
      (await one<{ b: Date | null }>(
        "SELECT blob_deleted_at AS b FROM application_document_files WHERE id = $1",
        [fileId],
      ))!.b;
    expect((await cleanupStorage(runtime, storage, { apply: true })).unresolvedWrites).toBe(1);
    expect(await blobDeleted()).toBeNull();
    await late.land();
    const resolved = await cleanupStorage(runtime, storage, { apply: true });
    expect(resolved.attemptsResolved).toBe(1);
    expect(await prefixVersions(app.applicationId)).toEqual([]);
    expect(await blobDeleted()).toBeNull(); // çözüm bu listelemeden sonra → bir sonraki tur
    await cleanupStorage(runtime, storage, { apply: true });
    expect(await blobDeleted()).not.toBeNull();
  });

  it("I: belirsiz yazım beklerken kota erken serbest bırakılmaz; silmeden sonra tam olarak düşer", async () => {
    const app = await seed();
    const late = lateProvider();
    const before = await readStorageUsage(db);
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    const during = await readStorageUsage(db);
    expect(during.total - before.total).toBe(pdf.byteLength);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    for (let i = 0; i < 2; i += 1) {
      await timeTravel(app.applicationId);
      expect(await step(app.applicationId)).toEqual(waiting);
      expect((await readStorageUsage(db)).total).toBe(during.total);
    }
    await late.land();
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    expect((await readStorageUsage(db)).total).toBe(before.total);
  });

  it("J: belirsiz yazım varken tamamlama audit'i yok; tek FAILED (kategori) ve çözümden sonra tek DELETED", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    for (let i = 0; i < 3; i += 1) expect(await step(app.applicationId)).toEqual(waiting);
    expect(await deletedAudits(app.applicationId)).toBe(0);
    const failed = await owner.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_FAILED'",
      [app.applicationId],
    );
    expect(failed.rows.map((r) => r.metadata.reason)).toEqual(["UPLOAD_OUTCOME_UNKNOWN"]);
    await late.land();
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
    expect(await deletedAudits(app.applicationId)).toBe(1);
  });

  it("K: sonuç kalıcı olarak belirlenemiyor → süre geçse de fail-closed; runtime rolü kanıt taklidi/bypass yapamaz", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      await timeTravel(app.applicationId);
      expect(await step(app.applicationId)).toEqual(waiting);
    }
    expect(await getDeletionProgress(db, app.applicationId)).toMatchObject({
      unresolvedWrites: 1,
      lastError: "UPLOAD_OUTCOME_UNKNOWN",
    });
    const [attempt] = await attemptsOf(app.applicationId);
    // "Elle çözüldü" yolu yok: UNKNOWN → FAILED/FENCED trigger ile reddedilir; silme işareti geri alınamaz.
    await expectPgError(
      runtime.query(
        "UPDATE storage_write_attempts SET state = 'FAILED', outcome = 'NOT_SENT', settled_at = now() WHERE id = $1",
        [attempt!.id],
      ),
      "55000",
    );
    await expectPgError(
      runtime.query(
        "UPDATE storage_write_attempts SET state = 'FENCED', started_at = NULL, settled_at = now() WHERE id = $1",
        [attempt!.id],
      ),
      "55000",
    );
    await expectPgError(
      runtime.query(
        "UPDATE applications SET deletion_requested_at = NULL, deletion_requested_by_user_id = NULL WHERE id = $1",
        [app.applicationId],
      ),
      "55000",
    );
    await expectPgError(
      runtime.query("DELETE FROM storage_write_attempts WHERE id = $1", [attempt!.id]),
      "42501",
    );
    // Sonlandırma kanıtları elle taklit edilse bile DB koruması çözülmemiş girişimi görür.
    await runtime.query(
      "UPDATE application_document_files SET blob_deleted_at = now() WHERE application_id = $1",
      [app.applicationId],
    );
    await runtime.query(
      "UPDATE application_deletions SET storage_verified_at = now(), final_listing_started_at = now() WHERE application_id = $1",
      [app.applicationId],
    );
    await expectPgError(
      runtime.query("DELETE FROM applications WHERE id = $1", [app.applicationId]),
      "55000",
    );
    expect(await exists(app.applicationId)).toBe(true);
  });

  it("bir fiziksel versiyon iki girişimi çözemez (veritabanı UNIQUE)", async () => {
    const app = await seed();
    const late = lateProvider();
    expect((await upload(app.customer, app.reqIds[0]!, late.adapter)).ok).toBe(false);
    const [first] = (
      await owner.query<{ id: string; file_id: string; object_key: string }>(
        "SELECT id, file_id, object_key FROM storage_write_attempts WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows;
    const second = (
      await owner.query<{ id: string }>(
        `INSERT INTO storage_write_attempts (application_id, file_id, object_key, state, outcome, started_at)
         VALUES ($1, $2, $3, 'UNKNOWN', 'RESPONSE_LOST', now()) RETURNING id`,
        [app.applicationId, first!.file_id, first!.object_key],
      )
    ).rows[0]!.id;
    await runtime.query(
      "UPDATE storage_write_attempts SET state = 'CONFIRMED', outcome = 'OBSERVED', version_id = 'v-1', settled_at = now() WHERE id = $1",
      [first!.id],
    );
    await expectPgError(
      runtime.query(
        "UPDATE storage_write_attempts SET state = 'CONFIRMED', outcome = 'OBSERVED', version_id = 'v-1', settled_at = now() WHERE id = $1",
        [second],
      ),
      "23505",
    );
    // (Gözlemle çözümde aynı kural: Test G — tek versiyon varken ikinci belirsiz girişim açık kalır.)
    expect(
      (
        await owner.query<{ state: string }>(
          "SELECT state FROM storage_write_attempts WHERE id = $1",
          [second],
        )
      ).rows[0]!.state,
    ).toBe("UNKNOWN");
  });

  it("eski (takipsiz) dosya kaydı → otomatik çözülmüş sayılmaz; teknik inceleme (LEGACY_UNVERIFIED)", async () => {
    const app = await seed();
    const fileId = randomUUID();
    await owner.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname,
         original_filename, size_bytes, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, 'EXPIRED', $4, 'a.pdf', 100, 'USER', $5, now() - interval '1 day')`,
      [
        fileId,
        app.applicationId,
        app.reqIds[0],
        `applications/${app.applicationId}/${app.reqIds[0]}/${fileId}.pdf`,
        admin,
      ],
    );
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    expect(await step(app.applicationId)).toEqual({
      ok: true,
      data: { state: "BLOCKED", error: "LEGACY_UNVERIFIED" },
    });
    expect(await getDeletionProgress(db, app.applicationId)).toMatchObject({ manualReview: true });
    expect(await exists(app.applicationId)).toBe(true);
  });

  // ================================================================== Eşzamanlılık matrisi (D-114, D-128)

  /** Silme talebi ↔ X; iki sırayla. Değişmez: silme işaretinden SONRA X'in etkisi (audit) commit edilmez. */
  async function raceWithDeletion(
    prepare: () => Promise<{ applicationId: string; op: () => Promise<{ ok: boolean }> }>,
    action: string,
  ) {
    for (const deletionFirst of [true, false]) {
      const { applicationId, op } = await prepare();
      const deletion = () => requestDeletion(applicationId);
      const results = await ordered<{ ok: boolean }>(
        lockApp,
        [applicationId],
        deletionFirst ? [deletion, op] : [op, deletion],
      );
      const [deletionResult, opResult] = deletionFirst ? results : [results[1]!, results[0]!];
      if (deletionFirst) {
        expect(deletionResult!.ok, `${action} silme önce`).toBe(true);
        expect(opResult!.ok, `${action} silmeden sonra reddedilir`).toBe(false);
      } else {
        expect(opResult!.ok, `${action} önce`).toBe(true);
      }
      const requested = await one<{ id: string }>(
        "SELECT id FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_REQUESTED'",
        [applicationId],
      );
      if (requested !== undefined) {
        expect(
          await count(
            "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = $2 AND id > $3",
            [applicationId, action, requested.id],
          ),
          `${action}: silme işaretinden sonra etki yok`,
        ).toBe(0);
      }
    }
  }

  async function underReview() {
    const app = await seed();
    for (const id of app.reqIds) expect((await upload(app.customer, id)).ok).toBe(true);
    expect(
      (
        await workflow.submitApplication(db, app.customer, {
          applicationId: app.applicationId,
          expectedVersion: await appVersion(app.applicationId),
        })
      ).ok,
    ).toBe(true);
    return app;
  }
  const activeFileOf = async (requirementId: string) =>
    (await one<{ id: string }>(
      "SELECT id FROM application_document_files WHERE requirement_id = $1 AND status = 'ACTIVE'",
      [requirementId],
    ))!.id;

  it("silme talebi × silme talebi (iki personel) → tek işlem, tek audit", async () => {
    const app = await seed();
    const results = await ordered<{ ok: boolean; data?: unknown }>(
      lockApp,
      [app.applicationId],
      [
        () => requestDeletion(app.applicationId, admin),
        () => requestDeletion(app.applicationId, employee),
      ],
    );
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(results.map((r) => (r as { data: { alreadyRequested: boolean } }).data)).toEqual([
      { alreadyRequested: false },
      { alreadyRequested: true },
    ]);
    expect(
      await count(
        "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_REQUESTED'",
        [app.applicationId],
      ),
    ).toBe(1);
  });

  it("sürdürme × sürdürme (kira, gerçek kilit) → tek adım; diğeri meşgul veya tamamlanmış; tek DELETED", async () => {
    const app = await seed();
    expect((await upload(app.customer, app.reqIds[0]!)).ok).toBe(true);
    expect((await requestDeletion(app.applicationId)).ok).toBe(true);
    const results = await ordered<Awaited<ReturnType<typeof step>>>(
      "SELECT application_id FROM application_deletions WHERE application_id = $1 FOR UPDATE",
      [app.applicationId],
      [
        () => step(app.applicationId, storage, admin),
        () => step(app.applicationId, storage, employee),
      ],
    );
    expect(results[0]).toEqual({ ok: true, data: { state: "DELETED" } });
    const second = results[1]!;
    if (second.ok) expect(second.data).toEqual({ state: "DELETED" });
    else expect(second.error.code).toBe("CONFLICT");
    await expectDeleted(app.applicationId);
  });

  it("silme × evrak kararı / gönderim / kaldırma / yorum / iç not / bağlantı yenileme / iptal (iki yön)", async () => {
    await raceWithDeletion(async () => {
      const app = await underReview();
      const fileId = await activeFileOf(app.reqIds[0]!);
      return {
        applicationId: app.applicationId,
        op: async () =>
          workflow.reviewDocument(
            db,
            { userId: employee },
            {
              requirementId: app.reqIds[0]!,
              fileId,
              expectedVersion: await reqVersion(app.reqIds[0]!),
              decision: "APPROVED",
              customerMessage: null,
            },
          ),
      };
    }, "DOCUMENT_APPROVED");

    await raceWithDeletion(async () => {
      const app = await seed();
      for (const id of app.reqIds) expect((await upload(app.customer, id)).ok).toBe(true);
      const version = await appVersion(app.applicationId);
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.submitApplication(db, app.customer, {
            applicationId: app.applicationId,
            expectedVersion: version,
          }),
      };
    }, "APPLICATION_SUBMITTED");

    await raceWithDeletion(async () => {
      const app = await seed();
      expect((await upload(app.customer, app.reqIds[0]!)).ok).toBe(true);
      const fileId = await activeFileOf(app.reqIds[0]!);
      const version = await reqVersion(app.reqIds[0]!);
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.removeDocumentFile(db, app.customer, { fileId, expectedVersion: version }),
      };
    }, "DOCUMENT_DELETED");

    await raceWithDeletion(async () => {
      const app = await seed();
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.addCustomerComment(
            db,
            { userId: employee },
            {
              applicationId: app.applicationId,
              requirementId: null,
              body: "Yarış yorumu",
              idempotencyKey: randomUUID(),
            },
          ),
      };
    }, "DOCUMENT_COMMENT_ADDED");

    await raceWithDeletion(async () => {
      const app = await seed();
      return {
        applicationId: app.applicationId,
        op: () =>
          addInternalNote(
            db,
            { userId: employee },
            {
              applicationId: app.applicationId,
              requirementId: null,
              body: "Yarış notu",
              idempotencyKey: randomUUID(),
            },
          ),
      };
    }, "INTERNAL_NOTE_ADDED");

    await raceWithDeletion(async () => {
      const app = await seed();
      return {
        applicationId: app.applicationId,
        op: () =>
          applications.rotateAccessLink(
            db,
            { userId: employee },
            { applicationId: app.applicationId, expectedActiveTokenId: app.tokenId },
            tokenEnv,
          ),
      };
    }, "ACCESS_LINK_ROTATED");

    await raceWithDeletion(async () => {
      const app = await seed();
      const version = await appVersion(app.applicationId);
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.transitionApplication(
            db,
            { userId: employee },
            {
              applicationId: app.applicationId,
              expectedVersion: version,
              code: "CANCEL",
              reason: "Yarış iptali",
            },
          ),
      };
    }, "APPLICATION_STATUS_CHANGED");
  });

  it("silme × düzeltme kararı / yeniden gönderim / yeniden açma / personel yükleme kabulü (iki yön)", async () => {
    await raceWithDeletion(async () => {
      const app = await underReview();
      const fileId = await activeFileOf(app.reqIds[0]!);
      return {
        applicationId: app.applicationId,
        op: async () =>
          workflow.reviewDocument(
            db,
            { userId: employee },
            {
              requirementId: app.reqIds[0]!,
              fileId,
              expectedVersion: await reqVersion(app.reqIds[0]!),
              decision: "REVISION_REQUIRED",
              customerMessage: "Belgenin tüm sayfalarını yükleyiniz.",
            },
          ),
      };
    }, "DOCUMENT_REVISION_REQUESTED");

    await raceWithDeletion(async () => {
      const app = await underReview();
      const [first, second] = app.reqIds as [string, string];
      expect(
        (
          await workflow.reviewDocument(
            db,
            { userId: admin },
            {
              requirementId: first,
              fileId: await activeFileOf(first),
              expectedVersion: await reqVersion(first),
              decision: "REVISION_REQUIRED",
              customerMessage: "Belgenin tüm sayfalarını yükleyiniz.",
            },
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await workflow.reviewDocument(
            db,
            { userId: admin },
            {
              requirementId: second,
              fileId: await activeFileOf(second),
              expectedVersion: await reqVersion(second),
              decision: "APPROVED",
              customerMessage: null,
            },
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await workflow.transitionApplication(
            db,
            { userId: admin },
            {
              applicationId: app.applicationId,
              expectedVersion: await appVersion(app.applicationId),
              code: "REQUEST_REVISION",
              reason: null,
            },
          )
        ).ok,
      ).toBe(true);
      expect((await upload(app.customer, first)).ok).toBe(true);
      const version = await appVersion(app.applicationId);
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.submitApplication(db, app.customer, {
            applicationId: app.applicationId,
            expectedVersion: version,
          }),
      };
    }, "APPLICATION_RESUBMITTED");

    await raceWithDeletion(async () => {
      const app = await seed();
      expect(
        (
          await workflow.transitionApplication(
            db,
            { userId: admin },
            {
              applicationId: app.applicationId,
              expectedVersion: await appVersion(app.applicationId),
              code: "CANCEL",
              reason: "İptal",
            },
          )
        ).ok,
      ).toBe(true);
      const version = await appVersion(app.applicationId);
      return {
        applicationId: app.applicationId,
        op: () =>
          workflow.transitionApplication(
            db,
            { userId: employee },
            {
              applicationId: app.applicationId,
              expectedVersion: version,
              code: "REOPEN_CANCELLED",
              reason: "Yeniden açma yarışı",
            },
          ),
      };
    }, "APPLICATION_STATUS_CHANGED");

    // Personel (müşteri adına) yükleme kabulü. Yükleme iki aşamalıdır: kabul önce olsa da silme talebi
    // girişimi çitler veya aktivasyon silme işaretini görür → yükleme hiçbir sırada tamamlanamaz; değişmez:
    // silme önce → girişim yok; kabul önce → girişim kayıtlı ve çözülmüş, silme sahipsiz nesne bırakmaz.
    for (const deletionFirst of [true, false]) {
      const app = await seed();
      const staffUpload = () => upload({ kind: "STAFF", userId: employee }, app.reqIds[0]!);
      const deletion = () => requestDeletion(app.applicationId);
      const results = await ordered<{ ok: boolean }>(
        lockApp,
        [app.applicationId],
        deletionFirst ? [deletion, staffUpload] : [staffUpload, deletion],
      );
      expect(results.every((r) => r !== undefined)).toBe(true);
      const uploadResult = deletionFirst ? results[1]! : results[0]!;
      expect(uploadResult.ok).toBe(false);
      const states = (await attemptsOf(app.applicationId)).map((a) => a.state);
      expect(states).toEqual(deletionFirst ? [] : [expect.stringMatching(/^(FENCED|CONFIRMED)$/)]);
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_UPLOADED'",
          [app.applicationId],
        ),
      ).toBe(0);
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await expectDeleted(app.applicationId);
    }
  });

  it("silme × dosya aktivasyonu (iki yön) → aktive olan dosya da silinir; sahipsiz nesne yok", async () => {
    for (const deletionFirst of [true, false]) {
      const app = await seed();
      const gate = gatedProvider();
      const uploading = upload(app.customer, app.reqIds[0]!, gate.adapter);
      await gate.arrived;
      const holder = await connectOwner();
      try {
        await holder.query("BEGIN");
        await holder.query(lockApp, [app.applicationId]);
        const waiters = lockWaiters;
        let deletion: Promise<unknown>;
        if (deletionFirst) {
          deletion = requestDeletion(app.applicationId);
          await until(async () => (await waiters()) >= 1, "silme bekliyor");
          gate.release();
          await until(async () => (await waiters()) >= 2, "aktivasyon bekliyor");
        } else {
          gate.release();
          await until(async () => (await waiters()) >= 1, "aktivasyon bekliyor");
          deletion = requestDeletion(app.applicationId);
          await until(async () => (await waiters()) >= 2, "silme bekliyor");
        }
        await holder.query("COMMIT");
        const [uploadResult] = await Promise.all([uploading, deletion]);
        expect(uploadResult.ok).toBe(!deletionFirst);
      } finally {
        await holder.end();
      }
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await expectDeleted(app.applicationId);
    }
  });

  it("silme sonlandırması kota kilidi × başka başvurunun yükleme rezervasyonu → kullanım tutarlı", async () => {
    const target = await seed();
    expect((await upload(target.customer, target.reqIds[0]!)).ok).toBe(true);
    const targetBytes = await count(
      "SELECT coalesce(sum(size_bytes), 0) AS n FROM application_document_files WHERE application_id = $1",
      [target.applicationId],
    );
    const other = await seed();
    expect((await requestDeletion(target.applicationId)).ok).toBe(true);
    const before = await readStorageUsage(db);
    const results = await ordered<{ ok: boolean }>(
      "SELECT id FROM storage_quota_state WHERE id = 1 FOR UPDATE",
      [],
      [() => step(target.applicationId), () => upload(other.customer, other.reqIds[0]!)],
    );
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    await expectDeleted(target.applicationId);
    const after = await readStorageUsage(db);
    expect(after.total).toBe(before.total - targetBytes + pdf.byteLength);
  });
});
