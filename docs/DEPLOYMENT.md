# Ortamlar, Altyapı ve Deployment

> Doğrulama tarihi: **2026-11-24**. Fiyatlar/limitler değişebilir — PHASE 13 öncesinde yeniden doğrulanmalıdır.
> Hesap oluşturma, satın alma, ücretli plana geçiş, kredi kartı gerektiren hizmet etkinleştirme veya deployment **yapılmamıştır** ve kullanıcı onayı olmadan yapılmaz (OD-12).
> **Hedef aylık maliyet: 0.**

## 1. Ortamlar

| | Development | Demo / Preview | Production |
|---|---|---|---|
| Uygulama | Yerel `pnpm dev` | Vercel Hobby (geliştiricinin hesabı), sağlayıcı alt alan adı (ör. `cs-global-panel.vercel.app` — örnek) | **Açık (PB-01)** |
| Veritabanı | Neon Free, non-prod projesi → `dev` branch | Neon Free, non-prod projesi → preview/demo branch'i | Ayrı proje/hesap — sağlayıcı açık |
| Storage | Vercel Blob (Hobby) private store `dev` | Ayrı private store `demo` | Ayrı private store — sağlayıcı açık |
| Secret'lar | `.env.local` | Sağlayıcı Preview scope | Production scope (yalnızca yetkili kişi) |
| Veri | Sahte seed | **Yalnızca sahte** | Gerçek |
| Bölge | — | `fra1` / `aws-eu-central-1` | Veri konumu seçim kriteri |

**İzolasyon kuralları (D-022):** production DB/storage/secret'ları preview/demo'dan tamamen ayrıdır; preview production verisine erişemez; Neon–Vercel entegrasyonu production projesine bağlanmaz; demo ortamında gerçek müşteri verisi kullanılmaz.

> ⚠️ **Demo ortamı notu:** Vercel Hobby, Terms §4'e göre yalnızca *"personal or non-commercial use"* içindir. Şirket için hazırlanan bir demonun bu kapsama girip girmediği belirsizdir; demo yalnızca sahte veriyle, kısa süreli ve geliştiricinin kişisel hesabında tutulmalıdır. Bu, ticari kullanım iznine ilişkin bir doğrulama değildir.

## 2. Bölge

| Servis | Bölge | Not |
|---|---|---|
| Vercel Functions | `fra1` | Varsayılan `iad1` → `vercel.json` `"regions": ["fra1"]` (Hobby tek bölge seçebilir) |
| Neon | `aws-eu-central-1` | Proje oluştururken; sonradan değiştirilemez |
| Vercel Blob | `fra1` | Store oluştururken; sonradan değiştirilemez |

## 3. Environment Değişkenleri (`.env.example` planı)

> PHASE 01'de `.env.example` oluşturuldu: etkin olarak yalnızca `APP_ENV` ve `APP_URL` (yerel varsayılanlarla) vardır; aşağıdaki diğer değişkenler dosyada yorum satırı olarak, kullanılacakları fazla birlikte listelenir. Gerçek değerler repoya yazılmaz; `.env`, `.env.local`, `.env.*` ignore edilir (`.env.example` hariç) — CI'da otomatik kontrol edilir.
> Doğrulama `src/server/env.ts`'te ilk kullanımda yapılır (D-047). `NODE_ENV=production` iken `APP_ENV` zorunlu; `development` dışında `APP_URL` zorunlu ve `https` origin olmalıdır. Her yeni değişken, onu kullanan kodla aynı fazda şemaya eklenir.

