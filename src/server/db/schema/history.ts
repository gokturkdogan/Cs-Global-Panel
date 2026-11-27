import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import {
  ACTOR_TYPES,
  APPLICATION_STATUSES,
  REASON_REQUIRED_TRANSITION_CODES,
  TRANSITION_CODES,
} from "../../../config/statuses";
import { applicationAccessTokens, applications } from "./applications";
import { users } from "./auth";
import { inList, timestamptz } from "./helpers";
import { applicationDocumentRequirements } from "./documents";

/**
 * Başvuru statü geçmişi (STATE_TRANSITIONS). Değiştirilemez. Statü değerlerinin geçerliliği
 * burada; hangi geçişin kim tarafından yapılabileceği domain katmanında (PHASE 09) korunur.
 */
export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: APPLICATION_STATUSES }),
    toStatus: text("to_status", { enum: APPLICATION_STATUSES }).notNull(),
    transitionCode: text("transition_code", { enum: TRANSITION_CODES }).notNull(),
    actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorAccessTokenId: uuid("actor_access_token_id"),
    onBehalfOfCustomer: boolean("on_behalf_of_customer").notNull().default(false),
    // Personel içi gerekçe; müşteriye gösterilmez.
    reason: text("reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Bkz. app_doc_files_access_token_fk: başvuru silmede zincirleme silme (migration 0005).
    foreignKey({
      name: "app_status_history_access_token_fk",
      columns: [t.actorAccessTokenId, t.applicationId],
      foreignColumns: [applicationAccessTokens.id, applicationAccessTokens.applicationId],
    }).onDelete("cascade"),
    index("app_status_history_application_created_idx").on(t.applicationId, t.createdAt),
    check("app_status_history_from_status_check", inList(t.fromStatus, APPLICATION_STATUSES)),
    check("app_status_history_to_status_check", inList(t.toStatus, APPLICATION_STATUSES)),
    check("app_status_history_transition_code_check", inList(t.transitionCode, TRANSITION_CODES)),
    check(
      "app_status_history_create_check",
      sql`(${t.fromStatus} IS NULL) = (${t.transitionCode} = 'CREATE')`,
    ),
    check("app_status_history_actor_type_check", inList(t.actorType, ACTOR_TYPES)),
    check(
      "app_status_history_actor_check",
      sql`(${t.actorType} = 'USER') = (${t.actorUserId} IS NOT NULL)`,
    ),
    check(
      "app_status_history_on_behalf_check",
      sql`NOT ${t.onBehalfOfCustomer} OR ${t.actorType} = 'USER'`,
    ),
    check(
      "app_status_history_reason_check",
      sql`(NOT (${inList(t.transitionCode, REASON_REQUIRED_TRANSITION_CODES)}) OR (${t.reason} IS NOT NULL AND char_length(btrim(${t.reason})) >= 1)) AND (${t.reason} IS NULL OR char_length(${t.reason}) <= 1000)`,
    ),
  ],
);

/** Yalnızca personelin gördüğü iç notlar (BR-121). Müşteri yolu kodundan erişilmez. */
export const applicationInternalNotes = pgTable(
  "application_internal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id"),
    body: text("body").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // PHASE 10 (D-115): D-113 ile aynı sözleşme — istemcinin mantıksal not işlemi anahtarı (UNIQUE) ve
    // SHA-256 (başvuru, evrak, yazar, metin). Aynı anahtar + farklı içerik/kapsam → genel çakışma.
    idempotencyKey: uuid("idempotency_key").unique("app_internal_notes_idempotency_key_unique"),
    payloadHash: text("payload_hash"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "app_internal_notes_idempotency_check",
      sql`(${t.idempotencyKey} IS NULL) = (${t.payloadHash} IS NULL) AND (${t.payloadHash} IS NULL OR ${t.payloadHash} ~ '^[0-9a-f]{64}$')`,
    ),
    foreignKey({
      name: "app_internal_notes_requirement_fk",
      columns: [t.requirementId, t.applicationId],
      foreignColumns: [
        applicationDocumentRequirements.id,
        applicationDocumentRequirements.applicationId,
      ],
    }).onDelete("cascade"),
    index("app_internal_notes_application_created_idx").on(t.applicationId, t.createdAt),
    check("app_internal_notes_body_check", sql`char_length(${t.body}) BETWEEN 1 AND 5000`),
  ],
);
