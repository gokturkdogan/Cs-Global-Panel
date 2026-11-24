import { randomUUID } from "node:crypto";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanup,
  connectOwner,
  connectRuntime,
  createApplication,
  createRequirement,
  createService,
  createUser,
  expectPgError,
  insertFile,
  insertToken,
  newCreated,
  randomHex,
  sleep,
} from "./helpers";

const created = newCreated();
let db: pg.Client;
let userId: string;
let serviceId: string;
let templateId: string;

beforeAll(async () => {
  db = await connectRuntime();
  userId = await createUser(db, created);
  ({ serviceId, templateId } = await createService(db, created, userId));
});
afterAll(async () => {
  await db.end();
  await cleanup(created);
});

async function newApplicationWithRequirement() {
  const applicationId = await createApplication(db, created, { serviceId, userId });
  const requirementId = await createRequirement(db, applicationId, templateId);
  return { applicationId, requirementId };
}

describe("başvuru", () => {
  it("INV-01: başvuru numarası benzersizdir ve biçimi zorunludur", async () => {
    const number = `CS-2097-${Date.now().toString().slice(-6)}`;
    await createApplication(db, created, { serviceId, userId, number });
    await expectPgError(createApplication(db, created, { serviceId, userId, number }), "23505");
    await expectPgError(
      createApplication(db, created, { serviceId, userId, number: "2026-000001" }),
      "23514",
    );
  });

  it("aynı telefon ve e-posta farklı başvurularda bulunabilir (BR-04)", async () => {
    await createApplication(db, created, { serviceId, userId });
    await expect(createApplication(db, created, { serviceId, userId })).resolves.toBeDefined();
  });

  it.each([
    ["geçersiz telefon", "customer_phone_e164 = '05550000001'"],
    ["büyük harfli e-posta", "customer_email = 'Test@Example.invalid'"],
    ["boşluklu ad", "customer_first_name = ' Test'"],
    ["geçersiz statü", "status = 'ARCHIVED'"],
    ["sıfır versiyon (INV-16)", "version = 0"],
    ["silen kişi olmadan silme işareti", "deletion_requested_at = now()"],
  ])("reddeder: %s", async (_label, assignment) => {
    const { applicationId } = await newApplicationWithRequirement();
    await expectPgError(
      db.query(`UPDATE applications SET ${assignment} WHERE id = $1`, [applicationId]),
      "23514",
    );
  });

  it("INV-14: var olmayan hizmete veya kullanıcıya bağlanamaz", async () => {
    await expectPgError(
      createApplication(db, created, { serviceId: randomUUID(), userId }),
      "23503",
    );
    await expectPgError(
      createApplication(db, created, { serviceId, userId: "no-such-user" }),
      "23503",
    );
  });

  it("INV-16: optimistic lock — eski versiyonla güncelleme 0 satır etkiler", async () => {
    const { applicationId } = await newApplicationWithRequirement();
    const first = await db.query(
      "UPDATE applications SET version = version + 1 WHERE id = $1 AND version = 1",
      [applicationId],
    );
    const stale = await db.query(
      "UPDATE applications SET version = version + 1 WHERE id = $1 AND version = 1",
      [applicationId],
    );
    expect(first.rowCount).toBe(1);
    expect(stale.rowCount).toBe(0);
  });

  it("INV-17: updated_at her güncellemede veritabanı tarafından ilerletilir", async () => {
    const { applicationId } = await newApplicationWithRequirement();
    const before = await db.query<{ t: Date }>(
      "SELECT updated_at AS t FROM applications WHERE id = $1",
      [applicationId],
    );
    await sleep(20);
    await db.query("UPDATE applications SET submitted_at = now() WHERE id = $1", [applicationId]);
    const after = await db.query<{ t: Date }>(
      "SELECT updated_at AS t FROM applications WHERE id = $1",
      [applicationId],
    );
    expect(after.rows[0]!.t.getTime()).toBeGreaterThan(before.rows[0]!.t.getTime());
  });
});