```dotenv
# --- Uygulama ---
APP_URL=                          # Tek bağlantı kaynağı (OD-20): http://localhost:3000 | https://<demo>.vercel.app | production adresi
APP_ENV=                          # development | preview | production

# --- Veritabanı ---
DATABASE_URL=                     # Pooled bağlantı — runtime, cs_app_runtime rolü, sslmode=verify-full (PHASE 02)
DATABASE_URL_UNPOOLED=            # Direct bağlantı — migration/yönetim, tablo sahibi rol (PHASE 02)

# --- Better Auth ---
BETTER_AUTH_SECRET=               # >=32 kr., yüksek entropi (PHASE 03)
# BETTER_AUTH_URL kullanılmaz: base URL = APP_URL (D-066)

# --- Müşteri erişimi ---
ACCESS_TOKEN_HMAC_KEY=            # 32 bayt base64
ACCESS_TOKEN_ENCRYPTION_KEYS=     # {"k1":"<32 bayt base64>"}
ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID=   # k1
CUSTOMER_SESSION_SECRET=          # Portal cookie imzası, 32 bayt base64

# --- Rate limiting ---
RATE_LIMIT_KEY_SECRET=            # Kullanıcı adı anahtarlarının HMAC'i, >=32 kr., BETTER_AUTH_SECRET'tan farklı (PHASE 03)

# --- Storage ---
BLOB_READ_WRITE_TOKEN=            # handleUpload için (OIDC kabul etmiyor)
# VERCEL_BLOB_CALLBACK_URL=       # yalnızca yerel tünelle callback testi

# --- Zamanlanmış iş ---
CRON_SECRET=
```

Kaldırılan değişkenler: `NEXT_PUBLIC_APP_URL` (→ `APP_URL`, sunucu tarafı), `OTP_HMAC_KEY`, `CUSTOMER_COOKIE_SECRET` (→ `CUSTOMER_SESSION_SECRET`), `IP_HASH_KEY`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `FILE_SCAN_MODE/ENDPOINT/API_KEY`.
Şirket iletişim bilgileri, dosya limitleri, şifre/oturum parametreleri ve rate limitler **env değil**, `src/config/*` sabitleridir.

## 4. Deployment Akışı (PHASE 13'te, sağlayıcı kararından sonra)

1. GitHub `main` korumalı: PR + CI yeşil + review.
2. PR → preview + Neon preview branch → migration'lar → E2E.
3. Production: migration'lar deploy'dan önce açık bir adımla (`pnpm db:migrate`, direct URL, yetkili kişi); expand/contract.
4. Smoke test (sahte test başvurusu, sonra personel silme işlemiyle silinir).
5. Geri alma: sağlayıcının önceki deployment'a dönüş özelliği; migration'lar ileri düzeltme.

`package.json`: `"engines": { "node": "24.x" }` (OD-13), `"packageManager": "pnpm@<sürüm>"` (D-004).

## 5. Secret Rotasyonu

