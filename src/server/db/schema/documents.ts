import { sql } from "drizzle-orm";
import {
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

import { MAX_PDF_SIZE_BYTES } from "../../../config/constants";
import {
  ACTOR_TYPES,
  DOCUMENT_STATUSES,
  FILE_REJECTION_REASONS,
  FILE_STATUSES,
  IN_PROGRESS_FILE_STATUSES,
  REVIEW_DECISIONS,
  VERSIONED_FILE_STATUSES,
} from "../../../config/statuses";
import { applicationAccessTokens, applications } from "./applications";
import { users } from "./auth";
import { auditTimestamps, inList, timestamptz } from "./helpers";
import { serviceDocumentRequirements } from "./services";

/**
 * Başvuruya özel evrak listesi: oluşturma anındaki şablonun kopyası (snapshot) + evrak statüsü.
 * Şablon değişiklikleri mevcut snapshot'ları etkilemez; kaynak şablon satırına yalnızca
 * referans tutulur (silinirse NULL olur).
 */
export const applicationDocumentRequirements = pgTable(
  "application_document_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    sourceRequirementId: uuid("source_requirement_id"),
    title: text("title").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    isRequired: boolean("is_required").notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("NOT_UPLOADED"),
    statusChangedAt: timestamptz("status_changed_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    ...auditTimestamps(),
  },
  (t) => [
    foreignKey({
      name: "app_doc_reqs_application_fk",
      columns: [t.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("cascade"),
    // Kaynak şablon silinirse snapshot korunur, yalnızca referans NULL olur (INV-10).
    foreignKey({
      name: "app_doc_reqs_source_requirement_fk",
      columns: [t.sourceRequirementId],
      foreignColumns: [serviceDocumentRequirements.id],
    }).onDelete("set null"),
    index("app_doc_reqs_application_sort_idx").on(t.applicationId, t.sortOrder),
    // Bileşik FK hedefi: dosya/inceleme/yorumların aynı başvuruya ait olmasını garanti eder (INV-09/10).
    unique("app_doc_reqs_id_application_unique").on(t.id, t.applicationId),
    check(
      "app_doc_reqs_title_check",
      sql`char_length(${t.title}) BETWEEN 2 AND 150 AND ${t.title} = btrim(${t.title})`,
    ),
    check(
      "app_doc_reqs_description_check",
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 2000`,
    ),
    check(
      "app_doc_reqs_instructions_check",
      sql`${t.instructions} IS NULL OR char_length(${t.instructions}) <= 4000`,
    ),
    check("app_doc_reqs_status_check", inList(t.status, DOCUMENT_STATUSES)),
    check("app_doc_reqs_version_check", sql`${t.version} >= 1`),
  ],
);

/**
 * Dosya versiyonları — yalnızca metadata; PDF içeriği private storage'dadır (DB'de binary yok).
 * Teknik yaşam döngüsü (`status`) evrak iş sürecinden (`application_document_requirements.status`)
 * ayrıdır. `mime_type` kolonu yoktur: kabul edilen tek tür PDF'tir ve PHASE 08'de yapısal
 * doğrulamayla garanti edilir; bu kolonlar dosyanın güvenli olduğunu kanıtlamaz.
 */
export const applicationDocumentFiles = pgTable(
  "application_document_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    status: text("status", { enum: FILE_STATUSES }).notNull().default("UPLOAD_PENDING"),
    versionNumber: integer("version_number"),
    // `applications/{applicationId}/{requirementId}/{fileId}.pdf` — kişisel veri içermez.
    blobPathname: text("blob_pathname").notNull().unique("app_doc_files_blob_pathname_unique"),
    originalFilename: text("original_filename").notNull(),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    // Sağlayıcının fiziksel nesne versiyonu (B2 `x-amz-version-id`; PHASE 08, D-102). Görüntüleme tam bu
    // versiyonu okur; temizlik/silme versiyona özgü fiziksel silme yapar. Yerel adapter da üretir.
    storageVersionId: text("storage_version_id"),
    rejectionReason: text("rejection_reason", { enum: FILE_REJECTION_REASONS }),
    uploadedByActorType: text("uploaded_by_actor_type", { enum: ACTOR_TYPES }).notNull(),
    uploadedByUserId: text("uploaded_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    uploadedByAccessTokenId: uuid("uploaded_by_access_token_id"),
    uploadExpiresAt: timestamptz("upload_expires_at").notNull(),
    uploadedAt: timestamptz("uploaded_at"),
    activatedAt: timestamptz("activated_at"),
    endedAt: timestamptz("ended_at"),
    endedByActorType: text("ended_by_actor_type", { enum: ACTOR_TYPES }),
    endedByUserId: text("ended_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    blobDeletedAt: timestamptz("blob_deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "app_doc_files_requirement_fk",
      columns: [t.requirementId, t.applicationId],
      foreignColumns: [
        applicationDocumentRequirements.id,
        applicationDocumentRequirements.applicationId,
      ],
    }).onDelete("cascade"),
    // Token satırları yalnızca başvuruyla birlikte silinir (runtime rolünün DELETE yetkisi yok);
    // CASCADE, başvuru silmede zincirleme silmenin NO ACTION kontrolüne takılmasını önler (0005).
    foreignKey({
      name: "app_doc_files_access_token_fk",
      columns: [t.uploadedByAccessTokenId, t.applicationId],
      foreignColumns: [applicationAccessTokens.id, applicationAccessTokens.applicationId],
    }).onDelete("cascade"),
    // Tek aktif PDF (OD-16, INV-04).
    uniqueIndex("app_doc_files_one_active_per_requirement")
      .on(t.requirementId)
      .where(sql`${t.status} = 'ACTIVE'`),
    // Tek devam eden yükleme (BR-43, INV-05).
    uniqueIndex("app_doc_files_one_in_progress_per_requirement")
      .on(t.requirementId)
      .where(inList(t.status, IN_PROGRESS_FILE_STATUSES)),
    // Versiyon numarası evrak içinde benzersiz (INV-08).
    uniqueIndex("app_doc_files_requirement_version_unique")
      .on(t.requirementId, t.versionNumber)
      .where(sql`${t.versionNumber} IS NOT NULL`),
    unique("app_doc_files_id_requirement_application_unique").on(
      t.id,
      t.requirementId,
      t.applicationId,
    ),
    index("app_doc_files_requirement_created_idx").on(t.requirementId, t.createdAt.desc()),
    index("app_doc_files_application_idx").on(t.applicationId),
    index("app_doc_files_pending_expiry_idx")
      .on(t.status, t.uploadExpiresAt)
      .where(sql`${t.status} = 'UPLOAD_PENDING'`),
    check("app_doc_files_status_check", inList(t.status, FILE_STATUSES)),
    check(
      "app_doc_files_version_check",
      sql`(${inList(t.status, VERSIONED_FILE_STATUSES)}) = (${t.versionNumber} IS NOT NULL) AND (${t.versionNumber} IS NULL OR ${t.versionNumber} >= 1)`,
    ),
    check(
      "app_doc_files_size_check",
      sql`${t.sizeBytes} IS NULL OR (${t.sizeBytes} > 0 AND ${t.sizeBytes} <= ${sql.raw(String(MAX_PDF_SIZE_BYTES))})`,
    ),
    check(
      "app_doc_files_validated_metadata_check",
      sql`NOT (${inList(t.status, VERSIONED_FILE_STATUSES)}) OR (${t.sizeBytes} IS NOT NULL AND ${t.sha256} IS NOT NULL AND ${t.activatedAt} IS NOT NULL)`,
    ),
    check(
      "app_doc_files_storage_version_check",
      sql`${t.storageVersionId} IS NULL OR char_length(${t.storageVersionId}) BETWEEN 1 AND 255`,
    ),
    check(
      "app_doc_files_active_storage_version_check",
      sql`${t.status} <> 'ACTIVE' OR ${t.storageVersionId} IS NOT NULL`,
    ),
    check("app_doc_files_sha256_check", sql`${t.sha256} IS NULL OR ${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "app_doc_files_blob_pathname_check",
      sql`${t.blobPathname} = 'applications/' || ${t.applicationId} || '/' || ${t.requirementId} || '/' || ${t.id} || '.pdf'`,
    ),
    check(
      "app_doc_files_original_filename_check",
      sql`char_length(${t.originalFilename}) BETWEEN 1 AND 200`,
    ),
    check(
      "app_doc_files_rejection_check",
      sql`${t.rejectionReason} IS NULL OR (${t.status} = 'REJECTED' AND ${inList(t.rejectionReason, FILE_REJECTION_REASONS)})`,
    ),
    check("app_doc_files_uploader_type_check", inList(t.uploadedByActorType, ACTOR_TYPES)),
    check(
      "app_doc_files_uploader_check",
      sql`(${t.uploadedByActorType} = 'USER') = (${t.uploadedByUserId} IS NOT NULL)`,
    ),
    check(
      "app_doc_files_ended_by_check",
      sql`${inList(t.endedByActorType, ACTOR_TYPES)} AND (${t.endedByActorType} IS NOT DISTINCT FROM 'USER') = (${t.endedByUserId} IS NOT NULL)`,
    ),
  ],
);

/** Evrak kararları — belirli dosya versiyonuna bağlıdır (BR-57), değiştirilemez. */
export const documentReviews = pgTable(
  "document_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    fileId: uuid("file_id").notNull(),
    decision: text("decision", { enum: REVIEW_DECISIONS }).notNull(),
    customerMessage: text("customer_message"),
    reviewedByUserId: text("reviewed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "document_reviews_application_fk",
      columns: [t.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_reviews_requirement_fk",
      columns: [t.requirementId, t.applicationId],
      foreignColumns: [
        applicationDocumentRequirements.id,
        applicationDocumentRequirements.applicationId,
      ],
    }).onDelete("cascade"),
    // INV-09: incelenen dosya aynı evrağa ve aynı başvuruya aittir.
    foreignKey({
      name: "document_reviews_file_fk",
      columns: [t.fileId, t.requirementId, t.applicationId],
      foreignColumns: [
        applicationDocumentFiles.id,
        applicationDocumentFiles.requirementId,
        applicationDocumentFiles.applicationId,
      ],
    }).onDelete("cascade"),
    index("document_reviews_requirement_created_idx").on(t.requirementId, t.createdAt.desc()),
    index("document_reviews_file_idx").on(t.fileId),
    check("document_reviews_decision_check", inList(t.decision, REVIEW_DECISIONS)),
    check(
      "document_reviews_message_check",
      sql`(${t.decision} <> 'REVISION_REQUIRED' OR (${t.customerMessage} IS NOT NULL AND char_length(${t.customerMessage}) BETWEEN 10 AND 1000)) AND (${t.customerMessage} IS NULL OR char_length(${t.customerMessage}) <= 1000)`,
    ),
  ],
);

/** Müşteriye görünür yorumlar; `requirement_id` NULL ise başvuru geneli. Değiştirilemez. */
export const documentComments = pgTable(
  "document_comments",
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
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "document_comments_requirement_fk",
      columns: [t.requirementId, t.applicationId],
      foreignColumns: [
        applicationDocumentRequirements.id,
        applicationDocumentRequirements.applicationId,
      ],
    }).onDelete("cascade"),
    index("document_comments_application_created_idx").on(t.applicationId, t.createdAt),
    check("document_comments_body_check", sql`char_length(${t.body}) BETWEEN 1 AND 2000`),
  ],
);
