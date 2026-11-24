# Geliştirme Roadmap'i

> Her faz sonunda PROJECT_STATE, CHANGELOG, (gerekirse) DECISION_LOG güncellenir; faz raporu sunulur; **kullanıcı açıkça onaylamadan sonraki faza geçilmez**.
> **Ortak Definition of Done (tüm fazlar):** `typecheck` + `lint` + `format:check` + ilgili testler yeşil · `pnpm audit` yüksek/kritik yok · dokümanlar güncel · yeni secret yok · gerçek veri yok · ücretli servis yok · test edilmeyen iş "tamamlandı" raporlanmaz.
> Revizyon 2026-11-24: OTP, e-posta, müşteri eşleştirme, çalışan atama, arşiv, ayarlar, otomatik saklama/süre sonu, harici AV, dinamik limitler kaldırıldı; ADMIN yeniden açma/geri alma, manuel silme, tek aktif PDF, sabit yapılandırma eklendi.

---

## PHASE 00 — Project Foundation & Architecture (tamamlandı — Product Owner onayı 2026-11-24)
- **Scope:** Yalnızca doküman.
- **Deliverables:** `CLAUDE.md`, `README.md`, `docs/*` (20 doküman), 23 ürün kararının işlenmesi.
- **Dependencies:** —
- **Security checks:** Threat model, birleşik risk analizi, production blocker listesi.
- **Test requirements:** Test stratejisi ve kabul kriterleri.
- **Acceptance:** Dokümanlar kararlarla uyumlu, çelişkisiz, referanslar geçerli.
- **DoD:** Kullanıcı revizyonu onaylar; D-002 ve D-004 kararlarını verir.