| Secret | Etkisi | Prosedür |
|---|---|---|
| `BETTER_AUTH_SECRET` | Personel oturumları | `BETTER_AUTH_SECRETS` (çoğul) ile kademeli (PHASE 03'te doğrulanır) |
| `ACCESS_TOKEN_ENCRYPTION_KEYS` | Yok (çoklu anahtar) | Ekle → aktif ID → yeniden şifrele → eskiyi kaldır |
| `ACCESS_TOKEN_HMAC_KEY` | **Tüm bağlantılar geçersiz** | Yalnızca sızıntıda; tüm bağlantılar yenilenip yeniden paylaşılır |
| `CUSTOMER_SESSION_SECRET` | Tüm müşteri oturumları sonlanır (bağlantılar geçerli) | Doğrudan değiştir |
| `RATE_LIMIT_KEY_SECRET` | Rate limit sayaçları sıfırlanır | Doğrudan değiştir |
| `BLOB_READ_WRITE_TOKEN`, DB şifresi | Kısa kesinti | Konsol → env → redeploy |

## 6. Ücretsiz Plan Değerlendirmesi

### 6.1 Doğrulanmış bilgiler (2026-11-24)

| Servis / Plan | Ticari kullanım | Kapasite | Diğer | Kaynak |
|---|---|---|---|---|
| **Vercel Hobby** | ❌ Terms §4: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* | 1M function çağrısı, 4 CPU-saat, 360 GB-saat bellek, 100 GB Fast Data Transfer; maks süre 300 sn; 2 GB / 1 vCPU; tek bölge; request body 4.5 MB | Cron: en sık **günde 1**, ±59 dk | vercel.com/legal/terms, vercel.com/docs/plans/hobby, /functions/limitations, /cron-jobs/usage-and-pricing |
| **Vercel Blob (Hobby)** | Hobby koşullarına tabi | **1 GB** depolama, 10K basit / 2K gelişmiş işlem, 10 GB transfer/ay | Aşımda erişim 30 gün bloklanır, **ücret çıkmaz** | vercel.com/docs/vercel-blob/usage-and-pricing |
| **Neon Free** | Açık ifade bulunamadı ("Prototypes, side projects, and small teams") | 1 GB/proje (20 GB toplam), 100 CU-saat/proje/ay, 10 branch | Geri yükleme penceresi **6 saat**; SLA yok; aşımda compute askıya alınır / yazma bloklanır | neon.com/docs/introduction/plans |
| Vercel Pro (referans, **satın alınmayacak**) | ✅ | — | $20/ay/koltuk | vercel.com/pricing |
| Neon Launch (referans, **satın alınmayacak**) | ✅ | — | Kullandıkça öde, minimum yok | neon.com/pricing |

### 6.2 Kapasite değerlendirmesi
- Ortalama PDF 2 MB, başvuru başına ~8 evrak ve versiyonlarla ~10 dosya → başvuru başına ~20 MB.
- **Vercel Blob Hobby 1 GB ≈ 50 başvuru.** Otomatik silme olmadığından (OD-06) kapasite birikimlidir; dolduğunda yükleme/görüntüleme 30 gün bloklanır → **gerçek kullanım için yetersiz** (PB-02).
- Neon Free 1 GB: metadata için uzun süre yeterli (binary yok). 100 CU-saat/ay, düşük trafikte scale-to-zero ile muhtemelen yeterli (ölçülmeli).
- Vercel Hobby function/bandwidth: küçük operasyon için muhtemelen yeterli; ancak ticari kullanım izni yok (PB-01).

### 6.3 PHASE 13 öncesi değerlendirilecek seçenekler (doğrulanmadı)
Aşağıdakiler **aday**dır; hiçbirinin ticari kullanım koşulu, kotası, güvenliği veya sürekliliği bu fazda doğrulanmamıştır:

| Kategori | Adaylar | Değerlendirme notu |
|---|---|---|
| Next.js full-stack hosting (ticari kullanıma açık ücretsiz katman) | Cloudflare Workers (OpenNext adaptörü), Netlify, Render, Google Cloud Run, Oracle Cloud Always Free (kendi sunucunda Node) | Next.js 16 özellik uyumu (Server Actions, `proxy.ts` Node runtime, streaming), Node 24 desteği, cold start, kredi kartı zorunluluğu |
| PostgreSQL | Neon Free (ticari kullanım teyidi), Supabase Free, sağlayıcıların ücretsiz katmanları, Oracle VM üzerinde self-hosted Postgres | Pause/askıya alma politikası, yedek, bölge, bağlantı yöntemi (interactive transaction) |
| Private object storage | Cloudflare R2 ücretsiz katmanı, diğer S3-uyumlu ücretsiz katmanlar, Oracle Object Storage, Supabase Storage | Private erişim, presigned upload, kapasite, egress, kredi kartı gereksinimi |

**Değerlendirme kriterleri (her aday için):** ticari kullanım izni · depolama/DB kotası · bant genişliği · function limitleri · yedek/geri yükleme · veri konumu (KVKK) · güvenlik/uyumluluk belgeleri · DPA · erişilebilirlik/SLA · aşım ücretleri · **sert harcama limiti** (kredi kartı olmadan veya ücretlendirme kapatılabilir) · Next.js uyumu.

Storage sağlayıcısı değişirse yalnızca `src/server/storage/storage.ts` ve `src/lib/upload-client.ts` değişir (D-040). Hosting değişirse cron, region ve env yapılandırması değişir; uygulama kodu Node.js standartlarında kalır.

### 6.4 Beklenen maliyet

| Ortam | Maliyet |
|---|---|
| Development | **0** (yerel + Neon Free + Vercel Blob Hobby) |
| Demo | **0** (Vercel Hobby + Neon Free + Blob Hobby; yalnızca sahte veri) |
| Production | **Hedef 0** — ticari kullanıma uygun ücretsiz altyapı bulunamazsa **production blocker** (PB-01). Ücretli plan yalnızca kullanıcı açıkça onaylarsa. Referans: Vercel Pro $20/ay + Neon Launch kullanım bazlı (~$5–10/ay tahmini, doğrulanmamış varsayımlarla). |

Harici servis yok: e-posta, SMS, antivirüs, Redis, kuyruk, APM, analytics, alan adı, ücretli DNS.

## 7. Yedekleme ve Geri Yükleme

- Neon Free geri yükleme penceresi **6 saat** — veri kaybı/yanlış silme için çok kısa; production sağlayıcısında yedek yeteneği bir seçim kriteridir (PB-08).
- Vercel Blob sürüm/yedek özelliği **doğrulanmadı**; silinen dosya geri getirilemeyebilir → silme yalnızca onaylı manuel silme akışıyla.
- Geri yükleme provası production öncesi zorunlu (PHASE 13).
- Ek uzun süreli yedek alınmaz (DATA_PRIVACY §4).

## 8. Alan Adı (OD-20)

- Şimdilik hosting sağlayıcısının ücretsiz alt alan adı; alan adı satın alınmaz, ücretli DNS yok.
- Tüm bağlantılar `APP_URL`'den üretilir; `Host` header'ından URL üretilmez.
- **Alan adı değişikliği etkisi:** müşteri bağlantılarında yalnızca token önemlidir (DB'de hash). `APP_URL` değişince yeni üretilen/gösterilen bağlantılar yeni adresi kullanır.
  - Eski alan adı erişilebilir kalıyorsa (ör. aynı sağlayıcıda alias): eski adreste `/b/*` → yeni adres `/b/*` kalıcı yönlendirme (308); token'lar geçerli kalır.
  - Eski alan adı kaybedilirse (ör. sağlayıcı değişikliği, `*.vercel.app` alt alan adı bırakılırsa): WhatsApp'taki eski bağlantılar **çalışmaz**; aktif başvuruların bağlantıları personel tarafından yeniden paylaşılmalıdır (token değişmeden yeni adresle "Göster → Paylaş"). Taşıma planında bu adım yer almalıdır.
  - Cookie'ler alan adına bağlıdır; müşteriler yeni adreste bağlantıyı yeniden açar. Personel yeniden giriş yapar. `BETTER_AUTH_URL`/`trustedOrigins` güncellenir.

## 9. İzleme

Hosting runtime logları (redaksiyonlu), DB konsol metrikleri, temizlik işi çıktıları (`TECHNICAL_CLEANUP_EXECUTED`), storage kullanım oranı (kota uyarısı için düzenli kontrol — operasyonel). Ücretli izleme servisi yok.

## 10. Hesap Güvenliği

Tüm konsollarda (hosting, DB, storage, GitHub) **MFA zorunlu**; production erişimi en az kişi; hesaplar mümkünse şirket adına; ayrılan personelin erişimi aynı gün kaldırılır.

## 11. Build ve CI Ortamı (PHASE 01)

- Node.js `engines.node: 24.x` + `.nvmrc` (`24`); pnpm `packageManager: pnpm@10.34.9`. Vercel'in varsayılan Node sürümü 26 olduğundan `engines` sabitlemesi zorunludur. Hosting'de pnpm 10.34.9 kullanımı (Corepack/`packageManager`) **doğrulanmadı** — deployment PHASE 13'te.
- CI: `.github/workflows/ci.yml` — push (`main`) ve PR'da kalite kapıları + E2E. Repo herkese açık olduğundan GitHub Actions standart runner'ları ücretsizdir; ücretli plan veya kredi kartı gerekmez. Workflow yalnızca `contents: read` yetkisiyle çalışır, secret kullanmaz.
- Deployment, preview, hosting hesabı: **yapılmadı** (PHASE 13).

## 12. Veritabanı Ortamı (PHASE 02)

### 12.1 Neon kurulumu (yapıldı — 2026-11-24)
Tek veritabanı (D-059): Neon projesindeki `neondb` veritabanı uygulama, migration, seed ve integration testleri için ortak kullanılır. Ayrı development/test veritabanı yoktur. Proje: Free plan, AWS Europe (Frankfurt) `aws-eu-central-1`, PostgreSQL 18.7.
- `.env.local` (yalnızca yerel, git'te ignore, izin `600`):
  - `DATABASE_URL_UNPOOLED` = pooler olmayan uç nokta, sahip rol (`neondb_owner`), `neondb`, `sslmode=verify-full` (`channel_binding` parametresi kaldırılır).
  - `DATABASE_URL` = aynı ana makinenin `-pooler` ekli hali, kullanıcı `cs_app_runtime`, yerelde üretilen şifre (`openssl rand -hex 32` eşdeğeri), `neondb`, `sslmode=verify-full`.
- Komutlar: `pnpm db:verify` → `pnpm db:init` → `pnpm db:migrate` → (isteğe bağlı) `pnpm db:seed`; `pnpm test:integration` aynı veritabanında çalışır.
- Bağlantı bilgileri sohbete, terminal çıktısına veya issue'lara yazılmaz; yazıldıysa ilgili rolün şifresi Neon'da sıfırlanır.

### 12.2 Bölge ve KVKK
Frankfurt, planlanan hosting bölgesine (`fra1`) yakın olduğu için önerilir. **Avrupa bölgesi seçmek tek başına KVKK uyumu sağlamaz**: Türkiye dışına aktarım (m.9) ve sağlayıcı sözleşmeleri hukuki değerlendirme gerektirir (DATA_PRIVACY §8, PB-03). Production bölgesi PHASE 13'te sağlayıcı kararıyla kesinleşir.

### 12.3 Neon Free plan (doğrulandı 2026-11-24, neon.com/docs/introduction/plans)
100 proje; proje başına 1 GB depolama (toplam 20 GB), 100 CU-saat/ay, 5 GB egress, 10 branch, 6 saat (1 GB değişiklik geçmişi) geri yükleme penceresi; 5 dk hareketsizlikte scale-to-zero (Free'de sabit). SLA yok. Development/test için yeterlidir; production uygunluğu PB-01/PB-08 kapsamındadır.

### 12.4 Ortam izolasyonu (D-059)
Veritabanı düzeyinde ortam ayrımı yoktur (Product Owner kararı). `db:init` bu projeye ait olmayan tablo varsa durur; integration testleri yalnızca kendi sentetik kayıtlarını siler; seed mevcut kayıtlara dokunmaz. **Gerçek müşteri verisi girmeden önce** ayrı production veritabanı veya bu kararın yazılı risk kabulü gerekir (PB-06, TM-43).

## 13. Şirket Hesapları (PHASE 03 — OD-24)
- İki hesap (ADMIN, EMPLOYEE) yalnızca işletmecinin kendi terminalinde `pnpm auth:bootstrap` ile oluşturulur; şifreler gizli girilir, sohbete/issue'ya/kanala yazılmaz. Production'da ayrı ve güçlü şifrelerle yeniden yapılır (PHASE 13).
- Şifre unutulursa veya hesap ele geçirilirse: `pnpm auth:reset-password` (ilgili hesabın tüm oturumları sonlanır).
- Secret rotasyonu: `BETTER_AUTH_SECRET` değişirse tüm oturum cookie'leri geçersizleşir (yeniden giriş gerekir); `RATE_LIMIT_KEY_SECRET` değişirse rate limit sayaçları sıfırlanır.
