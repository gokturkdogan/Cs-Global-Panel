import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import {
  openDocumentFile,
  precheckUpload,
  uploadDocumentFile,
  type FileActor,
  type UploadDeps,
} from "@/features/documents/service";
import * as schema from "@/server/db/schema";
import { validatePdfIsolated } from "@/server/pdf/validate";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import type { StorageAdapter } from "@/server/storage/types";

import { cleanupStorage, reconcileStorage } from "../../scripts/storage/maintenance";
import { fixtures, validPdfOfSize } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, createRuntimePool, testId } from "./helpers";

/**
 * Evrak dosyası yaşam döngüsü (PHASE 08). Commit eden testler → YALNIZCA izole veritabanı + geçici
 * yerel private depolama (gerçek B2 yok). Sentetik PDF'ler; gerçek müşteri belgesi yok.
 */
describe.runIf(isIsolatedTestDatabase())(`evrak dosyaları — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(12);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let root: string;
  let storage: StorageAdapter;
  let admin: string;
  let employee: string;
  const createdUsers: string[] = [];
  const pdf = fixtures.valid();
  const bigQuota = { maxTotalBytes: 9_000_000_000, warningBytes: 8_000_000_000 };

  beforeAll(async () => {
    owner = await connectOwner();
    root = await mkdtemp(join(tmpdir(), "cs-docs-test-"));
    storage = await createLocalPrivateAdapter(root);
    // İki hesap modeli (OD-24): rol başına tek hesap. Varsa okunur (değiştirilmez), yoksa geçici oluşturulur.
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
    await owner.query("UPDATE storage_quota_state SET untracked_bytes = 0 WHERE id = 1");
  });
  afterAll(async () => {
    // Yalnızca bu dosyanın sentetik kayıtları ve geçici hesapları (auth testleri hesapsız başlamalı).
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
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  const deps = (overrides: Partial<UploadDeps> = {}): UploadDeps => ({
    db,
    storage,
    quota: bigQuota,
    validatePdf: (bytes) => validatePdfIsolated(bytes),
    ...overrides,
  });
  const staff = (userId = admin): FileActor => ({ kind: "STAFF", userId });

  async function seed(
    status: "AWAITING_DOCUMENTS" | "UNDER_REVIEW" | "REVISION_REQUIRED" = "AWAITING_DOCUMENTS",
    docStatus?: string,
  ) {
    const app = await seedApplication(owner, admin, {
      status,
      documents: [
        { title: "Pasaport", ...(docStatus ? { status: docStatus as never } : {}) },
        { title: "Fotoğraf", required: false },
      ],
    });
    const reqs = await owner.query<{ id: string; version: number }>(
      "SELECT id, version FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
      [app.applicationId],
    );
    const customer: FileActor = {
      kind: "CUSTOMER",
      applicationId: app.applicationId,
      tokenId: app.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    return {
      ...app,
      requirementId: reqs.rows[0]!.id,
      otherRequirementId: reqs.rows[1]!.id,
      customer,
    };
  }

  async function version(requirementId: string) {
    const { rows } = await owner.query<{ version: number; status: string }>(
      "SELECT version, status FROM application_document_requirements WHERE id = $1",
      [requirementId],
    );
    return rows[0]!;
  }

  async function filesOf(requirementId: string) {
    const { rows } = await owner.query<{
      id: string;
      status: string;
      version_number: number | null;
      blob_pathname: string;
      storage_version_id: string | null;
      sha256: string | null;
      blob_deleted_at: Date | null;
      uploaded_by_actor_type: string;
    }>("SELECT * FROM application_document_files WHERE requirement_id = $1 ORDER BY created_at", [
      requirementId,
    ]);
    return rows;
  }

  async function upload(
    actor: FileActor,
    requirementId: string,
    bytes = pdf,
    extra: Partial<UploadDeps> = {},
  ) {
    const { version: expectedVersion } = await version(requirementId);
    return uploadDocumentFile(deps(extra), actor, {
      requirementId,
      expectedVersion,
      filename: "pasaport.pdf",
      bytes,
    });
  }

  async function auditActions(applicationId: string) {
    const { rows } = await owner.query<{
      action: string;
      actor_type: string;
      metadata: Record<string, unknown>;
    }>(
      "SELECT action, actor_type, metadata FROM audit_logs WHERE application_id = $1 ORDER BY id",
      [applicationId],
    );
    return rows;
  }

  // ------------------------------------------------------------ yaşam döngüsü

  it("ilk yükleme (personel, müşteri adına): v1 ACTIVE, evrak UPLOADED, nesne + SHA-256, audit", async () => {
    const app = await seed();
    const before = await version(app.requirementId);
    const result = await upload(staff(), app.requirementId);
    expect(result).toMatchObject({
      ok: true,
      versionNumber: 1,
      documentStatus: "UPLOADED",
      replaced: false,
    });
    const [file] = await filesOf(app.requirementId);
    expect(file).toMatchObject({
      status: "ACTIVE",
      version_number: 1,
      uploaded_by_actor_type: "USER",
    });
    expect(file!.sha256).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(file!.blob_pathname).toBe(
      `applications/${app.applicationId}/${app.requirementId}/${file!.id}.pdf`,
    );
    expect(file!.blob_pathname).not.toMatch(/pasaport/i);
    const head = await storage.headObject(file!.blob_pathname, file!.storage_version_id);
    expect(head?.contentLength).toBe(pdf.length);
    expect(await version(app.requirementId)).toEqual({
      version: before.version + 1,
      status: "UPLOADED",
    });
    const audit = await auditActions(app.applicationId);
    expect(audit.at(-1)).toMatchObject({ action: "DOCUMENT_UPLOADED", actor_type: "USER" });
    expect(audit.at(-1)!.metadata).toMatchObject({ onBehalfOfCustomer: true, versionNumber: 1 });
    expect(JSON.stringify(audit)).not.toMatch(/pasaport\.pdf|%PDF/);
  });

  it("müşteri değiştirme: v2 ACTIVE, v1 SUPERSEDED olarak korunur (nesne silinmez), audit CUSTOMER", async () => {
    const app = await seed();
    expect((await upload(app.customer, app.requirementId)).ok).toBe(true);
    const second = await upload(app.customer, app.requirementId, fixtures.openActionDestination());
    expect(second).toMatchObject({ ok: true, versionNumber: 2, replaced: true });
    const files = await filesOf(app.requirementId);
    expect(files.map((f) => [f.status, f.version_number])).toEqual([
      ["SUPERSEDED", 1],
      ["ACTIVE", 2],
    ]);
    for (const file of files) {
      expect(await storage.headObject(file.blob_pathname, file.storage_version_id)).not.toBeNull();
    }
    const audit = await auditActions(app.applicationId);
    expect(audit.at(-1)).toMatchObject({ action: "DOCUMENT_REPLACED", actor_type: "CUSTOMER" });
  });

  it("geçersiz PDF reddedilir: kayıt/nesne oluşmaz, önceki aktif dosya korunur", async () => {
    const app = await seed();
    await upload(staff(), app.requirementId);
    for (const [name, reason] of [
      ["javascriptOpenAction", "ACTIVE_CONTENT"],
      ["jpegWithPdfExtension", "NOT_PDF"],
      ["encrypted", "ENCRYPTED"],
      ["truncated", "MALFORMED"],
    ] as const) {
      const result = await upload(app.customer, app.requirementId, fixtures[name]());
      expect(result).toEqual({ ok: false, code: "INVALID_PDF", pdfReason: reason });
    }
    const files = await filesOf(app.requirementId);
    expect(files.map((f) => f.status)).toEqual(["ACTIVE"]);
    const audit = await auditActions(app.applicationId);
    expect(audit.filter((a) => a.action === "DOCUMENT_VALIDATION_REJECTED")).toHaveLength(4);
  }, 60_000);

  it("10 485 760 bayt kabul edilir", async () => {
    const app = await seed();
    const result = await upload(staff(), app.requirementId, validPdfOfSize(MAX_PDF_SIZE_BYTES));
    expect(result.ok).toBe(true);
  }, 60_000);

  // ------------------------------------------------------------ yetki

  it("müşteri UNDER_REVIEW'da yükleyemez; personel yükler, önceki onay devredilmez (BR-48)", async () => {
    const app = await seed("UNDER_REVIEW", "APPROVED");
    // Onaylı evrakın eski dosyası + onay kaydı (PHASE 09 verisi simülasyonu).
    const oldFile = randomUUID();
    await owner.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, version_number, blob_pathname,
         original_filename, size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at, activated_at, storage_version_id)
       VALUES ($1, $2, $3, 'ACTIVE', 1, $4, 'eski.pdf', 100, $5, 'USER', $6, now(), now(), 'v-old')`,
      [
        oldFile,
        app.applicationId,
        app.requirementId,
        `applications/${app.applicationId}/${app.requirementId}/${oldFile}.pdf`,
        "a".repeat(64),
        admin,
      ],
    );
    await owner.query(
      `INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, reviewed_by_user_id)
       VALUES ($1, $2, $3, 'APPROVED', $4)`,
      [app.applicationId, app.requirementId, oldFile, admin],
    );
    expect(await upload(app.customer, app.requirementId)).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
    });
    const result = await upload(staff(employee), app.requirementId);
    expect(result).toMatchObject({ ok: true, versionNumber: 2, documentStatus: "PENDING_REVIEW" });
    const reviews = await owner.query(
      "SELECT decision, file_id FROM document_reviews WHERE requirement_id = $1",
      [app.requirementId],
    );
    expect(reviews.rows).toEqual([{ decision: "APPROVED", file_id: oldFile }]);
    const audit = await auditActions(app.applicationId);
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["DOCUMENT_REPLACED", "DOCUMENT_APPROVAL_INVALIDATED"]),
    );
    expect(audit.find((a) => a.action === "DOCUMENT_APPROVAL_INVALIDATED")!.metadata).toMatchObject(
      { from: "APPROVED", to: "PENDING_REVIEW" },
    );
  });

  it("iki personel hesabı eşit: ADMIN ve EMPLOYEE aynı sonucu alır", async () => {
    const app = await seed();
    expect((await upload(staff(admin), app.requirementId)).ok).toBe(true);
    expect((await upload(staff(employee), app.requirementId)).ok).toBe(true);
    expect((await filesOf(app.requirementId)).map((f) => f.status)).toEqual([
      "SUPERSEDED",
      "ACTIVE",
    ]);
  });

  it("müşteri başka başvurunun evrakına yükleyemez (404) ve tamamlanan/iptal başvuruda yükleyemez", async () => {
    const a = await seed();
    const b = await seed();
    expect(await upload(a.customer, b.requirementId)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await filesOf(b.requirementId)).toHaveLength(0);
    for (const status of ["COMPLETED", "CANCELLED", "DOCUMENTS_APPROVED", "IN_PROCESS"]) {
      await owner.query("UPDATE applications SET status = $1 WHERE id = $2", [
        status,
        a.applicationId,
      ]);
      expect(await upload(a.customer, a.requirementId)).toEqual({ ok: false, code: "NOT_ALLOWED" });
      expect(await upload(staff(), a.requirementId)).toEqual({ ok: false, code: "NOT_ALLOWED" });
    }
  });

  it("eski expectedVersion → CONFLICT; süresi dolmuş müşteri oturumu → ACCESS_ENDED", async () => {
    const app = await seed();
    const { version: v } = await version(app.requirementId);
    const stale = await uploadDocumentFile(deps(), staff(), {
      requirementId: app.requirementId,
      expectedVersion: v + 5,
      filename: "a.pdf",
      bytes: pdf,
    });
    expect(stale).toEqual({ ok: false, code: "CONFLICT" });
    const expired = {
      ...app.customer,
      sessionExpiresAt: Math.floor(Date.now() / 1000) - 1,
    } as FileActor;
    expect(await upload(expired, app.requirementId)).toEqual({ ok: false, code: "ACCESS_ENDED" });
  });

  it("silme sürecindeki başvuru → NOT_FOUND; ön kontrol kotayı gövde okunmadan uygular", async () => {
    const app = await seed();
    const usage = await owner.query<{ total: string }>(
      "SELECT coalesce(sum(size_bytes),0)::text AS total FROM application_document_files WHERE blob_deleted_at IS NULL",
    );
    const total = Number(usage.rows[0]!.total);
    const { version: v } = await version(app.requirementId);
    const tight = { maxTotalBytes: total + 100, warningBytes: total + 50 };
    expect(
      await precheckUpload({ db, quota: tight }, staff(), {
        requirementId: app.requirementId,
        expectedVersion: v,
        sizeBytes: 100,
      }),
    ).toBeNull();
    expect(
      await precheckUpload({ db, quota: tight }, staff(), {
        requirementId: app.requirementId,
        expectedVersion: v,
        sizeBytes: 101,
      }),
    ).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    await owner.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $1 WHERE id = $2",
      [admin, app.applicationId],
    );
    expect(await upload(staff(), app.requirementId)).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  // ------------------------------------------------------------ hata kurtarma

  const failingPut = (kind: StorageError["kind"]): StorageAdapter => ({
    ...storage,
    putObject: async () => {
      throw new StorageError(kind, "test");
    },
  });

  it("storage yazımı başarısız → eski aktif korunur, kayıt EXPIRED, temizlik sonlandırır", async () => {
    const app = await seed();
    await upload(staff(), app.requirementId);
    expect(
      await upload(app.customer, app.requirementId, pdf, { storage: failingPut("UNAVAILABLE") }),
    ).toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" });
    expect(
      await upload(app.customer, app.requirementId, pdf, { storage: failingPut("LIMIT") }),
    ).toEqual({ ok: false, code: "STORAGE_LIMIT" });
    const files = await filesOf(app.requirementId);
    expect(files.map((f) => f.status)).toEqual(["ACTIVE", "EXPIRED", "EXPIRED"]);
    const audit = await auditActions(app.applicationId);
    expect(audit.filter((a) => a.action === "DOCUMENT_UPLOAD_FAILED")).toHaveLength(2);
    const report = await cleanupStorage(owner, storage, { apply: true });
    expect(report.applied).toBe(true);
    const after = await filesOf(app.requirementId);
    expect(
      after.filter((f) => f.status === "EXPIRED").every((f) => f.blob_deleted_at !== null),
    ).toBe(true);
    expect(after.find((f) => f.status === "ACTIVE")!.blob_deleted_at).toBeNull();
  });

  it("storage yazıldı ama yanıt kayboldu → HEAD mutabakatı ile aktive edilir (kör yeniden yazma yok)", async () => {
    const app = await seed();
    let puts = 0;
    const lostResponse: StorageAdapter = {
      ...storage,
      putObject: async (input) => {
        puts += 1;
        await storage.putObject(input);
        throw new StorageError("AMBIGUOUS", "test");
      },
    };
    const result = await upload(staff(), app.requirementId, pdf, { storage: lostResponse });
    expect(result).toMatchObject({ ok: true, versionNumber: 1 });
    expect(puts).toBe(1);
    const [file] = await filesOf(app.requirementId);
    expect(file!.storage_version_id).not.toBeNull();
  });

  it("belirsiz yazma + nesne yok → EXPIRED; önceki aktif korunur", async () => {
    const app = await seed();
    await upload(staff(), app.requirementId);
    const lost: StorageAdapter = {
      ...storage,
      putObject: async () => {
        throw new StorageError("AMBIGUOUS");
      },
    };
    expect(await upload(staff(), app.requirementId, pdf, { storage: lost })).toEqual({
      ok: false,
      code: "STORAGE_UNAVAILABLE",
    });
    expect((await filesOf(app.requirementId)).map((f) => f.status)).toEqual(["ACTIVE", "EXPIRED"]);
  });

  it("aktivasyon transaction'ı başarısız (ör. audit/kısıt hatası) → yarım mutasyon yok, eski aktif korunur", async () => {
    const app = await seed();
    await upload(staff(), app.requirementId);
    // version + 1 taşması aktivasyon transaction'ını commit öncesi düşürür (audit hatasıyla aynı rollback yolu).
    await owner.query(
      "UPDATE application_document_requirements SET version = 2147483647 WHERE id = $1",
      [app.requirementId],
    );
    const result = await upload(staff(), app.requirementId);
    expect(result).toEqual({ ok: false, code: "INTERNAL" });
    const files = await filesOf(app.requirementId);
    expect(files.map((f) => [f.status, f.version_number])).toEqual([
      ["ACTIVE", 1],
      ["EXPIRED", null],
    ]);
    expect(await version(app.requirementId)).toMatchObject({
      version: 2147483647,
      status: "UPLOADED",
    });
  });

  const duringPut = (action: () => Promise<unknown>): StorageAdapter => ({
    ...storage,
    putObject: async (input) => {
      const result = await storage.putObject(input);
      await action();
      return result;
    },
  });

  it("yükleme sırasında token iptali/yenileme → aktivasyon reddedilir, nesne temizlenir", async () => {
    for (const reason of ["REVOKED", "ROTATED"]) {
      const app = await seed();
      const result = await upload(app.customer, app.requirementId, pdf, {
        storage: duringPut(() =>
          owner.query(
            "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = $1, revoked_by_user_id = $2 WHERE id = $3",
            [reason, admin, app.tokenId],
          ),
        ),
      });
      expect(result).toEqual({ ok: false, code: "ACCESS_ENDED" });
      const [file] = await filesOf(app.requirementId);
      expect(file).toMatchObject({ status: "REJECTED" });
      expect(file!.blob_deleted_at).not.toBeNull();
      expect(await version(app.requirementId)).toMatchObject({ status: "NOT_UPLOADED" });
    }
  });

  it("yükleme sırasında statü değişikliği / silme talebi → STATE_CHANGED (BR-45)", async () => {
    const changed = await seed();
    expect(
      await upload(changed.customer, changed.requirementId, pdf, {
        storage: duringPut(() =>
          owner.query("UPDATE applications SET status = 'UNDER_REVIEW' WHERE id = $1", [
            changed.applicationId,
          ]),
        ),
      }),
    ).toEqual({ ok: false, code: "STATE_CHANGED" });
    const deleting = await seed();
    expect(
      await upload(staff(), deleting.requirementId, pdf, {
        storage: duringPut(() =>
          owner.query(
            "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $1 WHERE id = $2",
            [admin, deleting.applicationId],
          ),
        ),
      }),
    ).toEqual({ ok: false, code: "STATE_CHANGED" });
    expect((await filesOf(deleting.requirementId)).map((f) => f.status)).toEqual(["REJECTED"]);
  });

  // ------------------------------------------------------------ eşzamanlılık + kota

  const slowStorage = (ms: number): StorageAdapter => ({
    ...storage,
    putObject: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return storage.putObject(input);
    },
  });
  const fastValidate = async () => ({ ok: true as const, pageCount: 1 });

  it("aynı evrağa paralel yüklemeler (müşteri + iki personel): tek ACTIVE, versiyon çakışması yok", async () => {
    const app = await seed();
    const { version: v } = await version(app.requirementId);
    const actors = [app.customer, staff(admin), staff(employee), app.customer];
    const results = await Promise.all(
      actors.map((actor) =>
        uploadDocumentFile(deps({ storage: slowStorage(150), validatePdf: fastValidate }), actor, {
          requirementId: app.requirementId,
          expectedVersion: v,
          filename: "a.pdf",
          bytes: pdf,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results.filter((x) => !x.ok))
      expect(["UPLOAD_IN_PROGRESS", "CONFLICT"]).toContain((r as { code: string }).code);
    const files = await filesOf(app.requirementId);
    expect(files.filter((f) => f.status === "ACTIVE")).toHaveLength(1);
    expect(files.filter((f) => f.status === "ACTIVE")[0]!.version_number).toBe(1);
  });

  it("farklı evraklara paralel yüklemeler başarılı; karışık yükte kilitlenme (deadlock) yok", async () => {
    const apps = [await seed(), await seed(), await seed()];
    const jobs = apps.flatMap((app) => [
      { actor: app.customer, requirementId: app.requirementId },
      { actor: staff(), requirementId: app.otherRequirementId },
    ]);
    const results = await Promise.all(
      jobs.map(async (job) => {
        const { version: v } = await version(job.requirementId);
        return uploadDocumentFile(
          deps({ storage: slowStorage(50), validatePdf: fastValidate }),
          job.actor,
          {
            requirementId: job.requirementId,
            expectedVersion: v,
            filename: "a.pdf",
            bytes: pdf,
          },
        );
      }),
    );
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("kota sınırına yakın eşzamanlı yüklemeler: yalnızca sığan kadar kabul edilir (atomik rezervasyon)", async () => {
    const apps = [await seed(), await seed(), await seed()];
    const usage = await owner.query<{ total: string }>(
      "SELECT coalesce(sum(size_bytes),0)::text AS total FROM application_document_files WHERE blob_deleted_at IS NULL",
    );
    const total = Number(usage.rows[0]!.total);
    const quota = { maxTotalBytes: total + pdf.length * 2, warningBytes: total + 1 };
    const results = await Promise.all(
      apps.map(async (app) => {
        const { version: v } = await version(app.requirementId);
        return uploadDocumentFile(
          deps({ quota, storage: slowStorage(100), validatePdf: fastValidate }),
          staff(),
          {
            requirementId: app.requirementId,
            expectedVersion: v,
            filename: "a.pdf",
            bytes: pdf,
          },
        );
      }),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: "QUOTA_EXCEEDED" }]);
  });

  it("kota: önceki versiyonlar, devam eden rezervasyon ve kayıt dışı kullanım dahil", async () => {
    const app = await seed();
    await upload(staff(), app.requirementId);
    await upload(staff(), app.requirementId); // v1 SUPERSEDED kotada kalır
    const usage = await owner.query<{ total: string }>(
      "SELECT coalesce(sum(size_bytes),0)::text AS total FROM application_document_files WHERE blob_deleted_at IS NULL",
    );
    const total = Number(usage.rows[0]!.total);
    const other = await seed();
    const { version: v } = await version(other.requirementId);
    const exact = { maxTotalBytes: total + pdf.length, warningBytes: 1 };
    // Tam sınır: kabul (toplam = üst sınır).
    expect(
      await precheckUpload({ db, quota: exact }, staff(), {
        requirementId: other.requirementId,
        expectedVersion: v,
        sizeBytes: pdf.length,
      }),
    ).toBeNull();
    // Kayıt dışı 1 bayt → reddedilir (bilinmeyen kullanım yok sayılmaz).
    await owner.query("UPDATE storage_quota_state SET untracked_bytes = 1 WHERE id = 1");
    expect(
      await precheckUpload({ db, quota: exact }, staff(), {
        requirementId: other.requirementId,
        expectedVersion: v,
        sizeBytes: pdf.length,
      }),
    ).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    await owner.query("UPDATE storage_quota_state SET untracked_bytes = 0 WHERE id = 1");
  });

  // ------------------------------------------------------------ görüntüleme

  it("dosya erişimi: müşteri yalnızca kendi ACTIVE dosyası; personel geçmiş; audit yazılır", async () => {
    const a = await seed();
    const b = await seed();
    const first = await upload(a.customer, a.requirementId);
    const second = await upload(a.customer, a.requirementId, fixtures.openActionDestination());
    const other = await upload(b.customer, b.requirementId);
    if (!first.ok || !second.ok || !other.ok) throw new Error("upload");
    const open = (actor: FileActor, id: string, d: "inline" | "attachment" = "inline") =>
      openDocumentFile({ db, storage: async () => storage }, actor, id, d);

    const active = await open(a.customer, second.fileId);
    expect(active.ok).toBe(true);
    if (active.ok)
      expect(
        Buffer.from(await new Response(active.file.stream).arrayBuffer())
          .subarray(0, 5)
          .toString(),
      ).toBe("%PDF-");
    expect(await open(a.customer, first.fileId)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await open(a.customer, other.fileId)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await open(a.customer, randomUUID())).toEqual({ ok: false, code: "NOT_FOUND" });
    const history = await open(staff(employee), first.fileId, "attachment");
    expect(history.ok).toBe(true);
    if (history.ok) await history.file.stream.cancel();
    const audit = await auditActions(a.applicationId);
    expect(audit.map((x) => x.action)).toEqual(
      expect.arrayContaining(["DOCUMENT_VIEWED", "DOCUMENT_DOWNLOADED"]),
    );

    // İptal edilen token → müşteri erişimi yok.
    await owner.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'REVOKED', revoked_by_user_id = $1 WHERE id = $2",
      [admin, a.tokenId],
    );
    expect(await open(a.customer, second.fileId)).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("storage bütünlük uyuşmazlığı → dosya sunulmaz (INTEGRITY)", async () => {
    const app = await seed();
    const result = await upload(staff(), app.requirementId);
    if (!result.ok) throw new Error("upload");
    const [file] = await filesOf(app.requirementId);
    const dir = join(root, ...file!.blob_pathname.split("/"));
    const [versionFile] = await readdir(dir);
    await writeFile(
      join(dir, versionFile!),
      Buffer.concat([await readFile(join(dir, versionFile!)), Buffer.from("x")]),
    );
    expect(
      await openDocumentFile(
        { db, storage: async () => storage },
        staff(),
        result.fileId,
        "inline",
      ),
    ).toEqual({ ok: false, code: "INTEGRITY" });
  });

  // ------------------------------------------------------------ bakım

  it("temizlik: yinelenen fiziksel versiyon silinir, kayıtlı versiyon ve sahipsiz nesne korunur; mutabakat raporlar", async () => {
    const app = await seed();
    const result = await upload(staff(), app.requirementId);
    if (!result.ok) throw new Error("upload");
    const [file] = await filesOf(app.requirementId);
    // Yeniden deneme simülasyonu: aynı anahtara ikinci fiziksel versiyon.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const md5Hex = createHash("md5").update(pdf).digest("hex");
    await storage.putObject({
      key: file!.blob_pathname,
      body: pdf,
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      md5Hex,
    });
    // Sahipsiz nesne (DB'de kaydı yok).
    const orphanKey = `applications/${randomUUID()}/${randomUUID()}/${randomUUID()}.pdf`;
    await storage.putObject({
      key: orphanKey,
      body: pdf,
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      md5Hex,
    });

    const dry = await reconcileStorage(owner, storage, { apply: false });
    expect(dry.duplicateVersions).toBeGreaterThanOrEqual(1);
    expect(dry.orphanKeys).toBeGreaterThanOrEqual(1);
    expect(dry.untrackedBytes).toBeGreaterThanOrEqual(pdf.length * 2);
    expect(dry.applied).toBe(false);

    const plan = await cleanupStorage(owner, storage, { apply: false });
    expect(plan.applied).toBe(false);
    expect((await storage.listObjectVersions(file!.blob_pathname, 2)).versions).toHaveLength(2);

    const cleaned = await cleanupStorage(owner, storage, { apply: true });
    expect(cleaned.duplicateVersionsDeleted).toBeGreaterThanOrEqual(1);
    const remaining = await storage.listObjectVersions(file!.blob_pathname, 2);
    expect(remaining.versions.map((v) => v.versionId)).toEqual([file!.storage_version_id]);
    expect((await storage.listObjectVersions(orphanKey, 2)).versions).toHaveLength(1);

    const applied = await reconcileStorage(owner, storage, { apply: true });
    expect(applied.applied).toBe(true);
    const state = await owner.query<{ untracked_bytes: string; reconciled_at: Date | null }>(
      "SELECT untracked_bytes::text, reconciled_at FROM storage_quota_state WHERE id = 1",
    );
    expect(Number(state.rows[0]!.untracked_bytes)).toBe(applied.untrackedBytes);
    expect(state.rows[0]!.reconciled_at).not.toBeNull();
    await owner.query("UPDATE storage_quota_state SET untracked_bytes = 0 WHERE id = 1");
  });

  it("süresi dolmuş yarım yükleme EXPIRED yapılır ve nesnesi silinir", async () => {
    const app = await seed();
    const fileId = randomUUID();
    const key = `applications/${app.applicationId}/${app.requirementId}/${fileId}.pdf`;
    await storage.putObject({
      key,
      body: pdf,
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      md5Hex: createHash("md5").update(pdf).digest("hex"),
    });
    await owner.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname, original_filename, size_bytes, sha256,
         uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, 'UPLOAD_PENDING', $4, 'a.pdf', $5, $6, 'USER', $7, now() - interval '1 minute')`,
      [fileId, app.applicationId, app.requirementId, key, pdf.length, "b".repeat(64), admin],
    );
    const report = await cleanupStorage(owner, storage, { apply: true });
    expect(report.stalePendingExpired).toBeGreaterThanOrEqual(1);
    const [row] = await filesOf(app.requirementId);
    expect(row).toMatchObject({ status: "EXPIRED" });
    expect(row!.blob_deleted_at).not.toBeNull();
    expect((await storage.listObjectVersions(key, 2)).versions).toHaveLength(0);
  });
});
