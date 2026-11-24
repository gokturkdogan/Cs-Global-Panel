# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24** (PHASE 04 sonu)

## Current Phase
**PHASE 04 — Dashboard Foundation**
Phase Status: **COMPLETED — kullanıcı onayı bekleniyor**. PHASE 05'e onaysız geçilmez.

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24.
- PHASE 01 — Project Initialization — Product Owner onayı 2026-11-24.
- PHASE 02 — Database Foundation — Product Owner onayı 2026-11-24 (D-052…D-058 Accepted; D-059 tek veritabanı).
- PHASE 03 — Authentication & Equal Staff Access — Product Owner onayı 2026-11-24 (D-060…D-064, D-066 Accepted; D-065 koşullu). Gerçek ADMIN ve EMPLOYEE hesapları oluşturuldu.

> Faz onayları production güvenliği veya KVKK uyumluluğu onayı değildir; PB-01…PB-11 açıktır.

## Project Status
Şirket paneli temeli uygulandı: ortak düzen (sidebar, mobil drawer, header, konum yolu, hesap menüsü, çıkış), gerçek veritabanından Genel Bakış (4 sayaç, son 5 başvuru, inceleme kuyruğu), boş/hata/yükleniyor durumları, hazır olmayan modüller için bilgilendirme sayfaları. İki hesap birebir aynı arayüzü görür (OD-24). Kimliği doğrulanmış testler gerçek hesaplar varken de çalışır (D-067). CSRF reddi kontrollü 403 (D-069). Genel giriş limiti kaldırıldı, bilinmeyen kullanıcı adı limiti eklendi (D-068). Başvuru oluşturma, hizmet yönetimi, müşteri paneli, storage, deployment **yok**. Commit/push yapılmadı.