describe("erişim token'ları", () => {
  it("INV-02: başvuru başına tek aktif token; iptal edilenler geçmişte kalır", async () => {
    const { applicationId } = await newApplicationWithRequirement();
    const first = await insertToken(db, { applicationId, userId });
    await expectPgError(insertToken(db, { applicationId, userId }), "23505");
    await db.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $2 WHERE id = $1",
      [first.rows[0]!.id, userId],
    );
    await expect(insertToken(db, { applicationId, userId })).resolves.toBeDefined();
  });

  it("INV-03: token hash benzersizdir ve hex biçimindedir; düz token kolonu yoktur", async () => {
    const a = await newApplicationWithRequirement();
    const b = await newApplicationWithRequirement();
    const tokenHash = randomHex(32);
    await insertToken(db, { applicationId: a.applicationId, userId, tokenHash });
    await expectPgError(
      insertToken(db, { applicationId: b.applicationId, userId, tokenHash }),
      "23505",
    );
    await expectPgError(
      insertToken(db, { applicationId: b.applicationId, userId, tokenHash: "plain-token" }),
      "23514",
    );
    const columns = await db.query<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'application_access_tokens'",
    );
    expect(columns.rows.map((row) => row.name)).not.toContain("token");
    expect(columns.rows.map((row) => row.name)).not.toContain("expires_at");
  });

  it("iptal bilgileri birlikte tutulur (gerekçesiz iptal reddedilir)", async () => {
    const { applicationId } = await newApplicationWithRequirement();
    const token = await insertToken(db, { applicationId, userId });
    await expectPgError(
      db.query("UPDATE application_access_tokens SET revoked_at = now() WHERE id = $1", [
        token.rows[0]!.id,
      ]),
      "23514",
    );
  });
});

describe("dosya metadata'sı", () => {
  it("INV-04: evrak başına tek ACTIVE dosya; eski versiyonlar korunur", async () => {
    const ids = await newApplicationWithRequirement();
    const first = await insertFile(db, { ...ids, userId, status: "ACTIVE", versionNumber: 1 });
    await expectPgError(
      insertFile(db, { ...ids, userId, status: "ACTIVE", versionNumber: 2 }),
      "23505",
    );
    await db.query(
      "UPDATE application_document_files SET status = 'SUPERSEDED', ended_at = now() WHERE id = $1",
      [first.rows[0]!.id],
    );
    await insertFile(db, { ...ids, userId, status: "ACTIVE", versionNumber: 2 });
    const versions = await db.query(
      "SELECT 1 FROM application_document_files WHERE requirement_id = $1",
      [ids.requirementId],
    );
    expect(versions.rowCount).toBe(2);
  });

  it("INV-05: evrak başına tek devam eden yükleme (UPLOAD_PENDING/VALIDATING)", async () => {
    const ids = await newApplicationWithRequirement();
    await insertFile(db, { ...ids, userId, status: "UPLOAD_PENDING" });
    await expectPgError(insertFile(db, { ...ids, userId, status: "VALIDATING" }), "23505");
  });

  it.each([
    ["0 bayt", 0, "23514"],
    ["10 MiB + 1 bayt", 10_485_761, "23514"],
  ])("INV-06: boyut reddedilir — %s", async (_label, sizeBytes, code) => {
    const ids = await newApplicationWithRequirement();
    await expectPgError(insertFile(db, { ...ids, userId, status: "ACTIVE", sizeBytes }), code);
  });

  it("INV-06: tam 10 485 760 bayt kabul edilir", async () => {
    const ids = await newApplicationWithRequirement();
    await expect(
      insertFile(db, { ...ids, userId, status: "ACTIVE", sizeBytes: 10_485_760 }),
    ).resolves.toBeDefined();
  });

  it("INV-07: storage anahtarı yalnızca kimliklerden oluşan .pdf yoludur (kişisel veri yok)", async () => {
    const ids = await newApplicationWithRequirement();
    await expectPgError(
      insertFile(db, {
        ...ids,
        userId,
        status: "UPLOAD_PENDING",
        blobPathname: "applications/ayse-yilmaz/pasaport.pdf",
      }),
      "23514",
    );
  });

  it("INV-08: versiyon numarası evrak içinde benzersiz ve ≥ 1", async () => {
    const ids = await newApplicationWithRequirement();
    await insertFile(db, { ...ids, userId, status: "SUPERSEDED", versionNumber: 1 });
    await expectPgError(
      insertFile(db, { ...ids, userId, status: "REMOVED", versionNumber: 1 }),
      "23505",
    );
    await expectPgError(
      insertFile(db, { ...ids, userId, status: "REMOVED", versionNumber: 0 }),
      "23514",
    );
    await expectPgError(
      insertFile(db, { ...ids, userId, status: "UPLOAD_PENDING", versionNumber: 3 }),
      "23514",
    );
  });

  it("dosya başka başvurunun evrağına bağlanamaz", async () => {
    const a = await newApplicationWithRequirement();
    const b = await newApplicationWithRequirement();
    await expectPgError(
      insertFile(db, {
        applicationId: a.applicationId,
        requirementId: b.requirementId,
        userId,
        status: "UPLOAD_PENDING",
      }),
      "23503",
    );
  });
});

