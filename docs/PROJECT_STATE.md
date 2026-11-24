# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24** (PHASE 02 sonu)

## Current Phase
**PHASE 02 — Database Foundation**
Phase Status: **COMPLETED — kullanıcı onayı bekleniyor** (PHASE 03'e onaysız geçilmez)

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24.
- PHASE 01 — Project Initialization — Product Owner onayı 2026-11-24 (D-042…D-051 Accepted).

> Faz onayları production güvenliği veya KVKK uyumluluğu onayı değildir; PB-01…PB-11 açıktır.

## Project Status
Veritabanı altyapısı kuruldu ve gerçek Neon veritabanında doğrulandı. Kimlik doğrulama, şirket paneli, müşteri paneli, storage, deployment **yok**. Gerçek müşteri kullanımına hazır değildir. Commit/push yapılmadı.

## Implemented Features
Ürün özelliği yok. Altyapı:
- PHASE 01: Next.js 16.4.6, TypeScript 6.0.3 strict, Tailwind 4, shadcn/ui, tasarım token'ları, env doğrulaması, güvenlik header'ları, Vitest/Playwright, CI.
- PHASE 02: Drizzle ORM 0.45.4 + pg 8.23.1 + Drizzle Kit 0.31.11; 17 tablo (DATABASE_SCHEMA); 3 migration; en az yetkili `cs_app_runtime` rolü; audit append-only trigger'ları; lazy Pool (`getDb()`); `db:*` CLI; demo seed; 71 integration testi; canary bundle kontrolü.
- Veritabanı: Neon Free, Frankfurt (`aws-eu-central-1`), PostgreSQL 18.7, **tek veritabanı `neondb`** (D-059).

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-01…OD-23: **23/23 ACCEPTED** (Product Owner, 2026-11-24) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

D-042…D-051 **Accepted** (2026-11-24). PHASE 02 kararları DECISION_LOG'da (Proposed).

| ID | Konu | Öneri | Gerekli faz |
|---|---|---|---|
| ~~TD-01~~ | D-002 — TypeScript sürümü | **Çözüldü:** 6.0.3 — Accepted, kuruldu | PHASE 01 |
| ~~TD-02~~ | D-004 — pnpm sürümü | **Çözüldü:** 10.34.9 — Accepted, `packageManager` ile sabit | PHASE 01 |
| TD-03 | Better Auth `disabledPaths` / `hooks.before`'un `auth.api` sunucu çağrılarına etkisi; admin uç noktalarını HTTP'den kapatma yöntemi; admin ile kullanıcı adı güncelleme yöntemi | Test ile doğrulanacak; başarısızsa alternatif: kapalı uç noktalar için `hooks.before` + request varlığı kontrolü | PHASE 03 |
| TD-04 | Better Auth user-agent'ın yazılmaması (session hook) ve hosting'de güvenilir istemci IP header'ı | Hook + DB CHECK; IP header PHASE 03'te doğrulanır | PHASE 03 |
| TD-05 | Personel e-posta alanı (Better Auth zorunlu; e-posta gönderimi yok) | İsteğe bağlı gerçek e-posta; boş bırakılırsa yönlendirilemeyen `<username>@staff.invalid` (RFC 2606 `.invalid`) — veri minimizasyonu | PHASE 03 |
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
1. **Owner veritabanı şifresi sohbete yazıldı (2026-11-24).** `neondb_owner` şifresi Neon'da sıfırlanmalı ve `.env.local`'daki `DATABASE_URL_UNPOOLED` güncellenmelidir (kullanıcı adımı). Runtime (`cs_app_runtime`) şifresi yerelde üretildi, hiçbir yerde gösterilmedi.
2. **ESLint 10 peer uyarıları (D-042)** sürüyor.
3. **Bağımlılık taraması:** 1 moderate (GHSA-67mh-4wv8-2f99, esbuild ≤0.24.2 dev sunucusu CORS) — `drizzle-kit → @esbuild-kit/esm-loader (deprecated) → @esbuild-kit/core-utils → esbuild 0.18.20`. Yalnızca dev aracı; ilgili kod esbuild `serve` API'sini çağırmıyor. Override uygulanmadı. Runtime (`--prod`): açık yok.
4. **Node.js yaması:** yerel 24.22.1; 24.22.3 güvenlik sürümü (kurulmadı — kullanıcı kararı).
5. **Repo herkese açık** (2026-11-24 itibarıyla). Private yapılması önerilir.
6. Integration testleri CI'da çalışmaz (veritabanı secret'ı yok); yerelde çalıştırılır.
7. Tek veritabanı (D-059): testlerin audit satırları veritabanında kalır (değiştirilemez); şu an 2 satır.

## Technical Debt
- Nonce'lu CSP, rota bazlı `no-referrer`/`no-store` header'ları henüz yok (D-048; PHASE 03/07/08).
- `tw-animate-css` kaldırıldı; animasyonlu shadcn bileşenleri (Dialog, Sheet) eklenirken yeniden değerlendirilmeli (D-043).

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

**Geliştirmeyi (PHASE 02) başlatmayı engelleyen:** yalnızca PHASE 01 kullanıcı onayı. PB-01…PB-11 açık; hiçbiri çözülmüş sayılmaz. PHASE 00/01 onayları production güvenliği veya KVKK uyumluluğu onayı değildir.

## Latest Verification Results (2026-11-24, PHASE 02)
Node v24.22.1 · pnpm 10.34.9 · Neon PostgreSQL 18.7 (Frankfurt), tek veritabanı `neondb`.

| Komut | Exit | Sonuç |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | |
| `pnpm lint` / `typecheck` / `format:check` | 0 / 0 / 0 | |
| `pnpm test` | 0 | 7 dosya, 61 unit test |
| `pnpm db:check` | 0 | Migration'lar tutarlı |
| `pnpm db:verify` | 0 | TLS 1.3, sertifika doğrulandı (sahip ve runtime); 17 tablo; pg_trgm 1.6; 3 migration; runtime rolü süper kullanıcı/createrole/createdb/bypassrls/replication = false |
| `pnpm db:init` | 0 | Rol mevcut → öznitelik + şifre eşitlendi |
| `pnpm db:migrate` (2 kez) | 0 / 0 | 3 yeni → 0 yeni (tekrar uygulanmadı) |
| `pnpm test:integration` | 0 | 4 dosya, **71/71** (gerçek Neon, ~54 sn) |
| `pnpm db:seed` (2 kez) | 0 / 0 | 3 hizmet + 12 şablon → 0 oluşturuldu, 3 atlandı |
| `pnpm build` (canary secret'larla) + `check:bundle` | 0 / 0 | Canary değerleri client bundle'da yok; negatif test yakaladı |
| `pnpm test:e2e` | 0 | 30 geçti, 18 bilinçli atlandı |
| `pnpm run audit` (high) / `pnpm audit --prod` | 0 / 0 | 1 moderate (dev) / açık yok |

- Migration SQL'i önce PGlite (PostgreSQL WASM, scratch dizininde) üzerinde ön kontrol edildi.
- Testler sonrası satır sayıları: kullanıcı/başvuru/dosya/token 0 (temizlendi); hizmet 3 + şablon 12 (seed); audit 2 (test, silinemez).
- `cs_global_dev` ve `cs_global_test` (bu fazda oluşturulan) kullanıcı talebiyle silindi.

## Next Phase
**PHASE 03 — Authentication & Authorization** — kullanıcı açıkça onaylamadan başlanmaz.
