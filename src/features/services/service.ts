import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { writeAuditLog } from "@/server/audit/log";
import type { Database } from "@/server/db/client";
import { CONCURRENCY_ERROR_CODES, constraintName, pgErrorCode } from "@/server/db/errors";
import { serviceDocumentRequirements as requirements, services } from "@/server/db/schema";

import { REQUIREMENT_ORDER } from "./queries";
import type {
  createRequirementSchema,
  createServiceSchema,
  moveRequirementSchema,
  setRequirementActiveSchema,
  setServiceActiveSchema,
  updateRequirementSchema,
  updateServiceSchema,
} from "./schemas";

/**
 * Hizmet ve evrak şablonu mutasyonları (PHASE 05, D-072…D-076). Girdiler önceden Zod ile doğrulanmış
 * olmalıdır (actions.ts). Her mutasyon tek transaction'dır: kilit → varlık/ilişki kontrolü →
 * optimistic lock (`version`) → yazma → audit (aynı transaction; audit başarısızsa hepsi geri alınır).
 *
 * Kilit sözleşmesi (deadlock önleme, PHASE 06 snapshot ile ortak):
 *   services (FOR NO KEY UPDATE) → service_document_requirements (FOR UPDATE, belirleyici sırada)
 * Şablon mutasyonları başvuru tablolarına (snapshot dahil) hiçbir zaman yazmaz.
 */

/** Doğrulanmış oturumdan gelen aktör. İstemciden gelen kimlik kullanılmaz. */
export type Actor = { readonly userId: string };

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type TransactionRunner = Pick<Database, "transaction">;

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
    if (code === "23505" && constraintName(error) === "services_name_lower_unique") {
      return fail({
        code: "DUPLICATE",
        message: messages.services.duplicateName,
        fieldErrors: { name: messages.services.duplicateName },
      });
    }
    if (code !== undefined && CONCURRENCY_ERROR_CODES.has(code)) return conflict();
    // Yalnızca hata kodu loglanır (SQL, parametre, metin içeriği yok).
    console.error(`[services] ${label} başarısız`, { code: code ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.common.internal });
  }
}

function lockService(tx: Tx, serviceId: string) {
  return tx
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      isActive: services.isActive,
      version: services.version,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .for("no key update");
}

/** Evrakı yalnızca belirtilen hizmete aitse kilitler (IDOR: başka hizmetin evrakı → bulunamadı). */
function lockRequirement(tx: Tx, serviceId: string, requirementId: string) {
  return tx
    .select({
      id: requirements.id,
      title: requirements.title,
      description: requirements.description,
      instructions: requirements.instructions,
      isRequired: requirements.isRequired,
      isActive: requirements.isActive,
      version: requirements.version,
    })
    .from(requirements)
    .where(and(eq(requirements.id, requirementId), eq(requirements.serviceId, serviceId)))
    .for("update");
}

function changed<T extends Record<string, unknown>>(
  current: T,
  next: Partial<T>,
): (keyof T & string)[] {
  return (Object.keys(next) as (keyof T & string)[]).filter((key) => current[key] !== next[key]);
}

// ---------------------------------------------------------------- Hizmetler

export function createService(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof createServiceSchema>,
): Promise<ActionResult<{ serviceId: string }>> {
  return guarded<{ serviceId: string }>("hizmet oluşturma", () =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(services)
        .values({
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          sortOrder: sql`(SELECT coalesce(max(${services.sortOrder}), 0) + 10 FROM ${services})`,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        })
        .returning({ id: services.id });
      if (created === undefined) throw new Error("insert returned no row");
      await writeAuditLog(tx, {
        action: "SERVICE_CREATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "service",
        resourceId: created.id,
        metadata: { changedFields: ["name", "description", "isActive"] },
      });
      return ok({ serviceId: created.id });
    }),
  );
}

