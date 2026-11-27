import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCustomerPortalView } from "@/features/customer-portal/queries";
import { openDocumentFile, uploadDocumentFile, type FileActor } from "@/features/documents/service";
import * as workflow from "@/features/workflow/service";
import * as schema from "@/server/db/schema";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import type { StorageAdapter } from "@/server/storage/types";

import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { fileGet, connectOwner, createRuntimePool, testId } from "./helpers";

/**
 * Başvuru ve evrak iş akışı (PHASE 09). Commit eden testler → YALNIZCA izole veritabanı + geçici yerel
 * depolama. Sentetik veri; gerçek hesap/müşteri yok.
 */
describe.runIf(isIsolatedTestDatabase())(`iş akışı — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(12);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let root: string;
  let storage: StorageAdapter;
  let admin: string;
  let employee: string;
  const createdUsers: string[] = [];
  const pdf = fixtures.valid();

  beforeAll(async () => {
    owner = await connectOwner();
    root = await mkdtemp(join(tmpdir(), "cs-workflow-test-"));
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
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  const staffActor = (userId = admin): FileActor => ({ kind: "STAFF", userId });

  async function seed(options: { optional?: boolean; status?: "AWAITING_DOCUMENTS" } = {}) {
    const app = await seedApplication(owner, admin, {
      status: options.status ?? "AWAITING_DOCUMENTS",
      documents: [
        { title: "Pasaport" },
        { title: "Banka Dökümü" },
        ...(options.optional ? [{ title: "Ek Belge", required: false }] : []),
      ],
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

  const appState = async (id: string) =>
    (
      await owner.query<{ status: string; version: number }>(
        "SELECT status, version FROM applications WHERE id = $1",
        [id],
      )
    ).rows[0]!;
  const docStates = async (id: string) =>
    (
      await owner.query<{ status: string }>(
        "SELECT status FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [id],
      )
    ).rows.map((r) => r.status);
  const reqVersion = async (id: string) =>
    (
      await owner.query<{ version: number }>(
        "SELECT version FROM application_document_requirements WHERE id = $1",
        [id],
      )
    ).rows[0]!.version;
  const activeFile = async (requirementId: string) =>
    (
      await owner.query<{ id: string }>(
        "SELECT id FROM application_document_files WHERE requirement_id = $1 AND status = 'ACTIVE'",
        [requirementId],
      )
    ).rows[0]?.id;
  const historyCount = async (id: string) =>
    Number(
      (
        await owner.query<{ n: string }>(
          "SELECT count(*) AS n FROM application_status_history WHERE application_id = $1",
          [id],
        )
      ).rows[0]!.n,
    );

  async function upload(actor: FileActor, requirementId: string) {
    const result = await uploadDocumentFile(
      {
        db,
        storage,
        quota: { maxTotalBytes: 9e9, warningBytes: 8e9 },
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
    if (!result.ok) throw new Error(`upload ${result.code}`);
    return result.fileId;
  }

  async function review(
    requirementId: string,
    decision: "APPROVED" | "REVISION_REQUIRED",
    userId = admin,
  ) {
    return workflow.reviewDocument(
      db,
      { userId },
      {
        requirementId,
        fileId: (await activeFile(requirementId))!,
        expectedVersion: await reqVersion(requirementId),
        decision,
        customerMessage:
          decision === "REVISION_REQUIRED"
            ? "Sayfa okunaklı değil, lütfen yeniden yükleyiniz."
            : null,
      },
    );
  }

  async function transition(
    id: string,
    code: workflow.StaffTransitionCode,
    reason: string | null = null,
    userId = admin,
  ) {
    return workflow.transitionApplication(
      db,
      { userId },
      {
        applicationId: id,
        expectedVersion: (await appState(id)).version,
        code,
        reason,
      },
    );
  }

  async function submit(actor: FileActor, id: string) {
    return workflow.submitApplication(db, actor, {
      applicationId: id,
      expectedVersion: (await appState(id)).version,
    });
  }

  // ------------------------------------------------------------------ ana akış

  it("ana akış: gönderim → karar → düzeltme → yeniden gönderim → onay → işlem → tamamla → yeniden aç → iptal → iptal öncesine dön", async () => {
    const app = await seed({ optional: true });
    const [passport, bank] = app.reqIds as [string, string, string];
    expect(await submit(app.customer, app.applicationId)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    await upload(app.customer, passport);
    await upload(staffActor(), bank); // müşteri adına
    // T1 müşteri: UPLOADED → PENDING_REVIEW; isteğe bağlı eksik engellemez.
    const submitted = await submit(app.customer, app.applicationId);
    expect(submitted).toMatchObject({ ok: true, data: { status: "UNDER_REVIEW" } });
    expect(await docStates(app.applicationId)).toEqual([
      "PENDING_REVIEW",
      "PENDING_REVIEW",
      "NOT_UPLOADED",
    ]);
    const firstHistory = await owner.query(
      "SELECT transition_code, actor_type, actor_access_token_id, on_behalf_of_customer FROM application_status_history WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1",
      [app.applicationId],
    );
    expect(firstHistory.rows[0]).toMatchObject({
      transition_code: "SUBMIT",
      actor_type: "CUSTOMER",
      actor_access_token_id: app.tokenId,
      on_behalf_of_customer: false,
    });
    // BR-53: ikinci gönderim yan etkisiz.
    const before = await historyCount(app.applicationId);
    expect(await submit(app.customer, app.applicationId)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    expect(await historyCount(app.applicationId)).toBe(before);
    // İnceleme sırasında müşteri yükleyemez / kaldıramaz.
    await expect(upload(app.customer, passport)).rejects.toThrow("NOT_ALLOWED");

    // Kararlar (D4, D5) — başvuru statüsü değişmez (BR-61).
    expect(await review(passport, "APPROVED")).toMatchObject({
      ok: true,
      data: { status: "APPROVED" },
    });
    expect(await review(bank, "REVISION_REQUIRED", employee)).toMatchObject({
      ok: true,
      data: { status: "REVISION_REQUIRED" },
    });
    expect((await appState(app.applicationId)).status).toBe("UNDER_REVIEW");
    // T3 engelli (düzeltme var); T2 (BR-59) izinli.
    expect(await transition(app.applicationId, "APPROVE_DOCUMENTS")).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    expect(await transition(app.applicationId, "REQUEST_REVISION", null, employee)).toMatchObject({
      ok: true,
      data: { status: "REVISION_REQUIRED" },
    });

    // Müşteri düzeltme açıklamasını görür; onaylı evrakı değiştiremez; düzeltme beklerken yeniden gönderemez.
    const view = await getCustomerPortalView(db, {
      applicationId: app.applicationId,
      tokenId: app.tokenId,
    });
    expect(view!.documents[1]).toMatchObject({
      status: "REVISION_REQUIRED",
      revisionMessage: "Sayfa okunaklı değil, lütfen yeniden yükleyiniz.",
    });
    await expect(upload(app.customer, passport)).rejects.toThrow("NOT_ALLOWED");
    expect(await submit(app.customer, app.applicationId)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    await upload(app.customer, bank); // D7 → UPLOADED
    expect(await docStates(app.applicationId)).toEqual(["APPROVED", "UPLOADED", "NOT_UPLOADED"]);
    expect(await submit(app.customer, app.applicationId)).toMatchObject({ ok: true }); // T4
    expect(await docStates(app.applicationId)).toEqual([
      "APPROVED",
      "PENDING_REVIEW",
      "NOT_UPLOADED",
    ]);

    expect(await review(bank, "APPROVED")).toMatchObject({ ok: true });
    expect(await transition(app.applicationId, "APPROVE_DOCUMENTS")).toMatchObject({
      ok: true,
      data: { status: "DOCUMENTS_APPROVED" },
    });
    expect(await transition(app.applicationId, "START_PROCESSING", null, employee)).toMatchObject({
      ok: true,
      data: { status: "IN_PROCESS" },
    });
    expect(await transition(app.applicationId, "COMPLETE")).toMatchObject({
      ok: true,
      data: { status: "COMPLETED" },
    });
    // T9 gerekçesiz reddedilir; gerekçeli kabul.
    expect(await transition(app.applicationId, "REOPEN_COMPLETED", "  ")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(
      await transition(app.applicationId, "REOPEN_COMPLETED", "Ek işlem gerekti", employee),
    ).toMatchObject({ ok: true, data: { status: "IN_PROCESS" } });
    // T7 iptal → T8 iptal öncesi statüye (IN_PROCESS).
    expect(await transition(app.applicationId, "CANCEL", "Müşteri vazgeçti")).toMatchObject({
      ok: true,
      data: { status: "CANCELLED" },
    });
    expect(
      await transition(app.applicationId, "REOPEN_CANCELLED", "Müşteri devam etmek istedi"),
    ).toMatchObject({ ok: true, data: { status: "IN_PROCESS" } });
    // Matriste olmayan geçiş reddedilir.
    expect(await transition(app.applicationId, "REQUEST_REVISION")).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });

    // Token iptal/tamamlama nedeniyle otomatik iptal edilmedi; dosyalar ve kararlar korunur.
    const token = await owner.query(
      "SELECT revoked_at FROM application_access_tokens WHERE id = $1",
      [app.tokenId],
    );
    expect(token.rows[0].revoked_at).toBeNull();
    const reviewsCount = await owner.query(
      "SELECT count(*)::int AS n FROM document_reviews WHERE application_id = $1",
      [app.applicationId],
    );
    expect(reviewsCount.rows[0].n).toBe(3);
    const hist = await owner.query<{ transition_code: string; reason: string | null }>(
      "SELECT transition_code, reason FROM application_status_history WHERE application_id = $1 ORDER BY created_at, id",
      [app.applicationId],
    );
    expect(hist.rows.map((r) => r.transition_code).filter((code) => code !== "CREATE")).toEqual([
      "SUBMIT",
      "REQUEST_REVISION",
      "RESUBMIT",
      "APPROVE_DOCUMENTS",
      "START_PROCESSING",
      "COMPLETE",
      "REOPEN_COMPLETED",
      "CANCEL",
      "REOPEN_CANCELLED",
    ]);
    expect(hist.rows.find((r) => r.transition_code === "CANCEL")!.reason).toBe("Müşteri vazgeçti");
    // Audit: yorum/gerekçe metni, token yok.
    const audit = await owner.query(
      "SELECT action, metadata FROM audit_logs WHERE application_id = $1",
      [app.applicationId],
    );
    const serialized = JSON.stringify(audit.rows);
    expect(serialized).not.toMatch(/vazgeçti|okunaklı/);
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        "APPLICATION_SUBMITTED",
        "APPLICATION_RESUBMITTED",
        "DOCUMENT_APPROVED",
        "DOCUMENT_REVISION_REQUESTED",
        "APPLICATION_STATUS_CHANGED",
      ]),
    );
    // Müşteri zaman çizelgesi: yalnızca statü + tarih.
    const after = await getCustomerPortalView(db, {
      applicationId: app.applicationId,
      tokenId: app.tokenId,
    });
    expect(JSON.stringify(after!.timeline)).not.toMatch(/vazgeçti|USER|CUSTOMER/);
    expect(after!.timeline.at(-1)!.status).toBe("IN_PROCESS");
  });

  it("personel müşteri adına gönderir (on_behalf_of_customer); eksik evrakı atlayamaz", async () => {
    const app = await seed();
    expect(await submit(staffActor(employee), app.applicationId)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    for (const id of app.reqIds) await upload(staffActor(), id);
    expect(await submit(staffActor(employee), app.applicationId)).toMatchObject({ ok: true });
    const row = await owner.query(
      "SELECT actor_type, actor_user_id, on_behalf_of_customer FROM application_status_history WHERE application_id = $1 AND transition_code = 'SUBMIT'",
      [app.applicationId],
    );
    expect(row.rows[0]).toMatchObject({
      actor_type: "USER",
      actor_user_id: employee,
      on_behalf_of_customer: true,
    });
  });

  it("devam eden yükleme gönderimi engeller; süresi dolmuş bekleyen kayıt engellemez", async () => {
    const app = await seed();
    for (const id of app.reqIds) await upload(app.customer, id);
    const fileId = randomUUID();
    const [req] = app.reqIds;
    await owner.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname, original_filename, size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, 'UPLOAD_PENDING', $4, 'a.pdf', 10, $5, 'USER', $6, now() + interval '10 minutes')`,
      [
        fileId,
        app.applicationId,
        req,
        `applications/${app.applicationId}/${req}/${fileId}.pdf`,
        "c".repeat(64),
        admin,
      ],
    );
    expect(await submit(app.customer, app.applicationId)).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
    await owner.query(
      "UPDATE application_document_files SET upload_expires_at = now() - interval '1 minute' WHERE id = $1",
      [fileId],
    );
    expect(await submit(app.customer, app.applicationId)).toMatchObject({ ok: true });
  });

  it("eski versiyona karar verilemez (BR-57); yeni dosya onayı devralmaz (BR-48) ve eski karar korunur", async () => {
    const app = await seed();
    const [passport] = app.reqIds as [string, string];
    for (const id of app.reqIds) await upload(app.customer, id);
    await submit(app.customer, app.applicationId);
    const v1 = (await activeFile(passport))!;
    const v1Version = await reqVersion(passport);
    expect(await review(passport, "APPROVED")).toMatchObject({ ok: true });
    await upload(staffActor(employee), passport); // v2 (UNDER_REVIEW → PENDING_REVIEW, onay geçersiz)
    expect((await docStates(app.applicationId))[0]).toBe("PENDING_REVIEW");
    const stale = await workflow.reviewDocument(
      db,
      { userId: admin },
      {
        requirementId: passport,
        fileId: v1,
        expectedVersion: v1Version,
        decision: "APPROVED",
        customerMessage: null,
      },
    );
    expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const reviewsRows = await owner.query(
      "SELECT decision, file_id FROM document_reviews WHERE requirement_id = $1",
      [passport],
    );
    expect(reviewsRows.rows).toEqual([{ decision: "APPROVED", file_id: v1 }]);
    const audit = await owner.query(
      "SELECT 1 FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_APPROVAL_INVALIDATED'",
      [app.applicationId],
    );
    expect(audit.rowCount).toBe(1);
  });

  // ------------------------------------------------------------------ eşzamanlılık

  it("eşzamanlı: iki onay / onay+düzeltme / iki gönderim / iki yeniden açma — tek etkili sonuç, mükerrer geçmiş yok", async () => {
    const app = await seed();
    const [passport, bank] = app.reqIds as [string, string];
    for (const id of app.reqIds) await upload(app.customer, id);
    const subs = await Promise.all([
      submit(app.customer, app.applicationId),
      submit(staffActor(), app.applicationId),
    ]);
    expect(subs.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await owner
        .query(
          "SELECT 1 FROM application_status_history WHERE application_id = $1 AND transition_code = 'SUBMIT'",
          [app.applicationId],
        )
        .then((r) => r.rowCount),
    ).toBe(1);

    const fileP = (await activeFile(passport))!;
    const vP = await reqVersion(passport);
    const both = await Promise.all(
      [admin, employee].map((userId) =>
        workflow.reviewDocument(
          db,
          { userId },
          {
            requirementId: passport,
            fileId: fileP,
            expectedVersion: vP,
            decision: "APPROVED",
            customerMessage: null,
          },
        ),
      ),
    );
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    const fileB = (await activeFile(bank))!;
    const vB = await reqVersion(bank);
    const mixed = await Promise.all([
      workflow.reviewDocument(
        db,
        { userId: admin },
        {
          requirementId: bank,
          fileId: fileB,
          expectedVersion: vB,
          decision: "APPROVED",
          customerMessage: null,
        },
      ),
      workflow.reviewDocument(
        db,
        { userId: employee },
        {
          requirementId: bank,
          fileId: fileB,
          expectedVersion: vB,
          decision: "REVISION_REQUIRED",
          customerMessage: "Lütfen güncel dökümü yükleyiniz.",
        },
      ),
    ]);
    expect(mixed.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await owner
        .query("SELECT count(*)::int AS n FROM document_reviews WHERE application_id = $1", [
          app.applicationId,
        ])
        .then((r) => r.rows[0].n),
    ).toBe(2);

    // İptal ve yeniden açma yarışları.
    const cancelled = await transition(app.applicationId, "CANCEL", "Test iptali");
    expect(cancelled.ok).toBe(true);
    const version = (await appState(app.applicationId)).version;
    const reopen = await Promise.all(
      [admin, employee].map((userId) =>
        workflow.transitionApplication(
          db,
          { userId },
          {
            applicationId: app.applicationId,
            expectedVersion: version,
            code: "REOPEN_CANCELLED",
            reason: "Yeniden açıldı",
          },
        ),
      ),
    );
    expect(reopen.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await owner
        .query(
          "SELECT 1 FROM application_status_history WHERE application_id = $1 AND transition_code = 'REOPEN_CANCELLED'",
          [app.applicationId],
        )
        .then((r) => r.rowCount),
    ).toBe(1);
  });

  it("eşzamanlı: karar ↔ iptal; gönderim ↔ bağlantı iptali — tutarlı sonuç", async () => {
    const app = await seed();
    const [passport] = app.reqIds as [string, string];
    for (const id of app.reqIds) await upload(app.customer, id);
    await submit(app.customer, app.applicationId);
    const fileP = (await activeFile(passport))!;
    const vP = await reqVersion(passport);
    const version = (await appState(app.applicationId)).version;
    const [approve, cancel] = await Promise.all([
      workflow.reviewDocument(
        db,
        { userId: admin },
        {
          requirementId: passport,
          fileId: fileP,
          expectedVersion: vP,
          decision: "APPROVED",
          customerMessage: null,
        },
      ),
      workflow.transitionApplication(
        db,
        { userId: employee },
        {
          applicationId: app.applicationId,
          expectedVersion: version,
          code: "CANCEL",
          reason: "Yarış testi",
        },
      ),
    ]);
    expect(cancel.ok).toBe(true);
    const doc = (await docStates(app.applicationId))[0];
    // Karar ya iptalden önce işlendi ya da iptal sonrası reddedildi — iptal edilmiş başvuruda yeni karar yok.
    expect(approve.ok ? doc === "APPROVED" : doc === "PENDING_REVIEW").toBe(true);

    const other = await seed();
    for (const id of other.reqIds) await upload(other.customer, id);
    const otherVersion = (await appState(other.applicationId)).version;
    const [submitted] = await Promise.all([
      workflow.submitApplication(db, other.customer, {
        applicationId: other.applicationId,
        expectedVersion: otherVersion,
      }),
      owner.query(
        "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'REVOKED', revoked_by_user_id = $1 WHERE id = $2",
        [admin, other.tokenId],
      ),
    ]);
    const state = await appState(other.applicationId);
    expect(
      submitted.ok ? state.status === "UNDER_REVIEW" : state.status === "AWAITING_DOCUMENTS",
    ).toBe(true);
    // İptal commit edildikten sonra eski oturumla mutasyon başarısız.
    if (!submitted.ok) expect(submitted).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    const again = await seed();
    await owner.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $1 WHERE id = $2",
      [admin, again.tokenId],
    );
    expect(await submit(again.customer, again.applicationId)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("müşteri başka başvuruda işlem yapamaz; süresi dolmuş oturum reddedilir", async () => {
    const a = await seed();
    const b = await seed();
    expect(
      await workflow.submitApplication(db, a.customer, {
        applicationId: b.applicationId,
        expectedVersion: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const fileB = await upload(b.customer, b.reqIds[0]!);
    expect(
      await workflow.removeDocumentFile(db, a.customer, {
        fileId: fileB,
        expectedVersion: await reqVersion(b.reqIds[0]!),
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const expired = {
      ...a.customer,
      sessionExpiresAt: Math.floor(Date.now() / 1000) - 5,
    } as FileActor;
    expect(await submit(expired, a.applicationId)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  // ------------------------------------------------------------------ kaldırma, yorum, T12, geri alma

  it("dosya kaldırma (D2/D8): REMOVED, geçmişte kalır, kotadan düşmez; müşteri erişemez, personel erişir; incelemede yasak", async () => {
    const app = await seed({ optional: true });
    const [passport, bank, optional] = app.reqIds as [string, string, string];
    const file = await upload(app.customer, passport);
    const removed = await workflow.removeDocumentFile(db, app.customer, {
      fileId: file,
      expectedVersion: await reqVersion(passport),
    });
    expect(removed).toMatchObject({ ok: true, data: { status: "NOT_UPLOADED" } });
    const row = await owner.query(
      "SELECT status, blob_deleted_at FROM application_document_files WHERE id = $1",
      [file],
    );
    expect(row.rows[0]).toMatchObject({ status: "REMOVED", blob_deleted_at: null });
    expect(
      await openDocumentFile(
        { db, storage: async () => storage },
        app.customer,
        fileGet(file, "inline"),
      ),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    const staffOpen = await openDocumentFile(
      { db, storage: async () => storage },
      staffActor(),
      fileGet(file, "attachment"),
    );
    expect(staffOpen.ok).toBe(true);
    if (staffOpen.ok) await staffOpen.file.stream?.cancel();
    expect(
      await owner
        .query(
          "SELECT 1 FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_DELETED'",
          [app.applicationId],
        )
        .then((r) => r.rowCount),
    ).toBe(1);

    // İncelemede kaldırma yok (personel dahil); düzeltmede zorunlu evrak REVISION_REQUIRED'da kalır, isteğe bağlı NOT_UPLOADED olur.
    await upload(app.customer, passport);
    await upload(app.customer, bank);
    await upload(app.customer, optional);
    await submit(app.customer, app.applicationId);
    const bankFile = (await activeFile(bank))!;
    expect(
      await workflow.removeDocumentFile(db, staffActor(), {
        fileId: bankFile,
        expectedVersion: await reqVersion(bank),
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    await review(passport, "APPROVED");
    await review(bank, "REVISION_REQUIRED");
    await review(optional, "REVISION_REQUIRED");
    await transition(app.applicationId, "REQUEST_REVISION");
    expect(
      await workflow.removeDocumentFile(db, app.customer, {
        fileId: (await activeFile(passport))!,
        expectedVersion: await reqVersion(passport),
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(
      await workflow.removeDocumentFile(db, app.customer, {
        fileId: bankFile,
        expectedVersion: await reqVersion(bank),
      }),
    ).toMatchObject({ ok: true, data: { status: "REVISION_REQUIRED" } });
    expect(
      await workflow.removeDocumentFile(db, staffActor(), {
        fileId: (await activeFile(optional))!,
        expectedVersion: await reqVersion(optional),
      }),
    ).toMatchObject({ ok: true, data: { status: "NOT_UPLOADED" } });
  });

  it("müşteriye görünür yorum: personel ekler, müşteri görür, audit'te metin yok; başka başvuruya sızmaz", async () => {
    const a = await seed();
    const b = await seed();
    const result = await workflow.addCustomerComment(
      db,
      { userId: employee },
      {
        applicationId: a.applicationId,
        requirementId: a.reqIds[0]!,
        body: "Evraklarınız tarafımıza ulaştı.\nİnceleme sürüyor.",
        idempotencyKey: randomUUID(),
      },
    );
    expect(result.ok).toBe(true);
    expect(
      await workflow.addCustomerComment(
        db,
        { userId: admin },
        {
          applicationId: a.applicationId,
          requirementId: b.reqIds[0]!,
          body: "x",
          idempotencyKey: randomUUID(),
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const viewA = await getCustomerPortalView(db, {
      applicationId: a.applicationId,
      tokenId: a.tokenId,
    });
    expect(viewA!.comments).toEqual([
      expect.objectContaining({
        body: "Evraklarınız tarafımıza ulaştı.\nİnceleme sürüyor.",
        documentTitle: "Pasaport",
      }),
    ]);
    expect(JSON.stringify(viewA!.comments)).not.toContain(employee);
    const viewB = await getCustomerPortalView(db, {
      applicationId: b.applicationId,
      tokenId: b.tokenId,
    });
    expect(viewB!.comments).toEqual([]);
    const audit = await owner.query(
      "SELECT metadata FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_COMMENT_ADDED'",
      [a.applicationId],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("ulaştı");
    expect((await appState(a.applicationId)).status).toBe("AWAITING_DOCUMENTS");
  });

  it("T12: seçilen onaylı evraklar düzeltmeye; diğer onaylar korunur; T10/T11 gerekçeli", async () => {
    const app = await seed();
    const [passport, bank] = app.reqIds as [string, string];
    for (const id of app.reqIds) await upload(app.customer, id);
    await submit(app.customer, app.applicationId);
    await review(passport, "APPROVED");
    await review(bank, "APPROVED");
    await transition(app.applicationId, "APPROVE_DOCUMENTS");
    await transition(app.applicationId, "START_PROCESSING");
    expect(
      await transition(app.applicationId, "REVERT_TO_DOCUMENTS_APPROVED", "Eksik bilgi"),
    ).toMatchObject({ ok: true, data: { status: "DOCUMENTS_APPROVED" } });
    expect(
      await transition(app.applicationId, "REVERT_TO_REVIEW", "Tekrar bakılacak"),
    ).toMatchObject({ ok: true, data: { status: "UNDER_REVIEW" } });
    await transition(app.applicationId, "APPROVE_DOCUMENTS");
    const result = await workflow.revertForRevision(
      db,
      { userId: employee },
      {
        applicationId: app.applicationId,
        expectedVersion: (await appState(app.applicationId)).version,
        reason: "Banka dökümü güncel değil",
        documents: [
          {
            requirementId: bank,
            fileId: (await activeFile(bank))!,
            customerMessage: "Son üç aya ait güncel dökümü yükleyiniz.",
          },
        ],
      },
    );
    expect(result).toMatchObject({ ok: true, data: { status: "REVISION_REQUIRED" } });
    expect(await docStates(app.applicationId)).toEqual(["APPROVED", "REVISION_REQUIRED"]);
    const view = await getCustomerPortalView(db, {
      applicationId: app.applicationId,
      tokenId: app.tokenId,
    });
    expect(view!.documents[1]!.revisionMessage).toBe("Son üç aya ait güncel dökümü yükleyiniz.");
  });

  it("iptal devam eden yüklemeleri EXPIRED yapar; evrak statüleri ve dosyalar değişmez", async () => {
    const app = await seed();
    const [req] = app.reqIds;
    await upload(app.customer, req!);
    const fileId = randomUUID();
    await owner.query(
      `INSERT INTO application_document_files (id, application_id, requirement_id, status, blob_pathname, original_filename, size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at)
       VALUES ($1, $2, $3, 'UPLOAD_PENDING', $4, 'a.pdf', 10, $5, 'USER', $6, now() + interval '10 minutes')`,
      [
        fileId,
        app.applicationId,
        app.reqIds[1],
        `applications/${app.applicationId}/${app.reqIds[1]}/${fileId}.pdf`,
        "d".repeat(64),
        admin,
      ],
    );
    const docsBefore = await docStates(app.applicationId);
    expect(await transition(app.applicationId, "CANCEL", "İptal")).toMatchObject({ ok: true });
    expect(await docStates(app.applicationId)).toEqual(docsBefore);
    const pending = await owner.query(
      "SELECT status FROM application_document_files WHERE id = $1",
      [fileId],
    );
    expect(pending.rows[0].status).toBe("EXPIRED");
    expect(await activeFile(req!)).toBeDefined();
  });

  it("geçmiş/audit yazılamazsa (işlem içi hata) tüm mutasyon geri alınır", async () => {
    const app = await seed();
    for (const id of app.reqIds) await upload(app.customer, id);
    await owner.query("UPDATE applications SET version = 2147483647 WHERE id = $1", [
      app.applicationId,
    ]);
    const result = await workflow.submitApplication(db, app.customer, {
      applicationId: app.applicationId,
      expectedVersion: 2147483647,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect((await appState(app.applicationId)).status).toBe("AWAITING_DOCUMENTS");
    expect(await docStates(app.applicationId)).toEqual(["UPLOADED", "UPLOADED"]);
    expect(
      await owner
        .query(
          "SELECT 1 FROM application_status_history WHERE application_id = $1 AND transition_code = 'SUBMIT'",
          [app.applicationId],
        )
        .then((r) => r.rowCount),
    ).toBe(0);
  });

  it("silme sürecindeki başvuruda iş akışı mutasyonu yok", async () => {
    const app = await seed();
    await owner.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $1 WHERE id = $2",
      [admin, app.applicationId],
    );
    expect(await transition(app.applicationId, "CANCEL", "x")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
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
  });
});