describe("inceleme ve yorum ilişkileri", () => {
  async function insertReview(applicationId: string, requirementId: string, fileId: string) {
    return db.query(
      `INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, reviewed_by_user_id)
       VALUES ($1, $2, $3, 'APPROVED', $4)`,
      [applicationId, requirementId, fileId, userId],
    );
  }

  it("INV-09: inceleme yalnızca aynı evrağın dosyasına bağlanır", async () => {
    const a = await newApplicationWithRequirement();
    const file = await insertFile(db, { ...a, userId, status: "ACTIVE" });
    await expect(
      insertReview(a.applicationId, a.requirementId, file.rows[0]!.id),
    ).resolves.toBeDefined();

    const otherRequirement = await createRequirement(db, a.applicationId);
    await expectPgError(insertReview(a.applicationId, otherRequirement, file.rows[0]!.id), "23503");

    const b = await newApplicationWithRequirement();
    await expectPgError(insertReview(b.applicationId, b.requirementId, file.rows[0]!.id), "23503");
  });

  it("düzeltme kararı 10–1000 karakter müşteri açıklaması gerektirir", async () => {
    const a = await newApplicationWithRequirement();
    const file = await insertFile(db, { ...a, userId, status: "ACTIVE" });
    await expectPgError(
      db.query(
        `INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, reviewed_by_user_id)
         VALUES ($1, $2, $3, 'REVISION_REQUIRED', $4)`,
        [a.applicationId, a.requirementId, file.rows[0]!.id, userId],
      ),
      "23514",
    );
  });

  it("INV-10: yorum ve iç not başka başvurunun evrağına bağlanamaz", async () => {
    const a = await newApplicationWithRequirement();
    const b = await newApplicationWithRequirement();
    for (const table of ["document_comments", "application_internal_notes"]) {
      await expectPgError(
        db.query(
          `INSERT INTO ${table} (application_id, requirement_id, body, author_user_id) VALUES ($1, $2, 'Not', $3)`,
          [a.applicationId, b.requirementId, userId],
        ),
        "23503",
      );
    }
  });

  it("statü geçmişi: gerekçe zorunlu geçişler gerekçesiz kaydedilemez; başka başvurunun token'ı kullanılamaz", async () => {
    const a = await newApplicationWithRequirement();
    const b = await newApplicationWithRequirement();
    await expectPgError(
      db.query(
        `INSERT INTO application_status_history (application_id, from_status, to_status, transition_code, actor_type, actor_user_id)
         VALUES ($1, 'AWAITING_DOCUMENTS', 'CANCELLED', 'CANCEL', 'USER', $2)`,
        [a.applicationId, userId],
      ),
      "23514",
    );
    const tokenOfB = await insertToken(db, { applicationId: b.applicationId, userId });
    await expectPgError(
      db.query(
        `INSERT INTO application_status_history (application_id, from_status, to_status, transition_code, actor_type, actor_access_token_id)
         VALUES ($1, 'AWAITING_DOCUMENTS', 'UNDER_REVIEW', 'SUBMIT', 'CUSTOMER', $2)`,
        [a.applicationId, tokenOfB.rows[0]!.id],
      ),
      "23503",
    );
  });
});

