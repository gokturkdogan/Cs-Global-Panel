# Changelog

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esinli; fazlara göre gruplanır. Tarihler `YYYY-MM-DD`.

## [PHASE 09.1 — Workflow Hardening & Final Verification] — 2026-11-25

### Added
- Yorum idempotency: `idempotencyKey` (istemci işlem anahtarı), migration 0006 (`document_comments.idempotency_key` UNIQUE + `payload_hash`), `ON CONFLICT DO NOTHING` + içerik özeti karşılaştırması (D-113).
- `tests/e2e/main-scenario.spec.ts` — 19 adımlı ana senaryo (Chrome + WebKit, gerçek arayüz).
- `tests/integration/workflow-hardening.test.ts` — yorum idempotency (6), kontrollü araya girmeli eşzamanlılık (8), müşteri token/oturum kapsamı, storage regresyonu (D-114).
- E2E: TM-40 yeniden gönderim/kaldırma/eski form/süresi dolmuş oturum/iptal-yenileme; yorum çift tıklama. Unit: iş akışı modüllerinin storage'a bağımlı olmadığı (statik).

### Changed
- `addCommentAction` girdisine `idempotencyKey`; yanıt `{ commentId, created }`; `CommentForm` işlem anahtarını ağ hatasında korur.
- Dokümanlar: DECISION_LOG (D-113, D-114), DATABASE_SCHEMA (§9.10), API_CONTRACTS, SECURITY, TESTING_STRATEGY (§19), DEVELOPMENT_ROADMAP, PROJECT_STATE.

### Not Done / Not Verified
- Gerçek cihaz, GitHub CI, production HTTPS, hosting upload sınırı, token log redaksiyonu, WhatsApp önizleme, PDF görüntüleyici güvenliği, Range, uygulamadan gerçek B2'ye tam E2E. PB-01…PB-11 açık. Commit/push yapılmadı.

## [PHASE 09 — Document Review & Application Workflow] — 2026-11-25

### Added
- Başvuru state machine (T1–T12) ve evrak kararı/kaldırma kuralları saf domain modüllerinde; transaction'lı iş akışı servisi (`src/features/workflow/*`) — D-108…D-110.
- Müşteri: incelemeye gönder / yeniden gönder (onay penceresi, engel nedenleri), dosya kaldırma, "CS Global'den mesajlar", süreç geçmişi; dar giriş noktası `workflow/customer-entry.ts` (D-111).
- Personel: "Başvuru durumu ve işlemler" paneli (matristen aksiyonlar, gerekçe/onay; T12 evrak seçimi), evrak "Onayla"/"Düzeltme İste" (incelenen versiyon), dosya kaldırma, inceleme geçmişi, müşteriye görünür yorumlar, gerekçeli statü geçmişi (D-112).
- Testler: unit +63, izole integration +13, E2E +4 senaryo (4 proje).

### Changed
- PHASE 08 onayı: D-096, D-097, D-098, D-103, D-106, D-107 Accepted; D-099…D-102, D-104, D-105 koşullu Accepted. Canlı B2 smoke testi (kullanıcı terminali) PASS olarak kaydedildi.
- `ActionErrorCode`'a `NOT_ALLOWED`; `WORKFLOW_TEXT_LIMITS` sabiti; `customerStillAllowed` dışa açıldı; dosya geçmişinde "Kaldırıldı" etiketi; yer tutucu `SubmitPlaceholder` kaldırıldı; personel bağlantı uyarısı sadeleşti.
- Dokümanlar: DECISION_LOG, STATE_TRANSITIONS (§5), BUSINESS_RULES, AUTHORIZATION_MATRIX, API_CONTRACTS, ARCHITECTURE, SECURITY (§17), THREAT_MODEL (TM-40 çözüldü), DESIGN_SYSTEM (§15), TESTING_STRATEGY (§18), DATABASE_SCHEMA (§9.9), DATA_PRIVACY (§12b), FILE_STORAGE (§9 canlı sonuç), DEVELOPMENT_ROADMAP, PROJECT_STATE, README.

### Not Done / Not Verified
- Kalıcı silme, iç notlar, audit yönetim ekranı (PHASE 10). Gerçek cihaz testleri. Tek parça 19 adımlı ana senaryo E2E'si. Yeni migration yok. Commit/push yapılmadı.

