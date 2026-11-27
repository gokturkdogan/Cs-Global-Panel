import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  DELETION_ERROR_CODES,
  DELETION_OBJECT_STATES,
  WRITE_ATTEMPT_OUTCOMES,
  WRITE_ATTEMPT_STATES,
} from "../../../config/statuses";
import { applications } from "./applications";
import { users } from "./auth";
import { applicationDocumentFiles } from "./documents";
import { auditTimestamps, inList, timestamptz } from "./helpers";

/**
 * Kalıcı başvuru silme işlemi (PHASE 10, D-116; BR-150…BR-155). Başvuru başına en fazla bir kayıt
 * (PK = başvuru). Silme ilerlemesi süreç belleğinde değil burada tutulur: süreç çökse de kaldığı yerden
 * sürdürülür. Başvuru satırıyla birlikte (son aşamada) CASCADE silinir; audit kayıtları kalır.
 * - `settle_after`: devam eden yüklemelerin storage yazımlarının sonuçlanması için en erken envanter zamanı.
 * - `lease_*`: aynı anda tek adım çalışır (iki personel / iki sekme); süre dolunca başkası devralır.
 * - `storage_verified_at`: başvuru önekinde hiçbir fiziksel versiyon kalmadığı doğrulandı.
 * - Gerekçe personel içidir; audit'e yazılmaz ve başvuruyla birlikte silinir.
 */
