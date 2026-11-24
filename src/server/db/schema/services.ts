import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditTimestamps } from "./helpers";
import { users } from "./auth";

/*
 * Hizmetler ve evrak şablonları — DATABASE_SCHEMA §4.1–4.2. Fiziksel silme yoktur (BR-22);
 * pasifleştirme `is_active` ile yapılır. Dosya tipi/boyutu/sayısı kolon değildir (OD-16).
 *
 * `created_by_user_id` NULL olabilir: NULL = sistem/seed kaydı (D-053). Personelin
 * oluşturduğu kayıtlarda uygulama katmanı (PHASE 05) değeri zorunlu doldurur.
 */

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Optimistic lock (PHASE 05, D-074): her alan/durum değişikliğinde artar. */
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (t) => [
    check("services_version_check", sql`${t.version} >= 1`),
    uniqueIndex("services_name_lower_unique").on(sql`lower(${t.name})`),
    index("services_active_sort_idx").on(t.isActive, t.sortOrder),
    check(
      "services_name_check",
      sql`char_length(${t.name}) BETWEEN 2 AND 150 AND ${t.name} = btrim(${t.name})`,
    ),
    check(
      "services_description_check",
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 2000`,
    ),
  ],
);

export const serviceDocumentRequirements = pgTable(
  "service_document_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /** Optimistic lock (PHASE 05, D-074): içerik/durum değişikliğinde artar; sıralama artırmaz. */
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditTimestamps(),
  },
  (t) => [
    check("service_doc_reqs_version_check", sql`${t.version} >= 1`),
    index("service_doc_reqs_service_active_sort_idx").on(t.serviceId, t.isActive, t.sortOrder),
    check(
      "service_doc_reqs_title_check",
      sql`char_length(${t.title}) BETWEEN 2 AND 150 AND ${t.title} = btrim(${t.title})`,
    ),
    check(
      "service_doc_reqs_description_check",
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 2000`,
    ),
    check(
      "service_doc_reqs_instructions_check",
      sql`${t.instructions} IS NULL OR char_length(${t.instructions}) <= 4000`,
    ),
  ],
);
