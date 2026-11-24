# Ortamlar ve Deployment

> Doğrulama tarihi: **2026-11-24**. Fiyatlar ve limitler değişebilir — PHASE 13 öncesinde yeniden doğrulanmalıdır.
> PHASE 00'da hesap oluşturma, satın alma veya deployment **yapılmamıştır**.

## 1. Ortamlar

| | Development | Preview | Production |
|---|---|---|---|
| Uygulama | Yerel `pnpm dev` | Vercel Preview (her PR) | Vercel Production (`main`) |
| Vercel planı | — | Pro (ticari proje) | **Pro** (Hobby ticari kullanıma izin vermez) |
| Veritabanı | Neon **non-prod projesi** → `dev` branch | Neon non-prod projesi → PR başına branch (`main` non-prod branch'inden) | Neon **prod projesi** (ayrı proje) |
| Blob store | `blob-dev` | `blob-preview` | `blob-prod` |
| Secret'lar | `.env.local` (geliştirici) | Vercel "Preview" scope | Vercel "Production" scope |
| Veri | Sahte seed | Sahte seed | Gerçek |
| Erişim | Geliştirici | Vercel Deployment Protection (ekip) | Public (uygulama auth ile) |
| Bölge | — | `fra1` | `fra1` |

**İzolasyon kuralları (D-022):**
- Production Neon projesi **ayrı projedir**; Neon–Vercel entegrasyonu production projesine **bağlanmaz** (entegrasyonlar preview branch'lerini proje içindeki ana branch'ten kopyalar — production verisi preview'a geçmesin).
- Preview branch'leri non-prod projesinin seed'li `main` branch'inden oluşturulur. Vercel-Managed entegrasyonda branch silme gecikebilir (Neon dokümanı) → Neon-Managed entegrasyon veya CI ile manuel branch yönetimi (PHASE 02/13'te karar).
- Schema-only branch (beta) seçeneği mevcut; non-prod zaten sahte veri içerdiğinden gerekli değil.
- Production secret'ları yalnızca "Production" scope'unda; preview deployment'ları production secret'larını **göremez**.

## 2. Bölge Seçimi

| Servis | Bölge | Not |
|---|---|---|
| Vercel Functions | `fra1` (Frankfurt) | Varsayılan `iad1` → `vercel.json` `"regions": ["fra1"]` |
| Neon | `aws-eu-central-1` (Frankfurt) | Proje oluştururken; sonradan değiştirilemez. Türkiye bölgesi yok. |
| Vercel Blob | `fra1` | Store oluştururken; sonradan değiştirilemez. |

Function ile DB'nin aynı şehirde olması gecikmeyi düşürür. Türkiye'deki kullanıcılar için Frankfurt makul gecikmededir.

## 3. Environment Değişkenleri (`.env.example` planı)

> Kesin adlar kütüphane dokümanlarına göredir; PHASE 01'de `.env.example` dosyası **değersiz** olarak oluşturulur. Gerçek değerler repoya yazılmaz.

```dotenv
# --- Uygulama ---
NEXT_PUBLIC_APP_URL=            # https://panel.<domain> | http://localhost:3000
APP_ENV=                        # development | preview | production

# --- Veritabanı (Neon) ---
DATABASE_URL=                   # Pooled (-pooler) bağlantı — runtime
DATABASE_URL_UNPOOLED=          # Direct bağlantı — yalnızca migration
# (Neon-Vercel entegrasyonu farklı adlar enjekte edebilir; PHASE 02'de eşlenir)

# --- Better Auth ---
BETTER_AUTH_SECRET=             # >=32 kr., yüksek entropi (openssl rand -base64 32)
BETTER_AUTH_URL=                # = NEXT_PUBLIC_APP_URL

# --- Müşteri erişimi ---
ACCESS_TOKEN_HMAC_KEY=          # 32 bayt base64
ACCESS_TOKEN_ENCRYPTION_KEYS=   # {"k1":"<32 bayt base64>"}
ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID=   # k1
OTP_HMAC_KEY=                   # 32 bayt base64
CUSTOMER_COOKIE_SECRET=         # pre-auth cookie imzası, 32 bayt base64
IP_HASH_KEY=                    # audit/rate limit için IP HMAC anahtarı

# --- Vercel Blob ---
BLOB_READ_WRITE_TOKEN=          # handleUpload için gerekli (OIDC kabul etmiyor)
# VERCEL_BLOB_CALLBACK_URL=     # yalnızca yerel tünel ile callback testi

# --- E-posta (OD-08) ---
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=                     # ör. "CS Global <no-reply@<domain>>"

# --- Dosya taraması (OD-07) ---
FILE_SCAN_MODE=                 # structural-only | clamav | provider
FILE_SCAN_ENDPOINT=
FILE_SCAN_API_KEY=

# --- Cron ---
CRON_SECRET=                    # Vercel Cron Authorization: Bearer
```

Rate limit eşikleri ve dosya limitleri **env değil**, `system_settings` + kod sabitleridir (gereksiz yapılandırma yüzeyi yok).

Doğrulama: `src/server/env.ts` (Zod). `NEXT_PUBLIC_` önekli yalnızca `NEXT_PUBLIC_APP_URL`.

## 4. Deployment Akışı (PHASE 13'te kurulur)

1. GitHub `main` korumalı branch: PR + CI yeşil + review zorunlu.
2. PR → Vercel Preview + Neon preview branch → migration'lar preview branch'ine uygulanır → E2E.
3. Merge → Production build. Migration'lar **deploy'dan önce** ayrı, açık bir adımla (`pnpm db:migrate` — direct URL, yetkili kişi veya korumalı CI job) uygulanır; uygulama kodu geriye uyumlu migration'larla (expand/contract) yazılır.
4. Deploy sonrası smoke test (login, liste, müşteri bağlantısı test başvurusu — production'da yalnızca sahte "test" başvurusu ile, sonra silinir).
5. Geri alma: Vercel "Instant Rollback" (uygulama) + migration'lar geri alınmaz, ileri düzeltme yapılır.

`package.json`: `"engines": { "node": "24.x" }`, `"packageManager": "pnpm@<sürüm>"` (D-003, D-004).

## 5. Secret Rotasyonu

| Secret | Rotasyon etkisi | Prosedür |
|---|---|---|
| `BETTER_AUTH_SECRET` | Oturumlar/imzalar | `BETTER_AUTH_SECRETS` (çoğul) ile kademeli rotasyon (Better Auth desteği PHASE 03'te doğrulanır) |
| `ACCESS_TOKEN_ENCRYPTION_KEYS` | Yok (çoklu anahtar) | Yeni anahtar ekle → aktif ID → yeniden şifreleme script'i → eskiyi kaldır |
| `ACCESS_TOKEN_HMAC_KEY` | **Tüm bağlantılar geçersiz** | Yalnızca sızıntıda; tüm bağlantılar yenilenir ve müşterilere yeniden gönderilir |
| `OTP_HMAC_KEY`, `CUSTOMER_COOKIE_SECRET` | Açık OTP/pre-auth geçersiz | Doğrudan değiştir |
| `BLOB_READ_WRITE_TOKEN`, DB şifresi | Kısa kesinti | Sağlayıcı konsolundan yeni değer → Vercel env → redeploy |

## 6. Maliyet ve Plan Değerlendirmesi

### 6.1 Zorunlu servisler

| Servis | Geliştirme | Production | Kaynak (2026-11-24) |
|---|---|---|---|
| **Vercel** | Hobby ücretsiz — **yalnızca kişisel/ticari olmayan kullanım** | **Pro: $20/ay** (+$20 kullanım kredisi dahil, üstü kullandıkça öde; ek geliştirici koltuğu $20/kullanıcı/ay) | vercel.com/pricing; vercel.com/legal/terms §4 ("You shall only use the Services under a Hobby plan for your personal or non-commercial use.") |
| Vercel Functions limitleri | Hobby: maks 300 sn, 2 GB/1 vCPU, tek bölge | Pro: 300 sn varsayılan/800 sn maks, 4 GB/2 vCPU, 5 bölge | vercel.com/docs/functions/limitations |
| **Vercel Blob** | Hobby: 1 GB depolama, 10K basit / 2K gelişmiş işlem, 10 GB transfer (aşımda 30 gün blok) | Pro: depolama "starting at" $0.023/GB-ay; basit işlem $0.35/1M; gelişmiş $4.50/1M; transfer "Flat Rate CDN" kapsamında. **fra1 bölgesel fiyatı doğrulanmadı.** | vercel.com/docs/vercel-blob/usage-and-pricing |
| **Neon** | Free: 1 GB/proje, 100 CU-saat/proje/ay, 6 saat geri yükleme penceresi, 10 branch; SLA yok | **Launch**: kullandıkça öde, $0.106/CU-saat, depolama $0.35/GB-ay, ≤7 gün geri yükleme ($0.20/GB-ay), minimum ücret yok. **Scale**: $0.222/CU-saat, ≤30 gün geri yükleme, SLA, SOC2/ISO/HIPAA | neon.com/pricing; neon.com/docs/introduction/plans |
| **E-posta sağlayıcı** (OTP) | Sağlayıcıya göre ücretsiz katman | **Doğrulanmadı** — OD-08 kararıyla birlikte | — |
| **Dosya taraması** | — | (a) VM: aylık sabit küçük maliyet (sağlayıcıya göre, doğrulanmadı) · (b) API: dosya başı, doğrulanmadı · (c) $0 | OD-07 |
| Domain | — | Kayıt firmasına göre yıllık | Şirket mevcut domain'ini kullanabilir |
| GitHub | Ücretsiz (private repo) | Ücretsiz veya Team | Actions dakika limitleri PHASE 01'de |

### 6.2 Kaba production tahmini (doğrulanmamış varsayımlarla)

Varsayım: ~200 aktif başvuru/ay, başvuru başı ~8 PDF × 2 MB ≈ 3.2 GB/ay yeni belge, Neon ortalama 0.25 CU × iş günü 10 saat aktif (scale-to-zero ile).

| Kalem | Tahmin |
|---|---|
| Vercel Pro (1 koltuk) | $20/ay (dahil kredi küçük kullanımın çoğunu karşılayabilir) |
| Neon Launch | ~0.25 CU × 220 saat ≈ 55 CU-saat ≈ $6 + depolama (≤2 GB) ≈ $0.7 + geri yükleme ≈ $1 → **~$8/ay** |
| Vercel Blob | 1 yılda ~40 GB birikimli (saklama politikasıyla daha az) → ~$1/ay + işlemler (ihmal edilebilir) |
| E-posta, tarama | Karar sonrası |
| **Toplam (zorunlu çekirdek)** | **~$30/ay + e-posta + tarama** |

Bu tahmin **bağlayıcı değildir**; gerçek kullanım ölçülerek PHASE 13'te güncellenir. Ek Vercel koltukları (her geliştirici/operatör) maliyeti artırır.

### 6.3 Gerçek ihtiyaç olmadan eklenmeyecek servisler
Redis/Upstash, kuyruk servisleri, APM/monitoring SaaS, CDN dışı cache, ayrı arama motoru. Rate limit ve kuyruk benzeri işlevler Postgres + Vercel Cron ile karşılanır. Vercel Cron sıklık limitleri (Hobby/Pro) PHASE 08'de doğrulanacak — tarama yeniden deneme sıklığı buna bağlı.

## 7. Yedekleme ve Geri Yükleme

- Neon geri yükleme penceresi (PITR): Launch ≤7 gün, Scale ≤30 gün. Production için **en az 7 gün** (Launch maks) — daha uzun gerekiyorsa Scale.
- Blob: sürüm/yedek özelliği **doğrulanmadı**; dosyalar silinirse geri getirilemeyebilir → silme yalnızca kontrollü işler ve yetkili akışlarla.
- Geri yükleme provası (PHASE 13, production öncesi zorunlu): non-prod projede bir branch'i geçmiş zamana geri yükleme → uygulamayı bağlama → veri doğrulama → süre ölçümü.
- Ek uzun süreli yedek alınmaz (DATA_PRIVACY §5).

## 8. İzleme (MVP)

- Vercel runtime logları (redaksiyonlu yapılandırılmış log).
- Neon konsol metrikleri.
- Cron çıktıları audit'e (`RETENTION_PURGE_EXECUTED`).
- Hata bildirim servisi (Sentry vb.) MVP'de yok; eklenirse PII/token gönderimi kapatılarak ve DPA ile.

## 9. Hesap Güvenliği (operasyonel)

- Vercel, Neon, GitHub, e-posta ve DNS sağlayıcı hesaplarında **MFA zorunlu**.
- Production erişimi en az kişi; ayrılan personelin erişimi aynı gün kaldırılır.
- Hesaplar şirket adına (kişisel hesap değil) açılmalı — fatura ve sahiplik devri için.
