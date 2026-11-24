-- OD-24 / D-061: Sabit iki hesap modeli. Hesap türü başına tek kayıt (en fazla 2 şirket hesabı),
-- e-posta = değişmez iç kimlik (<id>@staff.invalid), kullanıcı adı zorunlu.
-- Admin plugin kullanılmadığı için ilgili kolonlar kaldırılır (banned, ban_reason, ban_expires,
-- impersonated_by). Uygulandığı anda tablolarda kayıt yoktu (veri kaybı yok).
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_no_impersonation_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_format_check";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_account_per_role" ON "users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "impersonated_by";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "banned";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ban_reason";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ban_expires";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_internal_check" CHECK ("users"."email" = "users"."id" || '@staff.invalid');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_check" CHECK ("users"."username" ~ '^[a-z0-9_.]{3,30}$');