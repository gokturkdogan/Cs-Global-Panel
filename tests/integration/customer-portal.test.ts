import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizePhone } from "@/features/applications/domain/phone";
import { getServicePreview } from "@/features/applications/queries";
import * as applications from "@/features/applications/service";
import { getCustomerPortalView } from "@/features/customer-portal/queries";
import * as services from "@/features/services/service";
import { checkCustomerAccess, resolveAccessToken } from "@/server/customer-session/access";
import { createSessionValue, newContextId } from "@/server/customer-session/session";
import * as schema from "@/server/db/schema";
import { parseAccessTokenEnv, parseCustomerSessionEnv } from "@/server/env";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { connectOwner, createRuntimePool, insertFile, testId } from "./helpers";

/**
 * Müşteri portalı erişimi (PHASE 07, D-087…D-092). Commit eden testler → YALNIZCA izole veritabanı.
 * Sentetik müşteri verisi; test token'ları gerçek bağlantı değildir.
 */
describe.runIf(isIsolatedTestDatabase())(`müşteri portalı — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(6);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let actor: applications.Actor;
  const tokenEnv = parseAccessTokenEnv(process.env);
  const sessionEnv = parseCustomerSessionEnv(process.env);

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
    await pool.end();
  });

  async function newApplication(firstName = "Ayşe") {
    const service = await services.createService(db, actor, {
      name: `Portal Testi ${randomUUID().slice(0, 6)}`,
      description: null,
      isActive: true,
    });
    if (!service.ok) throw new Error("service");
    const serviceId = service.data.serviceId;
    for (const [title, isRequired] of [
      ["Pasaport", true],
      ["Fotoğraf", false],
      ["Banka Dökümü", true],
    ] as const) {
      await services.createRequirement(db, actor, {
        serviceId,
        title,
        description: null,
        instructions: `${title} talimatı\n<script>alert(1)</script>`,
        isRequired,
      });
    }
    const preview = await getServicePreview(db, serviceId);
    const created = await applications.createApplication(
      db,
      actor,
      {
        firstName,
        lastName: "Yıldız",
        phone: normalizePhone("0532 777 88 99")!,
        email: `portal.${randomUUID().slice(0, 6)}@example.invalid`,
        serviceId,
        idempotencyKey: randomUUID(),
        templateFingerprint: preview!.fingerprint,
      },
      tokenEnv,
    );
    if (!created.ok) throw new Error(created.error.code);
    return { ...created.data, serviceId, token: created.data.accessLink!.split("/b/")[1]! };
  }

  const cookieFor = (
    applicationId: string,
    tokenId: string,
    contextId = newContextId(),
    nowSeconds?: number,
  ) => ({
    contextId,
    value: createSessionValue({ applicationId, tokenId, contextId }, sessionEnv.secret, nowSeconds)
      .value,
  });

  const state = async (applicationId: string) =>
    (
      await owner.query(
        `SELECT a.status, a.version, a.updated_at, (SELECT json_agg(json_build_object('id', t.id, 'revoked', t.revoked_at) ORDER BY t.created_at) FROM application_access_tokens t WHERE t.application_id = a.id) AS tokens,
              (SELECT count(*)::int FROM audit_logs WHERE application_id = a.id) AS audits
       FROM applications a WHERE a.id = $1`,
        [applicationId],
      )
    ).rows[0];

  it("token çözümleme: geçerli → başvuru/token; biçimsiz, kanonik olmayan, bilinmeyen → null; okuma hiçbir şeyi değiştirmez", async () => {
    const app = await newApplication();
    const before = await state(app.applicationId);
    expect(await resolveAccessToken(db, app.token, tokenEnv.hmacKey)).toEqual({
      applicationId: app.applicationId,
      tokenId: app.accessTokenId,
    });
    for (const bad of [
      "",
      "kısa",
      `${app.token}A`,
      app.token.slice(0, 42) + "+",
      "A".repeat(43),
      randomUUID(),
    ]) {
      expect(await resolveAccessToken(db, bad, tokenEnv.hmacKey)).toBeNull();
    }
    // Son karakteri farklı ama aynı baytlara çözülen (kanonik olmayan) biçim reddedilir.
    const last = app.token.at(-1)!;
    const alias = app.token.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) ^ 1);
    if (Buffer.from(alias, "base64url").equals(Buffer.from(app.token, "base64url"))) {
      expect(await resolveAccessToken(db, alias, tokenEnv.hmacKey)).toBeNull();
    }
    for (let i = 0; i < 3; i += 1) await resolveAccessToken(db, app.token, tokenEnv.hmacKey);
    expect(await state(app.applicationId)).toEqual(before); // GET/çözümleme yan etkisiz (BR-105)
  });

  it("oturum: geçerli; bağlam uyuşmazlığı, değiştirilmiş, süresi dolmuş, eksik → reddedilir", async () => {
    const app = await newApplication();
    const { contextId, value } = cookieFor(app.applicationId, app.accessTokenId!);
    expect(await checkCustomerAccess(contextId, value, sessionEnv, db)).toMatchObject({
      ok: true,
      access: { applicationId: app.applicationId, tokenId: app.accessTokenId },
    });
    expect(await checkCustomerAccess(newContextId(), value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "context_mismatch",
    });
    expect(
      await checkCustomerAccess(contextId, `${value.slice(0, -2)}AA`, sessionEnv, db),
    ).toMatchObject({ ok: false });
    expect(await checkCustomerAccess(contextId, undefined, sessionEnv, db)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(await checkCustomerAccess("geçersiz", value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "missing",
    });
    const old = cookieFor(
      app.applicationId,
      app.accessTokenId!,
      newContextId(),
      Math.floor(Date.now() / 1000) - 8 * 86400,
    );
    expect(await checkCustomerAccess(old.contextId, old.value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "expired",
    });
    // Başka başvurunun token kimliğiyle eşleştirilmiş (sahte) oturum reddedilir.
    const other = await newApplication("Mehmet");
    const forged = cookieFor(app.applicationId, other.accessTokenId!);
    expect(await checkCustomerAccess(forged.contextId, forged.value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("iptal: bu token'a bağlı TÜM oturumlar (farklı tarayıcılar) bir sonraki istekte reddedilir; yeniden oluşturulan bağlantı çalışır", async () => {
    const app = await newApplication();
    const sessions = [
      cookieFor(app.applicationId, app.accessTokenId!),
      cookieFor(app.applicationId, app.accessTokenId!),
    ];
    for (const session of sessions)
      expect((await checkCustomerAccess(session.contextId, session.value, sessionEnv, db)).ok).toBe(
        true,
      );
    await applications.revokeAccessLink(db, actor, {
      applicationId: app.applicationId,
      expectedActiveTokenId: app.accessTokenId,
    });
    for (const session of sessions)
      expect(await checkCustomerAccess(session.contextId, session.value, sessionEnv, db)).toEqual({
        ok: false,
        reason: "invalid",
      });
    expect(await resolveAccessToken(db, app.token, tokenEnv.hmacKey)).toBeNull();
    const recreated = await applications.rotateAccessLink(
      db,
      actor,
      { applicationId: app.applicationId, expectedActiveTokenId: null },
      tokenEnv,
    );
    if (!recreated.ok) throw new Error("rotate");
    expect(
      await resolveAccessToken(db, recreated.data.accessLink.split("/b/")[1]!, tokenEnv.hmacKey),
    ).toEqual({ applicationId: app.applicationId, tokenId: recreated.data.accessTokenId });
  });

  it("yenileme: eski token ve eski oturumlar reddedilir; yeni token çalışır", async () => {
    const app = await newApplication();
    const session = cookieFor(app.applicationId, app.accessTokenId!);
    const rotated = await applications.rotateAccessLink(
      db,
      actor,
      { applicationId: app.applicationId, expectedActiveTokenId: app.accessTokenId },
      tokenEnv,
    );
    if (!rotated.ok) throw new Error("rotate");
    expect(await checkCustomerAccess(session.contextId, session.value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await resolveAccessToken(db, app.token, tokenEnv.hmacKey)).toBeNull();
    const fresh = await resolveAccessToken(
      db,
      rotated.data.accessLink.split("/b/")[1]!,
      tokenEnv.hmacKey,
    );
    expect(fresh?.tokenId).toBe(rotated.data.accessTokenId);
  });

  it("silme sürecindeki başvuru: token çözülmez, oturum reddedilir", async () => {
    const app = await newApplication();
    const session = cookieFor(app.applicationId, app.accessTokenId!);
    await owner.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $2 WHERE id = $1",
      [app.applicationId, actor.userId],
    );
    expect(await resolveAccessToken(db, app.token, tokenEnv.hmacKey)).toBeNull();
    expect(await checkCustomerAccess(session.contextId, session.value, sessionEnv, db)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("portal görünümü: yalnızca kendi başvurusu, snapshot, sıra; iç not/telefon/e-posta/token/kimlik yok; düzeltme açıklaması yalnızca müşteriye yönelik metin", async () => {
    const app = await newApplication("Zeynep");
    const other = await newApplication("Başkası");
    const noteMarker = `IC-NOT-${randomUUID()}`;
    await owner.query(
      "INSERT INTO application_internal_notes (application_id, body, author_user_id) VALUES ($1, $2, $3)",
      [app.applicationId, noteMarker, actor.userId],
    );

    // Şablon sonradan değişir → müşteri başvuru anındaki evrakları görür.
    await services.updateService(db, actor, {
      serviceId: app.serviceId,
      expectedVersion: 1,
      name: `Yeni Ad ${randomUUID().slice(0, 4)}`,
      description: null,
    });
    await services.createRequirement(db, actor, {
      serviceId: app.serviceId,
      title: "Sonradan Eklenen",
      description: null,
      instructions: null,
      isRequired: true,
    });

    // Düzeltme: snapshot evrakı REVISION_REQUIRED + müşteri açıklamalı inceleme kaydı (PHASE 09 verisi simülasyonu).
    const requirement = (
      await owner.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1 AND title = 'Pasaport'",
        [app.applicationId],
      )
    ).rows[0]!;
    const file = await insertFile(owner, {
      applicationId: app.applicationId,
      requirementId: requirement.id,
      userId: actor.userId,
      status: "ACTIVE",
    });
    await owner.query(
      "INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, customer_message, reviewed_by_user_id) VALUES ($1, $2, $3, 'REVISION_REQUIRED', 'Sayfa okunaklı değil, lütfen yeniden tarayın.', $4)",
      [app.applicationId, requirement.id, file.rows[0]!.id, actor.userId],
    );
    await owner.query(
      "UPDATE application_document_requirements SET status = 'REVISION_REQUIRED' WHERE id = $1",
      [requirement.id],
    );

    const view = await getCustomerPortalView(db, {
      applicationId: app.applicationId,
      tokenId: app.accessTokenId!,
    });
    expect(view).not.toBeNull();
    expect(view!.customer).toEqual({ firstName: "Zeynep", lastName: "Yıldız" });
    expect(view!.application).toMatchObject({
      number: app.applicationNumber,
      serviceName: app.serviceName,
      status: "AWAITING_DOCUMENTS",
    });
    expect(view!.documents.map((item) => [item.title, item.isRequired])).toEqual([
      ["Pasaport", true],
      ["Fotoğraf", false],
      ["Banka Dökümü", true],
    ]);
    expect(view!.documents[0]).toMatchObject({
      status: "REVISION_REQUIRED",
      revisionMessage: "Sayfa okunaklı değil, lütfen yeniden tarayın.",
    });
    expect(view!.documents[1]!.revisionMessage).toBeNull();
    expect(view!.documents[0]!.instructions).toContain("<script>alert(1)</script>"); // düz metin; render'da inert
    const serialized = JSON.stringify(view);
    for (const forbidden of [
      noteMarker,
      "+905327778899",
      "example.invalid",
      app.token,
      app.applicationId,
      app.accessTokenId!,
      requirement.id,
      file.rows[0]!.id,
      other.applicationNumber,
      "Başkası",
      "Sonradan Eklenen",
      "blob",
      actor.userId,
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });
});
