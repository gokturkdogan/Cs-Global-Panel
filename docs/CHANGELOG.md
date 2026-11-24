# Changelog

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esinli; fazlara göre gruplanır. Tarihler `YYYY-MM-DD`.

## [PHASE 03 — Kapanış] — 2026-11-24

### Changed
- Gerçek ADMIN ve EMPLOYEE hesapları kullanıcı tarafından `pnpm auth:bootstrap` ile oluşturuldu; salt okunur doğrulandı (2 hesap, 1 admin + 1 employee, her birinde credential kaydı, tek-hesap kısıtı mevcut). Hesaplara/şifrelere/oturumlara müdahale edilmedi.
- D-060…D-064, D-066 **Accepted**; D-065 **Conditionally Accepted** (PHASE 04'te kalıcı test stratejisi koşulu).
- PHASE 04 açık teknik konuları kaydedildi: P4-01 kalıcı kimliği doğrulanmış test stratejisi, P4-02 CSRF reddinin kontrollü hata biçimi, P4-03 global login rate limit DoS riski, P4-04 HTTPS'te `Secure` cookie doğrulaması (PROJECT_STATE, ROADMAP, SECURITY, THREAT_MODEL, TESTING_STRATEGY).

### Not Changed
- PB-01…PB-11 açık. Kod değişikliği yok. Commit/push yapılmadı.

## [PHASE 05 — Service & Document Template Management] — 2026-11-24

PHASE 04 kapatıldı (D-069…D-071 Accepted; D-067, D-068 koşullu; D-063, D-065 Partially Superseded). Hizmet ve evrak şablonu yönetimi uygulandı.

### Added
- D-072…D-077 (Proposed); THREAT_MODEL TM-46; SECURITY §13; TESTING_STRATEGY §14; DATABASE_SCHEMA §9.4.
- Migration `0004_template_optimistic_lock` (`services.version`, `service_document_requirements.version`).
- `src/features/services/{schemas,queries,service,actions}.ts` + `components/{service-list,service-filters,service-form,service-status-card,requirement-list,requirement-form,status-badges}.tsx`.
- Rotalar: `/dashboard/services` (gerçek modül), `/dashboard/services/new`, `/dashboard/services/[serviceId]`.
- `src/components/dashboard/{confirm-dialog,form-field,use-unsaved-changes}.tsx`, `src/components/ui/textarea.tsx`, `src/lib/{search,action-result}.ts`, `src/server/db/errors.ts`; `SERVICE_TEXT_LIMITS`, `SERVICE_LIST_LIMIT`, `SEARCH_QUERY_MAX_LENGTH`; `messages.common|services|validation`.
- Audit olayları `DOCUMENT_TEMPLATE_ACTIVATED` / `DOCUMENT_TEMPLATE_DEACTIVATED`.
- İzole test ortamı: `scripts/test/isolated-db.ts`, `pnpm test:integration:isolated`, `pnpm test:e2e:isolated`, `tests/support/isolation.ts` (Docker `postgres:18-alpine`).
- Testler: `tests/unit/services.test.ts`, `tests/integration/services.test.ts`, `tests/e2e/services.spec.ts`.

### Changed
- `CspNonce` belgenin gerçek nonce'unu bir kez okur (Server Action sonrası diyaloglarda CSP hatası düzeltildi — D-071 notu).
- Playwright izole modda port 3200 ve sunucu yeniden kullanılmaz; E2E teardown izole ortamda geçici hesaplara bağlı sentetik kayıtları temizler.
- Gerçek hesap adına `USER_LOGOUT` yazan çıkış E2E testi yalnızca izole ortamda çalışır (D-067 koşulu).
- `privileges.test.ts` yetki denetimi tek sorguya indirildi; rate limit integration testleri uzun beklemeli ayrı havuz kullanır (yüksek ağ gecikmesi); dashboard integration testi hesap yokken geçici hesapla çalışır; rate limit pencere testi CHECK kısıtına uygun hale getirildi.
- API_CONTRACTS §2.3: `reorderServicesAction` ve `reorderDocumentTemplatesAction` yerine `moveRequirementAction` (D-072, D-075).

### Not Changed
- OD-01…OD-24; iki hesap eşit; RBAC yok; dosya politikası sabit. Başvuru/müşteri portalı/storage/deployment yok. PB-01…PB-11 açık. Bağımlılık eklenmedi. Commit/push yapılmadı.

## [PHASE 04 — Dashboard Foundation] — 2026-11-24

PHASE 03 kapatıldı. Şirket paneli temeli, kalıcı kimliği doğrulanmış test stratejisi ve PHASE 04 teknik konuları (P4-01…P4-04).

### Added
- D-067…D-071 (Proposed); THREAT_MODEL TM-45; SECURITY §12; TESTING_STRATEGY §13.
- Panel düzeni: `src/app/(dashboard)/dashboard/{layout,error,not-found}.tsx`, `(overview)/{page,loading}.tsx`, `[...rest]/page.tsx`, `applications|services|audit-logs/page.tsx` (bilgilendirme).
- `src/components/dashboard/*` (shell, sidebar, mobil drawer, header, konum yolu, sayfa başlığı, sayaç kartı, boş/hata/yükleniyor, hesap menüsü, çıkış, avatar, tekrar dene, CSP nonce), `src/config/navigation.ts`, `src/lib/format.ts`.
- `src/features/dashboard/{domain,queries}.ts` + bileşenler; `src/features/applications/{domain/status-labels.ts, components/application-status-badge.tsx}`; Badge `neutral`/`processing` varyantları; `messages.dashboard`.
- `src/server/security/request-origin.ts` (proxy köken kontrolü).
- `get-nonce` 1.0.1 (D-071).
- Testler: `tests/support/staff-session.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/dashboard.spec.ts`, `tests/integration/dashboard.test.ts`, `tests/unit/request-origin.test.ts`, `tests/unit/dashboard-ui.test.tsx`.

### Changed
- Giriş rate limiting: `login:global` kaldırıldı → `login:unknown-usernames` 50/15 dk (D-068); `consumeLoginAttempt` artık karar türü döndürür.
- `src/proxy.ts`: durum değiştiren isteklerde Origin/Host kontrolü → 403 (D-069).
- `/dashboard` placeholder yerine Genel Bakış.
- `tests/integration/auth.test.ts`: gerçek hesaplar varken çalışan salt okunur/etkisiz testler + Secure cookie yapılandırma testi; `tests/e2e/auth.spec.ts`: köken testleri (403); `tests/e2e/global-setup.ts`: test oturumu modu ve temizliği.
- Playwright trace kapalı; Vitest unit `.tsx` testleri.
- D-063 (genel limit kısmı) ve D-065 (atlama kısmı) için değiştirme önerisi notları.

### Not Changed
- OD-01…OD-24; iki hesap eşit; RBAC yok. Başvuru/hizmet mutasyonları, müşteri paneli, storage, deployment yok. PB-01…PB-11 açık. Commit/push yapılmadı.

## [PHASE 03 — Authentication & Equal Staff Access] — 2026-11-24

PHASE 02 kapatıldı (D-052…D-058 Accepted). Yeni ürün kararı **OD-24 — Fixed Two-Account Model & Equal Staff Permissions** (ACCEPTED) tüm dokümanlara işlendi; personel kimlik doğrulaması uygulandı.

### Added
- OD-24; D-060…D-066 (Proposed); THREAT_MODEL TM-44.
- `better-auth` 1.7.27 (yalnızca username plugin + `nextCookies`).
- Migration `0003_fixed_two_account_model` (hesap türü başına tek hesap, e-posta iç kimlik CHECK'i, `username` NOT NULL, admin plugin kolonlarının kaldırılması).
- `src/server/auth/{auth,staff,rate-limit,credentials-policy}.ts`, `src/server/audit/log.ts`, `src/lib/messages.ts`, `src/features/auth/{actions,schemas,components/login-form}`, `src/app/(auth)/login`, `src/app/(dashboard)/dashboard`, `src/proxy.ts`.
- `scripts/auth/{accounts,bootstrap,reset-password,prompt}.ts`; `pnpm auth:bootstrap`, `pnpm auth:reset-password`.
- `getAuthEnv()` (`BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY_SECRET`); giriş rate limit sabitleri.
- Testler: `tests/unit/auth-policy.test.ts`, `tests/integration/auth.test.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/global-setup.ts`; integration global teardown.

### Changed
- AUTHORIZATION_MATRIX sadeleşti: Authenticated Staff (iki hesap eşit) / Customer / Unauthenticated; RBAC ve izin matrisi kaldırıldı.
- OD-03, OD-05, OD-06, OD-11, OD-23 **PARTIALLY SUPERSEDED** (OD-24); D-021 Superseded; D-041 rol kısmı Superseded; BR-130…BR-136, BR-20, BR-106, BR-150, FR-02…FR-07, FR-33…FR-37, FR-61, STATE_TRANSITIONS (T8–T12 ve D10 her iki hesap), API_CONTRACTS, ARCHITECTURE, DESIGN_SYSTEM (tek ortak menü), DATA_PRIVACY, FILE_STORAGE, TESTING_STRATEGY, SECURITY §2/§5/§6, TECH_STACK, DATABASE_SCHEMA, DEPLOYMENT, README, CLAUDE.md güncellendi.
- Roadmap: PHASE 03 "Authentication & Equal Staff Access"; PHASE 04/05 rol farkı yok; PHASE 10'dan çalışan CRUD, kullanıcı/rol/izin yönetimi, hesap aktif/pasif ve personel oluşturma ekranı kaldırıldı.
- `/` artık `/login` veya `/dashboard`'a yönlendirir (altyapı önizleme sayfası kaldırıldı); foundation E2E testleri giriş ekranına taşındı.
- `next.config.ts`'teki temel CSP kaldırıldı (nonce'lu CSP proxy'de); root layout dinamik (`connection()`).
- PHASE 02 integration test yardımcıları iki hesap sınırına uyarlandı (gerçek hesaplara dokunmaz; hesap kısıt testleri `auth.test.ts`'e taşındı; "banned" testi kaldırıldı).
- CI: build/bundle canary'lerine auth secret'ları eklendi.

### Removed
- RBAC/izin matrisi tasarımı, `permissions.ts`/`can()`, `features/employees`, `/dashboard/employees`, çalışan yönetimi action'ları, `admin:bootstrap`/`admin:recover` planı, Better Auth `/api/auth/[...all]` route planı, `BETTER_AUTH_URL`, admin plugin kolonları.

### Not Changed
- OD-01, OD-02, OD-04, OD-07…OD-10, OD-12…OD-22 aynen geçerli; PB-01…PB-11 açık (PB-10 testle doğrulandı, IP header hariç). Müşteri paneli, storage, deployment yok. Commit/push yapılmadı.

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
