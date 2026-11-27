CREATE TABLE "storage_write_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"state" text DEFAULT 'ADMITTED' NOT NULL,
	"outcome" text,
	"version_id" text,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "storage_write_attempts_state_check" CHECK ("storage_write_attempts"."state" IN ('ADMITTED', 'IN_PROGRESS', 'CONFIRMED', 'FAILED', 'FENCED', 'UNKNOWN')),
	CONSTRAINT "storage_write_attempts_outcome_check" CHECK ("storage_write_attempts"."outcome" IN ('PROVIDER_CONFIRMED', 'OBSERVED', 'NOT_SENT', 'FENCED_BY_DELETION', 'RESERVATION_EXPIRED', 'RESPONSE_LOST', 'PROVIDER_ERROR', 'NO_VERSION_ID', 'INTEGRITY_MISMATCH')),
	CONSTRAINT "storage_write_attempts_key_check" CHECK ("storage_write_attempts"."object_key" LIKE 'applications/' || "storage_write_attempts"."application_id" || '/%/' || "storage_write_attempts"."file_id" || '.pdf'),
	CONSTRAINT "storage_write_attempts_version_check" CHECK (("storage_write_attempts"."state" = 'CONFIRMED') = ("storage_write_attempts"."version_id" IS NOT NULL) AND ("storage_write_attempts"."version_id" IS NULL OR char_length("storage_write_attempts"."version_id") BETWEEN 1 AND 255)),
	CONSTRAINT "storage_write_attempts_settled_check" CHECK (("storage_write_attempts"."state" IN ('CONFIRMED', 'FAILED', 'FENCED')) = ("storage_write_attempts"."settled_at" IS NOT NULL)),
	CONSTRAINT "storage_write_attempts_started_check" CHECK (("storage_write_attempts"."state" IN ('ADMITTED', 'FENCED')) = ("storage_write_attempts"."started_at" IS NULL)),
	CONSTRAINT "storage_write_attempts_failed_check" CHECK ("storage_write_attempts"."state" <> 'FAILED' OR "storage_write_attempts"."outcome" = 'NOT_SENT')
);
--> statement-breakpoint
ALTER TABLE "application_deletion_objects" DROP CONSTRAINT "app_deletion_objects_last_error_check";--> statement-breakpoint
ALTER TABLE "application_deletions" DROP CONSTRAINT "app_deletions_last_error_check";--> statement-breakpoint
ALTER TABLE "application_deletions" ADD COLUMN "final_listing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_write_attempts" ADD CONSTRAINT "storage_write_attempts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_write_attempts" ADD CONSTRAINT "storage_write_attempts_file_id_application_document_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."application_document_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_write_attempts_application_state_idx" ON "storage_write_attempts" USING btree ("application_id","state");--> statement-breakpoint
CREATE INDEX "storage_write_attempts_file_idx" ON "storage_write_attempts" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_write_attempts_version_unique" ON "storage_write_attempts" USING btree ("object_key","version_id") WHERE "storage_write_attempts"."version_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "application_deletion_objects" ADD CONSTRAINT "app_deletion_objects_last_error_check" CHECK ("application_deletion_objects"."last_error" IN ('STORAGE_UNAVAILABLE', 'STORAGE_LIMIT', 'STORAGE_FORBIDDEN', 'STORAGE_NOT_CONFIGURED', 'LISTING_INCOMPLETE', 'UNKNOWN_OBJECT', 'OWNERSHIP_CONFLICT', 'VERIFICATION_PENDING', 'FINALIZATION_FAILED', 'UPLOAD_OUTCOME_UNKNOWN', 'LEGACY_UNVERIFIED'));--> statement-breakpoint
ALTER TABLE "application_deletions" ADD CONSTRAINT "app_deletions_last_error_check" CHECK ("application_deletions"."last_error" IN ('STORAGE_UNAVAILABLE', 'STORAGE_LIMIT', 'STORAGE_FORBIDDEN', 'STORAGE_NOT_CONFIGURED', 'LISTING_INCOMPLETE', 'UNKNOWN_OBJECT', 'OWNERSHIP_CONFLICT', 'VERIFICATION_PENDING', 'FINALIZATION_FAILED', 'UPLOAD_OUTCOME_UNKNOWN', 'LEGACY_UNVERIFIED'));--> statement-breakpoint
-- PHASE 10.1 (D-122, D-125): yazım girişimi durum makinesi. Kimlik alanları değişmez; yalnızca izinli
-- geçişler: ADMITTED→IN_PROGRESS|FENCED, IN_PROGRESS→CONFIRMED|FAILED|UNKNOWN, UNKNOWN→CONFIRMED.
-- Çözülmüş kayıtlar değiştirilemez; UNKNOWN→FAILED/FENCED ("elle çözüldü") yolu yoktur. Tüm roller için.
CREATE FUNCTION storage_write_attempts_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.application_id <> OLD.application_id OR NEW.file_id <> OLD.file_id
     OR NEW.object_key <> OLD.object_key OR NEW.admitted_at <> OLD.admitted_at THEN
    RAISE EXCEPTION 'storage write attempt identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT ((OLD.state = 'ADMITTED' AND NEW.state IN ('IN_PROGRESS', 'FENCED'))
       OR (OLD.state = 'IN_PROGRESS' AND NEW.state IN ('CONFIRMED', 'FAILED', 'UNKNOWN'))
       OR (OLD.state = 'UNKNOWN' AND NEW.state = 'CONFIRMED')) THEN
    RAISE EXCEPTION 'storage write attempt transition % -> % not allowed', OLD.state, NEW.state
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER storage_write_attempts_guard_update BEFORE UPDATE ON storage_write_attempts
  FOR EACH ROW EXECUTE FUNCTION storage_write_attempts_guard_update();--> statement-breakpoint