export const applicationDeletions = pgTable(
  "application_deletions",
  {
    applicationId: uuid("application_id")
      .primaryKey()
      .references(() => applications.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    settleAfter: timestamptz("settle_after").notNull(),
    inventoryCompletedAt: timestamptz("inventory_completed_at"),
    storageVerifiedAt: timestamptz("storage_verified_at"),
    // PHASE 10.1 (D-124): sonlandırmayı mümkün kılan eksiksiz boş listelemenin BAŞLANGIÇ zamanı (DB saati).
    // Tüm yazım girişimleri bu andan ÖNCE çözülmüş olmalıdır (DB trigger'ı da denetler).
    finalListingStartedAt: timestamptz("final_listing_started_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamptz("last_attempt_at"),
    lastError: text("last_error", { enum: DELETION_ERROR_CODES }),
    leaseId: uuid("lease_id"),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    ...auditTimestamps(),
  },
  (t) => [
    check(
      "app_deletions_reason_check",
      sql`char_length(btrim(${t.reason})) >= 1 AND char_length(${t.reason}) <= 1000`,
    ),
    check("app_deletions_attempt_check", sql`${t.attemptCount} >= 0`),
    check("app_deletions_last_error_check", inList(t.lastError, DELETION_ERROR_CODES)),
    check("app_deletions_lease_check", sql`(${t.leaseId} IS NULL) = (${t.leaseExpiresAt} IS NULL)`),
  ],
);

/**
 * Silme envanteri: başvuru önekinde (`applications/{applicationId}/`) bulunan ve sahipliği DB'deki dosya
 * kaydıyla doğrulanan her fiziksel sağlayıcı versiyonu (silme işaretleri dahil). Fiziksel silme yalnızca
 * buradaki tam anahtar + versiyon kimliğiyle yapılır; istemciden anahtar/versiyon alınmaz.
 */
export const applicationDeletionObjects = pgTable(
  "application_deletion_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    objectKey: text("object_key").notNull(),
    versionId: text("version_id").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    isDeleteMarker: boolean("is_delete_marker").notNull(),
    fileId: uuid("file_id").notNull(),
    state: text("state", { enum: DELETION_OBJECT_STATES }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error", { enum: DELETION_ERROR_CODES }),
    discoveredAt: timestamptz("discovered_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    foreignKey({
      name: "app_deletion_objects_deletion_fk",
      columns: [t.applicationId],
      foreignColumns: [applicationDeletions.applicationId],
    }).onDelete("cascade"),
    unique("app_deletion_objects_key_version_unique").on(t.objectKey, t.versionId),
    index("app_deletion_objects_application_state_idx").on(t.applicationId, t.state),
    check(
      "app_deletion_objects_key_check",
      sql`${t.objectKey} = 'applications/' || ${t.applicationId} || '/' || substring(${t.objectKey} from 51 for 36) || '/' || ${t.fileId} || '.pdf'`,
    ),
    check("app_deletion_objects_version_check", sql`char_length(${t.versionId}) BETWEEN 1 AND 255`),
    check("app_deletion_objects_size_check", sql`${t.sizeBytes} >= 0`),
    check("app_deletion_objects_state_check", inList(t.state, DELETION_OBJECT_STATES)),
    check(
      "app_deletion_objects_deleted_check",
      sql`(${t.state} = 'DELETED') = (${t.deletedAt} IS NOT NULL)`,
    ),
    check("app_deletion_objects_attempts_check", sql`${t.attempts} >= 0`),
    check("app_deletion_objects_last_error_check", inList(t.lastError, DELETION_ERROR_CODES)),
  ],
);

/**
 * Fiziksel storage yazım girişimleri (PHASE 10.1 — D-121…D-123). Her PUT girişiminin dayanıklı kimliği;
 * rezervasyonla aynı transaction'da `ADMITTED` olarak açılır. SDK yeniden denemesi PUT için kapalıdır
 * (tek girişim = en fazla bir fiziksel versiyon); anahtar dosyaya özgüdür. Bu sayede belirsiz bir girişim
 * yalnızca o anahtarda sahiplenilmemiş bir versiyonun GÖZLENMESİYLE kesin olarak çözülür. Süre dolması,
 * kira bitişi veya boş listeleme çözüm kanıtı değildir. Durum geçişleri DB trigger'ıyla kısıtlıdır
 * (migration 0008); runtime rolü DELETE yapamaz (satırlar başvuruyla CASCADE silinir).
 */
export const storageWriteAttempts = pgTable(
  "storage_write_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => applicationDocumentFiles.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    state: text("state", { enum: WRITE_ATTEMPT_STATES }).notNull().default("ADMITTED"),
    outcome: text("outcome", { enum: WRITE_ATTEMPT_OUTCOMES }),
    versionId: text("version_id"),
    admittedAt: timestamptz("admitted_at").notNull().defaultNow(),
    startedAt: timestamptz("started_at"),
    settledAt: timestamptz("settled_at"),
  },
  (t) => [
    index("storage_write_attempts_application_state_idx").on(t.applicationId, t.state),
    index("storage_write_attempts_file_idx").on(t.fileId),
    uniqueIndex("storage_write_attempts_version_unique")
      .on(t.objectKey, t.versionId)
      .where(sql`${t.versionId} IS NOT NULL`),
    check("storage_write_attempts_state_check", inList(t.state, WRITE_ATTEMPT_STATES)),
    check("storage_write_attempts_outcome_check", inList(t.outcome, WRITE_ATTEMPT_OUTCOMES)),
    check(
      "storage_write_attempts_key_check",
      sql`${t.objectKey} LIKE 'applications/' || ${t.applicationId} || '/%/' || ${t.fileId} || '.pdf'`,
    ),
    check(
      "storage_write_attempts_version_check",
      sql`(${t.state} = 'CONFIRMED') = (${t.versionId} IS NOT NULL) AND (${t.versionId} IS NULL OR char_length(${t.versionId}) BETWEEN 1 AND 255)`,
    ),
    check(
      "storage_write_attempts_settled_check",
      sql`(${t.state} IN ('CONFIRMED', 'FAILED', 'FENCED')) = (${t.settledAt} IS NOT NULL)`,
    ),
    check(
      "storage_write_attempts_started_check",
      sql`(${t.state} IN ('ADMITTED', 'FENCED')) = (${t.startedAt} IS NULL)`,
    ),
    // Kesin başarısızlık yalnızca "hiç gönderilmedi" kanıtıyla (D-123).
    check(
      "storage_write_attempts_failed_check",
      sql`${t.state} <> 'FAILED' OR ${t.outcome} = 'NOT_SENT'`,
    ),
  ],
);
