import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { EXPECTED_TABLES } from "../../scripts/db/expected-tables";

const MIGRATIONS_DIR = "src/server/db/migrations";
const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const allSql = sqlFiles.map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8")).join("\n");
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};

describe("migration dosyaları", () => {
  it("journal ile SQL dosyaları birebir eşleşir", () => {
    expect(journal.entries.map((entry) => `${entry.tag}.sql`)).toEqual(sqlFiles);
  });

  it("pg_trgm, GIN index'inden önceki migration'da kurulur", () => {
    expect(sqlFiles[0]).toBe("0000_extensions.sql");
    expect(readFileSync(join(MIGRATIONS_DIR, sqlFiles[0] ?? ""), "utf8")).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    );
  });

  it("yıkıcı ifade içermez (yalnızca gerekçeli izin listesi hariç)", () => {
    // Bilinçli ve gerekçeli yıkıcı ifadeler (veri içermeyen kolon/kısıtlar — D-061).
    const ALLOWED_DESTRUCTIVE: Record<string, RegExp> = {
      "0003_fixed_two_account_model.sql":
        /ALTER TABLE "(users|sessions)" DROP (COLUMN|CONSTRAINT) "(impersonated_by|banned|ban_reason|ban_expires|sessions_no_impersonation_check|users_username_format_check)";/g,
      // PHASE 08: token FK'leri ON DELETE CASCADE ile yeniden tanımlanır (veri silinmez; aynı migration'da
      // eklenir) — başvuru silmede zincirleme silme NO ACTION'a takılmasın.
      "0005_storage_b2.sql":
        /ALTER TABLE "(application_document_files|application_status_history)" DROP CONSTRAINT "(app_doc_files_access_token_fk|app_status_history_access_token_fk)";/g,
    };
    for (const file of sqlFiles) {
      const allowed = ALLOWED_DESTRUCTIVE[file];
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(allowed ?? /$^/, "");
      expect(sql, file).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|INDEX|CONSTRAINT)\b/i);
      expect(sql, file).not.toMatch(/^\s*TRUNCATE\b/im);
      expect(sql, file).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });

  it("secret, şifre veya bağlantı adresi içermez", () => {
    expect(allSql).not.toMatch(/postgres(ql)?:\/\//i);
    // Rol şifresi migration'a yazılmaz (db:init ayarlar). `accounts.password` kolonu hash içindir.
    expect(allSql).not.toMatch(/PASSWORD\s+'/i);
    expect(allSql).not.toMatch(/\b(CREATE|ALTER)\s+ROLE\b/i);
  });

  it.each([
    [
      "INV-02 tek aktif bağlantı",
      /UNIQUE INDEX "access_tokens_one_active_per_application"[^;]*WHERE[^;]*"revoked_at" IS NULL/,
    ],
    [
      "INV-04 tek aktif PDF",
      /UNIQUE INDEX "app_doc_files_one_active_per_requirement"[^;]*WHERE[^;]*"status" = 'ACTIVE'/,
    ],
    [
      "INV-05 tek devam eden yükleme",
      /UNIQUE INDEX "app_doc_files_one_in_progress_per_requirement"[^;]*WHERE[^;]*IN \('UPLOAD_PENDING', 'VALIDATING'\)/,
    ],
    [
      "INV-08 benzersiz versiyon",
      /UNIQUE INDEX "app_doc_files_requirement_version_unique"[^;]*WHERE[^;]*"version_number" IS NOT NULL/,
    ],
    [
      "Türkçe arama trigram index'i",
      /"applications_search_text_trgm_idx"[^;]*USING gin \("search_text" gin_trgm_ops\)/,
    ],
    [
      "INV-09 inceleme → aynı evrak/başvuru dosyası",
      /"document_reviews_file_fk" FOREIGN KEY \("file_id","requirement_id","application_id"\)/,
    ],
    [
      "INV-12 IP/UA saklanmaz",
      /"sessions_no_ip_ua_check" CHECK \("sessions"\."ip_address" IS NULL AND "sessions"\."user_agent" IS NULL\)/,
    ],
    [
      "OD-24 hesap türü başına tek hesap",
      /UNIQUE INDEX "users_one_account_per_role" ON "users" USING btree \("role"\)/,
    ],
    [
      "OD-24 e-posta iç kimlik",
      /"users_email_internal_check" CHECK \("users"\."email" = "users"\."id" \|\| '@staff\.invalid'\)/,
    ],
    ["INV-13 audit UPDATE/DELETE trigger", /BEFORE UPDATE OR DELETE ON audit_logs/],
    ["INV-13 audit TRUNCATE trigger", /BEFORE TRUNCATE ON audit_logs/],
  ])("%s tanımlıdır", (_label, pattern) => {
    expect(allSql).toMatch(pattern);
  });

  it("her tablo runtime rolüne açıkça yetkilendirilir; audit_logs yalnızca SELECT+INSERT alır", () => {
    for (const table of EXPECTED_TABLES) {
      expect(allSql).toMatch(new RegExp(`GRANT [A-Z, ]+ ON ${table} TO cs_app_runtime;`));
    }
    expect(allSql).toContain("GRANT SELECT, INSERT ON audit_logs TO cs_app_runtime;");
    expect(allSql).not.toMatch(/GRANT[^;]*TRUNCATE/i);
    expect(allSql).not.toMatch(/GRANT ALL/i);
  });
});

describe("Drizzle şeması", () => {
  const tables = Object.values(schema)
    .filter(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        Symbol.for("drizzle:IsDrizzleTable") in value,
    )
    .map((table) => getTableConfig(table as Parameters<typeof getTableConfig>[0]).name)
    .sort();

  it("dokümandaki 17 tabloyu birebir içerir", () => {
    expect(tables).toEqual([...EXPECTED_TABLES].sort());
  });

  it("kaldırılmış tablolar yeniden eklenmemiştir", () => {
    for (const removed of [
      "customers",
      "customer_otp_challenges",
      "customer_sessions",
      "document_review_files",
      "system_settings",
      "rate_limits",
    ]) {
      expect(tables).not.toContain(removed);
    }
  });
});
