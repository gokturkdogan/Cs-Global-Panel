# Geliştirme Roadmap'i

> Her faz sonunda: PROJECT_STATE, CHANGELOG, (gerekirse) DECISION_LOG güncellenir; faz raporu sunulur; **kullanıcı onayı olmadan sonraki faza geçilmez**.
> Ortak Definition of Done (tüm fazlar): `typecheck` + `lint` + `format:check` + ilgili testler yeşil · `pnpm audit` yüksek/kritik yok · dokümanlar güncel · yeni secret yok · gerçek veri yok · test edilmeyen iş "tamamlandı" raporlanmaz.

---

## PHASE 00 — Project Foundation & Architecture ✅ (onay bekliyor)
- **Objective:** Gereksinim, mimari, veri modeli, güvenlik, tasarım ve test stratejisinin dokümantasyonu.
- **Scope:** Yalnızca doküman. Kod/kurulum/hesap yok.
- **Dependencies:** —
- **Deliverables:** `CLAUDE.md`, `README.md`, `docs/*` (20 doküman).
- **Security:** Threat model, güvenlik mimarisi, KVKK değerlendirme listesi.
- **Tests:** Test stratejisi ve kabul kriterleri.
- **Acceptance:** Dokümanlar tutarlı; açık kararlar listelenmiş; sürümler doğrulanmış.
- **DoD:** Kullanıcı dokümanları inceleyip açık kararları yanıtlar.

