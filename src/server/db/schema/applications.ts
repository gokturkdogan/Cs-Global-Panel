import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ACCESS_TOKEN_REVOKE_REASONS, APPLICATION_STATUSES } from "../../../config/statuses";
import { users } from "./auth";
import { auditTimestamps, inList, timestamptz } from "./helpers";
import { services } from "./services";

/**
 * Yıllık başvuru numarası sayacı (D-008, BR-10/BR-11). Numara başvuru transaction'ı içinde
 * `INSERT … ON CONFLICT (year) DO UPDATE SET last_value = last_value + 1 RETURNING` ile alınır;
 * satır kilidi eşzamanlı oluşturmaları sıraya koyar, geri alınan transaction sayacı da geri alır.
 * Boşluksuz sıra garanti edilmez ve gerekmez (BR-12).
 */
export const applicationNumberCounters = pgTable(
  "application_number_counters",
  {
    year: smallint("year").primaryKey(),
    lastValue: integer("last_value").notNull(),
  },
  (t) => [
    check("app_number_counters_year_check", sql`${t.year} BETWEEN 2000 AND 9999`),
    check("app_number_counters_value_check", sql`${t.lastValue} >= 1`),
  ],
);

/** Başvuru — müşteri bilgileri başvuru kaydındadır, müşteri tablosu yoktur (OD-10). */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationNumber: text("application_number").notNull().unique("applications_number_unique"),
    customerFirstName: text("customer_first_name").notNull(),
    customerLastName: text("customer_last_name").notNull(),
    // Telefon ve e-posta UNIQUE değildir (BR-04).
    customerPhoneE164: text("customer_phone_e164").notNull(),
    customerEmail: text("customer_email").notNull(),
    searchText: text("search_text").notNull(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    status: text("status", { enum: APPLICATION_STATUSES }).notNull().default("AWAITING_DOCUMENTS"),
    statusChangedAt: timestamptz("status_changed_at").notNull().defaultNow(),
    submittedAt: timestamptz("submitted_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: uuid("idempotency_key").unique("applications_idempotency_key_unique"),
    version: integer("version").notNull().default(1),
    // BR-153: dolu ise başvuru silme sürecindedir ve tüm okumalarda erişilemez (soft delete değil).
    deletionRequestedAt: timestamptz("deletion_requested_at"),
    deletionRequestedByUserId: text("deletion_requested_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (t) => [
    index("applications_created_at_idx").on(t.createdAt.desc()),
    index("applications_status_created_at_idx").on(t.status, t.createdAt.desc()),
    index("applications_service_created_at_idx").on(t.serviceId, t.createdAt.desc()),
    index("applications_phone_idx").on(t.customerPhoneE164),
    index("applications_email_idx").on(t.customerEmail),
    index("applications_search_text_trgm_idx").using("gin", t.searchText.op("gin_trgm_ops")),
    index("applications_deletion_requested_idx")
      .on(t.deletionRequestedAt)
      .where(sql`${t.deletionRequestedAt} IS NOT NULL`),
    check(
      "applications_number_format_check",
      sql`${t.applicationNumber} ~ '^CS-[0-9]{4}-[0-9]{6,}$'`,
    ),
    check(
      "applications_first_name_check",
      sql`char_length(${t.customerFirstName}) BETWEEN 1 AND 100 AND ${t.customerFirstName} = btrim(${t.customerFirstName})`,
    ),
    check(
      "applications_last_name_check",
      sql`char_length(${t.customerLastName}) BETWEEN 1 AND 100 AND ${t.customerLastName} = btrim(${t.customerLastName})`,
    ),
    check("applications_phone_check", sql`${t.customerPhoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      "applications_email_check",
      sql`char_length(${t.customerEmail}) <= 254 AND ${t.customerEmail} = lower(btrim(${t.customerEmail})) AND ${t.customerEmail} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`,
    ),
    check("applications_search_text_check", sql`char_length(${t.searchText}) >= 1`),
    check(
      "applications_service_name_snapshot_check",
      sql`char_length(${t.serviceNameSnapshot}) BETWEEN 2 AND 150`,
    ),
    check("applications_status_check", inList(t.status, APPLICATION_STATUSES)),
    check("applications_version_check", sql`${t.version} >= 1`),
    check(
      "applications_deletion_actor_check",
      sql`(${t.deletionRequestedAt} IS NULL) = (${t.deletionRequestedByUserId} IS NULL)`,
    ),
  ],
);

/**
 * Müşteri erişim bağlantısı token'ları (OD-01, OD-04, OD-18, OD-19). Düz token hiçbir kolonda
 * yoktur: doğrulama `token_hash` (HMAC-SHA256 hex), tekrar görüntüleme `token_ciphertext`
 * (AES-256-GCM, `v1:<keyId>:<iv>:<ct>:<tag>`, AAD = application_id). Son kullanma tarihi yoktur.
 */
export const applicationAccessTokens = pgTable(
  "application_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("access_tokens_hash_unique"),
    tokenCiphertext: text("token_ciphertext").notNull(),
    encryptionKeyId: text("encryption_key_id").notNull(),
    revokedAt: timestamptz("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    revokeReason: text("revoke_reason", { enum: ACCESS_TOKEN_REVOKE_REASONS }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Tek aktif bağlantı (OD-18, INV-02).
    uniqueIndex("access_tokens_one_active_per_application")
      .on(t.applicationId)
      .where(sql`${t.revokedAt} IS NULL`),
    // Bileşik FK hedefi: token'a başvuran kayıtların aynı başvuruya ait olmasını garanti eder.
    unique("access_tokens_id_application_unique").on(t.id, t.applicationId),
    index("access_tokens_application_created_idx").on(t.applicationId, t.createdAt.desc()),
    check("access_tokens_hash_format_check", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("access_tokens_key_id_format_check", sql`${t.encryptionKeyId} ~ '^[A-Za-z0-9_-]{1,32}$'`),
    check(
      "access_tokens_ciphertext_format_check",
      sql`${t.tokenCiphertext} LIKE 'v1:' || ${t.encryptionKeyId} || ':%'`,
    ),
    check("access_tokens_revoke_reason_check", inList(t.revokeReason, ACCESS_TOKEN_REVOKE_REASONS)),
    check(
      "access_tokens_revocation_check",
      sql`(${t.revokedAt} IS NULL) = (${t.revokeReason} IS NULL) AND (${t.revokedAt} IS NULL) = (${t.revokedByUserId} IS NULL)`,
    ),
  ],
);
