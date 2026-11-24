CREATE TABLE "application_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revoke_reason" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "access_tokens_id_application_unique" UNIQUE("id","application_id"),
	CONSTRAINT "access_tokens_hash_format_check" CHECK ("application_access_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "access_tokens_key_id_format_check" CHECK ("application_access_tokens"."encryption_key_id" ~ '^[A-Za-z0-9_-]{1,32}$'),
	CONSTRAINT "access_tokens_ciphertext_format_check" CHECK ("application_access_tokens"."token_ciphertext" LIKE 'v1:' || "application_access_tokens"."encryption_key_id" || ':%'),
	CONSTRAINT "access_tokens_revoke_reason_check" CHECK ("application_access_tokens"."revoke_reason" IN ('ROTATED', 'REVOKED', 'APPLICATION_DELETION')),
	CONSTRAINT "access_tokens_revocation_check" CHECK (("application_access_tokens"."revoked_at" IS NULL) = ("application_access_tokens"."revoke_reason" IS NULL) AND ("application_access_tokens"."revoked_at" IS NULL) = ("application_access_tokens"."revoked_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "application_number_counters" (
	"year" smallint PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "app_number_counters_year_check" CHECK ("application_number_counters"."year" BETWEEN 2000 AND 9999),
	CONSTRAINT "app_number_counters_value_check" CHECK ("application_number_counters"."last_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_number" text NOT NULL,
	"customer_first_name" text NOT NULL,
	"customer_last_name" text NOT NULL,
	"customer_phone_e164" text NOT NULL,
	"customer_email" text NOT NULL,
	"search_text" text NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name_snapshot" text NOT NULL,
	"status" text DEFAULT 'AWAITING_DOCUMENTS' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text,
	"idempotency_key" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deletion_requested_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_number_unique" UNIQUE("application_number"),
	CONSTRAINT "applications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "applications_number_format_check" CHECK ("applications"."application_number" ~ '^CS-[0-9]{4}-[0-9]{6,}$'),
	CONSTRAINT "applications_first_name_check" CHECK (char_length("applications"."customer_first_name") BETWEEN 1 AND 100 AND "applications"."customer_first_name" = btrim("applications"."customer_first_name")),
	CONSTRAINT "applications_last_name_check" CHECK (char_length("applications"."customer_last_name") BETWEEN 1 AND 100 AND "applications"."customer_last_name" = btrim("applications"."customer_last_name")),
	CONSTRAINT "applications_phone_check" CHECK ("applications"."customer_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "applications_email_check" CHECK (char_length("applications"."customer_email") <= 254 AND "applications"."customer_email" = lower(btrim("applications"."customer_email")) AND "applications"."customer_email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
	CONSTRAINT "applications_search_text_check" CHECK (char_length("applications"."search_text") >= 1),
	CONSTRAINT "applications_service_name_snapshot_check" CHECK (char_length("applications"."service_name_snapshot") BETWEEN 2 AND 150),
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" IN ('AWAITING_DOCUMENTS', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'DOCUMENTS_APPROVED', 'IN_PROCESS', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "applications_version_check" CHECK ("applications"."version" >= 1),
	CONSTRAINT "applications_deletion_actor_check" CHECK (("applications"."deletion_requested_at" IS NULL) = ("applications"."deletion_requested_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"actor_access_token_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"application_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_logs_action_format_check" CHECK ("audit_logs"."action" ~ '^[A-Z][A-Z_]{2,63}$'),
	CONSTRAINT "audit_logs_actor_type_check" CHECK ("audit_logs"."actor_type" IN ('USER', 'CUSTOMER', 'SYSTEM', 'ANONYMOUS')),
	CONSTRAINT "audit_logs_actor_user_check" CHECK ("audit_logs"."actor_type" <> 'USER' OR "audit_logs"."actor_user_id" IS NOT NULL),
	CONSTRAINT "audit_logs_resource_type_check" CHECK ("audit_logs"."resource_type" IN ('application', 'document', 'file', 'user', 'service', 'document_template', 'access_link', 'session')),
	CONSTRAINT "audit_logs_resource_id_check" CHECK ("audit_logs"."resource_id" IS NULL OR char_length("audit_logs"."resource_id") <= 100),
	CONSTRAINT "audit_logs_metadata_check" CHECK (jsonb_typeof("audit_logs"."metadata") = 'object' AND ("audit_logs"."metadata" - ARRAY['accessTokenId', 'changedFields', 'count', 'counts', 'fileCount', 'fileId', 'from', 'id', 'onBehalfOfCustomer', 'reason', 'requirementId', 'reviewId', 'serviceId', 'to', 'transitionCode', 'versionNumber']::text[]) = '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token"),
	CONSTRAINT "sessions_no_ip_ua_check" CHECK ("sessions"."ip_address" IS NULL AND "sessions"."user_agent" IS NULL),
	CONSTRAINT "sessions_no_impersonation_check" CHECK ("sessions"."impersonated_by" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin', 'employee')),
	CONSTRAINT "users_username_format_check" CHECK ("users"."username" IS NULL OR "users"."username" ~ '^[a-z0-9_.]{3,30}$'),
	CONSTRAINT "users_email_length_check" CHECK (char_length("users"."email") BETWEEN 3 AND 254)
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"status" text DEFAULT 'UPLOAD_PENDING' NOT NULL,
	"version_number" integer,
	"blob_pathname" text NOT NULL,
	"original_filename" text NOT NULL,
	"size_bytes" integer,
	"sha256" text,
	"rejection_reason" text,
	"uploaded_by_actor_type" text NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_by_access_token_id" uuid,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by_actor_type" text,
	"ended_by_user_id" text,
	"blob_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_doc_files_blob_pathname_unique" UNIQUE("blob_pathname"),
	CONSTRAINT "app_doc_files_id_requirement_application_unique" UNIQUE("id","requirement_id","application_id"),
	CONSTRAINT "app_doc_files_status_check" CHECK ("application_document_files"."status" IN ('UPLOAD_PENDING', 'VALIDATING', 'ACTIVE', 'SUPERSEDED', 'REMOVED', 'REJECTED', 'EXPIRED')),
	CONSTRAINT "app_doc_files_version_check" CHECK (("application_document_files"."status" IN ('ACTIVE', 'SUPERSEDED', 'REMOVED')) = ("application_document_files"."version_number" IS NOT NULL) AND ("application_document_files"."version_number" IS NULL OR "application_document_files"."version_number" >= 1)),
	CONSTRAINT "app_doc_files_size_check" CHECK ("application_document_files"."size_bytes" IS NULL OR ("application_document_files"."size_bytes" > 0 AND "application_document_files"."size_bytes" <= 10485760)),
	CONSTRAINT "app_doc_files_validated_metadata_check" CHECK (NOT ("application_document_files"."status" IN ('ACTIVE', 'SUPERSEDED', 'REMOVED')) OR ("application_document_files"."size_bytes" IS NOT NULL AND "application_document_files"."sha256" IS NOT NULL AND "application_document_files"."activated_at" IS NOT NULL)),
	CONSTRAINT "app_doc_files_sha256_check" CHECK ("application_document_files"."sha256" IS NULL OR "application_document_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "app_doc_files_blob_pathname_check" CHECK ("application_document_files"."blob_pathname" = 'applications/' || "application_document_files"."application_id" || '/' || "application_document_files"."requirement_id" || '/' || "application_document_files"."id" || '.pdf'),
	CONSTRAINT "app_doc_files_original_filename_check" CHECK (char_length("application_document_files"."original_filename") BETWEEN 1 AND 200),
	CONSTRAINT "app_doc_files_rejection_check" CHECK ("application_document_files"."rejection_reason" IS NULL OR ("application_document_files"."status" = 'REJECTED' AND "application_document_files"."rejection_reason" IN ('NOT_PDF', 'ACTIVE_CONTENT', 'EMBEDDED_FILE', 'ENCRYPTED', 'MALFORMED', 'TOO_LARGE', 'RESOURCE_LIMIT', 'STATE_CHANGED', 'VALIDATION_ERROR'))),
	CONSTRAINT "app_doc_files_uploader_type_check" CHECK ("application_document_files"."uploaded_by_actor_type" IN ('USER', 'CUSTOMER')),
	CONSTRAINT "app_doc_files_uploader_check" CHECK (("application_document_files"."uploaded_by_actor_type" = 'USER') = ("application_document_files"."uploaded_by_user_id" IS NOT NULL)),
	CONSTRAINT "app_doc_files_ended_by_check" CHECK ("application_document_files"."ended_by_actor_type" IN ('USER', 'CUSTOMER') AND ("application_document_files"."ended_by_actor_type" IS NOT DISTINCT FROM 'USER') = ("application_document_files"."ended_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "application_document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"source_requirement_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"instructions" text,
	"is_required" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'NOT_UPLOADED' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_doc_reqs_id_application_unique" UNIQUE("id","application_id"),
	CONSTRAINT "app_doc_reqs_title_check" CHECK (char_length("application_document_requirements"."title") BETWEEN 2 AND 150 AND "application_document_requirements"."title" = btrim("application_document_requirements"."title")),
	CONSTRAINT "app_doc_reqs_description_check" CHECK ("application_document_requirements"."description" IS NULL OR char_length("application_document_requirements"."description") <= 2000),
	CONSTRAINT "app_doc_reqs_instructions_check" CHECK ("application_document_requirements"."instructions" IS NULL OR char_length("application_document_requirements"."instructions") <= 4000),
	CONSTRAINT "app_doc_reqs_status_check" CHECK ("application_document_requirements"."status" IN ('NOT_UPLOADED', 'UPLOADED', 'PENDING_REVIEW', 'APPROVED', 'REVISION_REQUIRED')),
	CONSTRAINT "app_doc_reqs_version_check" CHECK ("application_document_requirements"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requirement_id" uuid,
	"body" text NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_comments_body_check" CHECK (char_length("document_comments"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"customer_message" text,
	"reviewed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_reviews_decision_check" CHECK ("document_reviews"."decision" IN ('APPROVED', 'REVISION_REQUIRED')),
	CONSTRAINT "document_reviews_message_check" CHECK (("document_reviews"."decision" <> 'REVISION_REQUIRED' OR ("document_reviews"."customer_message" IS NOT NULL AND char_length("document_reviews"."customer_message") BETWEEN 10 AND 1000)) AND ("document_reviews"."customer_message" IS NULL OR char_length("document_reviews"."customer_message") <= 1000))
);
--> statement-breakpoint
CREATE TABLE "application_internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requirement_id" uuid,
	"body" text NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_internal_notes_body_check" CHECK (char_length("application_internal_notes"."body") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"transition_code" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"actor_access_token_id" uuid,
	"on_behalf_of_customer" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_status_history_from_status_check" CHECK ("application_status_history"."from_status" IN ('AWAITING_DOCUMENTS', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'DOCUMENTS_APPROVED', 'IN_PROCESS', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "app_status_history_to_status_check" CHECK ("application_status_history"."to_status" IN ('AWAITING_DOCUMENTS', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'DOCUMENTS_APPROVED', 'IN_PROCESS', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "app_status_history_transition_code_check" CHECK ("application_status_history"."transition_code" IN ('CREATE', 'SUBMIT', 'REQUEST_REVISION', 'APPROVE_DOCUMENTS', 'RESUBMIT', 'START_PROCESSING', 'COMPLETE', 'CANCEL', 'REOPEN_CANCELLED', 'REOPEN_COMPLETED', 'REVERT_TO_DOCUMENTS_APPROVED', 'REVERT_TO_REVIEW', 'REVERT_FOR_REVISION')),
	CONSTRAINT "app_status_history_create_check" CHECK (("application_status_history"."from_status" IS NULL) = ("application_status_history"."transition_code" = 'CREATE')),
	CONSTRAINT "app_status_history_actor_type_check" CHECK ("application_status_history"."actor_type" IN ('USER', 'CUSTOMER')),
	CONSTRAINT "app_status_history_actor_check" CHECK (("application_status_history"."actor_type" = 'USER') = ("application_status_history"."actor_user_id" IS NOT NULL)),
	CONSTRAINT "app_status_history_on_behalf_check" CHECK (NOT "application_status_history"."on_behalf_of_customer" OR "application_status_history"."actor_type" = 'USER'),
	CONSTRAINT "app_status_history_reason_check" CHECK ((NOT ("application_status_history"."transition_code" IN ('CANCEL', 'REOPEN_CANCELLED', 'REOPEN_COMPLETED', 'REVERT_TO_DOCUMENTS_APPROVED', 'REVERT_TO_REVIEW', 'REVERT_FOR_REVISION')) OR ("application_status_history"."reason" IS NOT NULL AND char_length(btrim("application_status_history"."reason")) >= 1)) AND ("application_status_history"."reason" IS NULL OR char_length("application_status_history"."reason") <= 1000))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_check" CHECK (char_length("rate_limit_buckets"."key") BETWEEN 1 AND 200),
	CONSTRAINT "rate_limit_buckets_count_check" CHECK ("rate_limit_buckets"."count" >= 0),
	CONSTRAINT "rate_limit_buckets_window_check" CHECK ("rate_limit_buckets"."expires_at" > "rate_limit_buckets"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "service_document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"instructions" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_doc_reqs_title_check" CHECK (char_length("service_document_requirements"."title") BETWEEN 2 AND 150 AND "service_document_requirements"."title" = btrim("service_document_requirements"."title")),
	CONSTRAINT "service_doc_reqs_description_check" CHECK ("service_document_requirements"."description" IS NULL OR char_length("service_document_requirements"."description") <= 2000),
	CONSTRAINT "service_doc_reqs_instructions_check" CHECK ("service_document_requirements"."instructions" IS NULL OR char_length("service_document_requirements"."instructions") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_check" CHECK (char_length("services"."name") BETWEEN 2 AND 150 AND "services"."name" = btrim("services"."name")),
	CONSTRAINT "services_description_check" CHECK ("services"."description" IS NULL OR char_length("services"."description") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "application_access_tokens" ADD CONSTRAINT "application_access_tokens_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_access_tokens" ADD CONSTRAINT "application_access_tokens_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_access_tokens" ADD CONSTRAINT "application_access_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_deletion_requested_by_user_id_users_id_fk" FOREIGN KEY ("deletion_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "application_document_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "application_document_files_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "app_doc_files_requirement_fk" FOREIGN KEY ("requirement_id","application_id") REFERENCES "public"."application_document_requirements"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_files" ADD CONSTRAINT "app_doc_files_access_token_fk" FOREIGN KEY ("uploaded_by_access_token_id","application_id") REFERENCES "public"."application_access_tokens"("id","application_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_requirements" ADD CONSTRAINT "app_doc_reqs_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document_requirements" ADD CONSTRAINT "app_doc_reqs_source_requirement_fk" FOREIGN KEY ("source_requirement_id") REFERENCES "public"."service_document_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_requirement_fk" FOREIGN KEY ("requirement_id","application_id") REFERENCES "public"."application_document_requirements"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_requirement_fk" FOREIGN KEY ("requirement_id","application_id") REFERENCES "public"."application_document_requirements"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_file_fk" FOREIGN KEY ("file_id","requirement_id","application_id") REFERENCES "public"."application_document_files"("id","requirement_id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD CONSTRAINT "application_internal_notes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD CONSTRAINT "application_internal_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_internal_notes" ADD CONSTRAINT "app_internal_notes_requirement_fk" FOREIGN KEY ("requirement_id","application_id") REFERENCES "public"."application_document_requirements"("id","application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "app_status_history_access_token_fk" FOREIGN KEY ("actor_access_token_id","application_id") REFERENCES "public"."application_access_tokens"("id","application_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_document_requirements" ADD CONSTRAINT "service_document_requirements_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_document_requirements" ADD CONSTRAINT "service_document_requirements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_document_requirements" ADD CONSTRAINT "service_document_requirements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_tokens_one_active_per_application" ON "application_access_tokens" USING btree ("application_id") WHERE "application_access_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "access_tokens_application_created_idx" ON "application_access_tokens" USING btree ("application_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_status_created_at_idx" ON "applications" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_service_created_at_idx" ON "applications" USING btree ("service_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_phone_idx" ON "applications" USING btree ("customer_phone_e164");--> statement-breakpoint
CREATE INDEX "applications_email_idx" ON "applications" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "applications_search_text_trgm_idx" ON "applications" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "applications_deletion_requested_idx" ON "applications" USING btree ("deletion_requested_at") WHERE "applications"."deletion_requested_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs" USING btree ("action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_occurred_at_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_application_occurred_at_idx" ON "audit_logs" USING btree ("application_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "app_doc_files_one_active_per_requirement" ON "application_document_files" USING btree ("requirement_id") WHERE "application_document_files"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "app_doc_files_one_in_progress_per_requirement" ON "application_document_files" USING btree ("requirement_id") WHERE "application_document_files"."status" IN ('UPLOAD_PENDING', 'VALIDATING');--> statement-breakpoint
CREATE UNIQUE INDEX "app_doc_files_requirement_version_unique" ON "application_document_files" USING btree ("requirement_id","version_number") WHERE "application_document_files"."version_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "app_doc_files_requirement_created_idx" ON "application_document_files" USING btree ("requirement_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "app_doc_files_application_idx" ON "application_document_files" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "app_doc_files_pending_expiry_idx" ON "application_document_files" USING btree ("status","upload_expires_at") WHERE "application_document_files"."status" = 'UPLOAD_PENDING';--> statement-breakpoint
CREATE INDEX "app_doc_reqs_application_sort_idx" ON "application_document_requirements" USING btree ("application_id","sort_order");--> statement-breakpoint
CREATE INDEX "document_comments_application_created_idx" ON "document_comments" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "document_reviews_requirement_created_idx" ON "document_reviews" USING btree ("requirement_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "document_reviews_file_idx" ON "document_reviews" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "app_internal_notes_application_created_idx" ON "application_internal_notes" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "app_status_history_application_created_idx" ON "application_status_history" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "service_doc_reqs_service_active_sort_idx" ON "service_document_requirements" USING btree ("service_id","is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "services_name_lower_unique" ON "services" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "services_active_sort_idx" ON "services" USING btree ("is_active","sort_order");