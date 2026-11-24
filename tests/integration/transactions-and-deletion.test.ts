import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { serviceDocumentRequirements, services } from "@/server/db/schema";
import { DEMO_SERVICES, seedDemoServices } from "../../scripts/db/seed-data";
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
  TEST_ID_PREFIX,
  urls,
} from "./helpers";

const created = newCreated();
const database = createDatabase(urls.runtime.connectionString);
let runtime: pg.Client;
let owner: pg.Client;
let userId: string;
let serviceId: string;

beforeAll(async () => {
  runtime = await connectRuntime();
  owner = await connectOwner();
  userId = await createUser(runtime, created);
  ({ serviceId } = await createService(runtime, created, userId));
});
afterAll(async () => {
  await runtime.end();
  await owner.end();
  await database.pool.end();
  await cleanup(created);
});

describe("Drizzle transaction'ları (node-postgres + Neon pooler)", () => {
  it("hata fırlatılırsa transaction'daki tüm yazmalar geri alınır", async () => {
    const name = `Rollback Hizmeti ${randomUUID().slice(0, 8)}`;
    await expect(
      database.db.transaction(async (tx) => {
        const [service] = await tx
          .insert(services)
          .values({ name, createdByUserId: userId })
          .returning();
        await tx
          .insert(serviceDocumentRequirements)
          .values({ serviceId: service!.id, title: "Pasaport" });
        throw new Error("bilinçli hata");
      }),
    ).rejects.toThrow("bilinçli hata");
    const rows = await database.db.select().from(services).where(eq(services.name, name));
    expect(rows).toHaveLength(0);
  });

  it("veritabanı hatası (CHECK) önceki yazmaları da geri alır", async () => {
    const name = `Rollback Hizmeti ${randomUUID().slice(0, 8)}`;
    await expect(
      database.db.transaction(async (tx) => {
        const [service] = await tx
          .insert(services)
          .values({ name, createdByUserId: userId })
          .returning();
        await tx.insert(serviceDocumentRequirements).values({ serviceId: service!.id, title: "x" });
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    const rows = await database.db.select().from(services).where(eq(services.name, name));
    expect(rows).toHaveLength(0);
  });

  it("başarılı transaction commit edilir ve tipli okunur", async () => {
    const name = `Commit Hizmeti ${randomUUID().slice(0, 8)}`;
    const serviceIdCommitted = await database.db.transaction(async (tx) => {
      const [service] = await tx
        .insert(services)
        .values({ name, createdByUserId: userId })
        .returning();
      await tx
        .insert(serviceDocumentRequirements)
        .values({ serviceId: service!.id, title: "Pasaport" });
      return service!.id;
    });
    created.services.push(serviceIdCommitted);
    const [row] = await database.db
      .select()
      .from(services)
      .where(eq(services.id, serviceIdCommitted));
    expect(row).toMatchObject({ name, isActive: true, createdByUserId: userId });
    expect(row!.createdAt).toBeInstanceOf(Date);
  });
});

describe("silme davranışı (INV-15, BR-150…BR-155)", () => {
  it("başvuru silinince tüm alt kayıtlar silinir; audit kayıtları kalır", async () => {
    const applicationId = await createApplication(runtime, created, { serviceId, userId });
    const requirementId = await createRequirement(runtime, applicationId);
    const file = await insertFile(runtime, {
      applicationId,
      requirementId,
      userId,
      status: "ACTIVE",
    });
    await runtime.query(
      `INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, reviewed_by_user_id)
       VALUES ($1, $2, $3, 'APPROVED', $4)`,
      [applicationId, requirementId, file.rows[0]!.id, userId],
    );
    await insertToken(runtime, { applicationId, userId });
    await runtime.query(
      "INSERT INTO document_comments (application_id, body, author_user_id) VALUES ($1, 'Yorum', $2)",
      [applicationId, userId],
    );
    await runtime.query(
      "INSERT INTO application_internal_notes (application_id, body, author_user_id) VALUES ($1, 'Not', $2)",
      [applicationId, userId],
    );
    await runtime.query(
      `INSERT INTO application_status_history (application_id, to_status, transition_code, actor_type, actor_user_id)
       VALUES ($1, 'AWAITING_DOCUMENTS', 'CREATE', 'USER', $2)`,
      [applicationId, userId],
    );
    await runtime.query(
      `INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, resource_id, application_id, metadata)
       VALUES ('APPLICATION_DELETED', 'SYSTEM', NULL, 'application', $1::text, $1::uuid, '{"fileCount": 1}')`,
      [applicationId],
    );

    // Runtime rolü yalnızca applications üzerinde DELETE yetkisine sahiptir; alt kayıtlar CASCADE ile gider.
    await runtime.query("DELETE FROM applications WHERE id = $1", [applicationId]);

    const tables = [
      "application_document_requirements",
      "application_document_files",
      "document_reviews",
      "application_access_tokens",
      "document_comments",
      "application_internal_notes",
      "application_status_history",
    ];
    for (const table of tables) {
      const rows = await owner.query(`SELECT 1 FROM ${table} WHERE application_id = $1`, [
        applicationId,
      ]);
      expect(rows.rowCount, table).toBe(0);
    }
    const audit = await owner.query("SELECT 1 FROM audit_logs WHERE application_id = $1", [
      applicationId,
    ]);
    expect(audit.rowCount).toBe(1);
  });

  it("başvurusu olan hizmet ve işlem yapmış kullanıcı silinemez (RESTRICT)", async () => {
    await createApplication(runtime, created, { serviceId, userId });
    // ON DELETE RESTRICT → 23001 (restrict_violation)
    await expectPgError(owner.query("DELETE FROM services WHERE id = $1", [serviceId]), "23001");
    // Gerçek bir hesabı silmeyi denemeyiz; yalnızca geçici test hesabıyla doğrulanır.
    if (userId.startsWith(TEST_ID_PREFIX)) {
      await expectPgError(owner.query("DELETE FROM users WHERE id = $1", [userId]), "23001");
    }
  });
});

describe("Drizzle şeması ↔ veritabanı (drift)", () => {
  it("her tablonun kolonları migration sonrası veritabanıyla birebir aynıdır", async () => {
    const tables = (Object.values(schema) as unknown[]).filter(
      (value): value is PgTable =>
        typeof value === "object" &&
        value !== null &&
        Symbol.for("drizzle:IsDrizzleTable") in value,
    );
    for (const table of tables) {
      const config = getTableConfig(table);
      const result = await owner.query<{ name: string; nullable: string }>(
        "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [config.name],
      );
      const dbColumns = Object.fromEntries(
        result.rows.map((row) => [row.name, row.nullable === "NO"]),
      );
      const tsColumns = Object.fromEntries(
        config.columns.map((column) => [column.name, column.notNull]),
      );
      expect(dbColumns, config.name).toEqual(tsColumns);
    }
  });
});

describe("demo seed (idempotent)", () => {
  it("tekrar çalıştırıldığında kopya üretmez ve sonradan yapılan düzenlemeleri ezmez", async () => {
    const names = DEMO_SERVICES.map((service) => service.name);
    const idsOf = async () =>
      (
        await database.db
          .select({ id: services.id })
          .from(services)
          .where(inArray(services.name, names))
      ).map((row) => row.id);
    const before = await idsOf();

    const first = await seedDemoServices(runtime);
    expect(first.servicesCreated + first.servicesSkipped).toBe(DEMO_SERVICES.length);
    // Yalnızca bu testin oluşturduğu hizmetler temizlenir; önceden var olanlara dokunulmaz.
    created.services.push(...(await idsOf()).filter((id) => !before.includes(id)));

    const original = await runtime.query<{ description: string | null }>(
      "SELECT description FROM services WHERE name = $1",
      [names[0]],
    );
    await runtime.query("UPDATE services SET description = 'Elle düzenlendi' WHERE name = $1", [
      names[0],
    ]);
    try {
      const second = await seedDemoServices(runtime);
      expect(second).toEqual({
        servicesCreated: 0,
        servicesSkipped: DEMO_SERVICES.length,
        requirementsCreated: 0,
      });
      const edited = await runtime.query<{ description: string }>(
        "SELECT description FROM services WHERE name = $1",
        [names[0]],
      );
      expect(edited.rows[0]!.description).toBe("Elle düzenlendi");
      expect(await idsOf()).toHaveLength(DEMO_SERVICES.length);
    } finally {
      await runtime.query("UPDATE services SET description = $2 WHERE name = $1", [
        names[0],
        original.rows[0]!.description,
      ]);
    }
  });
});

describe("Türkçe arama altyapısı (BR-80)", () => {
  it("uygulamanın katladığı search_text üzerinde trigram araması çalışır", async () => {
    const applicationId = await createApplication(runtime, created, { serviceId, userId });
    // search_text uygulama tarafından Türkçe katlanır (PHASE 06): "Işıl Çağlar" → "isil caglar".
    await runtime.query(
      "UPDATE applications SET search_text = 'isil caglar isil@example.invalid' WHERE id = $1",
      [applicationId],
    );
    const found = await runtime.query(
      "SELECT 1 FROM applications WHERE id = $1 AND search_text % 'isil caglar'",
      [applicationId],
    );
    expect(found.rowCount).toBe(1);
  });

  it("veritabanı lower() fonksiyonuna Türkçe büyük/küçük harf için güvenilmez", async () => {
    const result = await runtime.query<{ dotted: string; dotless: string }>(
      "SELECT lower('İSTANBUL') AS dotted, lower('IŞIK') AS dotless",
    );
    // Türkçe kurala göre doğru sonuçlar "istanbul" ve "ışık"tır; varsayılan collation bunları üretmez.
    expect(result.rows[0]!.dotless).not.toBe("ışık");
  });
});
