import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import {
  buildAccessLink,
  decryptAccessToken,
  encryptAccessToken,
  generateAccessToken,
  hashAccessToken,
} from "@/server/access-tokens/crypto";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { CONCURRENCY_ERROR_CODES, constraintName, pgErrorCode } from "@/server/db/errors";
import {
  applicationAccessTokens as tokens,
  applicationDocumentRequirements as snapshots,
  applications,
  applicationStatusHistory as history,
  services,
} from "@/server/db/schema";
import type { AccessTokenEnv } from "@/server/env";

import { formatPhoneForDisplay, type NormalizedPhone } from "./domain/phone";
import { buildApplicationSearchText } from "./domain/search-text";
import { templateFingerprint } from "./domain/template-fingerprint";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "./domain/whatsapp";
import { readActiveTemplates } from "./queries";

/**
 * Başvuru ve müşteri bağlantısı mutasyonları (PHASE 06, D-078…D-086). Her işlem tek transaction:
 * kilit → varlık/ilişki → guard (version, aktif token kimliği) → yazma → audit (aynı transaction).
 *
 * Kilit sırası (D-074 sözleşmesi): services (FOR SHARE) → şablonlar (okuma) → sayaç → başvuru
 * kayıtları; bağlantı işlemlerinde applications (FOR UPDATE) → application_access_tokens (FOR UPDATE).
 * Düz token yalnızca bellekte ve yetkili personel yanıtında bulunur; log/audit/hata mesajına yazılmaz.
 */

export type Actor = { readonly userId: string };
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Runner = Pick<Database, "transaction">;
type Reader = Pick<Database, "select">;

const conflict = () => fail({ code: "CONFLICT", message: messages.common.conflict });
const notFound = () => fail({ code: "NOT_FOUND", message: messages.common.notFound });

async function guarded<T>(
  label: string,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    const code = pgErrorCode(error);
    if (code !== undefined && CONCURRENCY_ERROR_CODES.has(code)) return conflict();
    // Yalnızca hata türü/kodu; müşteri verisi, token veya SQL parametresi loglanmaz.
    console.error(`[applications] ${label} başarısız`, {
      code: code ?? (error instanceof Error ? error.name : "unknown"),
    });
    return fail({ code: "INTERNAL", message: messages.common.internal });
  }
}

/** Yeni token satırı: düz token yalnızca dönüş değerinde (bağlantı olarak). */
async function issueToken(tx: Tx, env: AccessTokenEnv, applicationId: string, actor: Actor) {
  const tokenId = randomUUID();
  const token = generateAccessToken();
  const key = env.encryptionKeys.get(env.activeKeyId);
  if (key === undefined) throw new Error("active key missing");
  await tx.insert(tokens).values({
    id: tokenId,
    applicationId,
    tokenHash: hashAccessToken(token, env.hmacKey),
    tokenCiphertext: encryptAccessToken(token, { applicationId, tokenId }, env.activeKeyId, key),
    encryptionKeyId: env.activeKeyId,
    createdByUserId: actor.userId,
  });
  return { tokenId, accessLink: buildAccessLink(env.appUrl, token) };
}

// ---------------------------------------------------------------- Oluşturma

export type CreateApplicationData = {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: NormalizedPhone;
  readonly email: string;
  readonly serviceId: string;
  readonly idempotencyKey: string;
  readonly templateFingerprint: string;
};

export type CreatedApplication = {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly customerFullName: string;
  readonly serviceName: string;
  readonly status: "AWAITING_DOCUMENTS";
  readonly accessLink: string | null;
  readonly accessTokenId: string | null;
  /** Aynı form gönderimi tekrarlandı; mevcut başvuru döndü (yeni kayıt yok). */
  readonly replayed: boolean;
};

