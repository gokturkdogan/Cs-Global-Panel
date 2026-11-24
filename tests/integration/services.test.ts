import { randomUUID } from "node:crypto";

import { sql, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getServiceDetail, listServices } from "@/features/services/queries";
import {
  createRequirementSchema,
  createServiceSchema,
  updateRequirementSchema,
  updateServiceSchema,
} from "@/features/services/schemas";
import * as service from "@/features/services/service";
import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { connectOwner, createRuntimePool, testId } from "./helpers";

/**
 * Hizmet ve evrak şablonu yönetimi (PHASE 05, D-072…D-077).
 *
 * 1) "rollback" testleri: her test runtime rolüyle bir DIŞ transaction açar; servis katmanının
 *    transaction'ları bunun içinde SAVEPOINT olarak çalışır ve test sonunda HER ŞEY geri alınır
 *    (hizmetler, evraklar, sentetik başvurular ve audit satırları dahil). Ortak veritabanında
 *    kalıcı kayıt veya gerçek personel adına kalıcı audit oluşmaz. Aktör: mevcut hesap (yalnızca
 *    FK hedefi olarak okunur) ya da hesap yoksa transaction içinde geçici `test-` hesabı.
 * 2) "eşzamanlılık" testleri: bağımsız bağlantılar commit eder → YALNIZCA izole geçici veritabanında.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Runner = Pick<Database, "transaction">;

const pool = createRuntimePool(4);
afterAll(() => pool.end());

const parse = {
  createService: (input: unknown) => createServiceSchema.parse(input),
  updateService: (input: unknown) => updateServiceSchema.parse(input),
  createRequirement: (input: unknown) => createRequirementSchema.parse(input),
  updateRequirement: (input: unknown) => updateRequirementSchema.parse(input),
};

const uniqueName = (prefix: string) => `${prefix} ${randomUUID().slice(0, 8)}`;

async function actorIn(tx: Tx): Promise<service.Actor> {
  const existing = await tx.execute<{ id: string }>(
    sql`SELECT id FROM users ORDER BY role LIMIT 1`,
  );
  const id = existing.rows[0]?.id;
  if (id !== undefined) return { userId: id };
  const created = testId();
  await tx.execute(
    sql`INSERT INTO users (id, name, email, username, role) VALUES (${created}, 'Test', ${`${created}@staff.invalid`}, ${`t_${randomUUID().slice(0, 8)}`}, 'employee')`,
  );
  return { userId: created };
}

/** Dış transaction + iç içe savepoint'ler; sonunda tamamen geri alınır. */
async function withRollback(
  test: (context: { runner: Runner; tx: Tx; actor: service.Actor }) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  const db = drizzle({ client, schema });
  try {
    await db.transaction(async (tx) => {
      const runner = {
        transaction: (callback: never) => tx.transaction(callback),
      } as unknown as Runner;
      await test({ runner, tx, actor: await actorIn(tx) });
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  } finally {
    client.release();
  }
}

async function auditOf(tx: Tx, resourceId: string) {
  const rows = await tx.execute<{
    action: string;
    actor_type: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    sql`SELECT action, actor_type, actor_user_id, metadata FROM audit_logs WHERE resource_id = ${resourceId} ORDER BY id`,
  );
  return rows.rows;
}

async function newService(runner: Runner, actor: service.Actor, name = uniqueName("Test Hizmeti")) {
  const result = await service.createService(
    runner,
    actor,
    parse.createService({ name, description: "Açıklama", isActive: true }),
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.data.serviceId;
}

async function newRequirement(
  runner: Runner,
  actor: service.Actor,
  serviceId: string,
  title: string,
  isRequired = true,
) {
  const result = await service.createRequirement(
    runner,
    actor,
    parse.createRequirement({
      serviceId,
      title,
      description: "",
      instructions: `${title} talimatı`,
      isRequired,
    }),
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.data.requirementId;
}

describe("hizmet yönetimi (rollback ile izole)", () => {
  it("hizmet oluşturma: oturumdaki aktör, version 1, sıra değeri; audit aynı transaction'da", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const name = uniqueName("Almanya Çalışma Vizesi");
      const serviceId = await newService(runner, actor, name);
      const [row] = (
        await tx.execute<{
          created_by_user_id: string;
          updated_by_user_id: string;
          version: number;
          sort_order: number;
          is_active: boolean;
        }>(
          sql`SELECT created_by_user_id, updated_by_user_id, version, sort_order, is_active FROM services WHERE id = ${serviceId}`,
        )
      ).rows;
      expect(row).toMatchObject({
        created_by_user_id: actor.userId,
        updated_by_user_id: actor.userId,
        version: 1,
        is_active: true,
      });
      expect(row!.sort_order).toBeGreaterThan(0);
      const audit = await auditOf(tx, serviceId);
      expect(audit).toEqual([
        {
          action: "SERVICE_CREATED",
          actor_type: "USER",
          actor_user_id: actor.userId,
          metadata: { changedFields: ["name", "description", "isActive"] },
        },
      ]);
      expect(JSON.stringify(audit)).not.toContain(name);
    });
  });

  it("aynı ad (büyük/küçük harf ve Türkçe İ dahil) DUPLICATE ile reddedilir", async () => {
    await withRollback(async ({ runner, actor }) => {
      const suffix = randomUUID().slice(0, 6);
      await newService(runner, actor, `İzmir Vizesi ${suffix}`);
      for (const name of [`izmir vizesi ${suffix}`, `İZMİR VİZESİ ${suffix}`]) {
        const result = await service.createService(
          runner,
          actor,
          parse.createService({ name, description: "", isActive: false }),
        );
        expect(result).toMatchObject({
          ok: false,
          error: { code: "DUPLICATE", fieldErrors: { name: "Bu adla bir hizmet zaten var." } },
        });
      }
    });
  });

  it("güncelleme: version artar, değişen alanlar audit'e; eski version CONFLICT; değişiklik yoksa no-op", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceId = await newService(runner, actor);
      const update = (name: string, expectedVersion: number) =>
        service.updateService(
          runner,
          actor,
          parse.updateService({ serviceId, name, description: "Açıklama", expectedVersion }),
        );
      const renamed = uniqueName("Yeni Ad");
      expect(await update(renamed, 1)).toEqual({ ok: true, data: { version: 2, changed: true } });
      expect(await update(uniqueName("Bayat"), 1)).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
      expect(await update(renamed, 2)).toEqual({ ok: true, data: { version: 2, changed: false } });
      const audit = await auditOf(tx, serviceId);
      expect(audit.map((entry) => entry.action)).toEqual(["SERVICE_CREATED", "SERVICE_UPDATED"]);
      expect(audit[1]!.metadata).toEqual({ changedFields: ["name"] });
    });
  });

  it("aktif/pasif: audit olayları, aktif evrak sayısı, aynı duruma geçiş no-op", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceId = await newService(runner, actor);
      const set = (isActive: boolean, expectedVersion: number) =>
        service.setServiceActive(runner, actor, { serviceId, isActive, expectedVersion });
      expect(await set(false, 1)).toEqual({
        ok: true,
        data: { version: 2, activeRequirementCount: 0 },
      });
      expect(await set(false, 2)).toEqual({
        ok: true,
        data: { version: 2, activeRequirementCount: 0 },
      });
      await newRequirement(runner, actor, serviceId, "Pasaport");
      expect(await set(true, 2)).toEqual({
        ok: true,
        data: { version: 3, activeRequirementCount: 1 },
      });
      expect((await auditOf(tx, serviceId)).map((entry) => entry.action)).toEqual([
        "SERVICE_CREATED",
        "SERVICE_DEACTIVATED",
        "SERVICE_ACTIVATED",
      ]);
    });
  });

  it("var olmayan hizmet/evrak NOT_FOUND döner", async () => {
    await withRollback(async ({ runner, actor }) => {
      const missing = randomUUID();
      expect(
        await service.updateService(
          runner,
          actor,
          parse.updateService({
            serviceId: missing,
            name: "Yok Hizmet",
            description: "",
            expectedVersion: 1,
          }),
        ),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        await service.setServiceActive(runner, actor, {
          serviceId: missing,
          isActive: false,
          expectedVersion: 1,
        }),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        await service.createRequirement(
          runner,
          actor,
          parse.createRequirement({
            serviceId: missing,
            title: "Pasaport",
            description: "",
            instructions: "",
            isRequired: true,
          }),
        ),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });
  });

  it("evrak: sıra 10/20/30, zorunluluk, düz metin talimat (satır sonu ve HTML aynen saklanır), audit", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceId = await newService(runner, actor);
      const payload =
        'Fotoğraflı sayfayı yükleyin.\n<script>alert("x")</script> & <img src=x onerror=alert(1)>';
      const created = await service.createRequirement(
        runner,
        actor,
        parse.createRequirement({
          serviceId,
          title: "Pasaport",
          description: "",
          instructions: payload,
          isRequired: false,
        }),
      );
      expect(created.ok).toBe(true);
      await newRequirement(runner, actor, serviceId, "Kimlik");
      await newRequirement(runner, actor, serviceId, "İş Sözleşmesi");
      const detail = await getServiceDetail(tx, serviceId);
      expect(detail?.requirements.map((item) => item.title)).toEqual([
        "Pasaport",
        "Kimlik",
        "İş Sözleşmesi",
      ]);
      expect(detail?.requirements[0]).toMatchObject({
        instructions: payload,
        isRequired: false,
        isActive: true,
        version: 1,
        description: null,
      });
      const sorts = await tx.execute<{ sort_order: number; created_by_user_id: string }>(
        sql`SELECT sort_order, created_by_user_id FROM service_document_requirements WHERE service_id = ${serviceId} ORDER BY sort_order`,
      );
      expect(sorts.rows.map((row) => row.sort_order)).toEqual([10, 20, 30]);
      expect(sorts.rows.every((row) => row.created_by_user_id === actor.userId)).toBe(true);
      const audit = await auditOf(tx, created.ok ? created.data.requirementId : "");
      expect(audit[0]).toMatchObject({
        action: "DOCUMENT_TEMPLATE_CREATED",
        metadata: { serviceId },
      });
      expect(JSON.stringify(audit)).not.toMatch(/<script>|alert|Fotoğraflı/);
    });
  });

  it("evrak güncelleme ve aktif/pasif; başka hizmetin evrakı değiştirilemez (IDOR → NOT_FOUND)", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceA = await newService(runner, actor);
      const serviceB = await newService(runner, actor);
      const requirementB = await newRequirement(runner, actor, serviceB, "Pasaport");
      const update = (serviceId: string, expectedVersion: number, title = "Pasaport (güncel)") =>
        service.updateRequirement(
          runner,
          actor,
          parse.updateRequirement({
            serviceId,
            requirementId: requirementB,
            title,
            description: "",
            instructions: "Yeni talimat",
            isRequired: false,
            expectedVersion,
          }),
        );
      expect(await update(serviceA, 1)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        await service.setRequirementActive(runner, actor, {
          serviceId: serviceA,
          requirementId: requirementB,
          isActive: false,
          expectedVersion: 1,
        }),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(
        await service.moveRequirement(runner, actor, {
          serviceId: serviceA,
          requirementId: requirementB,
          direction: "up",
        }),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

      expect(await update(serviceB, 1)).toEqual({ ok: true, data: { version: 2, changed: true } });
      expect(await update(serviceB, 1, "Bayat başlık")).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
      expect(
        await service.setRequirementActive(runner, actor, {
          serviceId: serviceB,
          requirementId: requirementB,
          isActive: false,
          expectedVersion: 2,
        }),
      ).toEqual({ ok: true, data: { version: 3 } });
      const audit = await auditOf(tx, requirementB);
      expect(audit.map((entry) => entry.action)).toEqual([
        "DOCUMENT_TEMPLATE_CREATED",
        "DOCUMENT_TEMPLATE_UPDATED",
        "DOCUMENT_TEMPLATE_DEACTIVATED",
      ]);
      expect(audit[1]!.metadata).toEqual({
        serviceId: serviceB,
        changedFields: ["title", "instructions", "isRequired"],
      });
    });
  });

  it("sıralama: komşuyla yer değiştirir, 10'ar yeniden numaralar, uçta no-op, version artmaz, diğer hizmet etkilenmez", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceId = await newService(runner, actor);
      const other = await newService(runner, actor);
      const otherRequirement = await newRequirement(runner, actor, other, "Başka");
      const [a, b, c] = [
        await newRequirement(runner, actor, serviceId, "A Evrakı"),
        await newRequirement(runner, actor, serviceId, "B Evrakı"),
        await newRequirement(runner, actor, serviceId, "C Evrakı"),
      ];
      // B pasif: pasif evraklar sırada yerini korur.
      await service.setRequirementActive(runner, actor, {
        serviceId,
        requirementId: b!,
        isActive: false,
        expectedVersion: 1,
      });
      const move = (requirementId: string, direction: "up" | "down") =>
        service.moveRequirement(runner, actor, { serviceId, requirementId, direction });
      expect(await move(a!, "up")).toEqual({ ok: true, data: { moved: false } });
      expect(await move(c!, "down")).toEqual({ ok: true, data: { moved: false } });
      expect(await move(c!, "up")).toEqual({ ok: true, data: { moved: true } });
      expect(await move(c!, "up")).toEqual({ ok: true, data: { moved: true } });
      const rows = await tx.execute<{ id: string; sort_order: number; version: number }>(
        sql`SELECT id, sort_order, version FROM service_document_requirements WHERE service_id = ${serviceId} ORDER BY sort_order`,
      );
      expect(rows.rows.map((row) => [row.id, row.sort_order])).toEqual([
        [c, 10],
        [a, 20],
        [b, 30],
      ]);
      expect(rows.rows.find((row) => row.id === c)!.version).toBe(1);
      const untouched = await tx.execute<{ sort_order: number }>(
        sql`SELECT sort_order FROM service_document_requirements WHERE id = ${otherRequirement}`,
      );
      expect(untouched.rows[0]!.sort_order).toBe(10);
      const audit = await auditOf(tx, c!);
      expect(audit.at(-1)).toMatchObject({
        action: "DOCUMENT_TEMPLATE_UPDATED",
        metadata: { serviceId, changedFields: ["sortOrder"] },
      });
    });
  });

  it("audit yazılamazsa domain değişikliği de geri alınır (atomiklik)", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceId = await newService(runner, actor);
      const failingAudit = {
        transaction: (callback: (inner: Tx) => Promise<unknown>) =>
          runner.transaction((inner) =>
            callback(
              new Proxy(inner, {
                get(target, property) {
                  if (property === "insert") {
                    return (table: unknown) => {
                      if (table === schema.auditLogs) throw new Error("audit kullanılamıyor");
                      return target.insert(table as typeof schema.services);
                    };
                  }
                  const value: unknown = Reflect.get(target, property);
                  return typeof value === "function" ? value.bind(target) : value;
                },
              }),
            ),
          ),
      } as unknown as Runner;
      const errors: unknown[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        const result = await service.updateService(
          failingAudit,
          actor,
          parse.updateService({
            serviceId,
            name: uniqueName("Kaydedilmemeli"),
            description: "",
            expectedVersion: 1,
          }),
        );
        expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
        const created = await service.createRequirement(
          failingAudit,
          actor,
          parse.createRequirement({
            serviceId,
            title: "Kaydedilmemeli",
            description: "",
            instructions: "",
            isRequired: true,
          }),
        );
        expect(created).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      } finally {
        console.error = original;
      }
      const row = await tx.execute<{ version: number; n: number }>(
        sql`SELECT version, (SELECT count(*)::int FROM service_document_requirements WHERE service_id = ${serviceId}) AS n FROM services WHERE id = ${serviceId}`,
      );
      expect(row.rows[0]).toEqual({ version: 1, n: 0 });
      expect(JSON.stringify(errors)).not.toContain("Kaydedilmemeli");
    });
  });

  it("liste: Türkçe karakter duyarsız arama, durum filtreleri, evrak sayıları, LIKE özel karakterleri", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const tag = randomUUID().slice(0, 6);
      const active = await newService(runner, actor, `Öğrenci Çalışma İzni ${tag}`);
      const passive = await newService(runner, actor, `Işık Turizm Vizesi ${tag}`);
      await service.setServiceActive(runner, actor, {
        serviceId: passive,
        isActive: false,
        expectedVersion: 1,
      });
      await newRequirement(runner, actor, active, "Pasaport", true);
      await newRequirement(runner, actor, active, "Fotoğraf", false);
      const pasif = await newRequirement(runner, actor, active, "Eski Evrak", true);
      await service.setRequirementActive(runner, actor, {
        serviceId: active,
        requirementId: pasif,
        isActive: false,
        expectedVersion: 1,
      });

      const names = async (q: string, status: "all" | "active" | "inactive" = "all") =>
        (await listServices(tx, { q, status })).items
          .map((item) => item.name)
          .filter((name) => name.endsWith(tag));
      for (const query of ["ogrenci calisma", "ÖĞRENCİ ÇALIŞMA", `izni ${tag}`, `IZNI ${tag}`]) {
        expect(await names(query)).toEqual([`Öğrenci Çalışma İzni ${tag}`]);
      }
      expect(await names("isik turizm")).toEqual([`Işık Turizm Vizesi ${tag}`]);
      expect(await names("IŞIK TURİZM")).toEqual([`Işık Turizm Vizesi ${tag}`]);
      expect(await names(tag, "active")).toEqual([`Öğrenci Çalışma İzni ${tag}`]);
      expect(await names(tag, "inactive")).toEqual([`Işık Turizm Vizesi ${tag}`]);
      expect(await names(tag)).toEqual([
        `Işık Turizm Vizesi ${tag}`,
        `Öğrenci Çalışma İzni ${tag}`,
      ]);
      expect((await listServices(tx, { q: `%${tag}`, status: "all" })).items).toEqual([]);
      expect((await listServices(tx, { q: "_", status: "all" })).items).toEqual([]);

      const item = (await listServices(tx, { q: tag, status: "active" })).items[0]!;
      expect(item).toMatchObject({
        activeRequirementCount: 2,
        requiredRequirementCount: 1,
        isActive: true,
      });
      expect(Object.keys(item).sort()).toEqual(
        [
          "activeRequirementCount",
          "description",
          "id",
          "isActive",
          "name",
          "requiredRequirementCount",
          "updatedAt",
        ].sort(),
      );
      const empty = await listServices(tx, { q: `yok-${randomUUID()}`, status: "all" });
      expect(empty).toMatchObject({ items: [], catalogEmpty: false, truncated: false });
    });
  });

  it("SNAPSHOT: şablon değişiklikleri mevcut başvurunun evrak listesini ve hizmet adını değiştirmez (BR-31)", async () => {
    await withRollback(async ({ runner, tx, actor }) => {
      const serviceName = uniqueName("Snapshot Hizmeti");
      const serviceId = await newService(runner, actor, serviceName);
      const [a, b, c] = [
        await newRequirement(runner, actor, serviceId, "A Evrakı"),
        await newRequirement(runner, actor, serviceId, "B Evrakı"),
        await newRequirement(runner, actor, serviceId, "C Evrakı"),
      ];

      // PHASE 06 sözleşmesi: hizmet FOR SHARE → aktif şablonlar belirleyici sırada → kopya.
      const application = await tx.execute<{ id: string }>(sql`
        INSERT INTO applications (application_number, customer_first_name, customer_last_name,
          customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot, created_by_user_id)
        SELECT ${`CS-2095-${String(Math.floor(Math.random() * 900000) + 100000)}`}, 'Test', 'Müşteri', '+905550000097',
          'snapshot@example.invalid', 'test musteri', s.id, s.name, ${actor.userId}
        FROM services s WHERE s.id = ${serviceId} FOR SHARE
        RETURNING id`);
      const applicationId = application.rows[0]!.id;
      const copySnapshot = (targetApplicationId: string) =>
        tx.execute(sql`
        INSERT INTO application_document_requirements
          (application_id, source_requirement_id, title, description, instructions, is_required, sort_order)
        SELECT ${targetApplicationId}, r.id, r.title, r.description, r.instructions, r.is_required, r.sort_order
        FROM service_document_requirements r
        WHERE r.service_id = ${serviceId} AND r.is_active
        ORDER BY r.sort_order, r.created_at, r.id`);
      await copySnapshot(applicationId);
      const readSnapshot = async (targetApplicationId: string) =>
        (
          await tx.execute<{
            title: string;
            instructions: string | null;
            is_required: boolean;
            sort_order: number;
            source_requirement_id: string | null;
          }>(sql`
            SELECT title, instructions, is_required, sort_order, source_requirement_id
            FROM application_document_requirements WHERE application_id = ${targetApplicationId} ORDER BY sort_order, title`)
        ).rows;
      const before = await readSnapshot(applicationId);
      expect(before.map((row) => row.title)).toEqual(["A Evrakı", "B Evrakı", "C Evrakı"]);

      // Şablon değişiklikleri: D eklenir, B'nin adı/talimatı/zorunluluğu değişir, C pasifleşir,
      // sıra değişir, hizmet adı/açıklaması değişir, hizmet pasifleşir.
      const d = await newRequirement(runner, actor, serviceId, "D Evrakı");
      await service.updateRequirement(
        runner,
        actor,
        parse.updateRequirement({
          serviceId,
          requirementId: b!,
          title: "B Evrakı (yeni)",
          description: "",
          instructions: "Yeni talimat",
          isRequired: false,
          expectedVersion: 1,
        }),
      );
      await service.setRequirementActive(runner, actor, {
        serviceId,
        requirementId: c!,
        isActive: false,
        expectedVersion: 1,
      });
      await service.moveRequirement(runner, actor, {
        serviceId,
        requirementId: d,
        direction: "up",
      });
      await service.moveRequirement(runner, actor, {
        serviceId,
        requirementId: a!,
        direction: "down",
      });
      await service.updateService(
        runner,
        actor,
        parse.updateService({
          serviceId,
          name: uniqueName("Yeniden Adlandırıldı"),
          description: "Yeni",
          expectedVersion: 1,
        }),
      );
      await service.setServiceActive(runner, actor, {
        serviceId,
        isActive: false,
        expectedVersion: 2,
      });

      expect(await readSnapshot(applicationId)).toEqual(before);
      const app = await tx.execute<{ service_name_snapshot: string; service_id: string }>(
        sql`SELECT service_name_snapshot, service_id FROM applications WHERE id = ${applicationId}`,
      );
      expect(app.rows[0]).toEqual({ service_name_snapshot: serviceName, service_id: serviceId });

      // Yeni başvuru güncel aktif şablonları alır: A, B (güncel) ve D — C yok.
      const second = await tx.execute<{ id: string }>(sql`
        INSERT INTO applications (application_number, customer_first_name, customer_last_name,
          customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot, created_by_user_id)
        VALUES (${`CS-2095-${String(Math.floor(Math.random() * 900000) + 100000)}`}, 'Test', 'Müşteri', '+905550000097',
          'snapshot@example.invalid', 'test musteri', ${serviceId}, 'Yeni Ad', ${actor.userId}) RETURNING id`);
      await copySnapshot(second.rows[0]!.id);
      const fresh = await readSnapshot(second.rows[0]!.id);
      expect(fresh.map((row) => row.title).sort()).toEqual(
        ["A Evrakı", "B Evrakı (yeni)", "D Evrakı"].sort(),
      );
      expect(fresh.find((row) => row.title === "B Evrakı (yeni)")).toMatchObject({
        instructions: "Yeni talimat",
        is_required: false,
      });
    });
  });
});

