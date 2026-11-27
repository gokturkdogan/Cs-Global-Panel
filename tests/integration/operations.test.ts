import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApplicationStatus } from "@/config/statuses";
import * as applications from "@/features/applications/service";
import { getApplicationDetail } from "@/features/applications/queries";
import { listAuditLogs } from "@/features/audit-logs/queries";
import { parseAuditFilters } from "@/features/audit-logs/schemas";
import { getCustomerPortalView } from "@/features/customer-portal/queries";
import { getDeletionProgress, listDeletionQueue } from "@/features/deletion/queries";
import {
  applicationPrefix,
  processApplicationDeletion,
  requestApplicationDeletion,
} from "@/features/deletion/service";
import { openDocumentFile, uploadDocumentFile, type FileActor } from "@/features/documents/service";
import { listInternalNotes } from "@/features/internal-notes/queries";
import { addInternalNote } from "@/features/internal-notes/service";
import * as workflow from "@/features/workflow/service";
import { isAccessActive } from "@/server/customer-session/access";
import * as schema from "@/server/db/schema";
import { parseAccessTokenEnv } from "@/server/env";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { readStorageUsage } from "@/server/storage/quota";
import { buildObjectKey, type StorageAdapter } from "@/server/storage/types";

import { cleanupStorage } from "../../scripts/storage/maintenance";
import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import {
  connectOwner,
  connectRuntime,
  createRuntimePool,
  expectPgError,
  fileGet,
  testId,
} from "./helpers";

/**
 * PHASE 10 — şirket içi notlar, işlem geçmişi, kalıcı başvuru silme (D-115…D-120). Gerçek PostgreSQL
 * (bağımsız bağlantılar) + geçici yerel private storage (B2 davranış modeli: fiziksel versiyonlar);
 * sağlayıcı hataları sarmalayıcı adapter'larla üretilir. YALNIZCA izole veritabanı.
 */