/** Tekrarlanan gönderim: aynı idempotency anahtarlı başvuruyu (ve aktif bağlantısını) döndürür. */
async function replay(
  db: Reader,
  env: AccessTokenEnv,
  idempotencyKey: string,
): Promise<CreatedApplication | null> {
  const [row] = await db
    .select({
      id: applications.id,
      number: applications.applicationNumber,
      firstName: applications.customerFirstName,
      lastName: applications.customerLastName,
      serviceName: applications.serviceNameSnapshot,
      tokenId: tokens.id,
      ciphertext: tokens.tokenCiphertext,
    })
    .from(applications)
    .leftJoin(tokens, and(eq(tokens.applicationId, applications.id), isNull(tokens.revokedAt)))
    .where(
      and(
        eq(applications.idempotencyKey, idempotencyKey),
        isNull(applications.deletionRequestedAt),
      ),
    )
    .limit(1);
  if (row === undefined) return null;
  const accessLink =
    row.tokenId !== null && row.ciphertext !== null
      ? buildAccessLink(
          env.appUrl,
          decryptAccessToken(
            row.ciphertext,
            { applicationId: row.id, tokenId: row.tokenId },
            env.encryptionKeys,
          ),
        )
      : null;
  return {
    applicationId: row.id,
    applicationNumber: row.number,
    customerFullName: `${row.firstName} ${row.lastName}`,
    serviceName: row.serviceName,
    status: "AWAITING_DOCUMENTS",
    accessLink,
    accessTokenId: row.tokenId,
    replayed: true,
  };
}

/**
 * BR-30, BR-10/11, D-079: tek transaction'da hizmet (FOR SHARE) → aktif şablonlar → parmak izi →
 * yıllık sayaç → başvuru → snapshot → statü geçmişi → token → audit. Herhangi bir adım başarısızsa
 * hiçbiri kalmaz (sayaç artışı dahil geri alınır).
 */
export async function createApplication(
  db: Runner & Reader,
  actor: Actor,
  input: CreateApplicationData,
  env: AccessTokenEnv,
): Promise<ActionResult<CreatedApplication>> {
  const result = await guarded<CreatedApplication>("başvuru oluşturma", async () => {
    try {
      return await db.transaction(async (tx) => {
        const existing = await replay(tx, env, input.idempotencyKey);
        if (existing !== null) return ok(existing);

        const [service] = await tx
          .select({
            id: services.id,
            name: services.name,
            version: services.version,
            isActive: services.isActive,
          })
          .from(services)
          .where(eq(services.id, input.serviceId))
          .for("share");
        if (service === undefined || !service.isActive) {
          return fail({
            code: "VALIDATION",
            message: messages.applications.serviceUnavailable,
            fieldErrors: { serviceId: messages.applications.serviceUnavailable },
          });
        }
        const requirementRows = await readActiveTemplates(tx, service.id);
        if (requirementRows.length === 0) {
          return fail({
            code: "VALIDATION",
            message: messages.applications.noActiveRequirements,
            fieldErrors: { serviceId: messages.applications.noActiveRequirements },
          });
        }
        if (templateFingerprint(service, requirementRows) !== input.templateFingerprint) {
          return fail({ code: "STALE_PREVIEW", message: messages.applications.stalePreview });
        }

        // BR-10/11: yıl Europe/Istanbul; sayaç satırı eşzamanlı oluşturmaları sıraya koyar.
        const counter = await tx.execute<{ year: number; value: number }>(sql`
          INSERT INTO application_number_counters (year, last_value)
          VALUES (extract(year FROM now() AT TIME ZONE 'Europe/Istanbul')::smallint, 1)
          ON CONFLICT (year) DO UPDATE SET last_value = application_number_counters.last_value + 1
          RETURNING year::int AS year, last_value AS value`);
        const sequence = counter.rows[0];
        if (sequence === undefined) throw new Error("counter");
        const applicationNumber = `CS-${sequence.year}-${String(sequence.value).padStart(6, "0")}`;

        const [created] = await tx
          .insert(applications)
          .values({
            applicationNumber,
            customerFirstName: input.firstName,
            customerLastName: input.lastName,
            customerPhoneE164: input.phone.e164,
            customerEmail: input.email,
            searchText: buildApplicationSearchText({
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email,
              phoneSearchForms: input.phone.searchForms,
            }),
            serviceId: service.id,
            serviceNameSnapshot: service.name,
            status: "AWAITING_DOCUMENTS",
            createdByUserId: actor.userId,
            idempotencyKey: input.idempotencyKey,
          })
          .returning({ id: applications.id });
        if (created === undefined) throw new Error("insert");
        const applicationId = created.id;

        await tx.insert(snapshots).values(
          requirementRows.map((item) => ({
            applicationId,
            sourceRequirementId: item.id,
            title: item.title,
            description: item.description,
            instructions: item.instructions,
            isRequired: item.isRequired,
            sortOrder: item.sortOrder,
          })),
        );
        await tx.insert(history).values({
          applicationId,
          fromStatus: null,
          toStatus: "AWAITING_DOCUMENTS",
          transitionCode: "CREATE",
          actorType: "USER",
          actorUserId: actor.userId,
        });
        const link = await issueToken(tx, env, applicationId, actor);
        await writeAuditLog(tx, {
          action: "APPLICATION_CREATED",
          actorType: "USER",
          actorUserId: actor.userId,
          resourceType: "application",
          resourceId: applicationId,
          applicationId,
          metadata: { serviceId: service.id },
        });
        await writeAuditLog(tx, {
          action: "ACCESS_LINK_CREATED",
          actorType: "USER",
          actorUserId: actor.userId,
          resourceType: "access_link",
          resourceId: link.tokenId,
          applicationId,
          metadata: { accessTokenId: link.tokenId },
        });
        return ok({
          applicationId,
          applicationNumber,
          customerFullName: `${input.firstName} ${input.lastName}`,
          serviceName: service.name,
          status: "AWAITING_DOCUMENTS" as const,
          accessLink: link.accessLink,
          accessTokenId: link.tokenId,
          replayed: false,
        });
      });
    } catch (error) {
      // Eşzamanlı aynı gönderim: ikinci transaction idempotency anahtarında çakışır → mevcut sonucu döndür.
      if (
        pgErrorCode(error) === "23505" &&
        constraintName(error) === "applications_idempotency_key_unique"
      ) {
        const existing = await replay(db, env, input.idempotencyKey);
        if (existing !== null) return ok(existing);
      }
      throw error;
    }
  });
  return result;
}