describe.runIf(isIsolatedTestDatabase())(
  `eşzamanlılık (bağımsız bağlantılar, commit) — ${ISOLATION_SKIP_REASON}`,
  () => {
    let owner: pg.Client;
    let actor: service.Actor;
    const dbA = drizzle({ client: createRuntimePool(3), schema });
    const dbB = drizzle({ client: createRuntimePool(3), schema });

    beforeAll(async () => {
      owner = await connectOwner();
      const existing = await owner.query<{ id: string }>(
        "SELECT id FROM users ORDER BY role LIMIT 1",
      );
      let id = existing.rows[0]?.id;
      if (id === undefined) {
        id = testId();
        await owner.query(
          "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Test', $1 || '@staff.invalid', $2, 'employee')",
          [id, `t_${randomUUID().slice(0, 8)}`],
        );
      }
      actor = { userId: id };
    });

    afterAll(async () => {
      await owner.end();
      await dbA.$client.end();
      await dbB.$client.end();
    });

    const committedService = async () => {
      const result = await service.createService(
        dbA,
        actor,
        parse.createService({ name: uniqueName("Eşzamanlı"), description: "", isActive: true }),
      );
      if (!result.ok) throw new Error(result.error.code);
      return result.data.serviceId;
    };

    it("aynı hizmetin eşzamanlı düzenlenmesi: biri başarılı, diğeri CONFLICT; kayıp güncelleme yok", async () => {
      const serviceId = await committedService();
      const results = await Promise.all([
        service.updateService(
          dbA,
          actor,
          parse.updateService({
            serviceId,
            name: uniqueName("Birinci"),
            description: "",
            expectedVersion: 1,
          }),
        ),
        service.updateService(
          dbB,
          actor,
          parse.updateService({
            serviceId,
            name: uniqueName("İkinci"),
            description: "",
            expectedVersion: 1,
          }),
        ),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        results.filter((result) => !result.ok && result.error.code === "CONFLICT"),
      ).toHaveLength(1);
      const audit = await owner.query(
        "SELECT 1 FROM audit_logs WHERE resource_id = $1 AND action = 'SERVICE_UPDATED'",
        [serviceId],
      );
      expect(audit.rowCount).toBe(1);
      const row = await owner.query<{ version: number }>(
        "SELECT version FROM services WHERE id = $1",
        [serviceId],
      );
      expect(row.rows[0]!.version).toBe(2);
    });

    it("aynı evrakta pasifleştirme ve düzenleme yarışı: yalnızca biri uygulanır", async () => {
      const serviceId = await committedService();
      const created = await service.createRequirement(
        dbA,
        actor,
        parse.createRequirement({
          serviceId,
          title: "Pasaport",
          description: "",
          instructions: "",
          isRequired: true,
        }),
      );
      if (!created.ok) throw new Error("setup");
      const requirementId = created.data.requirementId;
      const results = await Promise.all([
        service.setRequirementActive(dbA, actor, {
          serviceId,
          requirementId,
          isActive: false,
          expectedVersion: 1,
        }),
        service.updateRequirement(
          dbB,
          actor,
          parse.updateRequirement({
            serviceId,
            requirementId,
            title: "Pasaport (yeni)",
            description: "",
            instructions: "",
            isRequired: true,
            expectedVersion: 1,
          }),
        ),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        results.filter((result) => !result.ok && result.error.code === "CONFLICT"),
      ).toHaveLength(1);
    });

    it("eşzamanlı evrak ekleme: sıra değerleri çakışmaz", async () => {
      const serviceId = await committedService();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          service.createRequirement(
            index % 2 === 0 ? dbA : dbB,
            actor,
            parse.createRequirement({
              serviceId,
              title: `Evrak ${index}`,
              description: "",
              instructions: "",
              isRequired: true,
            }),
          ),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      const rows = await owner.query<{ sort_order: number }>(
        "SELECT sort_order FROM service_document_requirements WHERE service_id = $1 ORDER BY sort_order",
        [serviceId],
      );
      expect(rows.rows.map((row) => row.sort_order)).toEqual([10, 20, 30, 40, 50, 60]);
    });

    it("eşzamanlı sıralama: tüm evraklar korunur, sıra değerleri benzersiz ve ardışık", async () => {
      const serviceId = await committedService();
      const ids: string[] = [];
      for (const title of ["Bir", "İki", "Üç", "Dört"]) {
        const created = await service.createRequirement(
          dbA,
          actor,
          parse.createRequirement({
            serviceId,
            title,
            description: "",
            instructions: "",
            isRequired: true,
          }),
        );
        if (!created.ok) throw new Error("setup");
        ids.push(created.data.requirementId);
      }
      const results = await Promise.all([
        service.moveRequirement(dbA, actor, { serviceId, requirementId: ids[3]!, direction: "up" }),
        service.moveRequirement(dbB, actor, {
          serviceId,
          requirementId: ids[0]!,
          direction: "down",
        }),
        service.moveRequirement(dbA, actor, { serviceId, requirementId: ids[2]!, direction: "up" }),
      ]);
      expect(results.every((result) => result.ok)).toBe(true);
      const rows = await owner.query<{ id: string; sort_order: number }>(
        "SELECT id, sort_order FROM service_document_requirements WHERE service_id = $1 ORDER BY sort_order",
        [serviceId],
      );
      expect(rows.rows.map((row) => row.sort_order)).toEqual([10, 20, 30, 40]);
      expect(rows.rows.map((row) => row.id).sort()).toEqual([...ids].sort());
    });

    it("PHASE 06 kilit sözleşmesi: şablon mutasyonu sürerken snapshot okuyucusu (FOR SHARE) bekler", async () => {
      const serviceId = await committedService();
      const holder = await pool.connect();
      const reader = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT id FROM services WHERE id = $1 FOR NO KEY UPDATE", [serviceId]);
        await reader.query("BEGIN");
        await reader.query("SET LOCAL lock_timeout = '300ms'");
        await expect(
          reader.query("SELECT id FROM services WHERE id = $1 FOR SHARE", [serviceId]),
        ).rejects.toMatchObject({ code: "55P03" });
        await reader.query("ROLLBACK");
        await holder.query("ROLLBACK");
        // Kilit bırakılınca okuyucu devam eder.
        await reader.query("BEGIN");
        const ok = await reader.query("SELECT id FROM services WHERE id = $1 FOR SHARE", [
          serviceId,
        ]);
        expect(ok.rowCount).toBe(1);
        await reader.query("ROLLBACK");
      } finally {
        holder.release();
        reader.release();
      }
    });
  },
);