## PHASE 01 — Project Initialization
- **Objective:** Çalışan, boş ama standartlara uygun Next.js iskeleti.
- **Scope:** `.gitignore` değişimi (D-031), Next.js 16 + TS 6 strict + Tailwind 4 + shadcn/ui init, ESLint (flat config, `eslint-config-next`, `no-restricted-imports`, `dangerouslySetInnerHTML` yasağı) + Prettier, klasör yapısı, `server-only`, `env.ts` (Zod), `.env.example`, design token'ları (`globals.css`), temel bileşenler (Button, Input, Card, Badge, metin logo), Vitest + Playwright kurulumu (örnek test), güvenlik header'ları iskeleti (`next.config.ts`), `robots.ts`, CI (GitHub Actions) taslağı, `engines`/`packageManager` sabitleme.
- **Dependencies:** PHASE 00 onayı; D-002, D-003, D-004 kararları.
- **Deliverables:** Repo iskeleti, lockfile, CI workflow, `pnpm` script'leri (`dev`, `build`, `typecheck`, `lint`, `format`, `test:unit`, `test:e2e`).
- **Security:** Secret'lar repoda değil; bundle'da secret kontrol script'i; exact sürümler; pnpm kurulum script kısıtları.
- **Tests:** Örnek unit test; Playwright smoke (ana sayfa yanıt + header'lar); 320px'te yatay taşma yok.
- **Acceptance:** `pnpm build` başarılı; tüm kalite kapıları yeşil; header'lar mevcut.
- **DoD:** Ortak DoD + TECH_STACK'te kurulu sürümler güncellendi.

## PHASE 02 — Database Foundation
- **Objective:** Şemanın Drizzle ile tanımlanması ve migration'lar.
- **Scope:** Neon **non-prod** projesi (kullanıcı hesabıyla, onaylı), Drizzle config, `pg` pool client, tüm domain tabloları + CHECK/partial index/trigger/GRANT migration'ları, DB rolleri (`cs_app`, `cs_maintenance`), `pg_trgm`, sahte seed (hizmetler, şablonlar, sahte müşteriler), normalizasyon yardımcıları.
- **Dependencies:** PHASE 01; D-005, D-006, D-007, D-008, D-025, D-026.
- **Deliverables:** `src/server/db/schema/*`, migration SQL'leri, `db:generate`, `db:migrate`, `db:seed` script'leri, integration test altyapısı.
- **Security:** TLS bağlantı (`verify-full` doğrulaması), uygulama rolünün en az yetkisi, audit tablosunun değiştirilemezliği, seed'de gerçek veri yok.
- **Tests:** Integration: kısıtlar (CHECK, unique, FK), sayaç eşzamanlılığı, audit UPDATE/DELETE reddi, Türkçe arama katlaması, telefon/e-posta normalizasyonu (unit).
- **Acceptance:** Boş DB'ye migration'lar baştan sona uygulanır; seed çalışır; integration testleri yeşil.
- **DoD:** Ortak DoD + DATABASE_SCHEMA gerçek şemayla senkron.

## PHASE 03 — Authentication & Authorization
- **Objective:** Personel girişi, oturum ve RBAC.
- **Scope:** Better Auth (username + admin plugin, `nextCookies`), Drizzle adapter, `/api/auth/[...all]`, kapalı uç noktalar (sign-up, e-posta girişi, username availability, impersonation), DB rate limit, hesap bazlı başarısız giriş sınırlaması, `requireStaff`, `permissions.ts`, `/login` sayfası, zorunlu şifre değişimi, bootstrap admin script'i, oturum iptali, `proxy.ts` iyimser yönlendirme, auth audit event'leri.
- **Dependencies:** PHASE 02; D-020, D-021.
- **Deliverables:** Çalışan login/logout, admin bootstrap, izin altyapısı.
- **Security:** Cookie flag'leri, trusted origins, enumeration testleri, rate limit, cookie cache kapalı, pasif kullanıcı kontrolü.
- **Tests:** Unit: izin matrisi. Integration: login, pasif kullanıcı, kapalı uç noktalar, rate limit. E2E: login/logout, zorunlu şifre değişimi, EMPLOYEE'nin admin route'u.
- **Acceptance:** Public kayıt mümkün değil; bootstrap ikinci kez çalışmaz; pasifleştirme anında etkili.
- **DoD:** Ortak DoD + TECH_STACK §3.5 "doğrulanamayanlar" kapatıldı.

## PHASE 04 — Dashboard Foundation
- **Objective:** Şirket paneli iskeleti.
- **Scope:** Dashboard layout (sidebar, header, breadcrumb, mobil drawer), rol bazlı navigasyon, boş sayfa şablonları, ortak bileşenler (DataTable, Pagination, EmptyState, ConfirmDialog, StatusBadge, Skeleton), hata/404 sayfaları, hesap sayfası.
- **Dependencies:** PHASE 03.
- **Deliverables:** Gezinilebilir panel iskeleti.
- **Security:** Her layout/page `requireStaff`; `Cache-Control` doğrulaması; CSP nonce entegrasyonu.
- **Tests:** E2E: navigasyon (ADMIN vs EMPLOYEE menüsü), responsive drawer (768/1024), klavye navigasyonu, axe.
- **Acceptance:** 1024/1440'ta sidebar, <1024'te drawer; tüm sayfalar dinamik ve no-store.
- **DoD:** Ortak DoD.

## PHASE 05 — Service & Document Template Management
- **Objective:** ADMIN'in hizmet ve evrak şablonlarını yönetmesi.
- **Scope:** Hizmet CRUD (silme yok), aktif/pasif, sıralama; şablon CRUD, zorunluluk, limitler, sıralama, aktif/pasif.
- **Dependencies:** PHASE 04.
- **Deliverables:** `/dashboard/services*` sayfaları ve action'ları.
- **Security:** `service:manage` yalnızca ADMIN; Zod strict; limitlerin sistem üst sınırını aşmaması.
- **Tests:** Unit: şemalar. Integration: CRUD, yetki. E2E: admin hizmet + şablon oluşturur; EMPLOYEE erişemez.
- **Acceptance:** Pasif hizmet başvuru formu sorgusunda dönmez (test).
- **DoD:** Ortak DoD.

## PHASE 06 — Customer & Application Management
- **Objective:** Başvuru oluşturma, listeleme, detay (evrak işlemleri hariç), bağlantı yönetimi.
- **Scope:** Başvuru formu (combobox), mükerrer aday tespiti, atomik oluşturma (snapshot, numara, token), sonuç ekranı (kopyala, WhatsApp), liste (arama, filtre, sayfalama), detay (müşteri/başvuru bilgisi, statü geçmişi, notlar, bağlantı göster/yenile/iptal), müşteri bilgisi düzenleme, arşivleme, görünürlük kapsamı altyapısı.
- **Dependencies:** PHASE 05; OD-03, OD-04, OD-10, OD-18, OD-19; D-009, D-011.
- **Deliverables:** `/dashboard/applications*`.
- **Security:** Token üretimi/şifreleme/HMAC, bağlantı gösteriminin audit'i, kapsam filtresi, 404 davranışı, idempotency.
- **Tests:** Unit: token, numara formatı. Integration: transaction geri alma, eşzamanlı numara, snapshot değişmezliği, bağlantı iptali → oturum iptali (müşteri oturumu tablosu bu fazda hazır). E2E: başvuru oluşturma akışı.
- **Acceptance:** Brief §6'daki 9 adım tek transaction'da; sonuç ekranında tüm öğeler.
- **DoD:** Ortak DoD.

## PHASE 07 — Customer Portal
- **Objective:** Güvenli müşteri erişimi ve mobile-first panel (yükleme hariç).
- **Scope:** `/b/[token]` (veya fragment varyantı — OD-02), pre-auth cookie, OTP (e-posta sağlayıcı entegrasyonu — OD-08), müşteri oturumu, `/portal` (bilgiler, süreç göstergesi, tamamlanma göstergesi, evrak kartları salt okunur, iletişim), çıkış, salt okunur modlar.
- **Dependencies:** PHASE 06; **OD-01, OD-02, OD-08 kararları zorunlu**; D-012, D-013.
- **Deliverables:** Müşteri erişim akışı ve panel.
- **Security:** Rate limit (link, OTP gönder/doğrula), timing-safe karşılaştırma, `no-referrer`, `no-store`, `noindex`, üçüncü taraf script yok, müşteri DTO whitelist, iç not sızıntı testi.
- **Tests:** Unit: OTP, ilerleme hesapları. Integration: oturum geçerliliği, token iptali. E2E (mobil projeler): erişim, OTP, panel; S01–S04, S16, S18; 9 genişlik responsive.
- **Acceptance:** Doğrulama öncesi hiçbir kişisel veri yanıtta yok (HTML/RSC kontrolü).
- **DoD:** Ortak DoD + gerçek cihaz (iOS Safari, Android Chrome, WhatsApp in-app) manuel test sonuçları raporlandı.

## PHASE 08 — Secure PDF Document Management
- **Objective:** Güvenli yükleme, doğrulama, tarama, versiyonlama, görüntüleme.
- **Scope:** Blob store'lar (non-prod), `/api/uploads` (token + callback), client confirm, upload bileşeni (ilerleme, hata, tekrar dene, çift gönderim engeli), yapısal PDF doğrulama, AV entegrasyonu (OD-07), tarama durum poll'u, `/api/files/[fileId]`, kaldırma/değiştirme, versiyonlama, cron temizliği (orphan, PENDING, REJECTED), personelin müşteri adına yüklemesi.
- **Dependencies:** PHASE 07; **OD-07 kararı zorunlu**; D-017, D-018, D-029.
- **Deliverables:** Uçtan uca dosya yönetimi.
- **Security:** FILE_STORAGE §6.4 kabul kriterlerinin tamamı.
- **Tests:** Unit: sanitizasyon, PDF doğrulama (fixture seti). Integration: idempotency, yarış, sayı limiti. E2E: S07–S12, mobil dosya seçimi.
- **Acceptance:** FILE_STORAGE §6.4 maddeleri 1–13 geçer.
- **DoD:** Ortak DoD + SDK API'leri (maximumSizeInBytes, validUntil, ilerleme callback) TECH_STACK'te doğrulandı.

## PHASE 09 — Document Review & Application Workflow
- **Objective:** İnceleme ve statü iş akışı.
- **Scope:** Gönderim (müşteri + müşteri adına), evrak inceleme (onay/düzeltme + gerekçe), karar değişikliği, müşteri yorumları, T2/T3/T5/T6/T7 geçişleri, izin verilen aksiyonlar, müşteri panelinde düzeltme gösterimi, yeniden gönderim, statü geçmişi.
- **Dependencies:** PHASE 08; OD-05.
- **Deliverables:** Tam iş akışı.
- **Security:** Sunucu tarafı state machine, kilit + version, aktör kaydı ("müşteri adına").
- **Tests:** Unit: geçiş matrisi %100. Integration: eşzamanlılık senaryoları. E2E: **TESTING_STRATEGY §5.1 ana senaryo** (tamamı), S11–S14.
- **Acceptance:** Ana senaryo 19 adımın tamamı yeşil (desktop + mobil).
- **DoD:** Ortak DoD.

## PHASE 10 — Administration & Operations
- **Objective:** Yönetim ekranları ve operasyon.
- **Scope:** Çalışan yönetimi (oluştur, düzenle, rol, pasif/aktif, şifre sıfırlama, oturum sonlandırma), dashboard istatistikleri, audit log ekranı (filtre, sayfalama), ayarlar ekranı, (OD-03'e göre) atama UI'ı, müşteri anonimleştirme aracı (DATA_PRIVACY §5 — hukuki kararlara göre), saklama işleri (ayar değerleri girildiyse).
- **Dependencies:** PHASE 09; OD-06, OD-09, OD-11.
- **Deliverables:** `/dashboard/employees*`, `/dashboard/audit-logs`, `/dashboard/settings`, dashboard sayaçları.
- **Security:** BR-133 (son admin koruması), audit okuma yalnızca ADMIN, ayar değişikliği audit'i.
- **Tests:** Integration: kullanıcı yönetimi, son admin koruması, istatistik doğruluğu. E2E: S05, S06.
- **Acceptance:** Tüm AUTHORIZATION_MATRIX yönetim satırları testli.
- **DoD:** Ortak DoD.

## PHASE 11 — UI/UX & Performance Optimization
- **Objective:** Erişilebilirlik, responsive kalite ve performans.
- **Scope:** WCAG 2.2 AA denetimi ve düzeltmeleri, 9 genişlikte görsel regresyon, Lighthouse, sorgu planları (10k seed), bundle analizi, loading/empty/error durumları, metin/ton gözden geçirmesi.
- **Dependencies:** PHASE 10.
- **Deliverables:** Denetim raporu + düzeltmeler.
- **Security:** Performans optimizasyonlarının cache kurallarını (D-016) ihlal etmemesi.
- **Tests:** axe, Lighthouse, ekran okuyucu manuel testi, görsel regresyon.
- **Acceptance:** axe kritik/ciddi ihlal yok; müşteri paneli Lighthouse mobil Perf ≥90, A11y ≥95; liste sorguları index kullanır.
- **DoD:** Ortak DoD.

## PHASE 12 — Quality Assurance & Security Audit
- **Objective:** Production hazırlığı doğrulaması.
- **Scope:** Tam test regresyonu, yetki matrisi %100, güvenlik E2E (S01–S20), tehdit modeli gözden geçirme, manuel sızma testi (OWASP ASVS L2 kontrol listesi seçkisi), bağımlılık denetimi, log/payload sızıntı incelemesi, production blocker listesinin kapatılması.
- **Dependencies:** PHASE 11; hukuki değerlendirme sonuçları.
- **Deliverables:** Güvenlik denetim raporu, production readiness checklist.
- **Security:** SECURITY §11 blocker'larının tamamı.
- **Tests:** Tüm suite.
- **Acceptance:** Açık yüksek/kritik bulgu yok.
- **DoD:** Ortak DoD + kullanıcı risk kabulü (varsa) yazılı.

## PHASE 13 — Production Deployment
- **Objective:** Güvenli production yayını.
- **Scope:** Vercel Pro proje (fra1), Neon prod projesi (aws-eu-central-1, ücretli plan), Blob prod store (fra1), production env/secrets, domain + HSTS, GitHub branch koruma + secret scanning, migration, bootstrap admin, cron, yedek/geri yükleme provası, izleme, olay müdahale planı, smoke test.
- **Dependencies:** PHASE 12; kullanıcının ücretli plan ve hukuki onayı.
- **Deliverables:** Canlı sistem, operasyon runbook'u.
- **Security:** MFA, en az yetki, production izolasyonu, secret rotasyon prosedürü.
- **Tests:** Production smoke test (sahte test başvurusu, sonra silinir), geri yükleme provası.
- **Acceptance:** Smoke test yeşil, geri yükleme provası başarılı, tüm blocker'lar kapalı.
- **DoD:** Ortak DoD + PROJECT_STATE "Production" durumuna geçti.
