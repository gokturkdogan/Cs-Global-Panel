# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-27** (PHASE 12.1 sonu)

## Current Phase
**PHASE 12.1 — Targeted Security Remediation & Final Verification**
Phase Status: **PHASE 12.1 COMPLETED (mühendislik — kısmi; Neon migration onayı, gerçek sağlayıcı ve dış doğrulamalar bekliyor) — kullanıcı onayı bekleniyor** (2026-11-27). Rapor: [SECURITY_AUDIT.md](SECURITY_AUDIT.md) §8. Production: **NO-GO**. PHASE 12 değerlendirildi; nihai onay PHASE 12.1 sonrası. D-141, D-144 ACCEPTED; D-143, D-145 CONDITIONALLY ACCEPTED; PB-12, PB-13 kabul edilmiş blocker. **OD-27 ACCEPTED (2026-11-27):** uygulamaya özel yedek/geri yükleme altyapısı kapsam dışı — D-142 SUPERSEDED, D-148 WITHDRAWN, `test:restore-drill` ve `ops:post-restore` kaldırıldı; PB-08 ve PB-12 kalan risk / kullanıcı kabulü. PHASE 13 başlatılmadı.

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24.
- PHASE 01 — Project Initialization — Product Owner onayı 2026-11-24.
- PHASE 02 — Database Foundation — Product Owner onayı 2026-11-24 (D-052…D-058 Accepted; D-059 tek veritabanı).
- PHASE 03 — Authentication & Equal Staff Access — Product Owner onayı 2026-11-24 (D-060…D-064, D-066 Accepted; D-065 koşullu). Gerçek ADMIN ve EMPLOYEE hesapları oluşturuldu.
- PHASE 04 — Dashboard Foundation — Product Owner onayı 2026-11-24 (D-069…D-071 Accepted; D-067, D-068 koşullu Accepted; D-063, D-065 Partially Superseded). P4-01 PARTIAL, P4-03 MITIGATED, P4-04 DEFERRED.

