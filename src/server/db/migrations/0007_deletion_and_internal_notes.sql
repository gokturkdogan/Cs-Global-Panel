CREATE TABLE "application_deletion_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"version_id" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"is_delete_marker" boolean NOT NULL,
	"file_id" uuid NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "app_deletion_objects_key_version_unique" UNIQUE("object_key","version_id"),
	CONSTRAINT "app_deletion_objects_key_check" CHECK ("application_deletion_objects"."object_key" = 'applications/' || "application_deletion_objects"."application_id" || '/' || substring("application_deletion_objects"."object_key" from 51 for 36) || '/' || "application_deletion_objects"."file_id" || '.pdf'),
	CONSTRAINT "app_deletion_objects_version_check" CHECK (char_length("application_deletion_objects"."version_id") BETWEEN 1 AND 255),
	CONSTRAINT "app_deletion_objects_size_check" CHECK ("application_deletion_objects"."size_bytes" >= 0),
	CONSTRAINT "app_deletion_objects_state_check" CHECK ("application_deletion_objects"."state" IN ('PENDING', 'DELETED')),
	CONSTRAINT "app_deletion_objects_deleted_check" CHECK (("application_deletion_objects"."state" = 'DELETED') = ("application_deletion_objects"."deleted_at" IS NOT NULL)),
	CONSTRAINT "app_deletion_objects_attempts_check" CHECK ("application_deletion_objects"."attempts" >= 0),
	CONSTRAINT "app_deletion_objects_last_error_check" CHECK ("application_deletion_objects"."last_error" IN ('STORAGE_UNAVAILABLE', 'STORAGE_LIMIT', 'STORAGE_FORBIDDEN', 'STORAGE_NOT_CONFIGURED', 'LISTING_INCOMPLETE', 'UNKNOWN_OBJECT', 'OWNERSHIP_CONFLICT', 'VERIFICATION_PENDING', 'FINALIZATION_FAILED'))
);
--> statement-breakpoint
CREATE TABLE "application_deletions" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"settle_after" timestamp with time zone NOT NULL,
	"inventory_completed_at" timestamp with time zone,
	"storage_verified_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_deletions_reason_check" CHECK (char_length(btrim("application_deletions"."reason")) >= 1 AND char_length("application_deletions"."reason") <= 1000),
	CONSTRAINT "app_deletions_attempt_check" CHECK ("application_deletions"."attempt_count" >= 0),
	CONSTRAINT "app_deletions_last_error_check" CHECK ("application_deletions"."last_error" IN ('STORAGE_UNAVAILABLE', 'STORAGE_LIMIT', 'STORAGE_FORBIDDEN', 'STORAGE_NOT_CONFIGURED', 'LISTING_INCOMPLETE', 'UNKNOWN_OBJECT', 'OWNERSHIP_CONFLICT', 'VERIFICATION_PENDING', 'FINALIZATION_FAILED')),
	CONSTRAINT "app_deletions_lease_check" CHECK (("application_deletions"."lease_id" IS NULL) = ("application_deletions"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD COLUMN "payload_hash" text;--> statement-breakpoint
ALTER TABLE "application_deletion_objects" ADD CONSTRAINT "app_deletion_objects_deletion_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application_deletions"("application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_deletions" ADD CONSTRAINT "application_deletions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_deletions" ADD CONSTRAINT "application_deletions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_deletion_objects_application_state_idx" ON "application_deletion_objects" USING btree ("application_id","state");--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD CONSTRAINT "app_internal_notes_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD CONSTRAINT "app_internal_notes_idempotency_check" CHECK (("application_internal_notes"."idempotency_key" IS NULL) = ("application_internal_notes"."payload_hash" IS NULL) AND ("application_internal_notes"."payload_hash" IS NULL OR "application_internal_notes"."payload_hash" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
-- PHASE 10 (D-116): silme işlemi kaydının updated_at trigger'ı.
CREATE TRIGGER app_deletions_set_updated_at BEFORE UPDATE ON "application_deletions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- PHASE 10 (D-117, D-102 koşulu): başvuru satırı (ve CASCADE ile dosya metadata'sı) yalnızca kalıcı silme
-- iş akışı storage'daki tüm fiziksel versiyonların yokluğunu doğruladıktan sonra silinebilir. Tablo sahibi
-- (migration/bakım) dışındaki her rol için geçerlidir; runtime rolü storage iş akışını atlayamaz.
CREATE FUNCTION applications_guard_delete() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER') THEN
    RETURN OLD;
  END IF;
  IF OLD.deletion_requested_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM application_deletions d
        WHERE d.application_id = OLD.id AND d.storage_verified_at IS NOT NULL)
     OR EXISTS (
       SELECT 1 FROM application_document_files f
        WHERE f.application_id = OLD.id AND f.blob_deleted_at IS NULL)
     OR EXISTS (
       SELECT 1 FROM application_deletion_objects o
        WHERE o.application_id = OLD.id AND o.state <> 'DELETED')
  THEN
    RAISE EXCEPTION 'application row can only be deleted after verified storage deletion'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER applications_guard_delete BEFORE DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION applications_guard_delete();--> statement-breakpoint
-- En az yetki: DELETE yok (satırlar yalnızca başvuruyla birlikte CASCADE silinir).
GRANT SELECT, INSERT, UPDATE ON application_deletions TO cs_app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON application_deletion_objects TO cs_app_runtime;