## PHASE 01 — Project Initialization (tamamlandı — Product Owner onayı 2026-11-24)
- **Scope:** `.gitignore` değişimi (D-031, ilk adım), Next.js 16 + TypeScript (D-002) strict + Tailwind 4 + shadcn/ui, ESLint (flat config, `eslint-config-next`, `no-restricted-imports` sınırları, `dangerouslySetInnerHTML` yasağı, cache API yasağı) + Prettier, klasör yapısı, `server-only`, `src/server/env.ts`, `.env.example`, `src/config/constants.ts` ve `src/config/company.ts` iskeleti, design token'ları, temel bileşenler (Button, Input, Card, Badge, `Logo`), Vitest + Playwright kurulumu, güvenlik header iskeleti, `robots.ts`, CI taslağı, `engines.node = 24.x` + `packageManager` sabitleme.
- **Deliverables:** Repo iskeleti, lockfile, CI workflow, `pnpm` script'leri.
- **Dependencies:** PHASE 00 onayı; D-002, D-004.
- **Security checks:** `.gitignore` kapsamı (env, build, test çıktıları); bundle secret kontrol script'i; exact sürümler; pnpm kurulum script kısıtları.
- **Test requirements:** Örnek unit; Playwright smoke (header'lar); 320 px'te yatay taşma yok; `MAX_PDF_SIZE_BYTES` sabit testi.
- **Acceptance:** `pnpm build` başarılı; kalite kapıları yeşil; header'lar mevcut; `.env.local` git tarafından ignore ediliyor (test).
- **DoD:** Ortak DoD + TECH_STACK kurulu sürümlerle güncel.

## PHASE 02 — Database Foundation (tamamlandı — kullanıcı onayı bekliyor; tek veritabanı D-059)
- **Scope:** Neon Free non-prod projesi (kullanıcı onayıyla, ücretsiz), Drizzle + `pg` pool, 13 domain tablosu + CHECK/partial unique index/trigger/GRANT migration'ları, `pg_trgm`, sahte seed (demo hizmetler, şablonlar, sahte başvurular), normalizasyon yardımcıları (telefon, e-posta, arama).
- **Deliverables:** `src/server/db/schema/*`, migration SQL'leri, `db:generate`, `db:migrate`, `db:seed`, integration test altyapısı.
- **Dependencies:** PHASE 01; D-005, D-006, D-007, D-008, D-039.
- **Security checks:** TLS (`verify-full`), uygulama rolü en az yetki, audit değiştirilemezliği, seed'de gerçek veri yok, IP/UA kolonu olmadığının doğrulanması.
- **Test requirements:** Kısıtlar (tek aktif dosya, tek devam eden yükleme, tek aktif token, CHECK'ler), sayaç eşzamanlılığı, audit UPDATE/DELETE reddi, CASCADE silme davranışı, normalizasyon unit testleri.
- **Acceptance:** Boş DB'ye migration'lar baştan uygulanır; seed çalışır; integration yeşil.
- **DoD:** Ortak DoD + DATABASE_SCHEMA gerçek şemayla senkron.

## PHASE 03 — Authentication & Authorization
- **Scope:** Better Auth (username + admin plugin, `nextCookies`), Drizzle adapter, `/api/auth/[...all]`, `disableSignUp`, `disabledPaths` + `hooks.before` ile kapalı uç noktalar, `disableIpTracking` + session hook (UA null) + DB CHECK, uygulama limitleyicisiyle giriş sınırlaması, 7 gün sabit oturum (`disableSessionRefresh`), cookie cache kapalı, `requireStaff`, `permissions.ts`, `/login` (yalnızca kullanıcı adı + şifre), `proxy.ts` iyimser yönlendirme, `admin:bootstrap` ve `admin:recover` script'leri, auth audit event'leri.
- **Deliverables:** Çalışan giriş/çıkış, bootstrap/recover, izin altyapısı.
- **Dependencies:** PHASE 02; TD-03, TD-04, TD-05.
- **Security checks:** Kapalı uç noktalara doğrudan istek; IP/UA'nın yazılmadığı; oturumun uzamadığı; enumeration; cookie flag'leri; trusted origins; rate limiting'in serverless çoklu instance ortamında güvenilir olması (Postgres `rate_limit_buckets`, bellek içi sayaç yok; yalnızca kısa ömürlü HMAC'li anahtarlar, kalıcı IP/cihaz verisi yok); nonce'lu CSP (`proxy.ts`, D-048).
- **Test requirements:** Unit: izin matrisi. Integration: §3 "Personel auth", "Oturum parametreleri", "IP/UA saklamama", "Giriş sınırlaması". E2E: login/logout, S05, S18, S24.
- **Acceptance:** Public kayıt/self-servis şifre işlemi mümkün değil; bootstrap ikinci kez çalışmaz; `sessions` satırlarında IP/UA NULL.
- **DoD:** Ortak DoD + TECH_STACK §3.5 doğrulanamayanları kapatıldı.

## PHASE 04 — Dashboard Foundation
- **Scope:** Dashboard layout (sidebar, header, breadcrumb, mobil drawer), rol bazlı navigasyon (Ayarlar/Hesap sayfası yok), ortak bileşenler (DataTable, Pagination, EmptyState, ConfirmDialog, StatusBadge, Skeleton), hata/404 sayfaları.
- **Deliverables:** Gezinilebilir panel iskeleti.
- **Dependencies:** PHASE 03.
- **Security checks:** Her layout/page `requireStaff`; `Cache-Control`; CSP nonce entegrasyonu.
- **Test requirements:** E2E: ADMIN vs EMPLOYEE menüsü, responsive drawer, klavye navigasyonu, axe.
- **Acceptance:** 1024/1440'ta sidebar, <1024'te drawer; tüm sayfalar dinamik ve no-store.
- **DoD:** Ortak DoD.

## PHASE 05 — Service & Document Template Management
- **Scope:** Hizmet CRUD (silme yok), aktif/pasif, sıralama; evrak şablonu CRUD (başlık, açıklama, talimat, zorunlu/isteğe bağlı, sıra, aktif/pasif). Dosya boyutu/sayısı/tipi alanı **yok**.
- **Deliverables:** `/dashboard/services*`.
- **Dependencies:** PHASE 04.
- **Security checks:** `service:manage` yalnızca ADMIN; `.strict()` şemalar.
- **Test requirements:** Unit: şemalar. Integration: CRUD, yetki, pasif hizmetin aktif listede olmaması. E2E: ADMIN hizmet + şablon; EMPLOYEE erişemez.
- **Acceptance:** Pasif hizmet başvuru formunda listelenmez.
- **DoD:** Ortak DoD.

## PHASE 06 — Customer & Application Management
- **Scope:** Başvuru formu (müşteri bilgileri her başvuruda yeniden girilir; eşleştirme yok), atomik oluşturma (numara, snapshot, token), sonuç ekranı (Kopyala, **kişiselleştirilmiş WhatsApp paylaşımı** + onay penceresi, Detaya git), tek başvuru listesi (arama, statü/hizmet/tarih filtresi, sayfalama), detay (müşteri bilgisi düzenleme, statü geçmişi, iç notlar, bağlantı göster/kopyala/paylaş/yenile/iptal/yeni oluştur), ADMIN manuel silme (iki aşamalı; storage silme PHASE 08 storage modülü hazır olduğunda tamamlanır — bu fazda dosyasız başvurular için).
- **Deliverables:** `/dashboard/applications*`.
- **Dependencies:** PHASE 05; D-011, D-033, D-036.
- **Security checks:** Token üretimi/HMAC/AES-GCM; bağlantı gösteriminin audit'i; tek aktif token; `APP_URL` ile URL üretimi; idempotency; silme sonrası erişilemezlik.
- **Test requirements:** Unit: token, numara, WhatsApp URL. Integration: transaction geri alma, eşzamanlı numara, snapshot, bağımsız başvurular, eşzamanlı yenileme, silme. E2E: oluşturma akışı, E4, E5 (dosyasız), S22.
- **Acceptance:** Brief §6 adımları tek transaction'da; sonuç ekranındaki tüm öğeler.
- **DoD:** Ortak DoD.

## PHASE 07 — Customer Portal
- **Scope:** `GET /b/[token]` (rate limit, doğrulama, imzalı portal cookie'si, 303), `/portal` (bilgiler, süreç göstergesi, tamamlanma göstergesi, evrak kartları — yükleme hariç, yorumlar, düzeltme açıklamaları, sabit iletişim kartı/placeholder, salt okunur modlar), `/link-invalid`.
- **Deliverables:** Bağlantıyla doğrudan erişim ve mobile-first panel.
- **Dependencies:** PHASE 06; D-032.
- **Security checks:** Aynı tarayıcıda iki farklı başvuru bağlantısı (TM-40): cookie üzerine yazıldığında bir sekmede başka başvuru görüntülenmemeli ve yanlış başvuruya evrak yüklenememeli; müşteri oturumu her istekte doğru başvuru + aktif token ile ilişkilendirilir; GET'in veri değiştirmemesi; `no-referrer`, `no-store`, `noindex`; üçüncü taraf script yok; müşteri DTO whitelist; iç not sızıntısı; iptal/yenilemenin anında etkisi; token'ın log/hata mesajında olmaması.
- **Test requirements:** Unit: cookie imzası, ilerleme hesapları. Integration: bağlantı GET'in yan etkisizliği; iptal sonrası cookie reddi. E2E (mobil projeler): S01–S04, S16, S20, S21; aynı tarayıcıda iki bağlantı/iki sekme (TM-40); 9 genişlik.
- **Acceptance:** Geçerli bağlantı ek adımsız panele götürür; adres çubuğunda token kalmaz; geçersiz bağlantıda hiçbir kişisel veri dönmez.
- **DoD:** Ortak DoD + gerçek cihaz (iOS Safari, Android Chrome, WhatsApp in-app — cookie davranışı dahil) manuel test sonuçları raporlandı.

## PHASE 08 — Secure PDF Document Management
- **Scope:** Dev/demo private Blob store'ları (ücretsiz), storage modülü (`storage.ts`, `upload-client.ts`), `/api/uploads` (token + callback), client confirm, upload bileşeni (ilerleme, hata, tekrar dene, çift gönderim engeli, değiştir/kaldır), PDF yapısal doğrulama (parser seçimi TD-06), tek aktif PDF + versiyonlama, `/api/files/[fileId]` (inline/attachment — TD-12), personelin müşteri adına (UNDER_REVIEW dahil) yüklemesi, günlük teknik temizlik (cron), başvuru silmenin storage aşaması.
- **Deliverables:** Uçtan uca dosya yönetimi.
- **Dependencies:** PHASE 07; TD-06, TD-10, TD-11, TD-12.
- **Security checks:** FILE_STORAGE §6.4 kabul kriterlerinin tamamı; görüntüleme ve indirme uç noktasında (`/api/files/[fileId]`) her istekte sunucu tarafı yetkilendirme — yalnızca indirme butonunu gizlemek kontrol sayılmaz; "virüssüz" etiketi olmaması.
- **Test requirements:** Unit: sanitizasyon, doğrulama fixture seti. Integration: idempotency, yarış, tek aktif/tek devam eden yükleme, temizlik, silme. E2E: S07–S12, mobil dosya seçimi, E5 (dosyalı).
- **Acceptance:** FILE_STORAGE §6.4 maddeleri 1–15 geçer.
- **DoD:** Ortak DoD + SDK API'leri TECH_STACK'te doğrulandı.

## PHASE 09 — Document Review & Application Workflow
- **Scope:** Gönderim (müşteri + müşteri adına), evrak inceleme (onay/düzeltme + gerekçe, `fileId` bağlı), karar değişikliği, müşteri yorumları, T2–T7, **ADMIN T8–T12** (gerekçeli, evrak seçimli), izin verilen aksiyonlar, müşteri panelinde düzeltme gösterimi, yeniden gönderim, statü geçmişi.
- **Deliverables:** Tam iş akışı.
- **Dependencies:** PHASE 08; D-027, D-041.
- **Security checks:** Sunucu tarafı state machine; kilit + version; BR-57; aktör kaydı.
- **Test requirements:** Unit: geçiş matrisleri %100. Integration: eşzamanlılık, ADMIN geçişleri. E2E: §5.1 ana senaryo (tamamı), E1–E3, S13, S14, S23.
- **Acceptance:** Ana senaryonun 19 adımı desktop + mobilde yeşil.
- **DoD:** Ortak DoD.

## PHASE 10 — Administration & Operations
- **Scope:** Çalışan yönetimi (oluştur, kullanıcı adı/şifre belirle, düzenle, rol, aktif/pasif, yeni şifre ata + oturum iptali, oturum sonlandırma), dashboard istatistikleri, audit log ekranı (filtre, sayfalama), başvuru detayında işlem geçmişi.
- **Deliverables:** `/dashboard/employees*`, `/dashboard/audit-logs`, dashboard sayaçları.
- **Dependencies:** PHASE 09.
- **Security checks:** BR-133 son admin koruması; audit yalnızca ADMIN; şifrelerin hiçbir yanıtta/logda olmaması.
- **Test requirements:** Integration: kullanıcı yönetimi, son admin koruması, istatistik doğruluğu. E2E: S05, S06, E6.
- **Acceptance:** AUTHORIZATION_MATRIX yönetim satırlarının tamamı testli.
- **DoD:** Ortak DoD.

## PHASE 11 — UI/UX & Performance Optimization
- **Scope:** WCAG 2.2 AA denetimi, 9 genişlikte görsel regresyon, Lighthouse, sorgu planları (10k seed), bundle analizi, loading/empty/error durumları, metin/ton.
- **Dependencies:** PHASE 10.
- **Security checks:** Optimizasyonların cache kurallarını (D-016) ihlal etmemesi.
- **Test requirements:** axe, Lighthouse, ekran okuyucu, görsel regresyon.
- **Acceptance:** axe kritik/ciddi yok; portal Lighthouse mobil Perf ≥ 90, A11y ≥ 95; sorgular index kullanır.
- **DoD:** Ortak DoD.

## PHASE 12 — Quality Assurance & Security Audit
- **Scope:** Tam regresyon, yetki matrisi %100, S01–S24, tehdit modeli gözden geçirme, manuel sızma testi (ASVS L2 seçkisi), bağımlılık denetimi, log/payload sızıntı incelemesi, production blocker durumu.
- **Dependencies:** PHASE 11.
- **Security checks:** SECURITY §11 PB-04, PB-05, PB-07, PB-09, PB-10.
- **Test requirements:** Tüm suite.
- **Acceptance:** Açık yüksek/kritik bulgu yok; PB-04/PB-05 için Product Owner yazılı risk kabulü (veya alternatif önlem kararı).
- **DoD:** Ortak DoD.

## PHASE 13 — Production Deployment
- **Scope:** Ticari kullanıma uygun ücretsiz (veya kullanıcının açıkça onayladığı) hosting/DB/storage değerlendirmesi ve seçimi (DEPLOYMENT §6.3), production ortamı, env/secrets, sağlayıcı alt alan adı (`APP_URL`), GitHub branch koruma + secret scanning, migration, bootstrap admin, günlük temizlik zamanlaması, yedek/geri yükleme provası, izleme, olay müdahale planı, smoke test.
- **Dependencies:** PHASE 12; PB-01, PB-02, PB-03, PB-06, PB-08, PB-11 kapalı.
- **Security checks:** MFA, en az yetki, izolasyon, rotasyon prosedürü, sağlayıcı log politikası incelemesi (TM-15).
- **Test requirements:** Production smoke test (sahte başvuru, sonra silinir), geri yükleme provası.
- **Acceptance:** Tüm production blocker'ları kapalı; smoke test yeşil.
- **DoD:** Ortak DoD + PROJECT_STATE "Production".
