# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24** (PHASE 00 revizyonu)

## Current Phase
**PHASE 00 — Project Foundation & Architecture** — doküman revizyonu tamamlandı, **kullanıcı onayı bekleniyor**.

## Completed Phases
- Yok (PHASE 00 onay bekliyor).

## Project Status
Yalnızca dokümantasyon. Uygulama kodu, bağımlılık, veritabanı, storage, hesap, deployment, commit **yok**.

## Implemented Features
- Yok.

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 01–13.

## Product Decisions
OD-01…OD-23: **23/23 ACCEPTED** (Product Owner, 2026-11-24) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions (çözülmemiş)

| ID | Konu | Öneri | Gerekli faz |
|---|---|---|---|
| **TD-01** | D-002 — TypeScript sürümü | 6.0.3 (TS 7 typescript-eslint ile uyumsuz) | PHASE 01 — **kullanıcı onayı** |
| **TD-02** | D-004 — pnpm sürümü | `packageManager` ile exact; hosting'de doğrulanmış en güncel major, doğrulanamazsa 10.34.9 | PHASE 01 — **kullanıcı onayı** |
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
1. `.gitignore` Visual Studio şablonu; `.env.local`, `node_modules`, `.next` kapsanmıyor → D-031 (Accepted) — PHASE 01'in ilk adımı.
2. Yerel Node.js 24.22.1; güncel yama 24.22.3 — güncelleme önerilir (bu fazda yapılmadı).
3. Önceki brief'in kesik kısmı bu revizyon prompt'unda tamamlandı (§10).

## Technical Debt
- Yok (kod yok).

## Production Blockers
Ayrıntı: [SECURITY.md](SECURITY.md) §11.

| ID | Blocker | Geliştirmeyi engeller mi? |
|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage yok — Vercel Hobby ticari kullanıma izin vermiyor | Hayır |
| PB-02 | Vercel Blob Hobby 1 GB kapasite (~50 başvuru) | Hayır |
| PB-03 | KVKK hukuki değerlendirmesi (aydınlatma, yurt dışı aktarım, saklama/imha politikası, VERBİS, ihlal prosedürü) | Hayır |
| PB-04 | Bearer link + OTP yok + süresiz bağlantı riski için yazılı risk kabulü | Hayır |
| PB-05 | Antivirüs olmadan PDF kabulü için yazılı risk kabulü + personel cihaz politikası | Hayır |
| PB-06 | Production ortam izolasyonu | Hayır |
| PB-07 | Yetkilendirme ve güvenlik testlerinin geçmesi | Hayır |
| PB-08 | Seçilen ücretsiz planda yedek/geri yükleme yeteneği | Hayır |
| PB-09 | Bağımlılık taraması temiz | Hayır |
| PB-10 | Better Auth kapalı uç noktaları ve IP/UA saklamamanın testle doğrulanması | Hayır |
| PB-11 | Gerçek iletişim bilgileri ve hizmet/evrak kataloğu | Hayır |

**Geliştirmeyi (PHASE 01) başlatmayı engelleyen:** yalnızca TD-01 (D-002) ve TD-02 (D-004) kararları ve PHASE 00 onayı.

## Latest Verification Results (2026-11-24, revizyon)
- npm `latest` yeniden sorgulandı (next 16.4.6, react 19.3.1, typescript 7.0.2, typescript-eslint 8.74.0 — peer `<6.1.0`, eslint 10.15.0, eslint-config-next 16.4.6, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, better-auth 1.7.27, @vercel/blob 2.9.0, vitest 5.1.1, @playwright/test 1.65.1, tailwindcss 4.3.5, zod 4.6.7, pnpm 12.23.0) — ilk doğrulamadan değişiklik yok. Node 24 son yama 24.22.3.
- Better Auth: `disabledPaths`, `disableIpTracking` (yerleşik limiter'ı kapatır), `disableSessionRefresh`, `minPasswordLength`/`maxPasswordLength` (8/128), `disableSignUp`, `customStorage.consume`, before hook `{ data }` mekanizması, `hooks.before` path reddi doğrulandı. `auth.api` etkileşimi ve session UA hook'u doğrulanamadı (TD-03, TD-04).
- Vercel cron: Hobby günde 1 / ±59 dk; Pro dakikada 1.
- Doküman tutarlılık kontrolü: script ile çapraz referans kontrolü + kaldırılan kavramlar için anahtar kelime taraması (sonuçlar faz raporunda).
- Test: uygulanmadı (kod yok). Commit: yapılmadı.

## Next Phase
**PHASE 01 — Project Initialization** — başlamak için: PHASE 00 revizyon onayı + TD-01 (D-002) + TD-02 (D-004) kararları. Kullanıcı açıkça istemeden başlanmaz.
