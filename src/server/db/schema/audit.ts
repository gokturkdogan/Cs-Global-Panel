import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import {
  AUDIT_ACTOR_TYPES,
  AUDIT_METADATA_KEYS,
  AUDIT_RESOURCE_TYPES,
} from "../../../config/statuses";
import { inList, timestamptz } from "./helpers";

/**
 * Append-only audit kaydı (D-039, SECURITY §8). Hiçbir FK yoktur: başvuru veya kullanıcı
 * silinse de kişisel veri içermeyen minimum kayıt kalır. IP / user-agent kolonu yoktur (OD-09).
 * Değiştirilemezlik: runtime rolüne yalnızca INSERT+SELECT verilir ve UPDATE/DELETE/TRUNCATE
 * trigger ile engellenir (migration 0002). Tablo sahibi rol için mutlak koruma değildir.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    action: text("action").notNull(),
    actorType: text("actor_type", { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorUserId: text("actor_user_id"),
    actorAccessTokenId: uuid("actor_access_token_id"),
    resourceType: text("resource_type", { enum: AUDIT_RESOURCE_TYPES }).notNull(),
    resourceId: text("resource_id"),
    applicationId: uuid("application_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("audit_logs_occurred_at_idx").on(t.occurredAt.desc()),
    // PHASE 11 (D-138, migration 0010): işlem geçmişi listesi ve keyset sayfalama `(occurred_at, id)`
    // sırasıyla okunur; tek kolonlu indeks bu sırayı karşılamadığı için 100 000 satırda tam tarama + sıralama
    // ölçüldü (EXPLAIN ANALYZE). Bileşik indeks yalnızca ek (additive) değişikliktir.
    // Sıra yönü sorguyla birebir: `ORDER BY ... DESC` Postgres'te NULLS FIRST demektir.
    index("audit_logs_occurred_at_id_idx").on(
      t.occurredAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("audit_logs_action_occurred_at_idx").on(t.action, t.occurredAt.desc()),
    index("audit_logs_actor_user_occurred_at_idx").on(t.actorUserId, t.occurredAt.desc()),
    index("audit_logs_application_occurred_at_idx").on(t.applicationId, t.occurredAt.desc()),
    check("audit_logs_action_format_check", sql`${t.action} ~ '^[A-Z][A-Z_]{2,63}$'`),
    check("audit_logs_actor_type_check", inList(t.actorType, AUDIT_ACTOR_TYPES)),
    check(
      "audit_logs_actor_user_check",
      sql`${t.actorType} <> 'USER' OR ${t.actorUserId} IS NOT NULL`,
    ),
    check("audit_logs_resource_type_check", inList(t.resourceType, AUDIT_RESOURCE_TYPES)),
    check(
      "audit_logs_resource_id_check",
      sql`${t.resourceId} IS NULL OR char_length(${t.resourceId}) <= 100`,
    ),
    // Metadata yalnızca izinli üst düzey anahtarları içerebilir (PII/token/şifre anahtarı yok).
    check(
      "audit_logs_metadata_check",
      sql`jsonb_typeof(${t.metadata}) = 'object' AND (${t.metadata} - ${sql.raw(
        `ARRAY[${AUDIT_METADATA_KEYS.map((key) => `'${key}'`).join(", ")}]::text[]`,
      )}) = '{}'::jsonb`,
    ),
  ],
);