describe.runIf(isIsolatedTestDatabase())(`PHASE 10 operasyonlar — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(16);
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

  beforeAll(async () => {
    owner = await connectOwner();
    runtime = await connectRuntime();
    root = await mkdtemp(join(tmpdir(), "cs-operations-"));
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
    for (const name of ["test_fail_note_audit", "test_fail_deleted_audit"]) {
      await owner.query(`DROP TRIGGER IF EXISTS ${name} ON audit_logs`);
      await owner.query(`DROP FUNCTION IF EXISTS ${name}()`);
    }
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
  const appRow = async (id: string) =>
    (
      await owner.query<{ status: string; version: number; deletion_requested_at: Date | null }>(
        "SELECT status, version, deletion_requested_at FROM applications WHERE id = $1",
        [id],
      )
    ).rows[0];
  const reqVersion = async (id: string) =>
    (
      await owner.query<{ version: number }>(
        "SELECT version FROM application_document_requirements WHERE id = $1",
        [id],
      )
    ).rows[0]!.version;

  async function seed(status?: ApplicationStatus) {
    const app = await seedApplication(owner, admin, {
      documents: [{ title: "Pasaport" }, { title: "Banka Dökümü" }],
      ...(status ? { status } : {}),
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

  function uploadDeps(adapter: StorageAdapter = storage) {
    return {
      db,
      storage: adapter,
      quota: { maxTotalBytes: 9e9, warningBytes: 8e9 },
      validatePdf: async () => ({ ok: true as const, pageCount: 1 }),
    };
  }
  async function upload(actor: FileActor, requirementId: string, adapter?: StorageAdapter) {
    return uploadDocumentFile(uploadDeps(adapter), actor, {
      requirementId,
      expectedVersion: await reqVersion(requirementId),
      filename: "a.pdf",
      bytes: pdf,
    });
  }

  /** Başvuru + gerçek yüklemeler: evrak 1 v1→v2 (SUPERSEDED + ACTIVE), evrak 2 v1 + yinelenen fiziksel versiyon. */
  async function seedWithFiles(extraDuplicates = 1) {
    const app = await seed();
    expect((await upload(app.customer, app.reqIds[0]!)).ok).toBe(true);
    expect((await upload({ kind: "STAFF", userId: admin }, app.reqIds[0]!)).ok).toBe(true);
    expect((await upload(app.customer, app.reqIds[1]!)).ok).toBe(true);
    const key = (
      await owner.query<{ key: string }>(
        "SELECT blob_pathname AS key FROM application_document_files WHERE requirement_id = $1 AND status = 'ACTIVE'",
        [app.reqIds[1]],
      )
    ).rows[0]!.key;
    // Yüklemeler "eski": silme bekleme kapısı (D-116) yalnızca F senaryosunda test edilir.
    await owner.query(
      "UPDATE application_document_files SET upload_expires_at = now() - interval '2 hours' WHERE application_id = $1",
      [app.applicationId],
    );
    for (let i = 0; i < extraDuplicates; i += 1) {
      // Yeniden deneme kaynaklı ek fiziksel versiyon (kayıt dışı; mutabakat `untracked_bytes`).
      await storage.putObject({
        key,
        body: pdf,
        contentType: "application/pdf",
        sizeBytes: pdf.byteLength,
        md5Hex: (await import("node:crypto")).createHash("md5").update(pdf).digest("hex"),
      });
    }
    return app;
  }

  const md5 = async (body: Uint8Array) =>
    (await import("node:crypto")).createHash("md5").update(body).digest("hex");

  async function requestDeletion(applicationId: string, by = admin) {
    const row = (
      await owner.query<{ version: number; application_number: string }>(
        "SELECT version, application_number FROM applications WHERE id = $1",
        [applicationId],
      )
    ).rows[0]!;
    return requestApplicationDeletion(
      db,
      { userId: by },
      {
        applicationId,
        expectedVersion: row.version,
        reason: "Saklama yükümlülüğü sona erdi (test)",
        confirmationNumber: row.application_number,
      },
    );
  }

  const step = (applicationId: string, adapter: StorageAdapter = storage, by = admin) =>
    processApplicationDeletion(
      { db, storage: async () => adapter },
      { userId: by },
      {
        applicationId,
      },
    );

  const prefixVersions = async (applicationId: string) =>
    (await storage.listObjectVersions(applicationPrefix(applicationId), 10)).versions;

  type Counter = { list: number; del: number };
  function counting(
    base: StorageAdapter,
    counter: Counter,
    overrides: Partial<StorageAdapter> = {},
  ) {
    return {
      ...base,
      listObjectVersions: async (prefix: string, pages: number) => {
        counter.list += 1;
        return (overrides.listObjectVersions ?? base.listObjectVersions)(prefix, pages);
      },
      deleteObjectVersion: async (key: string, versionId: string) => {
        counter.del += 1;
        return (overrides.deleteObjectVersion ?? base.deleteObjectVersion)(key, versionId);
      },
    } satisfies StorageAdapter;
  }

  async function deletedFully(applicationId: string) {
    expect(await appRow(applicationId)).toBeUndefined();
    for (const table of [
      "application_document_requirements",
      "application_document_files",
      "document_reviews",
      "document_comments",
      "application_internal_notes",
      "application_status_history",
      "application_access_tokens",
      "application_deletions",
      "application_deletion_objects",
    ]) {
      expect(
        await count(`SELECT count(*) AS n FROM ${table} WHERE application_id = $1`, [
          applicationId,
        ]),
        table,
      ).toBe(0);
    }
    expect(await prefixVersions(applicationId)).toEqual([]);
    expect(
      await count(
        "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETED'",
        [applicationId],
      ),
    ).toBe(1);
  }

  // ================================================================== İç notlar

  describe("şirket içi notlar (D-115)", () => {
    it("ekler; aynı anahtarla tekrar yeni not/audit üretmez; statü değişmez; audit metni içermez", async () => {
      const app = await seed();
      const before = await appRow(app.applicationId);
      const key = randomUUID();
      const input = {
        applicationId: app.applicationId,
        requirementId: null,
        body: "Telefonla görüşüldü.\nGüncel iş sözleşmesi bekleniyor.",
        idempotencyKey: key,
      };
      const first = await addInternalNote(db, { userId: admin }, input);
      const again = await addInternalNote(db, { userId: admin }, input);
      expect(first).toMatchObject({ ok: true, data: { created: true } });
      expect(again).toMatchObject({ ok: true, data: { created: false } });
      if (first.ok && again.ok) expect(again.data.noteId).toBe(first.data.noteId);
      expect(
        await count(
          "SELECT count(*) AS n FROM application_internal_notes WHERE application_id = $1",
          [app.applicationId],
        ),
      ).toBe(1);
      const audits = await owner.query<{ metadata: Record<string, unknown> }>(
        "SELECT metadata FROM audit_logs WHERE application_id = $1 AND action = 'INTERNAL_NOTE_ADDED'",
        [app.applicationId],
      );
      expect(audits.rowCount).toBe(1);
      expect(Object.keys(audits.rows[0]!.metadata)).toEqual(["id"]);
      expect(JSON.stringify(audits.rows[0]!.metadata)).not.toContain("sözleşme");
      expect(await appRow(app.applicationId)).toEqual(before);
    });

    it("4 eşzamanlı aynı anahtarlı istek → tek not + tek audit; hepsi aynı kimliği alır", async () => {
      const app = await seed();
      const input = {
        applicationId: app.applicationId,
        requirementId: null,
        body: "Eşzamanlı not",
        idempotencyKey: randomUUID(),
      };
      const results = await Promise.all(
        Array.from({ length: 4 }, () => addInternalNote(db, { userId: admin }, input)),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      const ids = new Set(results.map((r) => (r.ok ? r.data.noteId : null)));
      expect(ids.size).toBe(1);
      expect(results.filter((r) => r.ok && r.data.created)).toHaveLength(1);
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'INTERNAL_NOTE_ADDED'",
          [app.applicationId],
        ),
      ).toBe(1);
    });

    it("aynı anahtar + farklı metin/hesap → genel çakışma; aynı metin + yeni anahtar → yeni not", async () => {
      const app = await seed();
      const key = randomUUID();
      const base = { applicationId: app.applicationId, requirementId: null, idempotencyKey: key };
      expect((await addInternalNote(db, { userId: admin }, { ...base, body: "A" })).ok).toBe(true);
      const differentBody = await addInternalNote(db, { userId: admin }, { ...base, body: "B" });
      expect(differentBody).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      const otherStaff = await addInternalNote(db, { userId: employee }, { ...base, body: "A" });
      expect(otherStaff).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      if (!otherStaff.ok) expect(otherStaff.error.message).not.toContain(key);
      const fresh = await addInternalNote(
        db,
        { userId: employee },
        { ...base, idempotencyKey: randomUUID(), body: "A" },
      );
      expect(fresh).toMatchObject({ ok: true, data: { created: true } });
      expect(
        await count(
          "SELECT count(*) AS n FROM application_internal_notes WHERE application_id = $1",
          [app.applicationId],
        ),
      ).toBe(2);
    });

    it("COMPLETED ve CANCELLED başvuruya not eklenebilir (ürün kuralı statü kısıtı koymaz)", async () => {
      for (const status of ["COMPLETED", "CANCELLED"] as const) {
        const app = await seed(status);
        const result = await addInternalNote(
          db,
          { userId: employee },
          {
            applicationId: app.applicationId,
            requirementId: null,
            body: `${status} notu`,
            idempotencyKey: randomUUID(),
          },
        );
        expect(result.ok, status).toBe(true);
        expect((await appRow(app.applicationId))!.status).toBe(status);
      }
    });

    it("audit yazılamazsa not da geri alınır; aynı anahtarla tekrar başarılı olur", async () => {
      const app = await seed();
      await owner.query(`CREATE FUNCTION test_fail_note_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'INTERNAL_NOTE_ADDED' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END $$`);
      await owner.query(
        "CREATE TRIGGER test_fail_note_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_note_audit()",
      );
      const input = {
        applicationId: app.applicationId,
        requirementId: null,
        body: "Geri alınacak not",
        idempotencyKey: randomUUID(),
      };
      try {
        expect(await addInternalNote(db, { userId: admin }, input)).toMatchObject({
          ok: false,
          error: { code: "INTERNAL" },
        });
        expect(
          await count(
            "SELECT count(*) AS n FROM application_internal_notes WHERE application_id = $1",
            [app.applicationId],
          ),
        ).toBe(0);
      } finally {
        await owner.query("DROP TRIGGER test_fail_note_audit ON audit_logs");
        await owner.query("DROP FUNCTION test_fail_note_audit()");
      }
      expect(await addInternalNote(db, { userId: admin }, input)).toMatchObject({
        ok: true,
        data: { created: true },
      });
    });

    it("müşteri DTO'su iç not içeriği içermez (sentinel); liste sınırlıdır ve yeniden eskiye sıralıdır", async () => {
      const app = await seed();
      const sentinel = `INTERNAL_NOTE_PRIVATE_SENTINEL_${randomUUID()}`;
      expect(
        (
          await addInternalNote(
            db,
            { userId: admin },
            {
              applicationId: app.applicationId,
              requirementId: null,
              body: sentinel,
              idempotencyKey: randomUUID(),
            },
          )
        ).ok,
      ).toBe(true);
      const view = await getCustomerPortalView(db, {
        applicationId: app.applicationId,
        tokenId: app.tokenId,
      });
      expect(view).not.toBeNull();
      expect(JSON.stringify(view)).not.toContain(sentinel);
      expect(JSON.stringify(view)).not.toContain("INTERNAL_NOTE");

      for (let i = 0; i < 52; i += 1) {
        await owner.query(
          `INSERT INTO application_internal_notes (application_id, body, author_user_id, created_at)
           VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
          [app.applicationId, `Not ${i}`, admin, i + 1],
        );
      }
      const list = await listInternalNotes(db, app.applicationId);
      expect(list.total).toBe(53);
      expect(list.items).toHaveLength(50);
      expect(list.items[0]!.body).toBe("Not 51");
      // PHASE 10.1: daha eski notlara sınırlı keyset sayfalarıyla erişilir (tekrar/eksik yok).
      expect(list.nextCursor).toBe(list.items.at(-1)!.id);
      const older = await listInternalNotes(db, app.applicationId, list.nextCursor);
      expect(older.items).toHaveLength(3);
      expect(older.nextCursor).toBeNull();
      const ids = [...list.items, ...older.items].map((n) => n.id);
      expect(new Set(ids).size).toBe(53);
      // Başka başvurunun imleci boş sayfa döndürür (kapsam dışı veri yok).
      const other = await seed();
      expect((await listInternalNotes(db, other.applicationId, list.nextCursor)).items).toEqual([]);
    });

    it("silme sürecindeki başvuruya not eklenemez ve notları okunmaz", async () => {
      const app = await seed();
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      expect(
        await addInternalNote(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            requirementId: null,
            body: "x",
            idempotencyKey: randomUUID(),
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect((await listInternalNotes(db, app.applicationId)).items).toEqual([]);
    });
  });

  // ================================================================== İşlem geçmişi

  describe("işlem geçmişi (D-119)", () => {
    it("aynı zaman damgalı kayıtlarda keyset sayfalama tekrar/eksik üretmez (ileri ve geri)", async () => {
      const app = await seed();
      await owner.query("BEGIN");
      for (let i = 0; i < 25; i += 1) {
        await owner.query(
          `INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, resource_id, application_id, metadata)
           VALUES ('APPLICATION_UPDATED', 'USER', $1, 'application', $2::text, $2::uuid, '{"changedFields":["email"]}')`,
          [admin, app.applicationId],
        );
      }
      await owner.query("COMMIT"); // tek transaction → aynı occurred_at
      const all = (
        await owner.query<{ id: string }>(
          "SELECT id FROM audit_logs WHERE application_id = $1 ORDER BY occurred_at DESC, id DESC",
          [app.applicationId],
        )
      ).rows.map((r) => Number(r.id));
      const base = { applicationId: app.applicationId, pageSize: "10" };
      const p1 = await listAuditLogs(db, parseAuditFilters(base).filters);
      // Sayfalar arasında yeni kayıt eklenmesi sonraki ("daha eski") sayfayı kaydırmaz.
      await owner.query(
        `INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, resource_id, application_id, metadata)
         VALUES ('APPLICATION_UPDATED', 'USER', $1, 'application', $2::text, $2::uuid, '{}')`,
        [admin, app.applicationId],
      );
      const p2 = await listAuditLogs(
        db,
        parseAuditFilters({ ...base, after: String(p1.olderCursor) }).filters,
      );
      const p3 = await listAuditLogs(
        db,
        parseAuditFilters({ ...base, after: String(p2.olderCursor) }).filters,
      );
      const seen = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
      expect(seen).toEqual(all);
      expect(p1.newerCursor).toBeNull();
      expect(p3.olderCursor).toBeNull();
      const back = await listAuditLogs(
        db,
        parseAuditFilters({ ...base, before: String(p3.newerCursor) }).filters,
      );
      expect(back.items.map((i) => i.id)).toEqual(p2.items.map((i) => i.id));
      // Ayrıntılar allowlist: alan adı etiketlenir, değer yok.
      expect(p1.items[0]!.details).toEqual([{ label: "Değişen alanlar", value: "E-posta" }]);
    });

    it("filtreler: işlem, aktör türü, personel, kaynak, Europe/Istanbul gün sınırı; bilinmeyen event güvenli", async () => {
      const app = await seed();
      const insert = (
        action: string,
        actor: string,
        user: string | null,
        at: string,
        meta = "{}",
      ) =>
        owner.query(
          `INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, application_id, occurred_at, metadata)
           VALUES ($1, $2, $3, 'application', $4, $5::timestamptz, $6::jsonb)`,
          [action, actor, user, app.applicationId, at, meta],
        );
      // 2026-01-01 21:30 UTC = 2026-01-02 00:30 Istanbul
      await insert("DOCUMENT_APPROVED", "USER", employee, "2026-01-01T21:30:00Z");
      await insert("DOCUMENT_VIEWED", "CUSTOMER", null, "2026-01-01T20:30:00Z");
      await insert("LEGACY_UNKNOWN_EVENT", "SYSTEM", null, "2026-01-03T10:00:00Z", '{"id":"x"}');
      const run = async (params: Record<string, string>) =>
        (
          await listAuditLogs(
            db,
            parseAuditFilters({ applicationId: app.applicationId, ...params }).filters,
          )
        ).items.map((i) => i.action);

      expect(await run({ from: "2026-01-02", to: "2026-01-02" })).toEqual(["DOCUMENT_APPROVED"]);
      expect(await run({ from: "2026-01-01", to: "2026-01-01" })).toEqual(["DOCUMENT_VIEWED"]);
      expect(await run({ actorType: "CUSTOMER" })).toEqual(["DOCUMENT_VIEWED"]);
      expect(await run({ staffId: employee })).toEqual(["DOCUMENT_APPROVED"]);
      expect(await run({ action: "DOCUMENT_APPROVED" })).toEqual(["DOCUMENT_APPROVED"]);
      expect(await run({ resourceType: "file" })).toEqual([]);
      const unknown = (
        await listAuditLogs(db, parseAuditFilters({ applicationId: app.applicationId }).filters)
      ).items.find((i) => i.action === "LEGACY_UNKNOWN_EVENT")!;
      expect(unknown.actionLabel).toBe("Diğer işlem");
      expect(unknown.details).toEqual([]);
      const staffRow = (
        await listAuditLogs(
          db,
          parseAuditFilters({ applicationId: app.applicationId, staffId: employee }).filters,
        )
      ).items[0]!;
      expect(staffRow.staff?.accountType).toBe("employee");
      expect(staffRow.application).toMatchObject({ number: app.number });
    });

    it("runtime rolü audit kaydını değiştiremez/silemez (append-only korunur)", async () => {
      await expectPgError(
        runtime.query("UPDATE audit_logs SET action = 'X_Y_Z' WHERE id = 1"),
        "42501",
      );
      await expectPgError(runtime.query("DELETE FROM audit_logs WHERE id = 1"), "42501");
      await expectPgError(runtime.query("TRUNCATE audit_logs"), "42501");
    });
  });

  // ================================================================== Kalıcı silme

  describe("kalıcı silme — talep ve erişim kapanışı", () => {
    it("talep: bağlantı iptal, müşteri erişimi/yükleme/iş akışı/yorum/bağlantı/dosya erişimi kapanır; tekrar talep tek işlem", async () => {
      const app = await seedWithFiles(0);
      const fileId = (
        await owner.query<{ id: string }>(
          "SELECT id FROM application_document_files WHERE application_id = $1 AND status = 'ACTIVE' LIMIT 1",
          [app.applicationId],
        )
      ).rows[0]!.id;
      expect(await requestDeletion(app.applicationId)).toEqual({
        ok: true,
        data: { alreadyRequested: false },
      });
      expect(await requestDeletion(app.applicationId, employee)).toEqual({
        ok: true,
        data: { alreadyRequested: true },
      });
      const token = (
        await owner.query<{ revoke_reason: string | null }>(
          "SELECT revoke_reason FROM application_access_tokens WHERE id = $1",
          [app.tokenId],
        )
      ).rows[0]!;
      expect(token.revoke_reason).toBe("APPLICATION_DELETION");
      expect(
        await isAccessActive(db, { applicationId: app.applicationId, tokenId: app.tokenId }),
      ).toBe(false);
      expect(
        await getCustomerPortalView(db, { applicationId: app.applicationId, tokenId: app.tokenId }),
      ).toBeNull();
      expect((await upload(app.customer, app.reqIds[0]!)).ok).toBe(false);
      expect((await upload({ kind: "STAFF", userId: admin }, app.reqIds[0]!)).ok).toBe(false);
      const version = (await appRow(app.applicationId))!.version;
      expect(
        await workflow.transitionApplication(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            expectedVersion: version,
            code: "CANCEL",
            reason: "x",
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        await workflow.addCustomerComment(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            requirementId: null,
            body: "x",
            idempotencyKey: randomUUID(),
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        (
          await applications.rotateAccessLink(
            db,
            { userId: admin },
            { applicationId: app.applicationId, expectedActiveTokenId: null },
            tokenEnv,
          )
        ).ok,
      ).toBe(false);
      expect(
        await openDocumentFile(
          { db, storage: async () => storage },
          { kind: "STAFF", userId: admin },
          fileGet(fileId, "inline"),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(await getApplicationDetail(db, app.applicationId)).toBeNull();
      expect(await getDeletionProgress(db, app.applicationId)).toMatchObject({
        applicationNumber: app.number,
      });
      expect((await listDeletionQueue(db)).items.map((i) => i.applicationId)).toContain(
        app.applicationId,
      );
      const requested = await owner.query<{ metadata: Record<string, unknown> }>(
        "SELECT metadata FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_REQUESTED'",
        [app.applicationId],
      );
      expect(requested.rows.map((r) => r.metadata)).toEqual([{ fileCount: 3 }]);
    });

    it("onay numarası/sürüm sunucuda doğrulanır; eşzamanlı iki personel talebi tek işlem + tek audit", async () => {
      const app = await seed();
      const row = (await appRow(app.applicationId))!;
      expect(
        await requestApplicationDeletion(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            expectedVersion: row.version,
            reason: "x",
            confirmationNumber: "CS-2000-000001",
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
      expect(
        await requestApplicationDeletion(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            expectedVersion: row.version + 5,
            reason: "x",
            confirmationNumber: app.number,
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      const results = await Promise.all([
        requestDeletion(app.applicationId, admin),
        requestDeletion(app.applicationId, employee),
      ]);
      const flags = results.map((r) => (r.ok ? r.data.alreadyRequested : null)).sort();
      // İkincisi ya mevcut işlemi görür ya da sürüm değiştiği için çakışma alır; işlem tektir.
      expect(flags.filter((f) => f === false)).toHaveLength(1);
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_REQUESTED'",
          [app.applicationId],
        ),
      ).toBe(1);
      expect(
        await count("SELECT count(*) AS n FROM application_deletions WHERE application_id = $1", [
          app.applicationId,
        ]),
      ).toBe(1);
    });

    it("DB koruması: runtime rolü doğrulanmamış başvuru satırını silemez (D-117)", async () => {
      const normal = await seed();
      await expectPgError(
        runtime.query("DELETE FROM applications WHERE id = $1", [normal.applicationId]),
        "55000",
      );
      const deleting = await seedWithFiles(0);
      expect((await requestDeletion(deleting.applicationId)).ok).toBe(true);
      await expectPgError(
        runtime.query("DELETE FROM applications WHERE id = $1", [deleting.applicationId]),
        "55000",
      );
      // İşlem kaydında doğrulama işareti olsa bile blob'u silinmemiş dosya kaydı varken silinemez.
      await owner.query(
        "UPDATE application_deletions SET storage_verified_at = now() WHERE application_id = $1",
        [deleting.applicationId],
      );
      await expectPgError(
        runtime.query("DELETE FROM applications WHERE id = $1", [deleting.applicationId]),
        "55000",
      );
      expect(await appRow(deleting.applicationId)).toBeDefined();
    });
  });

  describe("kalıcı silme — tamamlama ve kota", () => {
    it("tüm fiziksel versiyonlar (aktif, önceki, yinelenen) silinir; DB kayıtları gider; audit kalır; kota tam düşer; benzer önek etkilenmez", async () => {
      const target = await seedWithFiles(2);
      const other = await seedWithFiles(0);
      // Benzer önek: hedef başvuru kimliğinin son karakteri farklı, kayıtsız bir nesne.
      const similarId = `${target.applicationId.slice(0, -1)}${target.applicationId.endsWith("0") ? "1" : "0"}`;
      const similarKey = buildObjectKey(similarId, randomUUID(), randomUUID());
      await storage.putObject({
        key: similarKey,
        body: pdf,
        contentType: "application/pdf",
        sizeBytes: pdf.byteLength,
        md5Hex: await md5(pdf),
      });
      const targetBytes = await count(
        "SELECT coalesce(sum(size_bytes), 0) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
        [target.applicationId],
      );
      const usageBefore = await readStorageUsage(db);
      expect((await prefixVersions(target.applicationId)).length).toBe(5);

      expect((await requestDeletion(target.applicationId, employee)).ok).toBe(true);
      const result = await step(target.applicationId, storage, employee);
      expect(result).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(target.applicationId);

      const usageAfter = await readStorageUsage(db);
      expect(usageBefore.total - usageAfter.total).toBe(targetBytes);
      expect(usageAfter.untracked).toBe(usageBefore.untracked);
      expect((await prefixVersions(other.applicationId)).length).toBe(3);
      expect(await storage.headObject(similarKey, null)).not.toBeNull();
      const deleted = await owner.query<{ metadata: Record<string, unknown>; actor: string }>(
        "SELECT metadata, actor_user_id AS actor FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETED'",
        [target.applicationId],
      );
      expect(deleted.rows[0]).toEqual({ metadata: { fileCount: 3, count: 5 }, actor: employee });
      // Audit'te kişisel veri yok.
      const auditText = JSON.stringify(
        (
          await owner.query("SELECT metadata FROM audit_logs WHERE application_id = $1", [
            target.applicationId,
          ])
        ).rows,
      );
      for (const pii of [target.firstName, target.lastName, target.number]) {
        expect(auditText).not.toContain(pii);
      }
      // Tamamlanmış silmeyi tekrar sürdürmek yan etkisiz.
      expect(await step(target.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETED'",
          [target.applicationId],
        ),
      ).toBe(1);
      await storage.deleteObjectVersion(
        similarKey,
        (await storage.headObject(similarKey, null))!.versionId!,
      );
    });

    it("dosyasız başvuru tek adımda silinir; bilinmeyen kimlik NOT_FOUND", async () => {
      const app = await seed();
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
      expect(await step(randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });
  });

  describe("kalıcı silme — hata ve kurtarma senaryoları", () => {
    it("A: storage erişilemiyor → silme talepte kalır, metadata korunur, sahte başarı yok; sonra devam", async () => {
      const app = await seedWithFiles(0);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const down: StorageAdapter = {
        ...storage,
        listObjectVersions: async () => {
          throw new StorageError("UNAVAILABLE", "test");
        },
      };
      for (let i = 0; i < 2; i += 1) {
        expect(await step(app.applicationId, down)).toEqual({
          ok: true,
          data: { state: "IN_PROGRESS", error: "STORAGE_UNAVAILABLE" },
        });
      }
      expect((await appRow(app.applicationId))!.deletion_requested_at).not.toBeNull();
      expect(
        await count(
          "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
          [app.applicationId],
        ),
      ).toBe(3);
      // Hata kategorisi değişmediği için tek FAILED audit.
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_DELETION_FAILED'",
          [app.applicationId],
        ),
      ).toBe(1);
      expect(await getDeletionProgress(db, app.applicationId)).toMatchObject({
        lastError: "STORAGE_UNAVAILABLE",
        manualReview: false,
      });
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
    });

    it("B: 10 versiyondan 6'sı silinip hata → 6 doğrulandı, 4 kaldı; sonraki adım yalnızca 4 siler", async () => {
      const app = await seedWithFiles(7); // 3 kayıtlı + 7 yinelenen = 10 fiziksel versiyon
      expect((await prefixVersions(app.applicationId)).length).toBe(10);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      let deletes = 0;
      const flaky: StorageAdapter = {
        ...storage,
        deleteObjectVersion: async (key, versionId) => {
          deletes += 1;
          if (deletes > 6) throw new StorageError("UNAVAILABLE", "test");
          return storage.deleteObjectVersion(key, versionId);
        },
      };
      expect(await step(app.applicationId, flaky)).toEqual({
        ok: true,
        data: { state: "IN_PROGRESS", error: "STORAGE_UNAVAILABLE" },
      });
      const progress = (await getDeletionProgress(db, app.applicationId))!;
      expect(progress).toMatchObject({ inventoryReady: true, totalObjects: 10, deletedObjects: 6 });
      expect(
        await count(
          "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1",
          [app.applicationId],
        ),
      ).toBe(3);
      const counter = { list: 0, del: 0 };
      expect(await step(app.applicationId, counting(storage, counter))).toEqual({
        ok: true,
        data: { state: "DELETED" },
      });
      expect(counter.del).toBe(4);
      await deletedFully(app.applicationId);
    });

    it("C: silme yanıtı kayboldu → yokluk listelemeyle doğrulanır; kota iki kez düşmez", async () => {
      const app = await seedWithFiles(0);
      const bytes = await count(
        "SELECT coalesce(sum(size_bytes), 0) AS n FROM application_document_files WHERE application_id = $1",
        [app.applicationId],
      );
      const before = await readStorageUsage(db);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      let first = true;
      const lossy: StorageAdapter = {
        ...storage,
        deleteObjectVersion: async (key, versionId) => {
          await storage.deleteObjectVersion(key, versionId);
          if (first) {
            first = false;
            throw new StorageError("UNAVAILABLE", "response-lost");
          }
        },
      };
      expect(await step(app.applicationId, lossy)).toMatchObject({
        ok: true,
        data: { state: "IN_PROGRESS", error: "STORAGE_UNAVAILABLE" },
      });
      expect((await getDeletionProgress(db, app.applicationId))!.deletedObjects).toBe(1);
      // Kota yalnızca sonlandırmada (fiziksel yokluk doğrulandıktan sonra) düşer.
      expect((await readStorageUsage(db)).total).toBe(before.total);
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      expect(before.total - (await readStorageUsage(db)).total).toBe(bytes);
    });

    it("D: süreç çöktü (kira asılı) → eşzamanlı adım reddedilir; kira dolunca kaldığı yerden sürer; erişim kapalı kalır", async () => {
      const app = await seedWithFiles(0);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      await owner.query(
        "UPDATE application_deletions SET lease_id = $2, lease_expires_at = now() + interval '1 hour' WHERE application_id = $1",
        [app.applicationId, randomUUID()],
      );
      const counter = { list: 0, del: 0 };
      expect(await step(app.applicationId, counting(storage, counter))).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
      expect(counter).toEqual({ list: 0, del: 0 });
      expect(
        await isAccessActive(db, { applicationId: app.applicationId, tokenId: app.tokenId }),
      ).toBe(false);
      await owner.query(
        "UPDATE application_deletions SET lease_expires_at = now() - interval '1 second' WHERE application_id = $1",
        [app.applicationId],
      );
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
    });

    it("E: tüm nesneler silindi ama DB sonlandırması başarısız → başvuru silme talebinde kalır; tekrar tek DELETED audit", async () => {
      const app = await seedWithFiles(0);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      await owner.query(`CREATE FUNCTION test_fail_deleted_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'APPLICATION_DELETED' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END $$`);
      await owner.query(
        "CREATE TRIGGER test_fail_deleted_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_deleted_audit()",
      );
      try {
        expect(await step(app.applicationId)).toEqual({
          ok: true,
          data: { state: "IN_PROGRESS", error: "FINALIZATION_FAILED" },
        });
      } finally {
        await owner.query("DROP TRIGGER test_fail_deleted_audit ON audit_logs");
        await owner.query("DROP FUNCTION test_fail_deleted_audit()");
      }
      expect((await appRow(app.applicationId))!.deletion_requested_at).not.toBeNull();
      expect(await prefixVersions(app.applicationId)).toEqual([]);
      // Sonlandırma geri alındı: dosya kayıtları ve kota muhasebesi değişmedi (tutucu).
      expect(
        await count(
          "SELECT count(*) AS n FROM application_document_files WHERE application_id = $1 AND blob_deleted_at IS NULL",
          [app.applicationId],
        ),
      ).toBe(3);
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
    });

    it("F2: adım sırasında yeni fiziksel versiyon belirirse doğrulama listelemesi yakalar ve siler", async () => {
      const app = await seedWithFiles(0);
      const key = (
        await owner.query<{ key: string }>(
          "SELECT blob_pathname AS key FROM application_document_files WHERE application_id = $1 LIMIT 1",
          [app.applicationId],
        )
      ).rows[0]!.key;
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      let injected = false;
      const racing: StorageAdapter = {
        ...storage,
        deleteObjectVersion: async (k, v) => {
          await storage.deleteObjectVersion(k, v);
          if (!injected) {
            injected = true;
            await storage.putObject({
              key,
              body: pdf,
              contentType: "application/pdf",
              sizeBytes: pdf.byteLength,
              md5Hex: await md5(pdf),
            });
          }
        },
      };
      expect(await step(app.applicationId, racing)).toEqual({
        ok: true,
        data: { state: "DELETED" },
      });
      expect(injected).toBe(true);
      await deletedFully(app.applicationId);
    });

    it("G: sağlayıcı silmeyi reddetti (yetki/Object Lock) → nesne yok sayılmaz, manuel inceleme, metadata korunur", async () => {
      const app = await seedWithFiles(0);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const locked: StorageAdapter = {
        ...storage,
        deleteObjectVersion: async () => {
          throw new StorageError("FORBIDDEN", "403:AccessDenied");
        },
      };
      expect(await step(app.applicationId, locked)).toEqual({
        ok: true,
        data: { state: "BLOCKED", error: "STORAGE_FORBIDDEN" },
      });
      expect(await prefixVersions(app.applicationId)).toHaveLength(3);
      expect(await getDeletionProgress(db, app.applicationId)).toMatchObject({
        deletedObjects: 0,
        manualReview: true,
        lastError: "STORAGE_FORBIDDEN",
      });
      expect(await appRow(app.applicationId)).toBeDefined();
    });

    it("H: iki personel aynı anda sürdürür → tek işlem, tek DELETED audit, tutarlı son durum", async () => {
      const app = await seedWithFiles(3);
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const results = await Promise.all([
        step(app.applicationId, storage, admin),
        step(app.applicationId, storage, employee),
      ]);
      const deleted = results.filter((r) => r.ok && r.data.state === "DELETED").length;
      const busy = results.filter((r) => !r.ok && r.error.code === "CONFLICT").length;
      expect(deleted + busy).toBe(2);
      expect(deleted).toBeGreaterThanOrEqual(1);
      await deletedFully(app.applicationId);
    });

    it("I: sahipliği doğrulanamayan nesne → hiçbir şey silinmez, manuel inceleme; nesne kaldırılınca devam", async () => {
      const app = await seedWithFiles(0);
      const strangerKey = buildObjectKey(app.applicationId, app.reqIds[0]!, randomUUID());
      await storage.putObject({
        key: strangerKey,
        body: pdf,
        contentType: "application/pdf",
        sizeBytes: pdf.byteLength,
        md5Hex: await md5(pdf),
      });
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const counter = { list: 0, del: 0 };
      expect(await step(app.applicationId, counting(storage, counter))).toEqual({
        ok: true,
        data: { state: "BLOCKED", error: "UNKNOWN_OBJECT" },
      });
      expect(counter.del).toBe(0);
      expect(await prefixVersions(app.applicationId)).toHaveLength(4);
      // Operatör incelemesi sonrası (nesne güvenle kaldırıldı) silme sürdürülebilir.
      await storage.deleteObjectVersion(
        strangerKey,
        (await storage.headObject(strangerKey, null))!.versionId!,
      );
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
    });

    it("eksik (sayfalı) liste ile sonlandırma yapılmaz; tüm sayfalar işlenince tamamlanır", async () => {
      const app = await seedWithFiles(2); // 5 versiyon
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const paged: StorageAdapter = {
        ...storage,
        listObjectVersions: async (prefix, pages) => {
          const all = await storage.listObjectVersions(prefix, pages);
          return all.versions.length > 2
            ? { versions: all.versions.slice(0, 2), truncated: true }
            : all;
        },
      };
      expect(await step(app.applicationId, paged)).toEqual({
        ok: true,
        data: { state: "DELETED" },
      });
      await deletedFully(app.applicationId);
    });

    it("teknik temizlik silme sürecindeki başvurunun nesnelerine dokunmaz (D-120)", async () => {
      const app = await seed();
      const fileId = randomUUID();
      const key = buildObjectKey(app.applicationId, app.reqIds[0]!, fileId);
      const put = await storage.putObject({
        key,
        body: pdf,
        contentType: "application/pdf",
        sizeBytes: pdf.byteLength,
        md5Hex: await md5(pdf),
      });
      await owner.query(
        `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname,
           original_filename, size_bytes, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at, storage_version_id)
         VALUES ($1, $2, $3, 'EXPIRED', $4, 'a.pdf', $5, 'USER', $6, now() - interval '1 hour', $7)`,
        [fileId, app.applicationId, app.reqIds[0], key, pdf.byteLength, admin, put.versionId],
      );
      // PHASE 10.1: kaydın yazım girişimi (sağlayıcı onaylı) — takipsiz kayıt LEGACY_UNVERIFIED olurdu.
      await owner.query(
        `INSERT INTO storage_write_attempts (application_id, file_id, object_key, state, outcome, version_id, started_at, settled_at)
         VALUES ($1, $2, $3, 'CONFIRMED', 'PROVIDER_CONFIRMED', $4, now(), now())`,
        [app.applicationId, fileId, key, put.versionId],
      );
      expect((await requestDeletion(app.applicationId)).ok).toBe(true);
      const report = await cleanupStorage(runtime, storage, { apply: true });
      expect(report.applied).toBe(true);
      expect(await storage.headObject(key, null)).not.toBeNull();
      expect(
        (
          await owner.query<{ blob_deleted_at: Date | null }>(
            "SELECT blob_deleted_at FROM application_document_files WHERE id = $1",
            [fileId],
          )
        ).rows[0]!.blob_deleted_at,
      ).toBeNull();
      expect(await step(app.applicationId)).toEqual({ ok: true, data: { state: "DELETED" } });
      await deletedFully(app.applicationId);
    });
  });
});
