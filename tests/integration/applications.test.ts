import { createHmac, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizePhone } from "@/features/applications/domain/phone";
import { getServicePreview, listApplications } from "@/features/applications/queries";
import * as applications from "@/features/applications/service";
import * as services from "@/features/services/service";
import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { parseAccessTokenEnv, type AccessTokenEnv } from "@/server/env";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { connectOwner, createRuntimePool, testId } from "./helpers";

/**
 * Başvuru yönetimi ve müşteri bağlantısı (PHASE 06, D-078…D-086). Tümü commit eden testlerdir →
 * YALNIZCA izole geçici veritabanında (D-077). Hesap: geçici `test-` hesabı; token anahtarları
 * izole ortamın rastgele anahtarlarıdır. Test token'ları gerçek müşteri bağlantısı değildir.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Runner = Pick<Database, "transaction" | "select">;

describe.runIf(isIsolatedTestDatabase())(`başvuru yönetimi — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(8);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let actor: applications.Actor;
  let env: AccessTokenEnv;

  beforeAll(async () => {
    owner = await connectOwner();
    env = parseAccessTokenEnv(process.env);
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
    await pool.end();
  });

  const tag = () => randomUUID().slice(0, 6);
  const phone = (input: string) => {
    const value = normalizePhone(input);
    if (value === null) throw new Error("phone");
    return value;
  };

  async function newService(
    requirements: { title: string; isRequired?: boolean; active?: boolean }[],
  ) {
    const created = await services.createService(db, actor, {
      name: `Başvuru Testi ${tag()}`,
      description: null,
      isActive: true,
    });
    if (!created.ok) throw new Error(created.error.code);
    const serviceId = created.data.serviceId;
    const ids: string[] = [];
    for (const item of requirements) {
      const result = await services.createRequirement(db, actor, {
        serviceId,
        title: item.title,
        description: null,
        instructions: `${item.title} talimatı\nikinci satır`,
        isRequired: item.isRequired ?? true,
      });
      if (!result.ok) throw new Error(result.error.code);
      ids.push(result.data.requirementId);
      if (item.active === false) {
        await services.setRequirementActive(db, actor, {
          serviceId,
          requirementId: result.data.requirementId,
          isActive: false,
          expectedVersion: 1,
        });
      }
    }
    return { serviceId, requirementIds: ids };
  }

  async function create(
    serviceId: string,
    overrides: Partial<applications.CreateApplicationData> = {},
    runner: Runner = db,
  ) {
    const preview = await getServicePreview(db, serviceId);
    return applications.createApplication(
      runner,
      actor,
      {
        firstName: "Çağla",
        lastName: "Işıkoğlu",
        phone: phone("0532 111 22 33"),
        email: "cagla.test@example.invalid",
        serviceId,
        idempotencyKey: randomUUID(),
        templateFingerprint: preview?.fingerprint ?? "0".repeat(64),
        ...overrides,
      },
      env,
    );
  }

  const count = async (sql: string, params: unknown[] = []) =>
    (await owner.query<{ n: number }>(sql, params)).rows[0]!.n;

  it("oluşturma: numara, ilk statü, sıralı snapshot (pasif hariç), geçmiş, token ve audit tek seferde", async () => {
    const { serviceId, requirementIds } = await newService([
      { title: "Pasaport" },
      { title: "Eski Evrak", active: false },
      { title: "Fotoğraf", isRequired: false },
    ]);
    const result = await create(serviceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.data;
    const year = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
    }).format(new Date());
    expect(created.applicationNumber).toMatch(new RegExp(`^CS-${year}-[0-9]{6}$`));
    expect(created).toMatchObject({
      status: "AWAITING_DOCUMENTS",
      replayed: false,
      customerFullName: "Çağla Işıkoğlu",
    });

    const app = (
      await owner.query(
        "SELECT status, customer_phone_e164, customer_email, search_text, service_name_snapshot, created_by_user_id, version FROM applications WHERE id = $1",
        [created.applicationId],
      )
    ).rows[0];
    expect(app).toMatchObject({
      status: "AWAITING_DOCUMENTS",
      customer_phone_e164: "+905321112233",
      customer_email: "cagla.test@example.invalid",
      created_by_user_id: actor.userId,
      version: 1,
    });
    expect(app.search_text).toContain("cagla isikoglu");
    expect(app.search_text).toContain("05321112233");

    const snap = await owner.query(
      "SELECT source_requirement_id, title, instructions, is_required, sort_order, status FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
      [created.applicationId],
    );
    expect(snap.rows.map((row) => row.title)).toEqual(["Pasaport", "Fotoğraf"]);
    expect(snap.rows[0]).toMatchObject({
      source_requirement_id: requirementIds[0],
      is_required: true,
      status: "NOT_UPLOADED",
      instructions: "Pasaport talimatı\nikinci satır",
    });
    expect(snap.rows[1]).toMatchObject({
      source_requirement_id: requirementIds[2],
      is_required: false,
    });

    const hist = await owner.query(
      "SELECT from_status, to_status, transition_code, actor_type, actor_user_id FROM application_status_history WHERE application_id = $1",
      [created.applicationId],
    );
    expect(hist.rows).toEqual([
      {
        from_status: null,
        to_status: "AWAITING_DOCUMENTS",
        transition_code: "CREATE",
        actor_type: "USER",
        actor_user_id: actor.userId,
      },
    ]);

    // Token: düz token hiçbir kolonda yok; hash = HMAC(token); şifreli kopya v1 biçiminde.
    const token = created.accessLink!.split("/b/")[1]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.accessLink).toBe(`${new URL(env.appUrl).origin}/b/${token}`);
    const tokenRow = (
      await owner.query("SELECT * FROM application_access_tokens WHERE application_id = $1", [
        created.applicationId,
      ])
    ).rows;
    expect(tokenRow).toHaveLength(1);
    expect(tokenRow[0].token_hash).toBe(
      createHmac("sha256", env.hmacKey).update(token).digest("hex"),
    );
    expect(tokenRow[0].token_ciphertext).toMatch(
      new RegExp(`^v1:${env.activeKeyId}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]{22}$`),
    );
    expect(JSON.stringify(tokenRow)).not.toContain(token);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM applications WHERE search_text LIKE '%' || $1 || '%' OR customer_email LIKE '%' || $1 || '%'",
        [token],
      ),
    ).toBe(0);

    const audit = await owner.query(
      "SELECT action, actor_user_id, resource_type, metadata FROM audit_logs WHERE application_id = $1 ORDER BY id",
      [created.applicationId],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "APPLICATION_CREATED",
      "ACCESS_LINK_CREATED",
    ]);
    expect(audit.rows[0].metadata).toEqual({ serviceId });
    expect(audit.rows[1].metadata).toEqual({ accessTokenId: tokenRow[0].id });
    const serialized = JSON.stringify(audit.rows);
    for (const secret of [
      token,
      tokenRow[0].token_hash,
      "Çağla",
      "+905321112233",
      "example.invalid",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("aynı gönderim tekrarlanırsa (sıralı ve eşzamanlı) tek başvuru; bilinçli ikinci başvuru serbest", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const key = randomUUID();
    const first = await create(serviceId, { idempotencyKey: key });
    const again = await create(serviceId, { idempotencyKey: key });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.data).toMatchObject({
      applicationId: first.data.applicationId,
      replayed: true,
      accessLink: first.data.accessLink,
    });

    const raceKey = randomUUID();
    const [a, b] = await Promise.all([
      create(serviceId, { idempotencyKey: raceKey }),
      create(serviceId, { idempotencyKey: raceKey }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.applicationId).toBe(b.data.applicationId);
    expect(
      await count("SELECT count(*)::int AS n FROM applications WHERE idempotency_key = $1", [
        raceKey,
      ]),
    ).toBe(1);

    const second = await create(serviceId);
    expect(second.ok && second.data.applicationId !== first.data.applicationId).toBe(true);
    expect(
      await count("SELECT count(*)::int AS n FROM applications WHERE service_id = $1", [serviceId]),
    ).toBe(3);
  });

  it("pasif hizmet, aktif evraksız hizmet ve eski önizleme reddedilir; hiçbir kayıt/sayaç değişmez", async () => {
    const before = await count(
      "SELECT coalesce(sum(last_value), 0)::int AS n FROM application_number_counters",
    );
    const empty = await newService([]);
    expect(await create(empty.serviceId)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { serviceId: expect.any(String) } },
    });

    const { serviceId, requirementIds } = await newService([{ title: "Pasaport" }]);
    const preview = await getServicePreview(db, serviceId);
    await services.updateRequirement(db, actor, {
      serviceId,
      requirementId: requirementIds[0]!,
      expectedVersion: 1,
      title: "Pasaport (yeni)",
      description: null,
      instructions: null,
      isRequired: true,
    });
    expect(await create(serviceId, { templateFingerprint: preview!.fingerprint })).toMatchObject({
      ok: false,
      error: { code: "STALE_PREVIEW" },
    });
    await services.moveRequirement(db, actor, {
      serviceId,
      requirementId: requirementIds[0]!,
      direction: "down",
    });

    await services.setServiceActive(db, actor, { serviceId, isActive: false, expectedVersion: 1 });
    expect(await create(serviceId, { templateFingerprint: "a".repeat(64) })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(
      await count(
        "SELECT count(*)::int AS n FROM applications WHERE service_id = ANY($1::uuid[])",
        [[empty.serviceId, serviceId]],
      ),
    ).toBe(0);
    expect(
      await count("SELECT coalesce(sum(last_value), 0)::int AS n FROM application_number_counters"),
    ).toBe(before);
  });

  it("eşzamanlı 12 oluşturma: numaralar benzersiz ve ardışık", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const results = await Promise.all(Array.from({ length: 12 }, () => create(serviceId)));
    expect(results.every((result) => result.ok)).toBe(true);
    const numbers = results.map((result) => (result.ok ? result.data.applicationNumber : ""));
    expect(new Set(numbers).size).toBe(12);
    const sequence = numbers.map((n) => Number(n.split("-")[2])).sort((x, y) => x - y);
    expect(sequence.at(-1)! - sequence[0]!).toBe(11);
  });

  function failingInsert(target: unknown): Runner {
    return {
      select: db.select.bind(db),
      transaction: ((callback: (tx: Tx) => Promise<unknown>) =>
        db.transaction((tx) =>
          callback(
            new Proxy(tx, {
              get(object, property) {
                if (property === "insert") {
                  return (table: unknown) => {
                    if (table === target) throw new Error("simüle edilmiş hata");
                    return object.insert(table as typeof schema.applications);
                  };
                }
                const value: unknown = Reflect.get(object, property);
                return typeof value === "function" ? value.bind(object) : value;
              },
            }),
          ),
        )) as Runner["transaction"],
    } as Runner;
  }

  it.each([
    ["snapshot", schema.applicationDocumentRequirements],
    ["statü geçmişi", schema.applicationStatusHistory],
    ["token", schema.applicationAccessTokens],
    ["audit", schema.auditLogs],
  ])(
    "%s yazılamazsa her şey geri alınır (başvuru, snapshot, token, sayaç)",
    async (_name, table) => {
      const { serviceId } = await newService([{ title: "Pasaport" }]);
      const counters = await count(
        "SELECT coalesce(sum(last_value), 0)::int AS n FROM application_number_counters",
      );
      const original = console.error;
      console.error = () => undefined;
      try {
        expect(await create(serviceId, {}, failingInsert(table))).toMatchObject({
          ok: false,
          error: { code: "INTERNAL" },
        });
      } finally {
        console.error = original;
      }
      expect(
        await count("SELECT count(*)::int AS n FROM applications WHERE service_id = $1", [
          serviceId,
        ]),
      ).toBe(0);
      expect(
        await count(
          "SELECT coalesce(sum(last_value), 0)::int AS n FROM application_number_counters",
        ),
      ).toBe(counters);
      expect(
        await count(
          "SELECT count(*)::int AS n FROM application_access_tokens t LEFT JOIN applications a ON a.id = t.application_id WHERE a.id IS NULL",
        ),
      ).toBe(0);
    },
  );

  it("kilit sözleşmesi: şablon mutasyonu sürerken oluşturma bekler; değişiklik commit edilince eski önizleme reddedilir", async () => {
    const { serviceId, requirementIds } = await newService([{ title: "Pasaport" }]);
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM services WHERE id = $1 FOR NO KEY UPDATE", [serviceId]);
      await holder.query(
        "UPDATE service_document_requirements SET version = version + 1, title = 'Pasaport (yarış)' WHERE id = $1",
        [requirementIds[0]],
      );
      let settled = false;
      const pending = create(serviceId).then((value) => {
        settled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false); // FOR SHARE, şablon kilidinde bekliyor
      await holder.query("COMMIT");
      expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_PREVIEW" } });
    } finally {
      holder.release();
    }
    // Güncel önizlemeyle oluşturma başarılı ve yeni başlığı alır.
    const fresh = await create(serviceId);
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      const snap = await owner.query(
        "SELECT title FROM application_document_requirements WHERE application_id = $1",
        [fresh.data.applicationId],
      );
      expect(snap.rows).toEqual([{ title: "Pasaport (yarış)" }]);
    }
  });

  it("şablon sonradan değişse de mevcut başvurunun snapshot'ı ve hizmet adı değişmez", async () => {
    const { serviceId, requirementIds } = await newService([
      { title: "A Evrakı" },
      { title: "B Evrakı" },
      { title: "C Evrakı" },
    ]);
    const created = await create(serviceId);
    if (!created.ok) throw new Error("setup");
    const read = () =>
      owner.query(
        "SELECT title, instructions, is_required, sort_order FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [created.data.applicationId],
      );
    const before = (await read()).rows;
    await services.createRequirement(db, actor, {
      serviceId,
      title: "D Evrakı",
      description: null,
      instructions: null,
      isRequired: true,
    });
    await services.updateRequirement(db, actor, {
      serviceId,
      requirementId: requirementIds[1]!,
      expectedVersion: 1,
      title: "B Yeni",
      description: null,
      instructions: "Yeni",
      isRequired: false,
    });
    await services.setRequirementActive(db, actor, {
      serviceId,
      requirementId: requirementIds[2]!,
      isActive: false,
      expectedVersion: 1,
    });
    await services.moveRequirement(db, actor, {
      serviceId,
      requirementId: requirementIds[0]!,
      direction: "down",
    });
    await services.updateService(db, actor, {
      serviceId,
      expectedVersion: 1,
      name: `Yeni Ad ${tag()}`,
      description: null,
    });
    await services.setServiceActive(db, actor, { serviceId, isActive: false, expectedVersion: 2 });
    expect((await read()).rows).toEqual(before);
    const detail = (
      await owner.query("SELECT service_name_snapshot FROM applications WHERE id = $1", [
        created.data.applicationId,
      ])
    ).rows[0];
    expect(detail.service_name_snapshot).toBe(created.data.serviceName);
    const list = await listApplications(db, {
      q: created.data.applicationNumber,
      status: "ALL",
      serviceId,
      page: 1,
      pageSize: 20,
    });
    expect(list.items.map((item) => item.applicationNumber)).toEqual([
      created.data.applicationNumber,
    ]); // pasif hizmet filtresi
  });

  it("müşteri düzenleme: yalnızca bu başvuru, version/çakışma, değişen alanlar (değerler audit'te yok)", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const first = await create(serviceId);
    const other = await create(serviceId);
    if (!first.ok || !other.ok) throw new Error("setup");
    const update = (expectedVersion: number, phoneInput: string, firstName = "Çağla") =>
      applications.updateCustomerInfo(db, actor, {
        applicationId: first.data.applicationId,
        expectedVersion,
        firstName,
        lastName: "Işıkoğlu",
        phone: phone(phoneInput),
        email: "cagla.test@example.invalid",
      });
    expect(await update(1, "+49 1512 3456789")).toEqual({
      ok: true,
      data: { version: 2, changed: true, contactChanged: true },
    });
    expect(await update(1, "+49 1512 3456789", "Ayşe")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await update(2, "+49 1512 3456789")).toEqual({
      ok: true,
      data: { version: 2, changed: false, contactChanged: false },
    });
    const rows = await owner.query(
      "SELECT id, customer_phone_e164, search_text FROM applications WHERE id = ANY($1::uuid[])",
      [[first.data.applicationId, other.data.applicationId]],
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    expect(byId.get(first.data.applicationId)).toMatchObject({
      customer_phone_e164: "+4915123456789",
    });
    expect(byId.get(first.data.applicationId).search_text).toContain("4915123456789");
    expect(byId.get(other.data.applicationId)).toMatchObject({
      customer_phone_e164: "+905321112233",
    });
    const audit = await owner.query(
      "SELECT metadata FROM audit_logs WHERE application_id = $1 AND action = 'APPLICATION_UPDATED'",
      [first.data.applicationId],
    );
    expect(audit.rows).toEqual([{ metadata: { changedFields: ["phone"] } }]);
    expect(JSON.stringify(audit.rows)).not.toContain("4915123456789");
  });

  it("arama (Türkçe, telefon, e-posta, numara), filtre, sayfalama ve belirleyici sıra", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const unique = tag();
    const made: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const result = await create(serviceId, {
        firstName: i === 0 ? "Şükrü" : "Deneme",
        lastName: `Kişi${unique}`,
        phone: phone(
          i === 0
            ? "+90 (533) 444 55 66"
            : `0532 000 ${String(1000 + i).slice(-2)} ${String(10 + i)}`,
        ),
        email: i === 0 ? `sukru.${unique}@example.invalid` : `kisi${i}.${unique}@example.invalid`,
      });
      if (!result.ok) throw new Error(result.error.code);
      made.push(result.data.applicationNumber);
    }
    const search = (
      q: string,
      extra: Partial<{ page: number; pageSize: 10 | 20 | 50; status: "ALL" | "UNDER_REVIEW" }> = {},
    ) =>
      listApplications(db, {
        q,
        status: extra.status ?? "ALL",
        serviceId,
        page: extra.page ?? 1,
        pageSize: extra.pageSize ?? 20,
      });
    expect(
      (await search(`SUKRU KİŞİ${unique.toUpperCase()}`)).items.map(
        (item) => item.applicationNumber,
      ),
    ).toEqual([made[0]]);
    for (const q of [
      "0533 444 55 66",
      "+905334445566",
      "5334445566",
      `sukru.${unique}@example.invalid`,
      made[0]!.toLowerCase(),
    ]) {
      expect(
        (await search(q)).items.map((item) => item.applicationNumber),
        q,
      ).toEqual([made[0]]);
    }
    expect((await search("%")).total).toBe(0);
    expect((await search(unique, { status: "UNDER_REVIEW" })).total).toBe(0);

    const page1 = await search(unique, { pageSize: 10 });
    const page2 = await search(unique, { pageSize: 10, page: 2 });
    expect(page1).toMatchObject({ total: 12, pageCount: 2, page: 1 });
    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(2);
    const ordered = [...page1.items, ...page2.items].map((item) => item.applicationNumber);
    expect(ordered).toEqual([...made].reverse());
    expect((await search(unique, { pageSize: 10, page: 99 })).page).toBe(2); // sınır dışı sayfa son sayfaya
    // Bağlantı durumu: test başvurularının hepsi aktif bağlantılı (alt sorgu doğru bağlanmalı).
    const tokenIds = await owner.query<{ application_id: string; id: string }>(
      "SELECT application_id, id FROM application_access_tokens WHERE revoked_at IS NULL AND application_id = ANY($1::uuid[])",
      [page1.items.map((item) => item.id)],
    );
    const activeById = new Map(tokenIds.rows.map((row) => [row.application_id, row.id]));
    for (const item of page1.items) expect(item.activeTokenId).toBe(activeById.get(item.id));
    expect(page1.items.every((item) => item.activeTokenId !== null)).toBe(true);
    expect(Object.keys(page1.items[0]!).sort()).toEqual(
      [
        "activeTokenId",
        "applicationNumber",
        "createdAt",
        "customerName",
        "id",
        "serviceName",
        "status",
      ].sort(),
    );
  });

  it("bağlantı: görüntüleme aynı bağlantıyı verir; iptal, eski onay, yeniden oluşturma, yenileme ve WhatsApp", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const created = await create(serviceId);
    if (!created.ok) throw new Error("setup");
    const applicationId = created.data.applicationId;
    const firstToken = created.data.accessTokenId!;

    expect(await applications.revealAccessLink(db, actor, applicationId, env)).toEqual({
      ok: true,
      data: { accessLink: created.data.accessLink, accessTokenId: firstToken },
    });

    const share = await applications.prepareWhatsAppShare(db, actor, applicationId, env);
    expect(share.ok).toBe(true);
    if (share.ok) {
      expect(share.data.whatsappUrl.startsWith("https://wa.me/905321112233?text=")).toBe(true);
      const text = decodeURIComponent(share.data.whatsappUrl.split("?text=")[1]!);
      expect(text).toBe(share.data.message);
      expect(
        text.startsWith(
          "Sayın Çağla Işıkoğlu,\n\nCS Global'i tercih ettiğiniz için teşekkür ederiz.",
        ),
      ).toBe(true);
      expect(text).toContain(`${created.data.serviceName} danışmanlık süreciniz için`);
      expect(text).toContain(`\n${created.data.accessLink}\n`);
    }

    // Eski kimlikle yenileme/iptal reddedilir.
    expect(
      await applications.revokeAccessLink(db, actor, {
        applicationId,
        expectedActiveTokenId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const rotated = await applications.rotateAccessLink(
      db,
      actor,
      { applicationId, expectedActiveTokenId: firstToken },
      env,
    );
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.data.accessLink).not.toBe(created.data.accessLink);
    expect(
      await applications.revokeAccessLink(db, actor, {
        applicationId,
        expectedActiveTokenId: firstToken,
      }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      await applications.revokeAccessLink(db, actor, {
        applicationId,
        expectedActiveTokenId: rotated.data.accessTokenId,
      }),
    ).toMatchObject({ ok: true });
    expect(await applications.revealAccessLink(db, actor, applicationId, env)).toEqual({
      ok: true,
      data: { accessLink: null, accessTokenId: null },
    });
    expect(await applications.prepareWhatsAppShare(db, actor, applicationId, env)).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    const recreated = await applications.rotateAccessLink(
      db,
      actor,
      { applicationId, expectedActiveTokenId: null },
      env,
    );
    expect(recreated).toMatchObject({ ok: true, data: { previousTokenId: null } });

    const rows = await owner.query(
      "SELECT id, revoke_reason, revoked_by_user_id FROM application_access_tokens WHERE application_id = $1 ORDER BY created_at",
      [applicationId],
    );
    expect(rows.rows.map((row) => row.revoke_reason)).toEqual(["ROTATED", "REVOKED", null]);
    const actions = await owner.query(
      "SELECT action FROM audit_logs WHERE application_id = $1 ORDER BY id",
      [applicationId],
    );
    expect(actions.rows.map((row) => row.action)).toEqual([
      "APPLICATION_CREATED",
      "ACCESS_LINK_CREATED",
      "ACCESS_LINK_VIEWED",
      "ACCESS_LINK_SHARE_PREPARED",
      "ACCESS_LINK_ROTATED",
      "ACCESS_LINK_REVOKED",
      "ACCESS_LINK_CREATED",
    ]);
    const auditText = JSON.stringify(
      (
        await owner.query("SELECT metadata FROM audit_logs WHERE application_id = $1", [
          applicationId,
        ])
      ).rows,
    );
    expect(auditText).not.toContain("/b/");
    expect(auditText).not.toContain("wa.me");
  });

  it("eşzamanlı yenileme ve iptal (aynı eski kimlik): yalnızca biri uygulanır, en fazla bir aktif bağlantı", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    for (let round = 0; round < 5; round += 1) {
      const created = await create(serviceId);
      if (!created.ok) throw new Error("setup");
      const input = {
        applicationId: created.data.applicationId,
        expectedActiveTokenId: created.data.accessTokenId,
      };
      const results = await Promise.all([
        applications.rotateAccessLink(db, actor, input, env),
        applications.revokeAccessLink(db, actor, input),
        applications.rotateAccessLink(db, actor, input, env),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        await count(
          "SELECT count(*)::int AS n FROM application_access_tokens WHERE application_id = $1 AND revoked_at IS NULL",
          [created.data.applicationId],
        ),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("yenileme sırasında yeni token yazılamazsa eski bağlantı aktif kalır", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const created = await create(serviceId);
    if (!created.ok) throw new Error("setup");
    const original = console.error;
    console.error = () => undefined;
    try {
      const result = await applications.rotateAccessLink(
        failingInsert(schema.applicationAccessTokens),
        actor,
        {
          applicationId: created.data.applicationId,
          expectedActiveTokenId: created.data.accessTokenId,
        },
        env,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    } finally {
      console.error = original;
    }
    expect(
      await applications.revealAccessLink(db, actor, created.data.applicationId, env),
    ).toMatchObject({ ok: true, data: { accessLink: created.data.accessLink } });
  });

  it("bozulmuş şifreli kopya veya yanlış anahtar: fail-closed, bağlantı dönmez", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const created = await create(serviceId);
    if (!created.ok) throw new Error("setup");
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const wrongKeys: AccessTokenEnv = {
        ...env,
        encryptionKeys: new Map([[env.activeKeyId, Buffer.alloc(32, 7)]]),
      };
      expect(
        await applications.revealAccessLink(db, actor, created.data.applicationId, wrongKeys),
      ).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      await owner.query(
        "UPDATE application_access_tokens SET token_ciphertext = regexp_replace(token_ciphertext, ':[^:]+$', ':AAAAAAAAAAAAAAAAAAAAAA') WHERE application_id = $1",
        [created.data.applicationId],
      );
      expect(
        await applications.revealAccessLink(db, actor, created.data.applicationId, env),
      ).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    } finally {
      console.error = original;
    }
    expect(JSON.stringify(errors)).not.toContain(created.data.accessLink!.split("/b/")[1]!);
  });

  it("silme talepli başvuru: listede yok; görüntüleme/yenileme/düzenleme reddedilir", async () => {
    const { serviceId } = await newService([{ title: "Pasaport" }]);
    const created = await create(serviceId);
    if (!created.ok) throw new Error("setup");
    await owner.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $2 WHERE id = $1",
      [created.data.applicationId, actor.userId],
    );
    const applicationId = created.data.applicationId;
    expect(await applications.revealAccessLink(db, actor, applicationId, env)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await applications.rotateAccessLink(
        db,
        actor,
        { applicationId, expectedActiveTokenId: created.data.accessTokenId },
        env,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await applications.updateCustomerInfo(db, actor, {
        applicationId,
        expectedVersion: 1,
        firstName: "A",
        lastName: "B",
        phone: phone("05321112233"),
        email: "a@example.invalid",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      (
        await listApplications(db, {
          q: created.data.applicationNumber,
          status: "ALL",
          serviceId: "",
          page: 1,
          pageSize: 20,
        })
      ).total,
    ).toBe(0);
  });
});
