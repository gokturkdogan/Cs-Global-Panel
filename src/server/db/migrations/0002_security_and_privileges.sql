-- Veritabanı düzeyinde güvenlik ve tutarlılık (D-039, D-054). Elle yazılmış migration:
-- Drizzle şemasında ifade edilemeyen trigger, fonksiyon ve GRANT/REVOKE tanımları.
-- Secret içermez. Runtime rolünün şifresi migration'da değil, `pnpm db:init` ile ayarlanır.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_app_runtime') THEN
    RAISE EXCEPTION 'cs_app_runtime rolü bulunamadı. Önce "pnpm db:init" çalıştırın.';
  END IF;
END
$$;
--> statement-breakpoint

-- updated_at her UPDATE'te veritabanı saatiyle güncellenir (INV-17).
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER verifications_set_updated_at BEFORE UPDATE ON verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER service_doc_reqs_set_updated_at BEFORE UPDATE ON service_document_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER app_doc_reqs_set_updated_at BEFORE UPDATE ON application_document_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- audit_logs append-only (INV-13). Trigger tablo sahibi dahil herkes için UPDATE/DELETE/TRUNCATE'i
-- reddeder; yalnızca tablo sahibi trigger'ı kapatabilir (runtime rolü sahip değildir).
CREATE FUNCTION audit_logs_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs yalnızca eklemeye açıktır (% engellendi)', TG_OP;
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_block_update_delete BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_block_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint

-- En az yetki (D-054). Runtime rolü hiçbir nesnenin sahibi değildir; DDL, TRUNCATE ve
-- REFERENCES/TRIGGER yetkisi yoktur. Yeni tablo ekleyen her migration GRANT'larını da içermelidir
-- (integration testi eksik GRANT'ı yakalar).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO cs_app_runtime;
--> statement-breakpoint

-- Better Auth (PHASE 03). Kullanıcılar silinmez (pasifleştirilir).
GRANT SELECT, INSERT, UPDATE ON users TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON accounts TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON verifications TO cs_app_runtime;
--> statement-breakpoint

-- Hizmetler fiziksel olarak silinmez (BR-22).
GRANT SELECT, INSERT, UPDATE ON services TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON service_document_requirements TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON application_number_counters TO cs_app_runtime;
--> statement-breakpoint

-- Başvuru silme yalnızca applications satırı üzerinden (ADMIN, iki aşamalı — BR-150…BR-155);
-- alt kayıtlar FK CASCADE ile silinir (referans eylemleri tablo sahibinin yetkisiyle çalışır).
GRANT SELECT, INSERT, UPDATE, DELETE ON applications TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON application_document_requirements TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON application_document_files TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON application_access_tokens TO cs_app_runtime;
--> statement-breakpoint

-- Değiştirilemez kayıtlar: yalnızca ekleme ve okuma.
GRANT SELECT, INSERT ON document_reviews TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON document_comments TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON application_internal_notes TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON application_status_history TO cs_app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO cs_app_runtime;
--> statement-breakpoint

-- Kısa ömürlü teknik sayaçlar; süresi dolanlar silinir.
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO cs_app_runtime;
