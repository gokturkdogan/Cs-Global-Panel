-- PHASE 12.1 (D-144, SEC-04): çalışma zamanı rolü personel hesabı oluşturamaz/değiştiremez.
-- Uygulama (Better Auth) giriş/oturum/çıkış için users/accounts tablolarını yalnızca OKUR; oturumlar
-- sessions tablosundadır (yetkisi değişmez). Hesap oluşturma ve şifre sıfırlama yalnızca yerel CLI
-- (pnpm auth:bootstrap / auth:reset-password) ile ve sahip rolle yapılır. verifications tablosu hiçbir
-- uygulama akışında kullanılmaz (e-posta doğrulama/sıfırlama kapalı) → yalnızca okuma kalır.
-- Yalnızca yetki daraltır (veri/şema değişmez). Geri alma: GRANT INSERT, UPDATE ON users, accounts ve
-- GRANT INSERT, UPDATE, DELETE ON verifications TO cs_app_runtime.
REVOKE INSERT, UPDATE ON users FROM cs_app_runtime;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON accounts FROM cs_app_runtime;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON verifications FROM cs_app_runtime;