// ---------------------------------------------------------------- Müşteri bilgileri

export type UpdateCustomerData = {
  readonly applicationId: string;
  readonly expectedVersion: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: NormalizedPhone;
  readonly email: string;
};

/** Yalnızca bu başvuruyu günceller (BR-03); bağlantı kendiliğinden yenilenmez (D-083). */
export function updateCustomerInfo(
  db: Runner,
  actor: Actor,
  input: UpdateCustomerData,
): Promise<ActionResult<{ version: number; changed: boolean; contactChanged: boolean }>> {
  return guarded<{ version: number; changed: boolean; contactChanged: boolean }>(
    "müşteri bilgisi güncelleme",
    () =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            version: applications.version,
            firstName: applications.customerFirstName,
            lastName: applications.customerLastName,
            phone: applications.customerPhoneE164,
            email: applications.customerEmail,
          })
          .from(applications)
          .where(
            and(eq(applications.id, input.applicationId), isNull(applications.deletionRequestedAt)),
          )
          .for("update");
        if (current === undefined) return notFound();
        if (current.version !== input.expectedVersion) return conflict();

        const next = {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone.e164,
          email: input.email,
        };
        const changedFields = (Object.keys(next) as (keyof typeof next)[]).filter(
          (key) => current[key] !== next[key],
        );
        if (changedFields.length === 0) {
          return ok({ version: current.version, changed: false, contactChanged: false });
        }
        const version = current.version + 1;
        await tx
          .update(applications)
          .set({
            customerFirstName: next.firstName,
            customerLastName: next.lastName,
            customerPhoneE164: next.phone,
            customerEmail: next.email,
            searchText: buildApplicationSearchText({
              firstName: next.firstName,
              lastName: next.lastName,
              email: next.email,
              phoneSearchForms: input.phone.searchForms,
            }),
            version,
            updatedByUserId: actor.userId,
          })
          .where(eq(applications.id, input.applicationId));
        await writeAuditLog(tx, {
          action: "APPLICATION_UPDATED",
          actorType: "USER",
          actorUserId: actor.userId,
          resourceType: "application",
          resourceId: input.applicationId,
          applicationId: input.applicationId,
          // Yalnızca alan adları; eski/yeni değerler audit'e yazılmaz.
          metadata: { changedFields },
        });
        return ok({
          version,
          changed: true,
          contactChanged: changedFields.includes("phone") || changedFields.includes("email"),
        });
      }),
  );
}

