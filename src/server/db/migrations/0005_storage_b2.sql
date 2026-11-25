CREATE TABLE "storage_quota_state" (
	"id" smallint PRIMARY KEY NOT NULL,
	"untracked_bytes" bigint DEFAULT 0 NOT NULL,
	"reconciled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_quota_state_singleton_check" CHECK ("storage_quota_state"."id" = 1),
	CONSTRAINT "storage_quota_state_untracked_check" CHECK ("storage_quota_state"."untracked_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "application_document_files" DROP CONSTRAINT "app_doc_files_access_token_fk";
--> statement-breakpoint
ALTER TABLE "application_status_history" DROP CONSTRAINT "app_status_history_access_token_fk";
--> statement-breakpoint
ALTER TABLE "application_document_files" ADD COLUMN "storage_version_id" text;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "app_doc_files_access_token_fk" FOREIGN KEY ("uploaded_by_access_token_id","application_id") REFERENCES "public"."application_access_tokens"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "app_status_history_access_token_fk" FOREIGN KEY ("actor_access_token_id","application_id") REFERENCES "public"."application_access_tokens"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "app_doc_files_storage_version_check" CHECK ("application_document_files"."storage_version_id" IS NULL OR char_length("application_document_files"."storage_version_id") BETWEEN 1 AND 255);--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "app_doc_files_active_storage_version_check" CHECK ("application_document_files"."status" <> 'ACTIVE' OR "application_document_files"."storage_version_id" IS NOT NULL);--> statement-breakpoint
-- PHASE 08 (D-101, D-102): tek satırlık kota durumu + updated_at trigger'ı + en az yetki.
-- Runtime rolü satır ekleyemez/silemez; yalnızca okur ve günceller (kilit + mutabakat sonucu).
INSERT INTO "storage_quota_state" ("id", "untracked_bytes") VALUES (1, 0);--> statement-breakpoint
CREATE TRIGGER storage_quota_state_set_updated_at BEFORE UPDATE ON "storage_quota_state"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, UPDATE ON storage_quota_state TO cs_app_runtime;
