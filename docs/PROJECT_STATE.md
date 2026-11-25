# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24** (PHASE 06 sonu)

## Current Phase
**PHASE 06 — Customer & Application Management**
Phase Status: **COMPLETED — kullanıcı onayı bekleniyor**. PHASE 07'ye onaysız geçilmez.

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24.
- PHASE 01 — Project Initialization — Product Owner onayı 2026-11-24.
- PHASE 02 — Database Foundation — Product Owner onayı 2026-11-24 (D-052…D-058 Accepted; D-059 tek veritabanı).
- PHASE 03 — Authentication & Equal Staff Access — Product Owner onayı 2026-11-24 (D-060…D-064, D-066 Accepted; D-065 koşullu). Gerçek ADMIN ve EMPLOYEE hesapları oluşturuldu.
- PHASE 04 — Dashboard Foundation — Product Owner onayı 2026-11-24 (D-069…D-071 Accepted; D-067, D-068 koşullu Accepted; D-063, D-065 Partially Superseded). P4-01 PARTIAL, P4-03 MITIGATED, P4-04 DEFERRED.

- PHASE 05 — Service & Document Template Management — Product Owner onayı 2026-11-24 (D-072…D-077 Accepted; P4-01 yerel test izolasyonu açısından RESOLVED).

> Faz onayları production güvenliği veya KVKK uyumluluğu onayı değildir; PB-01…PB-11 açıktır.