// ---------------------------------------------------------------- Bağlantı (görüntüleme, paylaşım, iptal, yenileme)

async function lockApplication(tx: Tx, applicationId: string) {
  const [row] = await tx
    .select({
      id: applications.id,
      firstName: applications.customerFirstName,
      lastName: applications.customerLastName,
      phone: applications.customerPhoneE164,
      serviceName: applications.serviceNameSnapshot,
    })
    .from(applications)
    .where(and(eq(applications.id, applicationId), isNull(applications.deletionRequestedAt)))
    .for("update");
  return row;
}

async function activeToken(tx: Tx, applicationId: string, lock: boolean) {
  const query = tx
    .select({ id: tokens.id, ciphertext: tokens.tokenCiphertext })
    .from(tokens)
    .where(and(eq(tokens.applicationId, applicationId), isNull(tokens.revokedAt)));
  const [row] = lock ? await query.for("update") : await query;
  return row;
}

export type RevealedLink =
  | { readonly accessLink: string; readonly accessTokenId: string }
  | { readonly accessLink: null; readonly accessTokenId: null };

/** Bağlantıyı sunucuda çözer; yalnızca kullanıcı aksiyonuyla çağrılır ve audit'lenir (token'sız). */
export function revealAccessLink(
  db: Runner,
  actor: Actor,
  applicationId: string,
  env: AccessTokenEnv,
): Promise<ActionResult<RevealedLink>> {
  return guarded<RevealedLink>("bağlantı görüntüleme", () =>
    db.transaction(async (tx) => {
      const application = await lockApplication(tx, applicationId);
      if (application === undefined) return notFound();
      const token = await activeToken(tx, applicationId, false);
      if (token === undefined) return ok({ accessLink: null, accessTokenId: null });
      const raw = decryptAccessToken(
        token.ciphertext,
        { applicationId, tokenId: token.id },
        env.encryptionKeys,
      );
      await writeAuditLog(tx, {
        action: "ACCESS_LINK_VIEWED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "access_link",
        resourceId: token.id,
        applicationId,
        metadata: { accessTokenId: token.id },
      });
      return ok({ accessLink: buildAccessLink(env.appUrl, raw), accessTokenId: token.id });
    }),
  );
}

export type WhatsAppShare = {
  readonly whatsappUrl: string;
  readonly message: string;
  readonly accessTokenId: string;
  /** BR-162: paylaşım öncesi gösterilecek alıcı bilgisi. */
  readonly recipientName: string;
  readonly recipientPhone: string;
};

/**
 * WhatsApp paylaşım hazırlığı (BR-160/161): mesaj ve `wa.me` bağlantısı sunucuda üretilir, yalnızca
 * personelin açık aksiyonuyla döner. Audit "paylaşım hazırlandı" der; gönderim/teslim iddia edilmez.
 */
