# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-25** (PHASE 08 sonu)

## Current Phase
**PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage**
Phase Status: **COMPLETED (geliştirme) — kullanıcı onayı bekleniyor** (OD-25 kullanıcı kararı; D-096…D-107 Proposed). Canlı B2 doğrulaması kullanıcının `pnpm env:b2` + `pnpm storage:verify` çalıştırmasına bağlı (**NOT VERIFIED**).

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24.
- PHASE 01 — Project Initialization — Product Owner onayı 2026-11-24.
- PHASE 02 — Database Foundation — Product Owner onayı 2026-11-24 (D-052…D-058 Accepted; D-059 tek veritabanı).
- PHASE 03 — Authentication & Equal Staff Access — Product Owner onayı 2026-11-24 (D-060…D-064, D-066 Accepted; D-065 koşullu). Gerçek ADMIN ve EMPLOYEE hesapları oluşturuldu.
- PHASE 04 — Dashboard Foundation — Product Owner onayı 2026-11-24 (D-069…D-071 Accepted; D-067, D-068 koşullu Accepted; D-063, D-065 Partially Superseded). P4-01 PARTIAL, P4-03 MITIGATED, P4-04 DEFERRED.

- PHASE 05 — Service & Document Template Management — Product Owner onayı 2026-11-24 (D-072…D-077 Accepted; P4-01 yerel test izolasyonu açısından RESOLVED).
- PHASE 06 — Customer & Application Management — Product Owner onayı 2026-11-25 (D-078…D-080, D-082…D-086 Accepted; D-081 koşullu).
- PHASE 07 — Customer Portal — Product Owner onayı 2026-11-25 (D-088…D-092, D-094, D-095 Accepted; D-087, D-093 koşullu Accepted — hosting log redaksiyonu, tarayıcı geçmişi, WhatsApp önizleme, edge koruması, gerçek cihaz/in-app testleri, HTTPS `Secure` cookie, anahtar yedekleme/rotasyon ve PB'ler açık; D-081 koşullu kalır). TM-40 görüntüleme izolasyonu doğrulandı.

> Faz onayları production güvenliği veya KVKK uyumluluğu onayı değildir; PB-01…PB-11 açıktır.

## Project Status
PDF yükleme ve Backblaze B2 private depolama uygulandı (PHASE 08): müşteri ve personel (müşteri adına, `UNDER_REVIEW` dahil) PDF yükleme/değiştirme; ham PDF gövdesiyle kimlik doğrulamalı Route Handler'lar (proxy dışı); izole worker'da yapısal PDF doğrulaması (pdf.js + nesne düzeyi aktif içerik taraması — antivirüs değildir); SHA-256; rezervasyon → B2 → aktivasyon yaşam döngüsü ve hata kurtarma; tek aktif PDF + versiyon geçmişi; onay geçersizleştirme; atomik 9 GB kota (8 GB uyarı); yetkili görüntüleme/indirme (personel geçmiş, müşteri yalnızca ACTIVE); gerçek yükleme ilerlemesi; dashboard kapasite kartı; `pnpm env:b2`, `storage:verify`, `storage:reconcile`, `storage:cleanup`; migration 0005. İncelemeye gönderme/inceleme (PHASE 09), kaldırma (PHASE 09), başvuru silme (PHASE 10), deployment **yok**. Commit/push yapılmadı.

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
- Veritabanı: Neon Free, Frankfurt, PostgreSQL 18.7, tek veritabanı `neondb` (D-059); **6 migration, 18 tablo** (0005: `storage_quota_state`, `storage_version_id`, token FK'leri CASCADE).
- Depolama: Backblaze B2 private bucket `cs-global-documents` (EU Central, SSE-B2; OD-25) — uygulama bağlantısı **henüz yapılandırılmadı** (`.env.local`'da B2 anahtarı yok).

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-01…OD-24 ACCEPTED (Product Owner, 2026-11-24); **OD-25 — Backblaze B2** ACCEPTED (kullanıcı kararı, 2026-11-25) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

D-042…D-058, D-060…D-064, D-066, D-069…D-080, D-082…D-086, D-088…D-092, D-094, D-095 **Accepted**; D-067, D-068, D-081, D-087, D-093 **Conditionally Accepted**; D-063, D-065, D-035 **Partially Superseded**; D-017, D-040 **Superseded** (OD-25). PHASE 08 kararları **D-096…D-107 Proposed** (kullanıcı onayı bekliyor).

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
| TD-10 | Teknik temizlik zamanlaması | **Kısmen (D-105):** `pnpm storage:cleanup`/`reconcile` CLI (varsayılan dry-run); ücretli cron yok. Planlı çalıştırma hosting seçiminde | PHASE 10 / 13 |
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
1. **Canlı Backblaze B2 doğrulaması yapılmadı:** `.env.local`'da B2 anahtarı yok (kullanıcı `pnpm env:b2` ile girecek; sohbette istenmedi). Gerçek API erişimi, anahtar yetkileri, SSE-B2 yanıtı, versiyon kimliği, ETag=MD5, imzasız erişim reddi, Object Lock/replikasyon durumu **NOT VERIFIED**. Uygulamada B2 yapılandırılana kadar dosya işlemleri "şu anda işlenemiyor" (503) döner; diğer işlevler çalışır. Tüm otomatik testler yerel private adapter ile.
2. **Gerçek cihaz testi yapılmadı:** iOS Safari, Android Chrome, WhatsApp in-app — dosya seçici, yükleme, satır içi PDF görüntüleme ve PHASE 07 cookie davranışı (ROADMAP DoD maddeleri **karşılanmadı**). Yalnızca Playwright Chrome/WebKit + mobil emülasyon.
3. **Yapısal doğrulama antivirüs değildir** (OD-07, PB-05); gerçek belge setiyle (tarayıcı "PDF olarak kaydet", tarama uygulamaları, ofis çıktıları) yanlış pozitif oranı ölçülmedi (PHASE 12). Ad taraması içerik akışlarını taramaz (nesne değildir); pdf.js bozuk xref'leri onarabildiği için zarf kontrolü ayrıca yapılır.
4. **Kaldırma (BR-44 "kaldır", `REMOVED`) uygulanmadı** — PHASE 09. **Başvuru silmenin storage aşaması** PHASE 10 (başvuru silme henüz yok).
5. **Teknik temizlik elle:** `pnpm storage:cleanup --apply` / `storage:reconcile --apply` zamanlanmadı (ücretli cron yok; TD-10). Yarım yüklemelerin nesneleri temizlik çalıştırılana kadar kotada sayılır.
6. **Range desteği yok:** görüntülemede dosya her açılışta tam indirilir (≤ 10 MiB) — günlük 1 GB indirme cap'i için ~100 tam görüntüleme/gün. Uygulama tarafı günlük indirme göstergesi yok.
7. **Cap aşımındaki gerçek S3 hata kodu** belgelerde yok; sınıflandırma 403+cap/limit ve 429 üzerinden (canlı doğrulanmadı).
8. **Eşzamanlılık/kuyruk süreç başına** (bellek içi sayaç — yalnızca kaynak koruması, güvenlik limiti değil); çoklu instance'ta instance başına 4. Rate limitler Postgres'te (aktör başına).
9. **Aynı tarayıcıda tek etkin başvuru paneli (D-090)**; TM-40 dosya kısmı çözüldü, **gönderim kısmı açık** (PHASE 09).
10. **`/b` için IP rate limit yok** (TD-04, D-093) — PHASE 13. **HTTPS `__Host-`/`Secure` cookie** gerçek tarayıcıda doğrulanmadı.
11. **Anahtar yedekleme/rotasyon prosedürü yok** (token anahtarları, `CUSTOMER_SESSION_SECRET`, B2 anahtarı — TM-48, TM-49, TM-51; D-081 koşulu) — PHASE 13 öncesi zorunlu.
12. **Müşteri yorumları gösterilmiyor** (PHASE 09). Arama sayfa yenilenince sıfırlanır (D-085); iç notlar yok.
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
- `storage:cleanup`/`reconcile` için planlı çalıştırma (PHASE 10/13).
- Müşteri oturumu ve token anahtarları için yedekleme/rotasyon prosedürü ve şifreleme anahtarı yeniden şifreleme betiği (D-081, TM-49).
- `tw-animate-css` yeniden eklenmedi; drawer/menü geçişleri `globals.css` keyframe'leriyle (D-070). Yeni animasyonlu bileşenlerde aynı yaklaşım.
- axe taraması için `@axe-core/playwright` değerlendirmesi (PHASE 12).

## Production Blockers
Ayrıntı: [SECURITY.md](SECURITY.md) §11.

| ID | Blocker | Geliştirmeyi engeller mi? |
|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage yok — Vercel Hobby ticari kullanıma izin vermiyor | Hayır |
| PB-02 | Depolama kapasitesi: B2 ücretsiz 10 GB, uygulama kotası 9 GB (~450 başvuru), otomatik silme yok → birikimli | Hayır |
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

## Latest Verification Results (2026-11-25, PHASE 08)
- `install --frozen-lockfile`, lint, typecheck, format:check, `db:check` → exit 0; `db:verify` → **18 tablo, 6 migration**, TLS doğrulandı.
- Unit **310/310** (yeni: PDF doğrulama 25, dosya/depolama 51).
- Integration (`neondb`, salt okunur/geri alınan): 58 geçti / 17 atlandı. Integration (izole Docker): **153 geçti / 10 atlandı** (yeni `documents.test.ts` 23 test; atlananlar gerçek hesaba özgü).
- E2E (izole): **425 geçti / 99 atlandı / 0 başarısız** (yeni `documents.spec.ts` 7 × 4 proje = 28); atlananlar proje/genişlik kapsamı. E2E (`neondb`, salt okunur): **267 geçti / 257 atlandı / 0 başarısız** (izole-mutasyon testleri, şifreyle giriş, proje/genişlik kapsamı).
- Canary build (13 canary secret değeri — B2 dahil) + client bundle kontrolü (28 dosya) temiz; build uyarısız.
- `pnpm audit --audit-level=high` temiz (1 moderate, dev — önceki fazlardan).
- `pnpm storage:verify`: **çalıştırılmadı** (B2 anahtarı yok — NOT VERIFIED).
- `neondb` parmak izi (2 hesap + credential özeti, gerçek oturum 0, 3 hizmet, 12 şablon evrak, başvuru 0, token 0, dosya 0, audit 154) migration ve tüm testler öncesi/sonrası **aynı**. Artık Docker container'ı ve geçici depolama kökü yok.

## Next Phase
**PHASE 09 — Document Review & Application Workflow** — kullanıcı açıkça onaylamadan başlanmaz.
