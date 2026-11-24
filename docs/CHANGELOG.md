# Changelog

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esinli; fazlara göre gruplanır. Tarihler `YYYY-MM-DD`.

## [PHASE 02 — Database Foundation] — 2026-11-24

PHASE 01 kapatıldı (D-042…D-051 Accepted). Veritabanı altyapısı kuruldu ve Neon üzerinde doğrulandı.

### Added
- `drizzle-orm` 0.45.4, `pg` 8.23.1 (runtime); `drizzle-kit` 0.31.11, `@types/pg` 8.23.1 (dev). `tsx` eklenmedi (Node 24 TS'yi doğrudan çalıştırır).
- Drizzle şeması `src/server/db/schema/` (17 tablo), `src/config/statuses.ts` (statü/kod listeleri — CHECK'lerin tek kaynağı), `src/server/db/settings.ts`, `src/server/db/client.ts` (lazy Pool, `getDb()`), `getDatabaseEnv()`.
- Migration'lar: `0000_extensions` (pg_trgm), `0001_initial_schema`, `0002_security_and_privileges` (updated_at trigger'ları, audit append-only trigger'ları, runtime GRANT'ları).
- `drizzle.config.ts`; `scripts/db/` (`db:verify`, `db:init`, `db:migrate`, `db:seed`, `db:studio`); `db:generate`, `db:check`, `test:integration` script'leri.
- En az yetkili `cs_app_runtime` rolü (SQL ile; `neon_superuser` değil), rol düzeyi zaman aşımları.
- Unit testler (db adresi doğrulama, migration SQL statik kontrolleri, seed verisi, `parseDatabaseEnv`) ve 4 integration test dosyası (71 test).
- Kararlar D-052…D-059; THREAT_MODEL TM-41…TM-43; DATABASE_SCHEMA §9; ARCHITECTURE §12.1; DEPLOYMENT §12; SECURITY §9a; TESTING_STRATEGY §11.
- Neon projesi (Free, Frankfurt, PG 18.7): `neondb` üzerinde şema, rol ve demo seed.

### Changed
- Şema dokümana göre uygulandı; teknik zorunluluklarla: bileşik FK'lar ve NULL-güvenli CHECK'ler (D-052), hizmet/şablon `created_by_user_id` nullable (D-053), token referansları `SET NULL` yerine bileşik FK + `NO ACTION`.
- `check-client-bundle.mjs`: secret adlarına ek olarak build ortamındaki secret değerleri (canary) aranır; CI build/check canary değerlerle çalışır, `db:check` eklendi.
- `.env.example`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` biçim örnekleri.
- `pnpm-workspace.yaml`: `esbuild` kurulum script'i bilinçli olarak yok sayılır.
- `tsconfig.json`: `allowImportingTsExtensions` (Node ile çalışan script'ler için).
- **Tek veritabanı (D-059, Product Owner):** ayrı development/test veritabanı ve veritabanı ortam işareti kaldırıldı; geçici olarak oluşturulan `cs_global_dev`, `cs_global_test` silindi.

### Not Changed
- OD-01…OD-23; PB-01…PB-11 (PB-06 notu genişletildi). Kimlik doğrulama, panel, portal, storage, deployment yok. Commit/push yapılmadı.

## [PHASE 01 — Project Initialization] — 2026-11-24

PHASE 00 kapatıldı (Product Owner onayı; D-002, D-003, D-004, D-031 Accepted). Çalışan proje altyapısı kuruldu; ürün özelliği yok.

### Added
- Next.js 16.4.6 uygulaması repo kökünde (App Router, `src/`, Turbopack, `@/*` alias); `package.json` (exact sürümler, `packageManager: pnpm@10.34.9`, `engines.node: 24.x`), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (kurulum script kısıtları, `minimumReleaseAge`), `.nvmrc`.
- TypeScript 6.0.3 strict + `noUncheckedIndexedAccess`; ESLint 10 flat config (`eslint-config-next` + proje kuralları); Prettier.
- Tailwind CSS 4.3.5 (`@tailwindcss/postcss`), shadcn/ui (`components.json`, Radix): Button, Card, Badge, Alert, Separator, Input, Label; CS Global semantik token'ları (`globals.css`); yerel Geist fontu.
- `Logo` (geçici metin logo), `src/config/company.ts`, `src/config/constants.ts`, `src/lib/utils.ts` (`cn`), `src/server/env.ts` (Zod, lazy, fail-closed), `.env.example`.
- Root layout (`lang="tr"`, metadata, noindex), `robots.ts`, altyapı önizleme sayfası.
- Temel güvenlik header'ları (`next.config.ts`).
- Vitest (3 dosya, 26 test), Playwright (Desktop Chrome, Mobile Chrome, Mobile Safari, Desktop WebKit), `scripts/check-client-bundle.mjs`, `.github/workflows/ci.yml`.
- Teknik kararlar D-042…D-051 (Proposed); DECISION_LOG Bölüm C (faz onayları); THREAT_MODEL TM-40 (aynı tarayıcıda birden fazla müşteri bağlantısı).
- TECH_STACK §0 (kurulu sürümler), §3.1a; DESIGN_SYSTEM §1.3; TESTING_STRATEGY §10; DEPLOYMENT §11.

### Changed
- `.gitignore`: Visual Studio şablonu → Node.js/Next.js (D-031).
- D-002 (TypeScript 6.0.3), D-004 (pnpm 10.34.9) **Accepted**; D-003 yeniden teyit edildi; D-031 uygulandı.
- Test script adı `test:unit` → `test` (CLAUDE.md, TESTING_STRATEGY).
- Roadmap: PHASE 03 (dağıtık rate limiting doğrulaması, nonce'lu CSP), PHASE 07 (aynı tarayıcıda iki bağlantı — TM-40), PHASE 08 (dosya uç noktasında sunucu tarafı yetkilendirme; buton gizlemek kontrol değildir) notları eklendi.
- CLAUDE.md: kesinleşen sürümler, kalite kapıları, Next.js sürüm dokümanı ipucu; README: kurulum, komutlar, env yaklaşımı, durum.

### Not Changed
- OD-01…OD-23 ürün kararları; production blocker'ları (PB-01…PB-11 açık).
- Veritabanı, kimlik doğrulama, panel, portal, storage, deployment: yok. Commit/push yapılmadı. Global Node/pnpm kurulumları değiştirilmedi.

## [PHASE 00 — Revizyon] — 2026-11-24

Product Owner'ın OD-01…OD-23 kararları (23/23 ACCEPTED) tüm dokümanlara işlendi.

### Added
- DECISION_LOG Bölüm A: 23 ürün kararı (önceki öneri, nihai karar, etkiler, faz).
- Teknik kararlar D-032…D-041 (imzalı portal cookie'si, müşteri bilgisinin başvuruda tutulması, tek aktif dosya modeli, senkron PDF doğrulaması, iki aşamalı silme, sabit yapılandırma, Better Auth IP/UA saklamama, append-only audit, storage sınırı, ADMIN geçiş seti).
- ADMIN yeniden açma/geri alma geçişleri T8–T12; personelin `UNDER_REVIEW` yüklemesi (D9); ADMIN geçişinde onay geçersizleştirme (D10).
- ADMIN manuel başvuru silme (BR-150…BR-155), WhatsApp kişiselleştirilmiş mesaj (BR-160…BR-162), sabit iletişim/logo kuralları (BR-170…BR-172).
- THREAT_MODEL: yeni sütunlar (kalan risk, doğrulama, production blocker), birleşik risk analizi, düşük maliyetli ek önlem seçenekleri (uygulanmadı).
- SECURITY §11 production blocker tablosu (PB-01…PB-11); PROJECT_STATE'te teknik karar listesi (TD-01…TD-12) ve bekleyen girdiler.
- DEPLOYMENT: sıfır maliyet stratejisi, ücretsiz plan değerlendirmesi, kapasite hesabı, alan adı değişikliği etkileri.
- TECH_STACK §7 yeniden doğrulama kaydı.

### Changed
- Müşteri erişimi: bağlantı + OTP → **yalnızca bağlantı** (bearer, süresiz, path tabanlı), 7 günlük imzalı oturum cookie'si.
- Personel: şifreyi yalnızca ADMIN belirler; min 8 karakter; 7 gün sabit oturum; self-servis şifre işlemleri ve zorunlu ilk değişim yok.
- Veri modeli: 23 → 17 tablo; müşteri bilgileri `applications`'ta; dosya modeli tek `status` ekseni + tek aktif PDF; inceleme `file_id`'ye bağlı.
- Dosya limitleri sabit (PDF, 10 485 760 bayt, evrak başına 1 aktif).
- PDF güvenliği: harici AV yerine yalnızca yapısal doğrulama; "virüssüz" etiketi yok.
- Rate limiting: Better Auth yerleşik limiter yerine uygulama limitleyicisi (HMAC'li, süreli anahtarlar).
- Bağlantı yönetimi yetkileri ADMIN = EMPLOYEE.
- Env değişkenleri sadeleşti (`NEXT_PUBLIC_*`, OTP, e-posta, tarama, IP hash değişkenleri kaldırıldı).
- Roadmap tüm fazlarda güncellendi.
- Tehdit kimlikleri `T01…T39` → `TM-01…TM-39` (yeni ADMIN geçişleri T10–T12 ile çakışmayı önlemek için).
- D-003 ve D-031 **Accepted**; D-011, D-033 **Accepted** (ürün kararlarıyla); D-009, D-012, D-013, D-014, D-018, D-020, D-024, D-025, D-026, D-029, D-030 **Superseded**.

### Removed
- OTP (e-posta/SMS), e-posta entegrasyonu, müşteri profili/eşleştirme/birleştirme, çalışan atama ve görünürlük kapsamı, arşivleme, ayarlar sayfası ve `system_settings`, otomatik saklama/silme ve bağlantı süre sonu, dinamik dosya limitleri, evrak başına çoklu dosya, harici antivirüs, `/dashboard/account`, `/dashboard/settings`, `/portal/verify`, fragment tabanlı bağlantı, `customers`, `customer_otp_challenges`, `customer_sessions`, `document_review_files` tabloları, Better Auth `rateLimit` tablosu, IP/UA saklama.

### Not Changed
- Kod, bağımlılık, veritabanı, storage, deployment: yok. `.gitignore` değiştirilmedi (PHASE 01). Commit yapılmadı.

## [PHASE 00] — 2026-11-24

### Added
- `CLAUDE.md` ve `docs/` altında 20 proje dokümanı.
- Teknoloji sürümleri ve platform özellikleri doğrulaması.
- 31 karar kaydı (D-001…D-031), 23 açık ürün kararı (OD-01…OD-23).

### Changed
- `README.md` — mevcut başlık ve açıklama korunarak genişletildi.

### Not Changed
- `.gitignore` — uygunsuzluk tespit edildi, PHASE 01 için önerildi (D-031). Commit yapılmadı.
