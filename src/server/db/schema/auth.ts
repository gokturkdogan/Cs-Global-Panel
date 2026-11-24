import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { STAFF_ROLES } from "../../../config/statuses";
import { auditTimestamps, inList, timestamptz } from "./helpers";

/*
 * Better Auth 1.7.27 tabloları (username plugin; admin plugin kullanılmaz — OD-24, D-061).
 * TS alan adları Better Auth'un alan adlarıyla birebir aynıdır (Drizzle adapter
 * `schema[model][field]` ile arar); kolon adları snake_case'tir.
 *
 * Hesap modeli (OD-24): yalnızca iki şirket hesabı — bir `admin`, bir `employee`. Hesap türü
 * başına tek kayıt veritabanında zorunludur; yetki farkı yoktur (hesap türü yalnızca tanımlama).
 */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Better Auth zorunlu kılar; sistem e-posta göndermez (OD-08). Kişisel veri değildir:
    // değişmez iç kimlik `<id>@staff.invalid` (RFC 2606 `.invalid` — yönlendirilemez; D-061).
    email: text("email").notNull().unique("users_email_unique"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Tek giriş yolu. Username plugin değeri küçük harfe normalize eder; benzersizlik bu değer üzerindedir.
    username: text("username").notNull().unique("users_username_unique"),
    displayUsername: text("display_username"),
    // Hesap türü; varsayılan yoktur (bootstrap açıkça belirtir).
    role: text("role", { enum: STAFF_ROLES }).notNull(),
    ...auditTimestamps(),
  },
  (t) => [
    check("users_role_check", inList(t.role, STAFF_ROLES)),
    // OD-24: hesap türü başına en fazla bir hesap → toplam en fazla iki şirket hesabı.
    uniqueIndex("users_one_account_per_role").on(t.role),
    check("users_email_internal_check", sql`${t.email} = ${t.id} || '@staff.invalid'`),
    check("users_username_format_check", sql`${t.username} ~ '^[a-z0-9_.]{3,30}$'`),
    check("users_email_length_check", sql`char_length(${t.email}) BETWEEN 3 AND 254`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique("sessions_token_unique"),
    // OD-09: IP ve user-agent saklanmaz. Kolonlar Better Auth uyumluluğu için vardır,
    // CHECK ile her zaman NULL kalmaları zorunludur.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...auditTimestamps(),
  },
  (t) => [
    check("sessions_no_ip_ua_check", sql`${t.ipAddress} IS NULL AND ${t.userAgent} IS NULL`),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    // Better Auth'un ürettiği şifre hash'i (scrypt). Düz şifre asla saklanmaz.
    password: text("password"),
    ...auditTimestamps(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...auditTimestamps(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