-- PHASE 10.1 (D-125): silme işareti geri alınamaz (müşteri erişimi ve mutasyonlar yeniden açılamaz).
CREATE FUNCTION applications_guard_deletion_flag() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deletion_requested_at IS NOT NULL AND (
       NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at
       OR NEW.deletion_requested_by_user_id IS DISTINCT FROM OLD.deletion_requested_by_user_id) THEN
    RAISE EXCEPTION 'application deletion request is irreversible' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER applications_guard_deletion_flag BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION applications_guard_deletion_flag();--> statement-breakpoint
-- PHASE 10.1 (D-124, D-125, D-126): silme koruması v2 — 0007 koşullarına ek olarak: çözülmemiş yazım
-- girişimi yok; yazım takibi olmayan (eski) dosya kaydı yok; sonlandırma listelemesi kayıtlı ve her girişim
-- o listelemeden ÖNCE çözülmüş. DB dış sağlayıcıyı doğrulayamaz: bu koşullar uygulamanın ürettiği kalıcı
-- kanıtlar ve domain değişmezleri üzerinde çalışır. Tablo sahibi muaf (migration/test temizliği).
CREATE OR REPLACE FUNCTION applications_guard_delete() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  listing_at timestamptz;
BEGIN
  IF pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER') THEN
    RETURN OLD;
  END IF;
  SELECT d.final_listing_started_at INTO listing_at
    FROM application_deletions d
   WHERE d.application_id = OLD.id AND d.storage_verified_at IS NOT NULL;
  IF OLD.deletion_requested_at IS NULL
     OR listing_at IS NULL
     OR EXISTS (
       SELECT 1 FROM application_document_files f
        WHERE f.application_id = OLD.id AND f.blob_deleted_at IS NULL)
     OR EXISTS (
       SELECT 1 FROM application_deletion_objects o
        WHERE o.application_id = OLD.id AND o.state <> 'DELETED')
     OR EXISTS (
       SELECT 1 FROM storage_write_attempts w
        WHERE w.application_id = OLD.id
          AND (w.state NOT IN ('CONFIRMED', 'FAILED', 'FENCED') OR w.settled_at >= listing_at))
     OR EXISTS (
       SELECT 1 FROM application_document_files f
        WHERE f.application_id = OLD.id
          AND NOT EXISTS (SELECT 1 FROM storage_write_attempts w WHERE w.file_id = f.id))
  THEN
    RAISE EXCEPTION 'application row can only be deleted after verified storage deletion'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
-- En az yetki: DELETE yok (yalnızca başvuruyla CASCADE).
GRANT SELECT, INSERT, UPDATE ON storage_write_attempts TO cs_app_runtime;