export function prepareWhatsAppShare(
  db: Runner,
  actor: Actor,
  applicationId: string,
  env: AccessTokenEnv,
): Promise<ActionResult<WhatsAppShare>> {
  return guarded<WhatsAppShare>("WhatsApp paylaşım hazırlığı", () =>
    db.transaction(async (tx) => {
      const application = await lockApplication(tx, applicationId);
      if (application === undefined) return notFound();
      const token = await activeToken(tx, applicationId, false);
      if (token === undefined) {
        return fail({ code: "CONFLICT", message: messages.applications.linkUnavailable });
      }
      const raw = decryptAccessToken(
        token.ciphertext,
        { applicationId, tokenId: token.id },
        env.encryptionKeys,
      );
      const message = buildWhatsAppMessage({
        firstName: application.firstName,
        lastName: application.lastName,
        serviceName: application.serviceName,
        accessLink: buildAccessLink(env.appUrl, raw),
      });
      const whatsappUrl = buildWhatsAppUrl(application.phone, message);
      await writeAuditLog(tx, {
        action: "ACCESS_LINK_SHARE_PREPARED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "access_link",
        resourceId: token.id,
        applicationId,
        metadata: { accessTokenId: token.id },
      });
      return ok({
        whatsappUrl,
        message,
        accessTokenId: token.id,
        recipientName: `${application.firstName} ${application.lastName}`,
        recipientPhone: formatPhoneForDisplay(application.phone),
      });
    }),
  );
}

/** İptal (BR-106): yalnızca istemcinin gördüğü aktif token hâlâ aktifse (eski onay yeni bağlantıyı iptal edemez). */
export function revokeAccessLink(
  db: Runner,
  actor: Actor,
  input: { readonly applicationId: string; readonly expectedActiveTokenId: string | null },
): Promise<ActionResult<{ revokedTokenId: string }>> {
  return guarded("bağlantı iptali", () =>
    db.transaction(async (tx) => {
      const application = await lockApplication(tx, input.applicationId);
      if (application === undefined) return notFound();
      const token = await activeToken(tx, input.applicationId, true);
      if (
        token === undefined ||
        input.expectedActiveTokenId === null ||
        token.id !== input.expectedActiveTokenId
      ) {
        return conflict();
      }
      await tx
        .update(tokens)
        .set({ revokedAt: sql`now()`, revokeReason: "REVOKED", revokedByUserId: actor.userId })
        .where(eq(tokens.id, token.id));
      await writeAuditLog(tx, {
        action: "ACCESS_LINK_REVOKED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "access_link",
        resourceId: token.id,
        applicationId: input.applicationId,
        metadata: { accessTokenId: token.id },
      });
      return ok({ revokedTokenId: token.id });
    }),
  );
}

/**
 * Yenileme / iptal edilmişin yerine yeni bağlantı (BR-106): eski token `ROTATED` ile iptal + yeni token
 * aynı transaction'da (yeni token üretimi başarısızsa eski bağlantı da korunur). `expectedActiveTokenId`
 * güncel aktif token ile (ikisi de null olabilir) eşleşmezse `CONFLICT`.
 */
export function rotateAccessLink(
  db: Runner,
  actor: Actor,
  input: { readonly applicationId: string; readonly expectedActiveTokenId: string | null },
  env: AccessTokenEnv,
): Promise<
  ActionResult<{ accessLink: string; accessTokenId: string; previousTokenId: string | null }>
> {
  return guarded("bağlantı yenileme", () =>
    db.transaction(async (tx) => {
      const application = await lockApplication(tx, input.applicationId);
      if (application === undefined) return notFound();
      const token = await activeToken(tx, input.applicationId, true);
      if ((token?.id ?? null) !== input.expectedActiveTokenId) return conflict();
      if (token !== undefined) {
        await tx
          .update(tokens)
          .set({ revokedAt: sql`now()`, revokeReason: "ROTATED", revokedByUserId: actor.userId })
          .where(eq(tokens.id, token.id));
      }
      const link = await issueToken(tx, env, input.applicationId, actor);
      await writeAuditLog(tx, {
        action: token !== undefined ? "ACCESS_LINK_ROTATED" : "ACCESS_LINK_CREATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "access_link",
        resourceId: link.tokenId,
        applicationId: input.applicationId,
        metadata: { accessTokenId: link.tokenId },
      });
      return ok({
        accessLink: link.accessLink,
        accessTokenId: link.tokenId,
        previousTokenId: token?.id ?? null,
      });
    }),
  );
}
