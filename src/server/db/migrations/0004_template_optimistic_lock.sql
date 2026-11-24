ALTER TABLE "service_document_requirements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_document_requirements" ADD CONSTRAINT "service_doc_reqs_version_check" CHECK ("service_document_requirements"."version" >= 1);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_version_check" CHECK ("services"."version" >= 1);