- PHASE 05 — Service & Document Template Management — Product Owner onayı 2026-11-24 (D-072…D-077 Accepted; P4-01 yerel test izolasyonu açısından RESOLVED).
- PHASE 06 — Customer & Application Management — Product Owner onayı 2026-11-25 (D-078…D-080, D-082…D-086 Accepted; D-081 koşullu).
- PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage — Product Owner onayı 2026-11-25 (D-096, D-097, D-098, D-103, D-106, D-107 Accepted; D-099…D-102, D-104, D-105 koşullu Accepted). **Canlı B2 duman testi PASS** (kullanıcı terminali, `pnpm storage:verify`; yalnızca kontrollü storage smoke kapsamı).
- PHASE 09 — Document Review & Application Workflow (+ 09.1 kapanış) — Product Owner onayı 2026-11-25 (D-108…D-114 Accepted; önceki koşullu onaylar değişmedi).
- PHASE 11 — UI/UX Polish & Performance Optimization (+ 11.1) — Product Owner onayı 2026-11-27 (D-137…D-139 Accepted; D-134, D-135, D-136, D-140 koşullu Accepted; OD-26 ACCEPTED).
- PHASE 10 — Administration & Operations (+ 10.1, 10.2 kapanış) — Product Owner onayı 2026-11-26 (D-115…D-122, D-124…D-126, D-128…D-130, D-133 Accepted; D-123, D-127, D-131, D-132 koşullu Accepted; D-116 zamana dayalı sonlandırması D-124 ile geçersiz; D-102 gerçek B2 doğrulaması açık; Neon audit id 970 korunur, 155 audit satırı referans).
- PHASE 07 — Customer Portal — Product Owner onayı 2026-11-25 (D-088…D-092, D-094, D-095 Accepted; D-087, D-093 koşullu Accepted — hosting log redaksiyonu, tarayıcı geçmişi, WhatsApp önizleme, edge koruması, gerçek cihaz/in-app testleri, HTTPS `Secure` cookie, anahtar yedekleme/rotasyon ve PB'ler açık; D-081 koşullu kalır). TM-40 görüntüleme izolasyonu doğrulandı.

> Faz onayları production güvenliği veya KVKK uyumluluğu onayı değildir; PB-01…PB-11 açıktır.

## Project Status
**PHASE 12.1:** D-141 müşteri bağlantısı ara sayfası (GET veritabanısız/oturumsuz; açık `POST /b/enter`), SEC-05 temizlik komutu (`pnpm ops:rate-limit-cleanup`), SEC-06 geçerli token başına sınır, bağımsız inceleme REVIEW-01…06 → SEC-14 (HIGH, audit atomikliği), SEC-15…18 (MEDIUM: worker temizliği, tuval sınırı, kapasite varsayılanı, sağlayıcı yanıtı/belirsiz yazım) düzeltildi ve doğrulandı; migration **0011** (runtime rolü users/accounts/verifications yazma yetkisi geri alındı) **yalnızca izole** ortamda. Geri yükleme tatbikatı ve geri yükleme sonrası kilitleme/rapor araçları **OD-27 ile kaldırıldı** (uygulamaya özel yedek/geri yükleme kapsam dışı; veri kaybı ve sağlayıcı düzeyi geri yükleme kalan riskleri belgelendi — OPERATIONS_RUNBOOK §2; PB-08/PB-12 kalan risk / kullanıcı kabulü). Yeni bağımlılık yok. Neon ve Backblaze'de değişiklik yok.

**PHASE 12:** güvenlik denetimi (bulgular SEC-01…SEC-13; CRITICAL/HIGH yok; MEDIUM 3: B2 anahtarı fazla yetkili, bağlantı önizleme verisi, geri yükleme sonrası geri dönüş), yeni testler (`security-audit.spec.ts`, `accessibility.spec.ts`, audit tekilleştirme/kilit testleri), salt okunur B2 denetimi (`pnpm storage:inspect`), yedek/geri yükleme tatbikatı (`pnpm test:restore-drill`), operasyon runbook'u, doğrulama planları, hosting karşılaştırması, KVKK kontrol listesi, CI izole işi. Uygulama kodu değişikliği (yalnızca sınıf düzeyi): atlama bağlantısı `sr-only` düzeltmesi (SEC-08); boşluksuz uzun adlarda yatay taşma — `wrap-anywhere` / `min-w-0` (SEC-12). Test bütünlüğü: izole integration dosya sırası bağımlılığı giderildi (SEC-13). Yeni bağımlılık/migration yok. Sağlayıcı/Neon'da değişiklik yok.

**PHASE 11.1:** OD-26 (Backblaze B2 yıllık ~10 USD bütçe; diğer altyapılarda hedef 0) kaydedildi; kapasite kod tavanı 100 GB / uyarı 90 GB (D-140; şema değişikliği yok); aktif `.env.local` hesap hazırlığı doğrulanana kadar 9 GB / 8 GB; Backblaze fiyatları resmî sayfadan doğrulandı (100 GB ortalamada ~7,51 USD/yıl); görüntüleyicide sayfaya git + klavye gezinmesi; başvuru detayında evrak statü özeti; PDF dizi benchmark'ları (ilk 3 sayfa, son sayfa, tüm sayfalar, iptal); rate limit değerlendirmesi (değişiklik yok). Yeni bağımlılık yok. Sağlayıcı hesabında değişiklik yapılmadı.

**PHASE 11:** ölçüm altyapısı (`pnpm perf:isolated`, `pnpm perf:db:isolated` — D-134); güvenli HTTP Range ile PDF teslimi (tek aralık 206/416, If-Range + opak ETag, HEAD sağlayıcıya gitmez, sağlayıcıya `Range`+`VersionId`, yanıt doğrulaması, uzunluk korumalı akış, iptal iletimi, sınıf bazlı rate limit, parça audit tekilleştirme — D-135); tembel pdf.js görüntüleyici (yerel worker, CSP `worker-src 'self'`, aralık taşıyıcısı, uyarlamalı 1 MiB bloklar, kalıcı önbellek yok — D-136); ön-getirme politikası (D-137); audit bileşik indeksi (migration 0010 — D-138); WebKit test gezinme iptali düzeltmesi (D-139); UI polish (yükleme aşamaları, mobil filtre katlama, taşma/kesilme). Yeni bağımlılık yok. Commit/push yapılmadı.

**PHASE 10.2:** test izolasyonu korumaları (Neon'da kalıcı test yazımı engeli + parmak izi kontrolü + fail-closed hedef kontrolü — D-129), mutabakat muhasebe nesli (migration 0009 — D-130), WebKit konsol hatası kök nedeni (kurumsal içerik filtresi) ve dar test istisnası (D-131), `NOT_SENT` sıkılaştırması (D-132), müşteri bilgisi düzenleme formunda odak yarışı düzeltmesi (D-133). Neon test olayı kaydı (audit id 970) korunur; geliştirme parmak izi tabanı audit 155.

**PHASE 10.1:** silme ↔ gecikmiş storage yazımı riski giderildi — her PUT girişimi kalıcı kayıt (`storage_write_attempts`), PUT öncesi çit (silme başlamamış girişimleri çitler), PUT için SDK yeniden denemesi kapalı, kesin/belirsiz sonuç ayrımı (belirsiz yalnızca gözlemle çözülür), zamandan bağımsız sonlandırma (belirsiz yazım varken silme güvenle bekletilir), DB koruması v2 + durum makinesi trigger'ları + geri alınamaz silme işareti, eski takipsiz kayıtlar kanıtsız, teknik temizlik kanıt tabanlı, eski iç notlara keyset sayfalama. Migration 0008; yeni bağımlılık yok.

Yönetim ve operasyon özellikleri uygulandı (PHASE 10): başvuru detayında **Şirket İçi Notlar** (iki hesap; düz metin; sunucu + veritabanı idempotency; append-only; müşteriye sızmaz — sentinel testleri), merkezi **İşlem Geçmişi** (`/dashboard/audit-logs`: tarih/işlem/aktör/personel/kayıt türü/başvuru filtreleri, keyset sayfalama, allowlist ayrıntılar, salt okunur) ve başvuruya özel işlem geçmişi bağlantısı, **kalıcı başvuru silme** (Tehlikeli İşlemler; gerekçe + numara onayı; anında erişim kapanışı ve bağlantı iptali; yükleme bekleme kapısı; sahiplik doğrulamalı envanter; versiyona özgü sınırlı fiziksel silme; listeleme ile yokluk doğrulaması; kira; kalıcı ilerleme ve "Silme İşlemini Sürdür"; silme kuyruğu; DB koruma trigger'ı; kota yalnızca doğrulanmış silmeden sonra), teknik temizlik ↔ silme kapsam ayrımı. Migration 0007; yeni bağımlılık yok. Tekil dosya kalıcı silme (BR-47), toplu silme, audit dışa aktarma ve deployment **yok**. Commit/push yapılmadı.

Önceki faz (PHASE 09): Evrak inceleme ve başvuru iş akışı uygulandı: müşteri ve personel (müşteri adına) incelemeye gönderme / yeniden gönderme (BR-50 guard'ları sunucuda), evrak kararları (onay / düzeltme — belirli dosya versiyonuna bağlı, BR-57), müşteriye görünür düzeltme açıklamaları, T2–T12 statü geçişleri (manuel, matristen; gerekçeli iptal / yeniden açma / geri alma; T8 iptal öncesine), dosya kaldırma (D2/D8, fiziksel silme yok), müşteriye görünür yorumlar, personel statü geçmişi (gerekçeli) ve müşteri süreç geçmişi (statü + tarih), TM-40 iş akışı mutasyonu kapsamı. Kalıcı silme, iç notlar, audit yönetim ekranı (PHASE 10) ve deployment **yok**. Yeni migration ve bağımlılık yok. Commit/push yapılmadı.

Önceki faz (PHASE 08): PDF yükleme ve Backblaze B2 private depolama uygulandı (PHASE 08): müşteri ve personel (müşteri adına, `UNDER_REVIEW` dahil) PDF yükleme/değiştirme; ham PDF gövdesiyle kimlik doğrulamalı Route Handler'lar (proxy dışı); izole worker'da yapısal PDF doğrulaması (pdf.js + nesne düzeyi aktif içerik taraması — antivirüs değildir); SHA-256; rezervasyon → B2 → aktivasyon yaşam döngüsü ve hata kurtarma; tek aktif PDF + versiyon geçmişi; onay geçersizleştirme; atomik 9 GB kota (8 GB uyarı); yetkili görüntüleme/indirme (personel geçmiş, müşteri yalnızca ACTIVE); gerçek yükleme ilerlemesi; dashboard kapasite kartı; `pnpm env:b2`, `storage:verify`, `storage:reconcile`, `storage:cleanup`; migration 0005. İncelemeye gönderme/inceleme (PHASE 09), kaldırma (PHASE 09), başvuru silme (PHASE 10), deployment **yok**. Commit/push yapılmadı.

Önceki faz (PHASE 07): Salt okunur müşteri paneli uygulandı: `/b/TOKEN` girişi (biçim kontrolü, HMAC arama, yan etkisiz), imzalı 7 günlük sabit müşteri oturumu (`CUSTOMER_SESSION_SECRET`), 303 ile token'sız `/portal/<bağlam>`, her istekte iptal/yenileme/silme kontrolü, çoklu sekme bağlam izolasyonu (TM-40 görüntüleme kapsamı), `/link-invalid` ve `/link-unavailable`, mobile-first panel (hoş geldiniz, süreç göstergesi, evrak ilerlemesi, evrak kartları + düzeltme açıklaması, yükleme/gönderim yer tutucuları, iletişim kartı), müşteri yolu başlıkları ve log redaksiyonu. Dosya yükleme, inceleme/gönderim, statü geçişleri, silme, deployment **yok**. Commit/push yapılmadı.

Önceki faz (PHASE 06):  atomik başvuru oluşturma (müşteri bilgileri, aktif hizmet, sunucu doğrulamalı evrak önizlemesi, yıllık sayaçla benzersiz numara, snapshot, ilk statü geçmişi, müşteri bağlantı token'ı, audit — tek transaction), liste (URL dışı arama, durum/hizmet filtresi, sayfalama), detay, müşteri bilgisi düzenleme (optimistic lock), bağlantı göster/kopyala/yenile/iptal/yeniden oluştur, kişiselleştirilmiş WhatsApp mesajı hazırlığı (otomatik gönderim yok), dashboard bağlantıları. Token: 256 bit CSPRNG, HMAC-SHA256 hash, AES-256-GCM kopya. Müşteri paneli (`/b/TOKEN`), müşteri oturumu, PDF/storage, statü geçişleri, deployment **yok**. Commit/push bu fazda yapılmadı.

## Implemented Features
Altyapı:
- PHASE 01: Next.js 16.4.6, TypeScript 6.0.3 strict, Tailwind 4, shadcn/ui, tasarım token'ları, env doğrulaması, güvenlik header'ları, Vitest/Playwright, CI.
- PHASE 02: Drizzle ORM + pg; 17 tablo; en az yetkili `cs_app_runtime`; append-only audit; `db:*` CLI; demo seed.
- PHASE 03: Better Auth 1.7.27 (username plugin; HTTP route'u yok — D-060); iki hesap modeli (migration 0003 — D-061); `pnpm auth:bootstrap` / `pnpm auth:reset-password` (D-062); ortak `requireStaff()`; giriş rate limiting (D-063); nonce'lu CSP + dinamik render (D-064); ortak giriş ekranı `/login`; korumalı `/dashboard` placeholder; çıkış; auth audit event'leri.
- PHASE 04: `/dashboard` düzeni ve Genel Bakış (D-070); `/dashboard/applications`, `/services`, `/audit-logs` bilgilendirme sayfaları; panel içi 404; proxy köken kontrolü (D-069); bilinmeyen kullanıcı adı rate limiti (D-068); test oturumu altyapısı (D-067); CSP nonce'lu kaydırma kilidi (D-071).
- PHASE 05: `/dashboard/services` (liste, arama, filtre), `/new`, `/[serviceId]` (genel bilgiler, durum, sabit dosya kuralları, evrak gereksinimleri); 7 Server Action; migration 0004 (`version` kolonları — D-074); ConfirmDialog, FormField, Textarea; izole test ortamı (`pnpm test:integration:isolated`, `pnpm test:e2e:isolated` — D-077).
- PHASE 06: `/dashboard/applications` (liste), `/new` (oluşturma + başarı ekranı), `/[applicationId]` (özet, müşteri bilgileri, bağlantı yönetimi, evrak snapshot'ı, geçmiş); 8 Server Action; `src/server/access-tokens/crypto.ts`; `getAccessTokenEnv()`; `pnpm env:token-keys`; `libphonenumber-js` 1.13.17.
- PHASE 07: `GET /b/[token]`; `src/server/customer-session/{session,access}.ts` (`requireCustomerAccess`); `getCustomerSessionEnv()`; `src/features/customer-portal/*`; `src/app/(customer)/` (`/portal/[context]`, `/portal`, `/link-invalid`, `/link-unavailable`); müşteri yolu başlıkları ve dev log redaksiyonu (`next.config.ts`); müşteri modülü ESLint sınırı.
- PHASE 08: `src/server/storage/*` (B2 + yerel private adapter, config, quota), `src/server/pdf/*` (izole doğrulama), `src/features/documents/*` (servis, HTTP katmanı, sorgular, `PdfUpload`, `StaffDocumentCard`, `StorageCapacityCard`), 4 Route Handler (`/api/documents/[requirementId]/file`, `/api/files/[fileId]`, `/api/portal/[context]/documents/[requirementId]/file`, `/api/portal/[context]/files/[fileId]`), `scripts/storage/*`, `scripts/env/configure-b2.ts`; `@aws-sdk/client-s3` 3.1176.0, `pdfjs-dist` 6.5.438.
- PHASE 09: `src/features/applications/domain/{application-status,transition-labels}.ts`, `src/features/documents/domain/document-status.ts`, `src/features/workflow/{service,actions,customer-entry,schemas,queries}.ts` + bileşenler (`WorkflowPanel`, `ReviewActions`, `CommentForm`), müşteri `actions.ts`, `SubmitPanel`, `RemoveFileButton`, yorumlar/süreç geçmişi.
- PHASE 10: `src/features/internal-notes/*` (şema, servis, sorgu, action, `InternalNotesSection`), `src/features/audit-logs/*` (etiketler/allowlist, filtreler, keyset sorgu, numara çözümleme action'ı, filtre formu, liste), `src/features/deletion/*` (servis, sorgular, action'lar, `DeletionDangerZone`, `DeletionProgressCard`, `ResumeDeletionButton`, `DeletionQueueCard`), `src/server/idempotency/payload-hash.ts`, `/dashboard/audit-logs` gerçek sayfa.
- PHASE 10.1: `storage_write_attempts` + `beginStorageWrite`/`settleStorageWrite` (`src/features/documents/service.ts`), B2 `putClient` (tek girişim) ve `NOT_SENT` sınıfı, silme adımında gözlemle çözüm + versiyona özgü yokluk doğrulaması, `OlderNotes` / `listOlderInternalNotesAction`.
- PHASE 11: `src/features/documents/domain/byte-range.ts`, `src/server/storage/exact-length.ts`, `GetObjectOptions` (range/signal), dosya route'larında `HEAD`, `src/features/documents/components/pdf-viewer/*` (`PdfViewerDialog`, `PdfViewer`, `range-fetch.ts`, `pdf.worker.ts`), `src/components/csp-nonce.tsx` (ortak), `tests/perf/*`, `playwright.perf.config.ts`, `vitest.perf.config.ts`, `tests/support/instrumented-storage.ts`.
- Veritabanı: Neon Free, Frankfurt, PostgreSQL 18.7, tek veritabanı `neondb` (D-059); **11 migration, 21 tablo** (0010: audit bileşik indeksi) (0009: mutabakat muhasebe nesli) (0008: yazım girişimi takibi, koruma v2) (0007: iç not idempotency, `application_deletions`, `application_deletion_objects`, silme koruma trigger'ı) (0006: yorum idempotency) (0005: `storage_quota_state`, `storage_version_id`, token FK'leri CASCADE).
- Depolama: Backblaze B2 private bucket `cs-global-documents` (EU Central, SSE-B2; OD-25) — anahtar kullanıcı tarafından `pnpm env:b2` ile yapılandırıldı; canlı smoke PASS (PHASE 08). Otomatik testler yalnızca yerel private adapter kullanır.

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-26 — Backblaze B2 bütçesi ~10 USD/yıl ve 100 GB / 90 GB kapasite hedefi ACCEPTED (kullanıcı kararı, 2026-11-27). OD-01…OD-24 ACCEPTED (Product Owner, 2026-11-24); **OD-25 — Backblaze B2** ACCEPTED (kullanıcı kararı, 2026-11-25) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

D-042…D-058, D-060…D-064, D-066, D-069…D-080, D-082…D-086, D-088…D-092, D-094…D-098, D-103, D-106…D-114 **Accepted**; D-067, D-068, D-081, D-087, D-093, D-099…D-102, D-104, D-105 **Conditionally Accepted**; D-063, D-065, D-035 **Partially Superseded**; D-017, D-040 **Superseded** (OD-25). PHASE 10/10.1/10.2 kararları (2026-11-26 onay): **D-115…D-122, D-124…D-126, D-128…D-130, D-133 Accepted** (D-116 D-124 ile güncel; D-117 D-125 ile genişletilmiş); **D-123, D-127, D-131, D-132 Conditionally Accepted**. PHASE 11 kararları (2026-11-27 onay): **D-137…D-139 Accepted**; **D-134, D-135, D-136, D-140 Conditionally Accepted**. **OD-26 ACCEPTED**. PHASE 12 kararları (2026-11-27): **D-141, D-144 Accepted**; **D-143, D-145 Conditionally Accepted**; **D-142 Superseded** (OD-27). PHASE 12.1 kararları **D-146, D-147, D-149…D-151 Proposed**; **D-148 Withdrawn** (OD-27). **OD-27 ACCEPTED**.

| ID | Konu | Öneri | Gerekli faz |
|---|---|---|---|
| ~~TD-01~~ | D-002 — TypeScript sürümü | **Çözüldü:** 6.0.3 — Accepted, kuruldu | PHASE 01 |
| ~~TD-02~~ | D-004 — pnpm sürümü | **Çözüldü:** 10.34.9 — Accepted, `packageManager` ile sabit | PHASE 01 |
| ~~TD-03~~ | Better Auth uç noktalarını kapatma | **Çözüldü (D-060):** HTTP route'u bağlanmaz; 11 yol 404 (E2E) | PHASE 03 |
| TD-04 | Hosting'de güvenilir istemci IP header'ı (IP bazlı giriş ve `/b` limiti için) | UA'nın yazılmaması PHASE 03'te doğrulandı; IP header'ı ve IP bazlı limit (giriş + `/b/[token]` — D-093) hosting seçiminde | PHASE 13 |
| ~~TD-05~~ | Personel e-posta alanı | **Çözüldü (D-061):** `<id>@staff.invalid`, CHECK ile zorunlu | PHASE 03 |
| ~~TD-06~~ | PDF parser kütüphanesi | **Çözüldü (D-099):** pdfjs-dist 6.5.438 + nesne düzeyi tarama, izole worker | PHASE 08 |
| TD-07 | Production hosting / DB / storage sağlayıcısı | DEPLOYMENT §6.3 kriterleriyle değerlendirme | PHASE 13 (PB-01) |
| TD-08 | `pg` pool ayarları ve Neon PgBouncer kısıtları | PHASE 02'de doğrulama | PHASE 02 |
| TD-09 | Neon `pg_trgm` desteği | Yoksa prefix arama yedeği | PHASE 02 |
| TD-10 | Teknik temizlik zamanlaması | **Kısmen (D-105, D-120):** `pnpm storage:cleanup`/`reconcile` CLI (varsayılan dry-run; silme sürecindeki başvurulara dokunmaz); ücretli cron yok; yarım kalan kalıcı silmeler personel arayüzünden sürdürülür. Planlı çalıştırma hosting seçiminde | PHASE 13 |
| ~~TD-11~~ | Vercel Blob client upload API | **Geçersiz (OD-25, D-100)** — sunucu üzerinden yükleme | — |
| TD-12 | Tarayıcı bazında güvenli inline PDF görüntüleme vs indirme | **Kısmen (D-104):** yeni sekmede yerleşik görüntüleyici (satır içi, sandbox'sız, tüm alt kaynaklar kapalı) + indirme (sandbox). Gerçek cihazlarda doğrulanmadı | PHASE 12/13 (gerçek cihaz) |
| TD-13 | Production B2 bucket + bağımsız anahtar + ticari koşul/DPA + yedekleme | Ayrı bucket (geliştirme bucket'ı production'da reddedilir — D-098) | PHASE 13 |
| TD-14 | 10 MiB gövde kabul eden production hosting (D-100) | Zorunlu uyumluluk kriteri | PHASE 13 |

## Pending Implementation Inputs (Product Owner'dan beklenen)
1. Gerçek şirket telefon numarası ve WhatsApp iletişim bağlantısı (OD-14) — sağlanana kadar placeholder.
2. Gerçek hizmet kataloğu ve hizmet bazlı evrak listeleri (demo veriler resmî gereksinim değildir).
3. Gerçek şirket logosu (OD-15) — sağlanana kadar metin logo.
4. KVKK aydınlatma metni (hukuki süreç sonrası).
5. Production hosting kararı için değerlendirme sonuçlarına onay (TD-07).
6. **B2 anahtarı:** kullanıcı kendi terminalinde `pnpm env:b2` (gizli girdi) + `pnpm storage:verify` çalıştırmalıdır. Anahtar sohbette istenmez.

## Known Issues
1. **Canlı B2 duman testi PASS** (kullanıcı terminali, 2026-11-25): bucket erişimi, sentetik yazma, SSE-B2 AES256, versiyon kimliği, HEAD 400/400, GET SHA-256, imzasız erişim 401 (3 biçim), versiyona özgü silme. **Doğrulanmayan:** tarayıcıdan B2'ye tam uygulama yükleme akışı, gerçek kota/cap aşımı davranışı, tüm sağlayıcı hata/kurtarma senaryoları, Object Lock/replikasyon, production. Tüm otomatik testler yerel private adapter ile.
2. **Gerçek cihaz testi yapılmadı:** iOS Safari, Android Chrome, WhatsApp in-app — dosya seçici, yükleme, satır içi PDF görüntüleme ve PHASE 07 cookie davranışı (ROADMAP DoD maddeleri **karşılanmadı**). Yalnızca Playwright Chrome/WebKit + mobil emülasyon.
3. **Yapısal doğrulama antivirüs değildir** (OD-07, PB-05); gerçek belge setiyle (tarayıcı "PDF olarak kaydet", tarama uygulamaları, ofis çıktıları) yanlış pozitif oranı ölçülmedi (PHASE 12). Ad taraması içerik akışlarını taramaz (nesne değildir); pdf.js bozuk xref'leri onarabildiği için zarf kontrolü ayrıca yapılır.
4. Kaldırma PHASE 09'da uygulandı (dosya `REMOVED`, fiziksel silme yok). **Kalıcı başvuru silme PHASE 10'da uygulandı** (D-116, D-117 — D-102 koşulu DB trigger'ı ve iş akışıyla karşılandı; A–I senaryoları yerel adapter ile test edildi). **Doğrulanmayan:** gerçek B2 üzerinde uygulama silme akışı, gerçek cap/rate limit ve Object Lock davranışı. ~~Artık risk: bekleme payından sonra gecikmiş PUT~~ — **PHASE 10.1'de giderildi** (D-121…D-125). **Yeni kabul edilmiş davranış:** sonucu kanıtlanamayan bir yükleme varsa silme süresiz bekletilebilir (`UPLOAD_OUTCOME_UNKNOWN`; bypass yok — teknik inceleme gerekir). **Varsayım:** B2 listeleme/HEAD tutarlılık modeli belgelenmemiş (PHASE 12'de gerçek sağlayıcıyla doğrulanacak).
5. **Teknik temizlik elle:** `pnpm storage:cleanup --apply` / `storage:reconcile --apply` zamanlanmadı (ücretli cron yok; TD-10). Yarım yüklemelerin nesneleri temizlik çalıştırılana kadar kotada sayılır.
6. **Range desteği yok:** görüntülemede dosya her açılışta tam indirilir (≤ 10 MiB) — günlük 1 GB indirme cap'i için ~100 tam görüntüleme/gün. Uygulama tarafı günlük indirme göstergesi yok.
7. **Cap aşımındaki gerçek S3 hata kodu** belgelerde yok; sınıflandırma 403+cap/limit ve 429 üzerinden (canlı doğrulanmadı).
8. **Eşzamanlılık/kuyruk süreç başına** (bellek içi sayaç — yalnızca kaynak koruması, güvenlik limiti değil); çoklu instance'ta instance başına 4. Rate limitler Postgres'te (aktör başına).
9. **Aynı tarayıcıda tek etkin başvuru paneli (D-090)**; TM-40 görüntüleme, dosya ve iş akışı mutasyonu kapsamında testle çözüldü (gerçek cihaz/production tarayıcı önbelleği açık).
10. **`/b` için IP rate limit yok** (TD-04, D-093) — PHASE 13. **HTTPS `__Host-`/`Secure` cookie** gerçek tarayıcıda doğrulanmadı.
11. **Anahtar yedekleme/rotasyon prosedürü yok** (token anahtarları, `CUSTOMER_SESSION_SECRET`, B2 anahtarı — TM-48, TM-49, TM-51; D-081 koşulu) — PHASE 13 öncesi zorunlu.
12. **Müşteri yorum yazamaz** (BR-122 — salt okunur). Yorum idempotency PHASE 09.1'de sunucu/veritabanı düzeyinde çözüldü (D-113). Arama sayfa yenilenince sıfırlanır (D-085). İç notlar PHASE 10'da uygulandı (D-115); liste en yeni 50 notla sınırlı (daha eskiler için sayfalama yok).
21. **Kalıcı silme arka planda ilerlemez:** talep sonrası ilk adım hemen çalışır; kalan adımlar (sonucu bekleyen yükleme, storage hatası, çok sayıda versiyon) personelin "Silme İşlemini Sürdür" isteği gerektirir. PHASE 10.1: zamana dayalı bekleme kaldırıldı; belirsiz yazım kanıtlanana kadar silme tamamlanmaz.
24. **Belirsiz yazım kotada kalır:** sonucu kanıtlanamayan yükleme kayıtları (zaman aşımı/yanıt kaybı/sağlayıcı hatası) gözlemle çözülene kadar kota kullanımında sayılır (tutucu; yanlış boş kapasite gösterilmez).
26. **`neondb`'de 1 sentetik test audit kaydı (PHASE 10.1 hatası):** `privileges.test.ts`'e eklenen ve geri alınmayan bir ekleme, ortak veritabanına `TEST_EVENT` (SYSTEM, `metadata {}`, kişisel veri yok; id 970, 2026-11-26) yazdı — audit sayısı 154 → 155. Test, kaydı geri alınan transaction içinde yapacak şekilde düzeltildi ve sonraki çalıştırmada parmak izi değişmedi. Kayıt append-only olduğundan silinmedi; **kullanıcı kararı (PHASE 10.2): kayıt şeffaf olay kaydı olarak korunur**, audit korumaları değiştirilmez. **Yeni geliştirme parmak izi tabanı: audit 155** (`users 2, services 3, şablon 12, başvuru 0, dosya 0`). Kök neden giderildi (D-129). Geliştirme audit/test kayıtları production'a taşınmaz (DEPLOYMENT §14). (Daha eski benzer kayıt id 459, 2026-11-24 — önceki fazdan.)
27. **Geliştirme makinesinde kurumsal içerik filtresi** (Network Extension; D-131) WebKit isteklerini zaman zaman ağ katmanında düşürebilir ("blocked by a content filter" / "access control checks"); E2E denetimi bunu yalnızca dar koşullarda ayırt eder. Gerçek cihaz/production tarayıcı davranışı ayrıca doğrulanmadı.
25. **Eski (0008 öncesi) dosya kayıtları** yazım takibi olmadığından kanıtsızdır: silme `LEGACY_UNVERIFIED` ile durur, temizlik sonlandırmaz (`neondb`'de dosya kaydı yok).
22. **Kalan audit kayıtları ve yedekler:** kalıcı silmeden sonra kişisel veri içermeyen audit kayıtları (dolaylı tanımlayıcılar) ve sağlayıcı yedek/PITR kopyaları kalabilir (DATA_PRIVACY §12c; PB-03).
23. **Audit ekranı sorgu planları** büyük veri hacminde ölçülmedi (PHASE 11 — 10k seed); yeni index eklenmedi.
18. Ana senaryo (TESTING_STRATEGY §5.1, 19 adım) PHASE 09.1'de tek parça E2E olarak eklendi (Chrome + WebKit).
20. **Değiştirme ↔ karar yarışı:** personel değiştirmesi yazım aşamasındayken aynı evraka karar verilirse değiştirme sürüm çakışmasıyla reddedilir (güvenli; yeniden deneme gerekir — D-114).
19. **Otomatik statü geçişi yok (BR-61):** tüm evraklar onaylansa da personel "Evrakları Onayla" ile ilerletir; düzeltme kararları sonrası "Düzeltmeye Gönder" gerekir.
13. **Hesap başına kilitleme DoS'u** (D-068, TD-04); köken kontrolü hosting'e bağlı (D-069).
14. **İzole testler Docker gerektirir;** CI'da izole hedef yok; gerçek GitHub CI çalışması gözlemlenmedi.
15. **Ortak `neondb`'de test yan etkisi yok** (parmak izi öncesi/sonrası aynı); migration 0005 uygulandı (şema değişikliği, veri değişmedi).
16. **axe/ekran okuyucu testi yapılmadı** (PHASE 12). ESLint 10 peer uyarıları, **1 moderate bağımlılık bulgusu** (drizzle-kit → esbuild, dev), Node 24.22.3 yaması kurulmadı, **repo herkese açık**.
17. **Ekran görüntüsü yapay görüntüsü:** tam sayfa ekran görüntülerinde sabit üst bar içerik üzerine binebilir (yalnızca ekran görüntüsü yöntemi; arayüz hatası değil).

## PHASE 04 Teknik Konuları — Sonuç

| ID | Konu | Sonuç |
|---|---|---|
| **P4-01** | Kalıcı kimliği doğrulanmış test stratejisi | **RESOLVED (yerel otomatik test izolasyonu — D-077, PHASE 05 onayı)**. Neon'a özgü kapsam, GitHub CI ve production veri izolasyonu ayrı açık gereksinimler. Önceki durum: tek veritabanı + test başına kısa ömürlü oturum; gerçek hesaplara yalnızca okuma/etkisiz işlem; bypass/endpoint yok. Doğru şifreyle giriş gerçek hesaplar varken NOT VERIFIED. |
| **P4-02** | CSRF reddinin hata biçimi | **RESOLVED (D-069, Accepted):** proxy'de 403 "İstek reddedildi."; Next.js kontrolü ikinci katman olarak açık. |
| **P4-03** | Global login rate limit DoS riski | **MITIGATED (D-068, koşullu Accepted):** genel limit kaldırıldı, yalnızca bilinmeyen adlara ortak limit. **Açık:** hesap başına kilitleme DoS'u (TD-04, PHASE 13). |
| **P4-04** | HTTPS'te `Secure` cookie | **DEFERRED:** yapılandırma düzeyinde integration testli. Gerçek HTTPS tarayıcı doğrulaması sistem sertifika deposu değişikliği veya deployment gerektirdiği için yapılmadı → **PHASE 13 öncesi zorunlu** (PB-07 kapsamında). |

## Technical Debt
- Şifreleme anahtarı yeniden şifreleme (rotasyon) betiği (D-081).
- Başvuru listesinde tarih aralığı filtresi ve sıralama seçenekleri (API_CONTRACTS planı).
- `reorderServicesAction` uygulanmadı (hizmetler ada göre; D-072). İhtiyaç olursa hizmet sırası için ayrı karar.
- Hizmet listesi en fazla 100 kayıt (sayfalama yok — küçük katalog).
- Rota bazlı `no-referrer`: müşteri yollarında (PHASE 07) ve dosya route'larında (PHASE 08) uygulandı.
- Range (206) desteği ve uygulama tarafı günlük indirme göstergesi (bant genişliği cap'i için) değerlendirilebilir.
- `storage:cleanup`/`reconcile` için planlı çalıştırma (PHASE 13).
- Belirsiz yazım/eski kayıt için teknik müdahale prosedürü (tablo sahibi yetkisiyle, sağlayıcı kanıtına dayalı, audit'li) — PHASE 12/13.
- Müşteri oturumu ve token anahtarları için yedekleme/rotasyon prosedürü ve şifreleme anahtarı yeniden şifreleme betiği (D-081, TM-49).
- `tw-animate-css` yeniden eklenmedi; drawer/menü geçişleri `globals.css` keyframe'leriyle (D-070). Yeni animasyonlu bileşenlerde aynı yaklaşım.
- axe taraması için `@axe-core/playwright` değerlendirmesi (PHASE 12).

## Production Blockers
Ayrıntı: [SECURITY.md](SECURITY.md) §11.

| ID | Blocker | Geliştirmeyi engeller mi? |
|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage yok — Vercel Hobby ticari kullanıma izin vermiyor | Hayır |
| PB-02 | Depolama kapasitesi: B2 kotası hedefi 100 GB (~5 000 başvuru; OD-26 — yıllık ~10 USD bütçe; aktif değer hesap hazır olana kadar 9 GB), otomatik silme yok → birikimli; hesap ödeme/cap hazırlığı doğrulanmadı | Hayır |
| PB-03 | KVKK hukuki değerlendirmesi (aydınlatma, yurt dışı aktarım, saklama/imha politikası, VERBİS, ihlal prosedürü) | Hayır |
| PB-04 | Bearer link + OTP yok + süresiz bağlantı riski için yazılı risk kabulü | Hayır |
| PB-05 | Antivirüs olmadan PDF kabulü için yazılı risk kabulü + personel cihaz politikası | Hayır |
| PB-06 | Production ortam izolasyonu — **D-059 (tek veritabanı) ile kapsamı genişledi:** gerçek müşteri verisi girmeden önce ayrı production veritabanı veya yazılı risk kabulü (TM-43) | Hayır |
| PB-07 | Yetkilendirme ve güvenlik testlerinin geçmesi | Hayır |
| PB-08 | Seçilen ücretsiz planda yedek/geri yükleme yeteneği | Hayır |
| PB-09 | Bağımlılık taraması temiz | Hayır |
| PB-10 | Better Auth kapalı uç noktaları ve IP/UA saklamamanın testle doğrulanması | Hayır |
| PB-11 | Gerçek iletişim bilgileri ve hizmet/evrak kataloğu | Hayır |

**Geliştirmeyi engelleyen:** yok (yalnızca faz onayları). PB-01…PB-11 açık; hiçbiri çözülmüş sayılmaz. PHASE 00/01 onayları production güvenliği veya KVKK uyumluluğu onayı değildir.

## Latest Verification Results (2026-11-27, PHASE 12.1 — OD-27 sonrası)
Yalnızca yedek/geri yükleme betikleri ve dokümanlar değişti (çalışma zamanı kodu değişmedi). install, lint, typecheck, format:check, `db:check`, `db:verify` (`neondb` 21 tablo, 11 uygulanmış migration) → exit 0; unit **513/513**; izole integration **279 geçti / 10 atlandı / 0**; build + bundle (40 dosya, yasaklı ifade yok) → 0; izole E2E (retry 0) **568 / 0 / 120** (19 adımlı ana senaryo, T1–T12, A–K, R1–R7, kalıcı silme, PDF güvenliği dahil); `pnpm run audit` → 0 (1 moderate dev-only). `neondb` parmak izi aynı (audit 155, id 970); gerçek B2 mutasyonu yok; container/geçici dizin/süreç 0. Neon integration çalıştırılmadı (bekleyen 0011 — D-149).

## Previous Verification Results (2026-11-27, PHASE 12.1)
Son kod hâli; ilk başarısızlıklar gizlenmeden (ayrıntı SECURITY_AUDIT §8).

| Kapı | Exit | Geçti | Başarısız | Atlandı | Atlama / not |
|---|---|---|---|---|---|
| `install --frozen-lockfile` | 0 | — | — | — | — |
| lint / typecheck / format:check | 0 / 0 / 0 | — | — | — | — |
| `test` (unit) | 0 | 513 | 0 | 0 | — |
| `db:check` | 0 | — | — | — | 12 migration dosyası tutarlı |
| `db:verify` (`neondb`, salt okunur) | 0 | 21 tablo, **11** uygulanmış migration, TLS doğrulandı | — | — | 0011 bekliyor (onay) |
| `test:integration` (`neondb`) | 1 | 0 | — | — | **BLOCKED — beklenen:** "1 bekleyen migration"; testler Neon'a migration uygulamaz (D-149). Onay + `pnpm db:migrate` sonrası çalıştırılmalı |
| `test:integration:isolated` (varsayılan sıra) | 0 | 279 | 0 | 10 | izole DB'de gerçek hesap yok → gerçek hesap modu bloğu |
| dosya karıştırma seed 11 / 22 / 33 | 0 / 0 / 0 | 279 | 0 | 10 | aynı |
| `test:restore-drill` | 0 | envanter eşit, parmak izi farkı yok; phase121 senaryoları | — | — | sentetik, geçici container'lar — **OD-27 ile kaldırıldı** (artık kapı değil) |
| `build` / `check:bundle` | 0 / 0 | 39 dosya, yasaklı ifade yok | — | — | — |
| `test:e2e` (`neondb`, retry 0) | 0 | 287 | 0 | 401 | commit eden testler yalnızca izole (D-086) + proje kapsamı |
| `test:e2e:isolated` #1 (retry 0, son kod) | 0 | 568 | 0 | 120 | proje kapsamı (masaüstü/mobil/tek proje yeterli) |
| `test:e2e:isolated` #2 (retry 0, son kod) | 0 | 568 | 0 | 120 | aynı |
| `pnpm run audit` | 0 | — | — | — | 1 moderate (esbuild, drizzle-kit dev — SEC-10) |

**İlk başarısızlıklar (sırasıyla, hepsi kök nedeniyle giderildi):** (1) D-141 ilk tam E2E: form POST 403 — `no-referrer` altında `Origin: null` (D-146); (2) uzun token yansıtma iddiası Next.js RSC yükü nedeniyle yanlıştı (iddia belgeye çevrildi; yönlendirme ve cookie iddiaları korunur); (3) `/b/:token` başlık kuralı `/b/enter`'i de kapsıyordu (dar desen); (4) ana senaryo ve WebKit kuyruğu (eski giriş varsayımı; ~9,8 dk worker takılması) — ana senaryo yardımcıya taşındı; (5) WebKit yorum çift tıklama testi bir kez düştü (paralel integration yükü altında hidrasyon öncesi yazım — sonraki tüm koşularda geçti; ürün kodu değişmedi); (6) REVIEW-01/02/03 testleri eski kodla düştü (yeniden üretim, beklenen); (7) `b2-range` eski "yanlış versiyon iletilir" iddiası daha sıkı davranışa güncellendi; (8) GRANT negatif testi yanlıştı (PostgreSQL uyarı verir, hata değil → etki doğrulanır); (9) D-144 sonrası testlerin geçici hesap kurulumları (createUser, services, dashboard) runtime ile yazıyordu → sahip rolü; dashboard REPEATABLE READ anlık görüntüsü; (10) izole E2E #2 (ilk tur) Mobile Safari XSS testi: test kaynaklı gezinmede uçuştaki ön-getirme — D-139 beklemesi `openCustomerLink`'e eklendi (D-131 genişletilmedi). Son iki tam izole E2E bu düzeltmelerden sonra 568/0/120.

**Test sonrası:** `neondb` parmak izi başlangıçla aynı (users 2, services 3, templates 12, applications 0, files 0, sessions 0, audit 155, son id 970 `TEST_EVENT`; hesap/kota hash'leri değişmedi; hesap kayıtları son güncelleme 2026-11-24). Yetkisiz kalıcı Neon mutasyonu 0; gerçek B2 mutasyonu 0 (yalnızca salt okunur `storage:inspect`: 0 nesne). Docker container 0, geçici dizin 0, açık test süreci 0. Git index boş; commit/push yok.

## Kullanıcı İşlemleri (PHASE 12.1 — tek sıralı liste)
1. **Neon migration 0011 onayı (D-144):** değişiklik — `REVOKE INSERT, UPDATE ON users, accounts FROM cs_app_runtime; REVOKE INSERT, UPDATE, DELETE ON verifications FROM cs_app_runtime;` (veri/şema değişmez). Etki: uygulama girişi/oturum/çıkış etkilenmez (izole tam regresyon); `pnpm auth:bootstrap` / `auth:reset-password` sahip bağlantısını kullanır (zaten taşındı). Uygulama sırası (onay sonrası): parmak izi → `pnpm db:migrate` → `pnpm db:verify` (12) → `pnpm test:integration` (privileges matrisi) → `pnpm test:e2e` → parmak izi. Geri alma: `GRANT INSERT, UPDATE ON users, accounts TO cs_app_runtime; GRANT INSERT, UPDATE, DELETE ON verifications TO cs_app_runtime;` (yeni migration ile).
2. **Yeni en az yetkili B2 anahtarı** (OPERATIONS_RUNBOOK §3.1; `b2_create_key` — panel özel yetki seçtirmez) → `pnpm env:b2` → `pnpm storage:inspect` temiz → eski anahtarı silme.
3. **Checkpoint B onayı** (VERIFICATION_PLANS §1.3 — tek talep; ≤ 100 MB depolama, ≤ 100 MB egress, ≤ 500 istek, ~0 USD).
4. **B2 ödeme/cap hazırlığı** (panel) ve ardından **100 GB etkinleştirme onayı** (VERIFICATION_PLANS §1.5).
5. **Gerçek cihaz + WhatsApp** kontrol listesi (VERIFICATION_PLANS §2; ara sayfa adımı dahil).
6. **Hosting kararı** (PB-01).
7. **Hukuk/gizlilik ve saklama kararları** (PB-03; yedek saklama dahil).
8. **Risk kabulleri:** PB-04 bearer link kalan riski (ara sayfa ikinci faktör değildir), PB-05 antivirüssüz PDF, **PB-08 / PB-12 (OD-27):** uygulamaya özel yedek olmadan veri kaybı kalan riski ve sağlayıcı düzeyi geri yüklemede silinmiş veri/eski erişimin geri dönme riski (manuel değerlendirme — OPERATIONS_RUNBOOK §2; hukuki saklama yükümlülükleriyle birlikte, PB-03).
9. **D-146, D-147, D-149…D-151** kararları (özellikle D-146 `strict-origin` sapması). D-148 OD-27 ile geri çekildi.
10. **Uzak GitHub CI** çalıştırılması (commit/push kullanıcı kararı).

## Previous Verification Results (2026-11-27, PHASE 12)
Tüm kapılar son kod hâliyle; ilk başarısızlıklar gizlenmeden (ayrıntı SECURITY_AUDIT.md).

| Kapı | Exit | Geçti | Başarısız | Atlandı | Atlama nedeni |
|---|---|---|---|---|---|
| `install --frozen-lockfile` | 0 | — | — | — | — |
| lint / typecheck / format:check | 0 / 0 / 0 | — | — | — | — |
| `test` (unit) | 0 | 495 | 0 | 0 | — |
| `db:check` / `db:verify` | 0 / 0 | 21 tablo, 11 migration, TLS doğrulandı | — | — | — |
| `test:integration` (`neondb`) | 0 | 58 | 0 | 17 | gerçek hesaplar mevcut → geçici hesap yaşam döngüsü atlandı (D-067); izole-yalnız dosyalar dahil edilmez |
| `test:integration:isolated` (varsayılan sıra) | 0 | 261 | 0 | 10 | izole DB'de gerçek hesap yok → gerçek hesap modu bloğu |
| `test:integration:isolated` dosya karıştırma (seed 11/22/33) | 0 / 0 / 0 | 261 | 0 | 10 | aynı |
| `build` / `check:bundle` | 0 / 0 | 39 dosya, yasaklı ifade yok | — | — | — |
| `test:e2e` (`neondb`, retry 0) | 0 | 267 | 0 | 357 | commit eden testler yalnızca izole DB'de (D-086) + proje kapsamı |
| `test:e2e:isolated` #1 (retry 0) | 0 | 507 | 0 | 117 | proje kapsamı (masaüstü/mobil/tek proje yeterli) |
| `test:e2e:isolated` #2 (retry 0) | 0 | 507 | 0 | 117 | aynı |
| `pnpm run audit` (`--audit-level=high`) | 0 | — | — | — | 1 moderate (esbuild, drizzle-kit dev — SEC-10) |

**İlk başarısızlıklar (sırasıyla):** unit 1 (yeni drill'in audit eylemi `SYSTEM_CHECK` merkezi etiket listesinde yoktu → drill `APPLICATION_CREATED` kullanacak şekilde düzeltildi); `neondb` integration 1 (`services.test` ilk test 30 sn zaman aşımı — tekrar koşuda aynı test 1,6 sn; Neon gecikmesi/soğuk başlangıç olarak değerlendirildi, timeout artırılmadı, kök neden **kanıtlanmadı**); izole integration 1 dosya (SEC-13); izole E2E #1/#2 2'şer (320 px taşma, SEC-12) → düzeltme sonrası #1 3, #2 2 başarısız (güçlendirilmiş test 768/1024 px ve WebKit başvuru listesi taşmaları, SEC-12) → son düzeltmeler; `pnpm audit` exit 1 (yanlış çağrı: çıplak `pnpm audit` pnpm'in yerleşik komutu, seviye `low`; doğru kapı `pnpm run audit` → 0).

**Test sonrası:** `neondb` parmak izi sabit (users 2, services 3, templates 12, applications 0, audit 155, son id 970 `TEST_EVENT` korunuyor; hesap/credential kayıtları değişmedi — son güncelleme 2026-11-24; oturum 0). Docker container 0, geçici dizin 0, açık test/sunucu süreci 0. Git index boş; commit/push yok. Canlı B2 mutasyonu yok (Checkpoint B onay bekliyor); sağlayıcı ayarı değiştirilmedi.

## Previous Verification Results (2026-11-27, PHASE 11.1)
- lint, typecheck, format:check, `db:check` → exit 0. Şema değişikliği yok (11 migration, 21 tablo).
- Unit **494/494** (21 dosya). Integration (izole): **257 geçti / 10 atlandı** (+`storage-capacity` 6). Integration (`neondb`, korumalı): **58 geçti / 17 atlandı**.
- E2E (`neondb`): **267 geçti / 329 atlandı / 0 başarısız**. E2E (izole, retry 0): **#1 487/109/0; #2 487/109/0** (ilk denemede, ara hata yok).
- Build + client bundle kontrolü temiz (39 dosya). `pnpm audit --audit-level=high` temiz (1 moderate, dev — önceki).
- Aktif `.env.local` kotası: 9 GB / 8 GB (değiştirilmedi); hedef 100 / 90 GB yalnızca kod tavanı + izole testlerde doğrulandı. Sağlayıcı hesabında değişiklik yapılmadı; canlı B2 testi çalıştırılmadı.
- `neondb` parmak izi sabit (audit 155, son id 970). Açık container 0, geçici dizin 0, açık süreç 0.

## Latest Verification Results (2026-11-26, PHASE 11)
- lint, typecheck, format:check, `db:check` → exit 0; `db:migrate` (0010, yalnızca indeks) → exit 0 (`neondb` parmak izi öncesi/sonrası aynı); `db:verify` → **21 tablo, 11 migration**, TLS doğrulandı.
- Unit **487/487** (21 dosya). Integration (izole): **251 geçti / 10 atlandı** (+`file-delivery` 15). Integration (`neondb`, korumalı): **58 geçti / 17 atlandı**.
- E2E (`neondb`): **267 geçti / 325 atlandı / 0 başarısız** (parmak izi kontrolü geçti).
- E2E (izole, retry 0) — tüm tam çalıştırmalar sırasıyla: #1 başlatılamadı (webServer 240 sn zaman aşımı — eşzamanlı `pnpm audit`; 0 test koştu); #1b 475/109/**8 başarısız** (personel yükleme limiti 429 — yeni görüntüleyici testleri; `documents.spec` "Görüntüle" bağlantı varsayımı → test düzeltmeleri); #A 482/109/**1 başarısız** (WebKit gezinme iptali → D-139); #B 483/109/0; **#A2 483/109/0; #B2 483/109/0** (son iki çalıştırma tüm düzeltmelerden sonra). Hedeflenen: görüntüleyici 20/20, viewer+documents 48/48, D-139 teşhisi 0/240.
- Build (uyarısız) + client bundle kontrolü temiz (39 dosya). `pnpm audit --audit-level=high` temiz (1 moderate, dev — önceki).
- Ölçümler: `perf-results/` (yerel, gitignore) + `screenshots/phase-11/{before,after}`; ayrıntı PHASE 11 raporu ve FILE_STORAGE §7.1.
- `neondb` veri parmak izi tüm çalıştırmalar boyunca sabit (audit 155, son id 970). Açık Docker container'ı 0, geçici depolama dizini 0, açık sunucu/test süreci 0. Canlı B2 testi çalıştırılmadı.

## Previous Verification Results (2026-11-26, PHASE 10.2)
- install, lint, typecheck, format:check, `db:check` → exit 0; `db:migrate` (0009, yalnızca ekleme) → exit 0; `db:verify` → **21 tablo, 10 migration**, TLS doğrulandı.
- Unit **429/429**. Integration (izole): **236 geçti / 10 atlandı** (yeni `reconcile-safety` 7, `test-isolation` 1, yazım güvenliği +1; atlananlar gerçek hesaba özgü). Integration (`neondb`, korumalı bağlantılar + parmak izi kontrolü): **58 geçti / 17 atlandı**.
- E2E (`neondb`): **267 geçti / 305 atlandı / 0 başarısız** (parmak izi kontrolü geçti).
- E2E (izole, retry 0) — sırasıyla tüm tam çalıştırmalar: #1 463/109/0; #2 461/109/**2 başarısız** (müşteri düzenleme odak yarışı — gerçek hata, D-133 ile düzeltildi); #A (D-133 sonrası) 462/109/**1 başarısız** (tohumlama numara çakışması — test verisi hatası, düzeltildi); #B 463/109/0; **#C 463/109/0; #D 463/109/0** (son iki çalıştırma tüm düzeltmelerden sonra). Hedeflenen: WebKit oluşturma testi ×10 = 10/10; Chrome+WebKit grubu 105/9/0; iki önceki aralıklı test × 4 proje × 10 = 80/80.
- Build (uyarısız) + client bundle kontrolü temiz (30 dosya). `pnpm audit --audit-level=high` temiz (1 moderate, dev — önceki).
- `neondb` veri parmak izi tüm çalıştırmalar boyunca sabit: `users 2, accounts c4a8, gerçek oturum 0, services 3, şablon 12, başvuru 0, token 0, dosya 0, audit 155` (en son audit kaydı hâlâ id 970 — yeni kalıcı test yazımı 0). Açık Docker container'ı 0, geçici depolama dizini 0. Canlı B2 smoke testi çalıştırılmadı.

## Next Phase
**PHASE 13** — başlatılmadı; yalnızca kullanıcı onayıyla. Ön koşullar: yukarıdaki "Kullanıcı İşlemleri" (özellikle Neon 0011, yeni B2 anahtarı + Checkpoint B, hosting kararı), PB-01…PB-13 açık. Production NO-GO.

### Önceki "Next Phase" notu (PHASE 12)
**PHASE 13 — Production Readiness / Deployment** — kullanıcı açıkça onaylamadan başlanmaz. Ön koşullar (kullanıcı): hosting kararı (PB-01), en az yetkili B2 anahtarı + Checkpoint B onayı (PB-13), ödeme/cap hazırlığı (PB-02), yedek politikası (PB-08/PB-12), KVKK değerlendirmesi (PB-03), yazılı risk kabulleri (PB-04, PB-05), D-141/D-144 kararları, gerçek cihaz kontrol listesi.