## Implemented Features
Altyapı:
- PHASE 01: Next.js 16.4.6, TypeScript 6.0.3 strict, Tailwind 4, shadcn/ui, tasarım token'ları, env doğrulaması, güvenlik header'ları, Vitest/Playwright, CI.
- PHASE 02: Drizzle ORM + pg; 17 tablo; en az yetkili `cs_app_runtime`; append-only audit; `db:*` CLI; demo seed.
- PHASE 03: Better Auth 1.7.27 (username plugin; HTTP route'u yok — D-060); iki hesap modeli (migration 0003 — D-061); `pnpm auth:bootstrap` / `pnpm auth:reset-password` (D-062); ortak `requireStaff()`; giriş rate limiting (D-063); nonce'lu CSP + dinamik render (D-064); ortak giriş ekranı `/login`; korumalı `/dashboard` placeholder; çıkış; auth audit event'leri.
- PHASE 04: `/dashboard` düzeni ve Genel Bakış (D-070); `/dashboard/applications`, `/services`, `/audit-logs` bilgilendirme sayfaları; panel içi 404; proxy köken kontrolü (D-069); bilinmeyen kullanıcı adı rate limiti (D-068); test oturumu altyapısı (D-067); CSP nonce'lu kaydırma kilidi (D-071).
- Veritabanı: Neon Free, Frankfurt, PostgreSQL 18.7, tek veritabanı `neondb` (D-059); 4 migration.

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-01…OD-23: **23/23 ACCEPTED** (Product Owner, 2026-11-24) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

D-042…D-058 **Accepted**. D-060…D-064 ve D-066 **Accepted**; D-065 **Conditionally Accepted** (koşulu karşılamak için D-067 önerildi). PHASE 04 kararları **D-067…D-071 Proposed** (kullanıcı onayı bekliyor). Ürün kararı OD-24 ACCEPTED.

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
1. **Gerçek hesaplar varken doğrulanamayanlar (D-067):** doğru şifreyle giriş (Set-Cookie dahil), bootstrap'ın hesap oluşturması, şifre sıfırlamanın etkisi — yalnızca hesap yokken (PHASE 03) doğrulandı. Diğer tüm oturum davranışları test oturumlarıyla sürekli doğrulanıyor.
2. **Hesap başına kilitleme DoS'u (D-068 kalan risk):** kullanıcı adını bilen saldırgan 10 denemeyle o hesabın girişini 15 dk engelleyebilir; IP bazlı limit yok (TD-04, PHASE 13). Bilinmeyen-ad limiti doluyken sınırlı kullanıcı adı tespiti mümkün (aday başına 11 istek).
3. **Ani yük:** Pool en fazla 5 bağlantı; çok sayıda eşzamanlı giriş isteğinde bağlantı bekleme 10 sn'yi aşarsa giriş "şu anda yapılamıyor" ile reddedilir (fail-closed). Yük testi PHASE 12.
4. **`Secure` cookie:** yapılandırma düzeyinde testli; gerçek HTTPS tarayıcı doğrulaması yapılmadı (P4-04 → PHASE 13).
5. **Köken kontrolü hosting'e bağlı:** `X-Forwarded-Host`/`Host` davranışı hosting seçiminde doğrulanmalı (D-069).
6. **Test kayıtları:** testlerin audit kayıtları değiştirilemez olduğu için kalır; gerçek hesaplar varken çıkış E2E testi gerçek hesap kimliğiyle `USER_LOGOUT` yazar (tek projede).
7. **Panel veri hatası durumu** E2E ile değil unit + integration ile doğrulandı (paylaşılan veritabanında yetki geri alma riskli). **axe taraması** yapılmadı (paket yok — PHASE 12).
8. **ESLint 10 peer uyarıları (D-042)** sürüyor.
9. **Bağımlılık taraması:** 1 moderate (GHSA-67mh-4wv8-2f99, esbuild ≤0.24.2, drizzle-kit zinciri; runtime'da yüklenmez). Yüksek/kritik yok.
10. **Node.js yaması:** yerel 24.22.1; 24.22.3 güvenlik sürümü (kurulmadı).
11. **Repo herkese açık.** Private yapılması önerilir.
12. Integration testleri CI'da çalışmaz (veritabanı secret'ı yok); CI'daki E2E'de oturum gerektiren testler "no-database" gerekçesiyle atlanır. Gerçek GitHub CI çalışması gözlemlenmedi (push yok).

## PHASE 04 Teknik Konuları — Sonuç

| ID | Konu | Sonuç |
|---|---|---|
| **P4-01** | Kalıcı kimliği doğrulanmış test stratejisi | **Çözüldü (D-067, Proposed):** tek veritabanı + test başına kısa ömürlü oturum; gerçek hesaplara yalnızca okuma/etkisiz işlem; bypass/endpoint yok. Doğru şifreyle giriş gerçek hesaplar varken NOT VERIFIED. |
| **P4-02** | CSRF reddinin hata biçimi | **Çözüldü (D-069, Proposed):** proxy'de 403 "İstek reddedildi."; Next.js kontrolü ikinci katman olarak açık. |
| **P4-03** | Global login rate limit DoS riski | **Azaltıldı (D-068, Proposed):** genel limit kaldırıldı, yalnızca bilinmeyen adlara ortak limit. **Açık:** hesap başına kilitleme DoS'u (TD-04, PHASE 13). |
| **P4-04** | HTTPS'te `Secure` cookie | **Kısmen:** yapılandırma düzeyinde integration testli. Gerçek HTTPS tarayıcı doğrulaması sistem sertifika deposu değişikliği veya deployment gerektirdiği için yapılmadı → **PHASE 13 öncesi zorunlu** (PB-07 kapsamında). |

## Technical Debt
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

## Latest Verification Results (2026-11-24, PHASE 04)
Gerçek hesaplar mevcutken, tek veritabanında: lint, typecheck, format:check temiz; unit 118/118; db:check temiz; integration 89 geçti / 12 atlandı (geçici hesaplı yaşam döngüsü testleri — gerçek hesaplar varken bilinçli); canary build + client bundle kontrolü temiz; E2E 179 geçti / 69 atlandı (24 şifreyle giriş testi — gerçek hesaplar; diğerleri proje/genişlik kapsamı); `pnpm run audit` (high) temiz (1 moderate). `pnpm install --frozen-lockfile` ve `pnpm db:verify` (17 tablo, 4 migration, TLS doğrulandı) temiz. Development (`next dev`) ve production (`next start`) smoke: `/login` 200, oturumsuz `/dashboard*` → `/login`, `/api/auth/*` 404, sahte/eksik Origin'li POST 403, `no-store`. Test sonrası: `test-session-*` oturumu 0, başvuru 0, yalnızca 3 demo hizmet, 2 hesap.

## Next Phase
**PHASE 05 — Service & Document Template Management** — kullanıcı açıkça onaylamadan başlanmaz.