describe("personel kimliği (Better Auth tabloları)", () => {
  it("INV-11: kullanıcı adı küçük harf, biçimli ve benzersizdir", async () => {
    const insert = (id: string, username: string) =>
      db.query("INSERT INTO users (id, name, email, username) VALUES ($1, 'T', $2, $3)", [
        id,
        `${id}@example.invalid`,
        username,
      ]);
    const id = `test-${randomUUID()}`;
    created.users.push(id);
    await insert(id, `u_${id.slice(-8)}`);
    await expectPgError(insert(`test-${randomUUID()}`, `u_${id.slice(-8)}`), "23505");
    await expectPgError(insert(`test-${randomUUID()}`, "BuyukHarf"), "23514");
    await expectPgError(insert(`test-${randomUUID()}`, "a"), "23514");
  });

  it("rol yalnızca admin veya employee olabilir", async () => {
    await expectPgError(
      db.query("UPDATE users SET role = 'superadmin' WHERE id = $1", [userId]),
      "23514",
    );
  });

  it("INV-12: oturumda IP veya user-agent saklanamaz; impersonation kaydedilemez", async () => {
    const insert = (extra: string, value: string) =>
      db.query(
        `INSERT INTO sessions (id, expires_at, token, user_id, ${extra}) VALUES ($1, now() + interval '7 days', $2, $3, $4)`,
        [`s-${randomUUID()}`, randomHex(16), userId, value],
      );
    await expectPgError(insert("ip_address", "192.0.2.1"), "23514");
    await expectPgError(insert("user_agent", "Mozilla/5.0"), "23514");
    await expectPgError(insert("impersonated_by", userId), "23514");
    await expect(
      db.query(
        "INSERT INTO sessions (id, expires_at, token, user_id) VALUES ($1, now() + interval '7 days', $2, $3)",
        [`s-${randomUUID()}`, randomHex(16), userId],
      ),
    ).resolves.toBeDefined();
  });
});

describe("snapshot bağımsızlığı (INV-10)", () => {
  it("şablon değişikliği mevcut başvuru snapshot'ını değiştirmez; şablon silinirse snapshot kalır", async () => {
    const owner = await connectOwner();
    try {
      const { templateId: template } = await createService(db, created, userId);
      const applicationId = await createApplication(db, created, { serviceId, userId });
      const requirementId = await createRequirement(db, applicationId, template);

      await db.query(
        "UPDATE service_document_requirements SET title = 'Değişen Başlık', is_active = false WHERE id = $1",
        [template],
      );
      const snapshot = await db.query<{ title: string; source: string | null }>(
        "SELECT title, source_requirement_id AS source FROM application_document_requirements WHERE id = $1",
        [requirementId],
      );
      expect(snapshot.rows[0]).toEqual({ title: "Pasaport", source: template });

      // Şablon satırının fiziksel silinmesi uygulamada yoktur; davranışı sahip rolle doğrulanır.
      await owner.query("DELETE FROM service_document_requirements WHERE id = $1", [template]);
      const after = await db.query<{ title: string; source: string | null }>(
        "SELECT title, source_requirement_id AS source FROM application_document_requirements WHERE id = $1",
        [requirementId],
      );
      expect(after.rows[0]).toEqual({ title: "Pasaport", source: null });
    } finally {
      await owner.end();
    }
  });
});