## [PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage] — 2026-11-25

### Added
- **OD-25 (kullanıcı kararı):** Backblaze B2 private bucket (EU Central, SSE-B2, bucket'a kısıtlı anahtar). Vercel Blob ve client upload kararları Superseded (D-017, D-040; D-035 kısmen).
- Storage soyutlaması `src/server/storage/*` (B2 adapter — `@aws-sdk/client-s3` 3.1176.0; yerel private adapter; lazy, fail-closed yapılandırma; production'da geliştirme bucket'ı ve testlerde B2 reddi) — D-096…D-098.
- `pnpm env:b2` (yankısız gizli girdi, mevcut değerleri korur, 0600, atomik yazma), `pnpm storage:verify` (canlı, kontrollü), `pnpm storage:reconcile` ve `pnpm storage:cleanup` (varsayılan dry-run; versiyona özgü silme) — D-105.
- Yapısal PDF doğrulaması: zarf + nesne düzeyi ad taraması (ObjStm, `#xx`) + `pdfjs-dist` 6.5.438; izole worker (bellek/süre sınırı, boş env) — D-099.
- Yükleme: `POST /api/documents/[requirementId]/file` (personel, müşteri adına) ve `POST /api/portal/[context]/documents/[requirementId]/file` (müşteri); ham PDF gövdesi, sınırlı okuma, köken/kimlik/rate limit/eşzamanlılık kuyruğu; rezervasyon → B2 → aktivasyon yaşam döngüsü, SHA-256, hata kurtarma, onay geçersizleştirme audit'i — D-100, D-103, D-107.
- Görüntüleme/indirme: `GET /api/files/[fileId]` (personel; aktif + önceki versiyonlar) ve `GET /api/portal/[context]/files/[fileId]` (müşteri; yalnızca ACTIVE); audit; güvenli başlıklar — D-104.
- Kota: 9 GB uygulama sınırı, 8 GB uyarı, atomik rezervasyon (`storage_quota_state` kilidi), kayıt dışı kullanım dahil — D-101.
- Migration 0005: `storage_quota_state`, `application_document_files.storage_version_id`, token FK'leri `ON DELETE CASCADE` — D-102.
- UI: `PdfUpload` (gerçek ilerleme), müşteri evrak kartında aktif dosya + yükle/değiştir, personel `StaffDocumentCard` (versiyon, yükleyen, geçmiş, değiştirme onayı), dashboard "Dosya Depolama" kartı.
- Testler: unit +76 (PDF fixture seti, izin matrisi, sanitizasyon, yapılandırma, kota, adapter, hata sınıflandırması, kuyruk); izole integration +23; E2E +7 senaryo (4 proje); `tests/support/pdf-fixtures.ts` (sentetik PDF üretimi).
- Audit olayları: `DOCUMENT_APPROVAL_INVALIDATED`, `DOCUMENT_UPLOAD_FAILED`, `STORAGE_RECONCILED`; mevcut `DOCUMENT_UPLOADED/REPLACED/VALIDATION_REJECTED/VIEWED/DOWNLOADED`, `TECHNICAL_CLEANUP_EXECUTED` uygulandı.

### Changed
- PHASE 07 onayı: D-088…D-092, D-094, D-095 Accepted; D-087, D-093 koşullu Accepted.
- `proxy.ts` matcher dosya yollarını dışlar (proxy gövdeyi 10 MB'ta keser); `next.config.ts`: `serverExternalPackages: ["pdfjs-dist"]`, dosya yollarına `no-store`/`no-referrer`.
- Giriş rate limit sayacı ortak `src/server/security/rate-limit-counter.ts`'e taşındı (davranış aynı).
- Müşteri portalı DTO'su: evrak kimliği/sürümü ve ACTIVE dosya bilgisi (D-091 güncellemesi); yer tutucu kaldırıldı. Personel bağlantı uyarısı güncellendi ("PDF yükleme açık, incelemeye gönderme henüz yok…").
- İzole test betiği: geçici yerel depolama kökü, B2 değişkenleri boşaltılır. CI canary'ye sahte B2 değerleri; bundle kontrolüne B2 adları/değerleri.
- Dokümanlar: FILE_STORAGE (yeniden yazıldı), DECISION_LOG, ARCHITECTURE, API_CONTRACTS, DATABASE_SCHEMA, BUSINESS_RULES, STATE_TRANSITIONS, AUTHORIZATION_MATRIX, SECURITY (§16), THREAT_MODEL (TM-16, TM-40, TM-50…TM-53), DATA_PRIVACY (§12a), DESIGN_SYSTEM (§14), TESTING_STRATEGY (§17), TECH_STACK (§3.8, §9), DEPLOYMENT, DEVELOPMENT_ROADMAP, PROJECT_STATE, README, CLAUDE.md, `.env.example`.

### Fixed
- Başvuru silmede müşteri yüklemesi olan başvurunun zincirleme silinememesi (token FK NO ACTION) — migration 0005.
- Önceden var olan kararsız E2E assertion'ı (rastgele UUID'de "444").

### Not Done / Not Verified
- Canlı B2 doğrulaması (`storage:verify`) — B2 anahtarı henüz girilmedi. Gerçek cihaz testleri. Gerçek belge setiyle yanlış pozitif ölçümü. Kaldırma (PHASE 09), başvuru silme storage aşaması (PHASE 10), zamanlanmış temizlik. Commit/push yapılmadı.

## [PHASE 03 — Kapanış] — 2026-11-24

### Changed
- Gerçek ADMIN ve EMPLOYEE hesapları kullanıcı tarafından `pnpm auth:bootstrap` ile oluşturuldu; salt okunur doğrulandı (2 hesap, 1 admin + 1 employee, her birinde credential kaydı, tek-hesap kısıtı mevcut). Hesaplara/şifrelere/oturumlara müdahale edilmedi.
- D-060…D-064, D-066 **Accepted**; D-065 **Conditionally Accepted** (PHASE 04'te kalıcı test stratejisi koşulu).
- PHASE 04 açık teknik konuları kaydedildi: P4-01 kalıcı kimliği doğrulanmış test stratejisi, P4-02 CSRF reddinin kontrollü hata biçimi, P4-03 global login rate limit DoS riski, P4-04 HTTPS'te `Secure` cookie doğrulaması (PROJECT_STATE, ROADMAP, SECURITY, THREAT_MODEL, TESTING_STRATEGY).

### Not Changed
- PB-01…PB-11 açık. Kod değişikliği yok. Commit/push yapılmadı.

## [PHASE 07 — Customer Portal] — 2026-11-25

PHASE 06 kapatıldı (D-078…D-080, D-082…D-086 Accepted; D-081 koşullu Accepted). Salt okunur müşteri paneli uygulandı.

### Added
- `GET /b/[token]` (biçim kontrolü, HMAC arama, imzalı oturum cookie'si, 303 → token'sız `/portal/<bağlam>`; geçersiz → `/link-invalid`, geçici hata → `/link-unavailable`).
- `src/server/customer-session/{session,access}.ts`: imzalı cookie (`__Host-cs_portal` / yerel `cs_portal`), 7 gün sabit süre, bağlam kimliği, `requireCustomerAccess(context)` (her istekte token aktifliği + başvuru silinme kontrolü); aynı bağlantı yeniden açılınca bağlam korunur.
- `CUSTOMER_SESSION_SECRET` + `getCustomerSessionEnv()` (diğer anahtarlardan farklı olması doğrulanır); `pnpm env:token-keys` eksikse ekler; izole test betiği ve CI canary build'i.
- `src/features/customer-portal/{queries.ts, domain/progress.ts, components/*}`; `src/app/(customer)/` (layout, `portal/[context]/{page,loading,error}`, `portal`, `link-invalid`, `link-unavailable`); `messages.portal`.
- Müşteri yolu başlıkları (`no-referrer`, `private, no-store`), dev log redaksiyonu (`/b/` yolları, Server Function argümanları); müşteri modülü ESLint sınırı; bundle kontrolüne `cs-portal` işaretleyicisi.
- D-087…D-095 (Proposed); THREAT_MODEL TM-49; SECURITY §15; DATA_PRIVACY §12; FILE_STORAGE §8; DEPLOYMENT §3.2; TESTING_STRATEGY §16; DESIGN_SYSTEM §13; DATABASE_SCHEMA §9.7; API_CONTRACTS §4.4a.
- Testler: `tests/unit/customer-portal.test.ts`, `tests/integration/customer-portal.test.ts`, `tests/e2e/portal.spec.ts`, `tests/support/portal-seed.ts`.

### Changed
- SECURITY §3.4 / API_CONTRACTS §4.4: yönlendirme hedefi `/portal/<bağlam>`; `/b` için IP rate limit TD-04 ile PHASE 13'e ertelendi (429 yok).
- THREAT_MODEL TM-40: görüntüleme kapsamı E2E ile doğrulandı; mutasyon kapsamı PHASE 08/09 (D-095).
- Personel bağlantı uyarısı: "Müşteri paneli şu an yalnızca görüntüleme amaçlıdır…" (gerçek müşterilerle paylaşmama uyarısı sürüyor).
- Unit testteki rastgele kimliğe bağlı kararsız assertion düzeltildi.

### Not Changed
- OD-01…OD-24; şema/migration (5 migration, 17 tablo); bağımlılıklar; PHASE 06 token anahtarları; gerçek hesaplar. Dosya yükleme, inceleme/gönderim, statü geçişleri, silme, deployment yok. PB-01…PB-11 açık. Commit/push yapılmadı.

## [PHASE 06 — Customer & Application Management] — 2026-11-24

PHASE 05 kapatıldı (D-072…D-077 Accepted; P4-01 yerel test izolasyonu açısından RESOLVED). Başvuru yönetimi ve müşteri bağlantısı uygulandı.

### Added
- D-078…D-086 (Proposed); THREAT_MODEL TM-47, TM-48; SECURITY §14; DATA_PRIVACY §11; DEPLOYMENT §3.1; TESTING_STRATEGY §15; DATABASE_SCHEMA §9.5; API_CONTRACTS §2.1 uygulanan sözleşme.
- `src/features/applications/{schemas,queries,service,actions}.ts`, `domain/{phone,search-text,whatsapp,template-fingerprint,document-status-labels}.ts`, `components/{applications-browser,application-table,application-create-form,create-success,customer-info-card,access-link-card,whatsapp-share-dialog,copy-link-button,link-status-badge,document-status-badge}.tsx`.
- Rotalar: `/dashboard/applications` (gerçek modül), `/new`, `/[applicationId]`.
- `src/server/access-tokens/crypto.ts`; `getAccessTokenEnv()`; `src/lib/{field-errors,clipboard}.ts`; `ActionErrorCode` `STALE_PREVIEW`; `messages.applications`.
- `libphonenumber-js` 1.13.17 (exact); `pnpm env:token-keys`; `.env.example` token anahtarı açıklamaları.
- Audit olayı `ACCESS_LINK_SHARE_PREPARED`.
- Testler: `tests/unit/applications.test.ts`, `tests/integration/applications.test.ts`, `tests/e2e/applications.spec.ts`.

### Changed
- Dashboard: Yeni Başvuru aktif; son başvurular ve inceleme kuyruğu satırları detaya bağlantı; "Tümünü Gör"; Toplam/İncelemede/Tamamlanan "Listele" bağlantıları; dashboard DTO'suna `id`.
- Tablolar (hizmet, son başvurular, başvurular) kart içinde yatay kaydırılabilir; başvuru tablosu ≥1280px.
- `fieldErrorsOf` ortak modüle taşındı (`src/lib/field-errors.ts`).
- İzole test betiği rastgele token anahtarları üretir; canary bundle kontrolü token anahtarlarını (JSON içindekiler dahil) ve kriptografi işaretlerini arar; CI canary build'ine token anahtarları eklendi.
- `pnpm test:integration` (ortak `neondb`) yalnızca salt okunur/geri alınan dosyalar; commit eden PHASE 02 dosyaları izole ortamda; `privileges` audit ekleme testi geri alınan transaction'da; dashboard E2E'deki sentetik başvuru testi izole ortamda (D-086).
- Eşitlik (iki hesap) E2E'leri veri bağlantılarını hariç tutar (paralel testler).

### Fixed
- Liste "aktif bağlantı" alt sorgusu (Drizzle niteliksiz kolon → yanlış bağlanma) — E2E ile yakalandı, integration testi eklendi.

### Not Changed
- OD-01…OD-24; iki hesap eşit; şema/migration değişmedi; müşteri portalı, oturumu, PDF/storage, statü geçişleri, silme, deployment yok. PB-01…PB-11 açık. Commit/push yapılmadı.

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