export function updateService(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof updateServiceSchema>,
): Promise<ActionResult<{ version: number; changed: boolean }>> {
  return guarded<{ version: number; changed: boolean }>("hizmet güncelleme", () =>
    db.transaction(async (tx) => {
      const [current] = await lockService(tx, input.serviceId);
      if (current === undefined) return notFound();
      if (current.version !== input.expectedVersion) return conflict();
      const fields = changed(current, { name: input.name, description: input.description });
      if (fields.length === 0) return ok({ version: current.version, changed: false });

      const version = current.version + 1;
      await tx
        .update(services)
        .set({
          name: input.name,
          description: input.description,
          version,
          updatedByUserId: actor.userId,
        })
        .where(eq(services.id, input.serviceId));
      await writeAuditLog(tx, {
        action: "SERVICE_UPDATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "service",
        resourceId: input.serviceId,
        metadata: { changedFields: fields },
      });
      return ok({ version, changed: true });
    }),
  );
}

export function setServiceActive(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof setServiceActiveSchema>,
): Promise<ActionResult<{ version: number; activeRequirementCount: number }>> {
  return guarded<{ version: number; activeRequirementCount: number }>(
    "hizmet durum değişikliği",
    () =>
      db.transaction(async (tx) => {
        const [current] = await lockService(tx, input.serviceId);
        if (current === undefined) return notFound();
        if (current.version !== input.expectedVersion) return conflict();

        const [counts] = await tx
          .select({ active: sql<number>`count(*) FILTER (WHERE ${requirements.isActive})::int` })
          .from(requirements)
          .where(eq(requirements.serviceId, input.serviceId));
        const activeRequirementCount = counts?.active ?? 0;
        if (current.isActive === input.isActive) {
          return ok({ version: current.version, activeRequirementCount });
        }

        const version = current.version + 1;
        await tx
          .update(services)
          .set({ isActive: input.isActive, version, updatedByUserId: actor.userId })
          .where(eq(services.id, input.serviceId));
        await writeAuditLog(tx, {
          action: input.isActive ? "SERVICE_ACTIVATED" : "SERVICE_DEACTIVATED",
          actorType: "USER",
          actorUserId: actor.userId,
          resourceType: "service",
          resourceId: input.serviceId,
          metadata: { changedFields: ["isActive"] },
        });
        return ok({ version, activeRequirementCount });
      }),
  );
}

// ---------------------------------------------------------------- Evrak şablonları

export function createRequirement(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof createRequirementSchema>,
): Promise<ActionResult<{ requirementId: string }>> {
  return guarded<{ requirementId: string }>("evrak şablonu oluşturma", () =>
    db.transaction(async (tx) => {
      // Hizmet kilidi eşzamanlı eklemeleri sıraya koyar → sıra değerleri çakışmaz.
      const [service] = await lockService(tx, input.serviceId);
      if (service === undefined) return notFound();
      const [created] = await tx
        .insert(requirements)
        .values({
          serviceId: input.serviceId,
          title: input.title,
          description: input.description,
          instructions: input.instructions,
          isRequired: input.isRequired,
          isActive: true,
          sortOrder: sql`(SELECT coalesce(max(${requirements.sortOrder}), 0) + 10 FROM ${requirements} WHERE ${requirements.serviceId} = ${input.serviceId})`,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        })
        .returning({ id: requirements.id });
      if (created === undefined) throw new Error("insert returned no row");
      await writeAuditLog(tx, {
        action: "DOCUMENT_TEMPLATE_CREATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "document_template",
        resourceId: created.id,
        metadata: {
          serviceId: input.serviceId,
          changedFields: ["title", "description", "instructions", "isRequired"],
        },
      });
      return ok({ requirementId: created.id });
    }),
  );
}

