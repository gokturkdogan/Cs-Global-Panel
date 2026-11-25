import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as applications from "@/features/applications/service";
import { uploadDocumentFile, type FileActor } from "@/features/documents/service";
import * as workflow from "@/features/workflow/service";
import * as schema from "@/server/db/schema";
import { parseAccessTokenEnv } from "@/server/env";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { readStorageUsage } from "@/server/storage/quota";
import type { StorageAdapter } from "@/server/storage/types";

import { fixtures } from "../support/pdf-fixtures";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, createRuntimePool, testId } from "./helpers";

/**
 * PHASE 09.1 — iş akışı sertleştirme. Gerçek PostgreSQL eşzamanlılığı: bağımsız bağlantılar + kontrollü
 * araya girme (kilit tutucu bağlantı başvuru satırını `FOR UPDATE` tutar; yarışan işlemler ayrı havuz
 * bağlantılarında başlatılır ve `pg_stat_activity` ile gerçekten kilit beklediği doğrulanır; sonra kilit
 * bırakılır). Storage yazımı geçitli (gate) adapter ile durdurularak aşamalar arası araya girilir.
 * YALNIZCA izole veritabanı + geçici yerel depolama.
 */
describe.runIf(isIsolatedTestDatabase())(`iş akışı sertleştirme — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(16);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let root: string;
  let storage: StorageAdapter;
  let admin: string;
  let employee: string;
  const createdUsers: string[] = [];
  const tokenEnv = parseAccessTokenEnv(process.env);
  const pdf = fixtures.valid();

  beforeAll(async () => {
    owner = await connectOwner();
    root = await mkdtemp(join(tmpdir(), "cs-hardening-"));
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
    await owner.query("DROP TRIGGER IF EXISTS test_fail_comment_audit ON audit_logs");
    await owner.query("DROP FUNCTION IF EXISTS test_fail_comment_audit()");
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

  // ------------------------------------------------------------------ yardımcılar

  async function seed(documents = [{ title: "Pasaport" }, { title: "Banka Dökümü" }]) {
    const app = await seedApplication(owner, admin, { documents });
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
  const staff = (userId = admin): FileActor => ({ kind: "STAFF", userId });
  const reqVersion = async (id: string) =>
    (
      await owner.query<{ version: number }>(
        "SELECT version FROM application_document_requirements WHERE id = $1",
        [id],
      )
    ).rows[0]!.version;
  const appRow = async (id: string) =>
    (
      await owner.query<{ status: string; version: number }>(
        "SELECT status, version FROM applications WHERE id = $1",
        [id],
      )
    ).rows[0]!;
  const docStatus = async (id: string) =>
    (
      await owner.query<{ status: string }>(
        "SELECT status FROM application_document_requirements WHERE id = $1",
        [id],
      )
    ).rows[0]!.status;
  const activeFile = async (requirementId: string) =>
    (
      await owner.query<{ id: string }>(
        "SELECT id FROM application_document_files WHERE requirement_id = $1 AND status = 'ACTIVE'",
        [requirementId],
      )
    ).rows[0]?.id;
  const count = async (sql: string, params: unknown[]) =>
    Number((await owner.query<{ n: string }>(sql, params)).rows[0]!.n);

  function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    return { open, opened, arrived, reached };
  }

  /** Storage yazımını geçitte bekletir: rezervasyon commit edilmiş, aktivasyon başlamamış an. */
  function gatedStorage(g: ReturnType<typeof gate>): StorageAdapter {
    return {
      ...storage,
      putObject: async (input) => {
        g.reached();
        await g.opened;
        return storage.putObject(input);
      },
    };
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

  /**
   * Kontrollü araya girme: ayrı bir bağlantı başvuru satırını kilitler; işlemler başlatılır; en az
   * `waiters` kadar backend'in kilit beklediği görülünce kilit bırakılır.
   */
  async function raceUnderLock<T>(
    applicationId: string,
    waiters: number,
    ops: (() => Promise<T>)[],
  ) {
    const holder = await connectOwner();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM applications WHERE id = $1 FOR UPDATE", [applicationId]);
      const running = ops.map((op) => op());
      const deadline = Date.now() + 10_000;
      for (;;) {
        const waiting = await count(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND state = 'active'",
          [],
        );
        if (waiting >= waiters) break;
        if (Date.now() > deadline) throw new Error(`kilit bekleyen yok (${waiting}/${waiters})`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await holder.query("COMMIT");
      return await Promise.all(running);
    } finally {
      await holder.end();
    }
  }

  async function underReview(documents?: { title: string; required?: boolean }[]) {
    const app = await seed(documents);
    for (const id of app.reqIds) expect((await upload(app.customer, id)).ok).toBe(true);
    const submitted = await workflow.submitApplication(db, app.customer, {
      applicationId: app.applicationId,
      expectedVersion: (await appRow(app.applicationId)).version,
    });
    expect(submitted.ok).toBe(true);
    return app;
  }

  async function reviewInput(requirementId: string, decision: "APPROVED" | "REVISION_REQUIRED") {
    return {
      requirementId,
      fileId: (await activeFile(requirementId))!,
      expectedVersion: await reqVersion(requirementId),
      decision,
      customerMessage:
        decision === "REVISION_REQUIRED" ? "Lütfen okunaklı bir kopya yükleyiniz." : null,
    } as const;
  }

  // ------------------------------------------------------------------ 1. yorum idempotency

  describe("yorum idempotency (D-113)", () => {
    const comment = (
      applicationId: string,
      key: string,
      body = "Evraklarınız alındı.",
      userId = admin,
    ) =>
      workflow.addCustomerComment(
        db,
        { userId },
        { applicationId, requirementId: null, body, idempotencyKey: key },
      );
    const comments = (applicationId: string) =>
      count("SELECT count(*) AS n FROM document_comments WHERE application_id = $1", [
        applicationId,
      ]);
    const audits = (applicationId: string) =>
      count(
        "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_COMMENT_ADDED'",
        [applicationId],
      );

    it("aynı anahtar sıralı iki istek (yanıt kaybı sonrası tekrar): tek yorum, tek audit, aynı kimlik", async () => {
      const app = await seed();
      const key = randomUUID();
      const first = await comment(app.applicationId, key);
      const retry = await comment(app.applicationId, key);
      expect(first).toMatchObject({ ok: true, data: { created: true } });
      expect(retry).toMatchObject({ ok: true, data: { created: false } });
      if (first.ok && retry.ok) expect(retry.data.commentId).toBe(first.data.commentId);
      expect(await comments(app.applicationId)).toBe(1);
      expect(await audits(app.applicationId)).toBe(1);
    });

    it("aynı anahtar gerçek eşzamanlı istekler (kilit altında sıraya giren 4 bağlantı): tek yorum, tek audit", async () => {
      const app = await seed();
      const key = randomUUID();
      const results = await raceUnderLock(
        app.applicationId,
        4,
        [1, 2, 3, 4].map(() => () => comment(app.applicationId, key)),
      );
      expect(results.filter((r) => r.ok && r.data.created)).toHaveLength(1);
      expect(results.filter((r) => r.ok && !r.data.created)).toHaveLength(3);
      expect(await comments(app.applicationId)).toBe(1);
      expect(await audits(app.applicationId)).toBe(1);
    });

    it("aynı anahtar farklı başvurularda eşzamanlı (başvuru kilidi ayrı → veritabanı UNIQUE devrede): tek yorum, diğeri çakışma", async () => {
      const a = await seed();
      const b = await seed();
      const key = randomUUID();
      const results = await Promise.all([
        comment(a.applicationId, key),
        comment(b.applicationId, key),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        expect.objectContaining({ error: expect.objectContaining({ code: "CONFLICT" }) }),
      ]);
      expect((await comments(a.applicationId)) + (await comments(b.applicationId))).toBe(1);
      const failed = results.find((r) => !r.ok)!;
      expect(JSON.stringify(failed)).not.toMatch(/[0-9a-f-]{36}/); // diğer işlemin sonucu ifşa edilmez
    });

    it("aynı anahtar farklı metin → çakışma; aynı metin farklı anahtar → yeni yorum (metin üzerinden tekilleştirme yok)", async () => {
      const app = await seed();
      const key = randomUUID();
      expect((await comment(app.applicationId, key, "İlk metin")).ok).toBe(true);
      expect(await comment(app.applicationId, key, "Değiştirilmiş metin")).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
      expect((await comment(app.applicationId, randomUUID(), "İlk metin")).ok).toBe(true);
      expect(await comments(app.applicationId)).toBe(2);
      expect(await audits(app.applicationId)).toBe(2);
    });

    it("başka personel aynı anahtarı kullanırsa çakışma (sonuç ifşa edilmez); yetkisiz/silinmekte başvuruda tekrar reddedilir", async () => {
      const app = await seed();
      const key = randomUUID();
      expect((await comment(app.applicationId, key, "Mesaj", admin)).ok).toBe(true);
      const other = await comment(app.applicationId, key, "Mesaj", employee);
      expect(other).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      await owner.query(
        "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $1 WHERE id = $2",
        [admin, app.applicationId],
      );
      expect(await comment(app.applicationId, key, "Mesaj", admin)).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
    });

    it("audit yazılamazsa tamamı geri alınır; aynı anahtarla güvenli tekrar tek yorum oluşturur", async () => {
      const app = await seed();
      const key = randomUUID();
      await owner.query(`CREATE OR REPLACE FUNCTION test_fail_comment_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action = 'DOCUMENT_COMMENT_ADDED' AND NEW.application_id = '${app.applicationId}' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`);
      await owner.query(
        "CREATE TRIGGER test_fail_comment_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_comment_audit()",
      );
      try {
        expect(await comment(app.applicationId, key)).toMatchObject({
          ok: false,
          error: { code: "INTERNAL" },
        });
        expect(await comments(app.applicationId)).toBe(0);
      } finally {
        await owner.query("DROP TRIGGER IF EXISTS test_fail_comment_audit ON audit_logs");
        await owner.query("DROP FUNCTION IF EXISTS test_fail_comment_audit()");
      }
      expect(await comment(app.applicationId, key)).toMatchObject({
        ok: true,
        data: { created: true },
      });
      expect(await comments(app.applicationId)).toBe(1);
      expect(await audits(app.applicationId)).toBe(1);
    });
  });

  // ------------------------------------------------------------------ 2. eşzamanlılık kapsamı

  describe("eşzamanlılık (kontrollü araya girme)", () => {
    it("onay ↔ dosya değiştirme: yazım sürerken v1 onaylanırsa değiştirme sürüm çakışmasıyla reddedilir (v1 onaylı kalır); tekrar deneme v2'yi aktive eder ve onay devralınmaz", async () => {
      const app = await underReview();
      const [passport] = app.reqIds as [string];
      const v1 = (await activeFile(passport))!;
      const g = gate();
      const replacing = upload(staff(employee), passport, gatedStorage(g));
      await g.arrived; // rezervasyon commit edildi; storage yazımı bekliyor
      const approval = await workflow.reviewDocument(
        db,
        { userId: admin },
        await reviewInput(passport, "APPROVED"),
      );
      expect(approval).toMatchObject({ ok: true, data: { status: "APPROVED" } });
      g.open();
      // İyimser kilit (BR-90): yükleme, başladığı evrak sürümü değiştiği için aktive edilmez.
      expect(await replacing).toMatchObject({ ok: false, code: "STATE_CHANGED" });
      expect(await activeFile(passport)).toBe(v1);
      expect(await docStatus(passport)).toBe("APPROVED");
      // Personel tekrar dener → v2 aktif, onay devralınmaz (BR-48), eski karar v1'e bağlı kalır.
      expect(await upload(staff(employee), passport)).toMatchObject({
        ok: true,
        documentStatus: "PENDING_REVIEW",
      });
      const reviews = await owner.query(
        "SELECT file_id FROM document_reviews WHERE requirement_id = $1",
        [passport],
      );
      expect(reviews.rows).toEqual([{ file_id: v1 }]);
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'DOCUMENT_APPROVAL_INVALIDATED'",
          [app.applicationId],
        ),
      ).toBe(1);
      // v1'e verilen yeni karar reddedilir (aktif dosya değil).
      const stale = await workflow.reviewDocument(
        db,
        { userId: admin },
        {
          requirementId: passport,
          fileId: v1,
          expectedVersion: await reqVersion(passport),
          decision: "APPROVED",
          customerMessage: null,
        },
      );
      expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    });

    it("son iki zorunlu evrağın eşzamanlı onayı: ikisi de kaydedilir, başvuru otomatik ilerlemez (BR-61); eşzamanlı iki T3 → tek geçiş", async () => {
      const app = await underReview();
      const inputs = await Promise.all(app.reqIds.map((id) => reviewInput(id, "APPROVED")));
      const results = await raceUnderLock(
        app.applicationId,
        2,
        inputs.map(
          (input, i) => () =>
            workflow.reviewDocument(db, { userId: i === 0 ? admin : employee }, input),
        ),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      expect((await appRow(app.applicationId)).status).toBe("UNDER_REVIEW");
      const version = (await appRow(app.applicationId)).version;
      const t3 = await raceUnderLock(
        app.applicationId,
        2,
        [admin, employee].map(
          (userId) => () =>
            workflow.transitionApplication(
              db,
              { userId },
              {
                applicationId: app.applicationId,
                expectedVersion: version,
                code: "APPROVE_DOCUMENTS",
                reason: null,
              },
            ),
        ),
      );
      expect(t3.filter((r) => r.ok)).toHaveLength(1);
      expect(
        await count(
          "SELECT count(*) AS n FROM application_status_history WHERE application_id = $1 AND transition_code = 'APPROVE_DOCUMENTS'",
          [app.applicationId],
        ),
      ).toBe(1);
      expect(
        await count(
          "SELECT count(*) AS n FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_STATUS_CHANGED'",
          [app.applicationId],
        ),
      ).toBe(1);
    });

    it("gönderim ↔ yükleme sonlandırma: rezervasyon bekliyorken gönderim reddedilir; aktivasyon sonrası kabul", async () => {
      const app = await seed();
      const [passport, bank] = app.reqIds as [string, string];
      expect((await upload(app.customer, passport)).ok).toBe(true);
      const g = gate();
      const pending = upload(app.customer, bank, gatedStorage(g));
      await g.arrived;
      const blocked = await workflow.submitApplication(db, app.customer, {
        applicationId: app.applicationId,
        expectedVersion: (await appRow(app.applicationId)).version,
      });
      expect(blocked).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
      g.open();
      expect((await pending).ok).toBe(true);
      const accepted = await workflow.submitApplication(db, app.customer, {
        applicationId: app.applicationId,
        expectedVersion: (await appRow(app.applicationId)).version,
      });
      expect(accepted.ok).toBe(true);
      expect(
        await count(
          "SELECT count(*) AS n FROM application_status_history WHERE application_id = $1 AND transition_code = 'SUBMIT'",
          [app.applicationId],
        ),
      ).toBe(1);
    });

    it("gönderim ↔ bağlantı yenileme (gerçek eşzamanlı): eski oturumla gönderim yalnızca yenilemeden önce sıralanırsa başarılı", async () => {
      for (let round = 0; round < 3; round += 1) {
        const app = await seed();
        for (const id of app.reqIds) expect((await upload(app.customer, id)).ok).toBe(true);
        const version = (await appRow(app.applicationId)).version;
        const [submitted, rotated] = await raceUnderLock<{ readonly ok: boolean }>(
          app.applicationId,
          2,
          [
            () =>
              workflow.submitApplication(db, app.customer, {
                applicationId: app.applicationId,
                expectedVersion: version,
              }),
            () =>
              applications.rotateAccessLink(
                db,
                { userId: admin },
                { applicationId: app.applicationId, expectedActiveTokenId: app.tokenId },
                tokenEnv,
              ),
          ],
        );
        expect(rotated!.ok).toBe(true);
        const status = (await appRow(app.applicationId)).status;
        if (submitted!.ok) {
          expect(status).toBe("UNDER_REVIEW");
          const submitAt = await owner.query(
            "SELECT created_at FROM application_status_history WHERE application_id = $1 AND transition_code = 'SUBMIT'",
            [app.applicationId],
          );
          const revokedAt = await owner.query(
            "SELECT revoked_at FROM application_access_tokens WHERE id = $1",
            [app.tokenId],
          );
          expect(new Date(submitAt.rows[0].created_at).getTime()).toBeLessThanOrEqual(
            new Date(revokedAt.rows[0].revoked_at).getTime(),
          );
        } else {
          expect(submitted).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
          expect(status).toBe("AWAITING_DOCUMENTS");
        }
        // Yenileme sonrası eski oturum hiçbir koşulda yetki kazanmaz.
        const after = await workflow.submitApplication(db, app.customer, {
          applicationId: app.applicationId,
          expectedVersion: (await appRow(app.applicationId)).version,
        });
        expect(after.ok).toBe(false);
      }
    });

    it("kaldırma ↔ yeniden gönderim yarışı; kaldırılmış dosyaya karar verilemez", async () => {
      const app = await underReview([{ title: "Pasaport" }, { title: "Ek", required: false }]);
      const [passport, optional] = app.reqIds as [string, string];
      for (const [id, decision] of [
        [passport, "REVISION_REQUIRED"],
        [optional, "APPROVED"],
      ] as const) {
        expect(
          (await workflow.reviewDocument(db, { userId: admin }, await reviewInput(id, decision)))
            .ok,
        ).toBe(true);
      }
      expect(
        (
          await workflow.transitionApplication(
            db,
            { userId: admin },
            {
              applicationId: app.applicationId,
              expectedVersion: (await appRow(app.applicationId)).version,
              code: "REQUEST_REVISION",
              reason: null,
            },
          )
        ).ok,
      ).toBe(true);
      expect((await upload(app.customer, passport)).ok).toBe(true); // D7 → UPLOADED
      const file = (await activeFile(passport))!;
      const version = (await appRow(app.applicationId)).version;
      const fileVersion = await reqVersion(passport);
      const [removed, resubmitted] = await raceUnderLock<{ readonly ok: boolean }>(
        app.applicationId,
        2,
        [
          () =>
            workflow.removeDocumentFile(db, app.customer, {
              fileId: file,
              expectedVersion: fileVersion,
            }),
          () =>
            workflow.submitApplication(db, app.customer, {
              applicationId: app.applicationId,
              expectedVersion: version,
            }),
        ],
      );
      const status = (await appRow(app.applicationId)).status;
      if (removed!.ok) {
        expect(resubmitted).toMatchObject({ ok: false }); // zorunlu evrak eksik
        expect(status).toBe("REVISION_REQUIRED");
      } else {
        expect(resubmitted!.ok).toBe(true);
        expect(status).toBe("UNDER_REVIEW");
        expect(await activeFile(passport)).toBe(file);
      }
      // Kaldırılmış (REMOVED) dosyaya karar: aktif dosya değil → reddedilir.
      const otherApp = await seed([{ title: "Pasaport" }]);
      const [req] = otherApp.reqIds as [string];
      expect((await upload(otherApp.customer, req)).ok).toBe(true);
      const removedFile = (await activeFile(req))!;
      expect(
        (
          await workflow.removeDocumentFile(db, otherApp.customer, {
            fileId: removedFile,
            expectedVersion: await reqVersion(req),
          })
        ).ok,
      ).toBe(true);
      const decision = await workflow.reviewDocument(
        db,
        { userId: admin },
        {
          requirementId: req,
          fileId: removedFile,
          expectedVersion: await reqVersion(req),
          decision: "APPROVED",
          customerMessage: null,
        },
      );
      expect(decision.ok).toBe(false);
    });

    it("değiştirme aktivasyonu ↔ terminal/ilerlemiş statü: yazım sürerken iptal veya T3 → aktivasyon reddedilir, eski aktif korunur", async () => {
      for (const code of ["CANCEL", "APPROVE_DOCUMENTS"] as const) {
        const app = await underReview([{ title: "Pasaport" }]);
        const [passport] = app.reqIds as [string];
        if (code === "APPROVE_DOCUMENTS") {
          expect(
            (
              await workflow.reviewDocument(
                db,
                { userId: admin },
                await reviewInput(passport, "APPROVED"),
              )
            ).ok,
          ).toBe(true);
        }
        const oldFile = (await activeFile(passport))!;
        const before = await docStatus(passport);
        const g = gate();
        const replacing = upload(staff(employee), passport, gatedStorage(g));
        await g.arrived;
        const moved = await workflow.transitionApplication(
          db,
          { userId: admin },
          {
            applicationId: app.applicationId,
            expectedVersion: (await appRow(app.applicationId)).version,
            code,
            reason: code === "CANCEL" ? "Yarış testi" : null,
          },
        );
        expect(moved.ok).toBe(true);
        g.open();
        expect(await replacing).toMatchObject({ ok: false, code: "STATE_CHANGED" });
        expect(await activeFile(passport)).toBe(oldFile);
        expect(await docStatus(passport)).toBe(before);
      }
    });

    it("manuel T3 ↔ eşzamanlı düzeltme kararı; T2 ↔ son düzeltmenin onayı: tutarsız son durum oluşmaz, mükerrer geçmiş yok", async () => {
      for (let round = 0; round < 3; round += 1) {
        const app = await underReview();
        const [passport, bank] = app.reqIds as [string, string];
        expect(
          (
            await workflow.reviewDocument(
              db,
              { userId: admin },
              await reviewInput(passport, "APPROVED"),
            )
          ).ok,
        ).toBe(true);
        expect(
          (
            await workflow.reviewDocument(
              db,
              { userId: admin },
              await reviewInput(bank, "APPROVED"),
            )
          ).ok,
        ).toBe(true);
        const version = (await appRow(app.applicationId)).version;
        const revision = await reviewInput(bank, "REVISION_REQUIRED");
        const [t3, decision] = await raceUnderLock<{ readonly ok: boolean }>(app.applicationId, 2, [
          () =>
            workflow.transitionApplication(
              db,
              { userId: admin },
              {
                applicationId: app.applicationId,
                expectedVersion: version,
                code: "APPROVE_DOCUMENTS",
                reason: null,
              },
            ),
          () => workflow.reviewDocument(db, { userId: employee }, revision),
        ]);
        const status = (await appRow(app.applicationId)).status;
        expect(t3!.ok !== decision!.ok).toBe(true); // tam olarak biri
        if (t3!.ok) expect(await docStatus(bank)).toBe("APPROVED");
        else expect(status).toBe("UNDER_REVIEW");
        expect(
          status === "DOCUMENTS_APPROVED" && (await docStatus(bank)) === "REVISION_REQUIRED",
        ).toBe(false);
      }
      for (let round = 0; round < 3; round += 1) {
        const app = await underReview();
        const [passport, bank] = app.reqIds as [string, string];
        expect(
          (
            await workflow.reviewDocument(
              db,
              { userId: admin },
              await reviewInput(passport, "APPROVED"),
            )
          ).ok,
        ).toBe(true);
        expect(
          (
            await workflow.reviewDocument(
              db,
              { userId: admin },
              await reviewInput(bank, "REVISION_REQUIRED"),
            )
          ).ok,
        ).toBe(true);
        const version = (await appRow(app.applicationId)).version;
        const approve = await reviewInput(bank, "APPROVED");
        const [t2, decision] = await raceUnderLock<{ readonly ok: boolean }>(app.applicationId, 2, [
          () =>
            workflow.transitionApplication(
              db,
              { userId: admin },
              {
                applicationId: app.applicationId,
                expectedVersion: version,
                code: "REQUEST_REVISION",
                reason: null,
              },
            ),
          () => workflow.reviewDocument(db, { userId: employee }, approve),
        ]);
        expect(t2!.ok !== decision!.ok).toBe(true);
        const status = (await appRow(app.applicationId)).status;
        expect(
          status === "REVISION_REQUIRED" && (await docStatus(bank)) !== "REVISION_REQUIRED",
        ).toBe(false);
        expect(
          await count(
            "SELECT count(*) AS n FROM application_status_history WHERE application_id = $1 AND transition_code = 'REQUEST_REVISION'",
            [app.applicationId],
          ),
        ).toBeLessThanOrEqual(1);
      }
    });
  });

  // ------------------------------------------------------------------ 3. müşteri bağlamı / token

  describe("müşteri mutasyonları — token/oturum/kapsam", () => {
    it("iptal/yenilenmiş token ve süresi dolmuş oturumla yeniden gönderim ve kaldırma reddedilir; başka başvurunun dosyası 404", async () => {
      for (const reason of ["REVOKED", "ROTATED", "EXPIRED"] as const) {
        const app = await seed([{ title: "Pasaport" }]);
        const [req] = app.reqIds as [string];
        expect((await upload(app.customer, req)).ok).toBe(true);
        const file = (await activeFile(req))!;
        let actor: FileActor = app.customer;
        if (reason === "EXPIRED")
          actor = {
            ...app.customer,
            sessionExpiresAt: Math.floor(Date.now() / 1000) - 1,
          } as FileActor;
        else
          await owner.query(
            "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = $1, revoked_by_user_id = $2 WHERE id = $3",
            [reason, admin, app.tokenId],
          );
        expect(
          await workflow.removeDocumentFile(db, actor, {
            fileId: file,
            expectedVersion: await reqVersion(req),
          }),
        ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
        expect(
          await workflow.submitApplication(db, actor, {
            applicationId: app.applicationId,
            expectedVersion: (await appRow(app.applicationId)).version,
          }),
        ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
        expect(await activeFile(req)).toBe(file);
      }
      const a = await seed([{ title: "Pasaport" }]);
      const b = await seed([{ title: "Pasaport" }]);
      expect((await upload(b.customer, b.reqIds[0]!)).ok).toBe(true);
      expect(
        await workflow.removeDocumentFile(db, a.customer, {
          fileId: (await activeFile(b.reqIds[0]!))!,
          expectedVersion: await reqVersion(b.reqIds[0]!),
        }),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });
  });

  // ------------------------------------------------------------------ 4. storage regresyonu

  describe("storage regresyonu", () => {
    it("kaldırılan dosyanın nesnesi fiziksel olarak kalır ve kotadan düşmez; iptal/tamamlama token'ı iptal etmez", async () => {
      const app = await seed([{ title: "Pasaport" }]);
      const [req] = app.reqIds as [string];
      expect((await upload(app.customer, req)).ok).toBe(true);
      const file = await owner.query<{ id: string; key: string; version: string }>(
        "SELECT id, blob_pathname AS key, storage_version_id AS version FROM application_document_files WHERE requirement_id = $1 AND status = 'ACTIVE'",
        [req],
      );
      const before = await readStorageUsage(db);
      expect(
        (
          await workflow.removeDocumentFile(db, app.customer, {
            fileId: file.rows[0]!.id,
            expectedVersion: await reqVersion(req),
          })
        ).ok,
      ).toBe(true);
      const after = await readStorageUsage(db);
      expect(after.total).toBe(before.total);
      expect(after.history).toBe(before.history + pdf.length);
      expect(await storage.headObject(file.rows[0]!.key, file.rows[0]!.version)).not.toBeNull();

      const flow = await underReview([{ title: "Pasaport" }]);
      expect(
        (
          await workflow.reviewDocument(
            db,
            { userId: admin },
            await reviewInput(flow.reqIds[0]!, "APPROVED"),
          )
        ).ok,
      ).toBe(true);
      for (const code of ["APPROVE_DOCUMENTS", "START_PROCESSING", "COMPLETE"] as const) {
        expect(
          (
            await workflow.transitionApplication(
              db,
              { userId: admin },
              {
                applicationId: flow.applicationId,
                expectedVersion: (await appRow(flow.applicationId)).version,
                code,
                reason: null,
              },
            )
          ).ok,
        ).toBe(true);
      }
      const token = await owner.query(
        "SELECT revoked_at FROM application_access_tokens WHERE id = $1",
        [flow.tokenId],
      );
      expect(token.rows[0].revoked_at).toBeNull();
    });
  });
});