## Project Status
Başvuru yönetimi uygulandı (PHASE 06): atomik başvuru oluşturma (müşteri bilgileri, aktif hizmet, sunucu doğrulamalı evrak önizlemesi, yıllık sayaçla benzersiz numara, snapshot, ilk statü geçmişi, müşteri bağlantı token'ı, audit — tek transaction), liste (URL dışı arama, durum/hizmet filtresi, sayfalama), detay, müşteri bilgisi düzenleme (optimistic lock), bağlantı göster/kopyala/yenile/iptal/yeniden oluştur, kişiselleştirilmiş WhatsApp mesajı hazırlığı (otomatik gönderim yok), dashboard bağlantıları. Token: 256 bit CSPRNG, HMAC-SHA256 hash, AES-256-GCM kopya. Müşteri paneli (`/b/TOKEN`), müşteri oturumu, PDF/storage, statü geçişleri, deployment **yok**. Commit/push bu fazda yapılmadı.

## Implemented Features
Altyapı:
- PHASE 01: Next.js 16.4.6, TypeScript 6.0.3 strict, Tailwind 4, shadcn/ui, tasarım token'ları, env doğrulaması, güvenlik header'ları, Vitest/Playwright, CI.
- PHASE 02: Drizzle ORM + pg; 17 tablo; en az yetkili `cs_app_runtime`; append-only audit; `db:*` CLI; demo seed.
- PHASE 03: Better Auth 1.7.27 (username plugin; HTTP route'u yok — D-060); iki hesap modeli (migration 0003 — D-061); `pnpm auth:bootstrap` / `pnpm auth:reset-password` (D-062); ortak `requireStaff()`; giriş rate limiting (D-063); nonce'lu CSP + dinamik render (D-064); ortak giriş ekranı `/login`; korumalı `/dashboard` placeholder; çıkış; auth audit event'leri.
- PHASE 04: `/dashboard` düzeni ve Genel Bakış (D-070); `/dashboard/applications`, `/services`, `/audit-logs` bilgilendirme sayfaları; panel içi 404; proxy köken kontrolü (D-069); bilinmeyen kullanıcı adı rate limiti (D-068); test oturumu altyapısı (D-067); CSP nonce'lu kaydırma kilidi (D-071).
- PHASE 05: `/dashboard/services` (liste, arama, filtre), `/new`, `/[serviceId]` (genel bilgiler, durum, sabit dosya kuralları, evrak gereksinimleri); 7 Server Action; migration 0004 (`version` kolonları — D-074); ConfirmDialog, FormField, Textarea; izole test ortamı (`pnpm test:integration:isolated`, `pnpm test:e2e:isolated` — D-077).
- PHASE 06: `/dashboard/applications` (liste), `/new` (oluşturma + başarı ekranı), `/[applicationId]` (özet, müşteri bilgileri, bağlantı yönetimi, evrak snapshot'ı, geçmiş); 8 Server Action; `src/server/access-tokens/crypto.ts`; `getAccessTokenEnv()`; `pnpm env:token-keys`; `libphonenumber-js` 1.13.17.
- Veritabanı: Neon Free, Frankfurt, PostgreSQL 18.7, tek veritabanı `neondb` (D-059); 5 migration (PHASE 06'da şema değişikliği yok).

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-01…OD-23: **23/23 ACCEPTED** (Product Owner, 2026-11-24) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

D-042…D-058, D-060…D-064, D-066, D-069…D-077 **Accepted**; D-067 ve D-068 **Conditionally Accepted**; D-063 ve D-065 **Partially Superseded**. PHASE 06 kararları **D-078…D-086 Proposed** (kullanıcı onayı bekliyor). Ürün kararı OD-24 ACCEPTED.

| ID | Konu | Öneri | Gerekli faz |
|---|---|---|---|
| ~~TD-01~~ | D-002 — TypeScript sürümü | **Çözüldü:** 6.0.3 — Accepted, kuruldu | PHASE 01 |
| ~~TD-02~~ | D-004 — pnpm sürümü | **Çözüldü:** 10.34.9 — Accepted, `packageManager` ile sabit | PHASE 01 |
| ~~TD-03~~ | Better Auth uç noktalarını kapatma | **Çözüldü (D-060):** HTTP route'u bağlanmaz; 11 yol 404 (E2E) | PHASE 03 |
| TD-04 | Hosting'de güvenilir istemci IP header'ı (IP bazlı giriş limiti için) | UA'nın yazılmaması PHASE 03'te doğrulandı; IP header'ı ve IP bazlı limit hosting seçiminde | PHASE 13 |
| ~~TD-05~~ | Personel e-posta alanı | **Çözüldü (D-061):** `<id>@staff.invalid`, CHECK ile zorunlu | PHASE 03 |
| TD-06 | PDF parser kütüphanesi | Bakımı süren, kaynak sınırlamaya izin veren, uygun lisanslı kütüphane; gerekçeli seçim | PHASE 08 |
| TD-07 | Production hosting / DB / storage sağlayıcısı | DEPLOYMENT §6.3 kriterleriyle değerlendirme | PHASE 13 (PB-01) |
| TD-08 | `pg` pool ayarları ve Neon PgBouncer kısıtları | PHASE 02'de doğrulama | PHASE 02 |
| TD-09 | Neon `pg_trgm` desteği | Yoksa prefix arama yedeği | PHASE 02 |
| TD-10 | Teknik temizlik zamanlaması (Vercel Hobby cron günde 1; Cron Jobs → Schedules geçişi; başka hosting'de karşılığı) | Günlük cron + istek anında fırsatçı temizlik | PHASE 08 / 13 |
| TD-11 | Vercel Blob client upload API ayrıntıları (`maximumSizeInBytes`, `validUntil`, ilerleme callback'i, CSP upload host'u) | SDK referansıyla doğrulama | PHASE 08 |
| TD-12 | Tarayıcı bazında güvenli inline PDF görüntüleme vs indirme | Gerçek cihaz testleriyle karar | PHASE 08 |

## Pending Implementation Inputs (Product Owner'dan beklenen)
1. Gerçek şirket telefon numarası ve WhatsApp iletişim bağlantısı (OD-14) — sağlanana kadar placeholder.
2. Gerçek hizmet kataloğu ve hizmet bazlı evrak listeleri (demo veriler resmî gereksinim değildir).
3. Gerçek şirket logosu (OD-15) — sağlanana kadar metin logo.
4. KVKK aydınlatma metni (hukuki süreç sonrası).
5. Production hosting kararı için değerlendirme sonuçlarına onay (TD-07).

## Known Issues
1. **Müşteri tarafı doğrulanmadı:** bağlantılar oluşturuluyor ama `/b/TOKEN` ve müşteri oturumu PHASE 07'de; iptal/yenilemenin müşteri erişimini HTTP üzerinden kapattığı PHASE 07 E2E'siyle doğrulanacak. Ekranlarda "gerçek müşterilerle paylaşmayın" uyarısı var.
2. **Token anahtarı yedekleme ve şifreleme anahtarı rotasyon betiği yok** (TM-48) — PHASE 13 öncesi zorunlu. Yerel `.env.local`'da token anahtarları `pnpm env:token-keys` ile oluşturuldu; silinir/değişirse yerel bağlantılar çözülemez.
3. **Arama sayfa yenilenince sıfırlanır** (arama metni bilinçli olarak URL'de değil — D-085). Tarih aralığı filtresi ve `sort` parametresi bu fazda yok.
4. **İç notlar ve başvuru silme** PHASE 06 talimatı dışında bırakıldı (roadmap'teki ilgili maddeler sonraki faza).
5. **Hesap başına kilitleme DoS'u ve kullanıcı adı tespiti (D-068 — açık):** IP bazlı limit yok (TD-04).
6. **`Secure` cookie (P4-04 — DEFERRED)**, **köken kontrolü hosting'e bağlı** (D-069).
7. **İzole testler Docker gerektirir;** CI'da izole hedef ve veritabanı yok → integration ve oturum/mutasyon E2E'si CI'da çalışmaz. Gerçek GitHub CI çalışması gözlemlenmedi. Neon'a özgü test kapsamı ayrı gereksinim.
8. **Ortak `neondb`'de test yan etkisi kalmadı:** PHASE 06'dan itibaren `pnpm test:integration` ve `pnpm test:e2e` ortak veritabanına kalıcı yazmaz (parmak izi + audit sayısı test öncesi/sonrası aynı). Önceki fazlardan kalan sentetik `SYSTEM` audit kayıtları ve gerçek hesap adına `USER_LOGOUT` test kayıtları silinemez.
9. **Kaydedilmemiş değişiklik uyarısı** uygulama içi gezinmede yalnızca görünür gösterge (D-073).
10. **axe taraması, gerçek cihaz ve ekran okuyucu testi yapılmadı** (PHASE 12).
11. **ESLint 10 peer uyarıları**, **1 moderate bağımlılık bulgusu** (drizzle-kit → esbuild), **Node 24.22.3 yaması kurulmadı**, **repo herkese açık**.

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
- Rota bazlı `no-referrer` header'ı müşteri yollarıyla birlikte (PHASE 07/08).
- `tw-animate-css` yeniden eklenmedi; drawer/menü geçişleri `globals.css` keyframe'leriyle (D-070). Yeni animasyonlu bileşenlerde aynı yaklaşım.
- axe taraması için `@axe-core/playwright` değerlendirmesi (PHASE 12).

## Production Blockers
Ayrıntı: [SECURITY.md](SECURITY.md) §11.

| ID | Blocker | Geliştirmeyi engeller mi? |
|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage yok — Vercel Hobby ticari kullanıma izin vermiyor | Hayır |
| PB-02 | Vercel Blob Hobby 1 GB kapasite (~50 başvuru) | Hayır |
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

## Latest Verification Results (2026-11-24, PHASE 06)
- `install --frozen-lockfile`, lint, typecheck, format:check, `db:check` → exit 0; `db:verify` → 17 tablo, 5 migration, TLS doğrulandı.
- Unit 203/203.
- Integration (`neondb`, yalnızca salt okunur/geri alınan dosyalar): 58 geçti / 17 atlandı. Integration (izole): 124 geçti / 10 atlandı (gerçek hesaba özgü).
- Canary build (5 canary secret dahil token anahtarları) + client bundle kontrolü (25 dosya) temiz.
- E2E (`neondb`, salt okunur): 243 geçti / 153 atlandı (53 izole-mutasyon, 24 şifreyle giriş, kalanı proje/genişlik kapsamı). E2E (izole): 315 geçti / 81 atlandı (yalnızca proje/genişlik kapsamı). İki koşuda kararlı.
- `pnpm run audit` (high) temiz (1 moderate).
- `neondb` parmak izleri (hesap+credential, hizmet, evrak, başvuru 0, token 0, sayaç 0, şablon audit 0, toplam audit 154) tüm testler öncesi/sonrası **aynı**.

## Next Phase
**PHASE 07 — Customer Portal** — kullanıcı açıkça onaylamadan başlanmaz.