export function updateRequirement(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof updateRequirementSchema>,
): Promise<ActionResult<{ version: number; changed: boolean }>> {
  return guarded<{ version: number; changed: boolean }>("evrak şablonu güncelleme", () =>
    db.transaction(async (tx) => {
      const [service] = await lockService(tx, input.serviceId);
      if (service === undefined) return notFound();
      const [current] = await lockRequirement(tx, input.serviceId, input.requirementId);
      if (current === undefined) return notFound();
      if (current.version !== input.expectedVersion) return conflict();
      const next = {
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        isRequired: input.isRequired,
      };
      const fields = changed(current, next);
      if (fields.length === 0) return ok({ version: current.version, changed: false });

      const version = current.version + 1;
      await tx
        .update(requirements)
        .set({ ...next, version, updatedByUserId: actor.userId })
        .where(eq(requirements.id, input.requirementId));
      await writeAuditLog(tx, {
        action: "DOCUMENT_TEMPLATE_UPDATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "document_template",
        resourceId: input.requirementId,
        metadata: { serviceId: input.serviceId, changedFields: fields },
      });
      return ok({ version, changed: true });
    }),
  );
}

export function setRequirementActive(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof setRequirementActiveSchema>,
): Promise<ActionResult<{ version: number }>> {
  return guarded<{ version: number }>("evrak şablonu durum değişikliği", () =>
    db.transaction(async (tx) => {
      const [service] = await lockService(tx, input.serviceId);
      if (service === undefined) return notFound();
      const [current] = await lockRequirement(tx, input.serviceId, input.requirementId);
      if (current === undefined) return notFound();
      if (current.version !== input.expectedVersion) return conflict();
      if (current.isActive === input.isActive) return ok({ version: current.version });

      const version = current.version + 1;
      await tx
        .update(requirements)
        .set({ isActive: input.isActive, version, updatedByUserId: actor.userId })
        .where(eq(requirements.id, input.requirementId));
      await writeAuditLog(tx, {
        action: input.isActive ? "DOCUMENT_TEMPLATE_ACTIVATED" : "DOCUMENT_TEMPLATE_DEACTIVATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "document_template",
        resourceId: input.requirementId,
        metadata: { serviceId: input.serviceId, changedFields: ["isActive"] },
      });
      return ok({ version });
    }),
  );
}

/**
 * Evrakı bir üst/alt komşusuyla yer değiştirir ve hizmetin tüm evraklarını 10, 20, 30… olarak
 * yeniden numaralandırır. Göreli işlem olduğu için eşzamanlı taşımalar kilit altında sırayla
 * uygulanır (kayıp güncelleme yok). Aktif ve pasif evraklar tek sırada tutulur; yeniden
 * aktifleştirilen evrak yerini korur. Sıra değişikliği `version`'ı artırmaz (içerik formu çakışmaz).
 */
export function moveRequirement(
  db: TransactionRunner,
  actor: Actor,
  input: z.output<typeof moveRequirementSchema>,
): Promise<ActionResult<{ moved: boolean }>> {
  return guarded<{ moved: boolean }>("evrak sıralama", () =>
    db.transaction(async (tx) => {
      const [service] = await lockService(tx, input.serviceId);
      if (service === undefined) return notFound();
      const rows = await tx
        .select({ id: requirements.id, sortOrder: requirements.sortOrder })
        .from(requirements)
        .where(eq(requirements.serviceId, input.serviceId))
        .orderBy(...REQUIREMENT_ORDER)
        .for("update");
      const index = rows.findIndex((row) => row.id === input.requirementId);
      if (index === -1) return notFound();
      const target = input.direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return ok({ moved: false });

      const ordered = [...rows];
      [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
      for (const [position, row] of ordered.entries()) {
        const sortOrder = (position + 1) * 10;
        if (row.sortOrder !== sortOrder) {
          await tx
            .update(requirements)
            .set({ sortOrder, updatedByUserId: actor.userId })
            .where(eq(requirements.id, row.id));
        }
      }
      await writeAuditLog(tx, {
        action: "DOCUMENT_TEMPLATE_UPDATED",
        actorType: "USER",
        actorUserId: actor.userId,
        resourceType: "document_template",
        resourceId: input.requirementId,
        metadata: { serviceId: input.serviceId, changedFields: ["sortOrder"] },
      });
      return ok({ moved: true });
    }),
  );
}
