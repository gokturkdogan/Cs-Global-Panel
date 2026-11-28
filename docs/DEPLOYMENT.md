# Ortamlar, Altyapı ve Deployment

> Doğrulama tarihi: **2026-11-24**. Fiyatlar/limitler değişebilir — PHASE 13 öncesinde yeniden doğrulanmalıdır.
> Hesap oluşturma, satın alma, ücretli plana geçiş, kredi kartı gerektiren hizmet etkinleştirme veya deployment **yapılmamıştır** ve kullanıcı onayı olmadan yapılmaz (OD-12).
> **Hedef aylık maliyet: 0.**

## 1. Ortamlar

| | Development | Demo / Preview | Production |
|---|---|---|---|
| Uygulama | Yerel `pnpm dev` | Vercel Hobby (geliştiricinin hesabı), sağlayıcı alt alan adı (ör. `cs-global-panel.vercel.app` — örnek) | **Açık (PB-01)** |
| Veritabanı | Neon Free, non-prod projesi → `dev` branch | Neon Free, non-prod projesi → preview/demo branch'i | Ayrı proje/hesap — sağlayıcı açık |
| Storage | **Backblaze B2** private bucket `cs-global-documents` (EU Central, SSE-B2; OD-25) — otomatik testler: geçici yerel private depolama | Ayrı B2 bucket + ayrı anahtar (oluşturulmadı) | **Ayrı B2 bucket + bağımsız anahtar** (oluşturulmadı; `APP_ENV=production` geliştirme bucket'ını reddeder — D-098) |
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
| Backblaze B2 | `eu-central-003` (EU Central) | Bucket oluştururken (kullanıcı oluşturdu). AB bölgesi tek başına KVKK uyumu sağlamaz (DATA_PRIVACY §12a) |
| ~~Vercel Blob~~ | ~~`fra1`~~ | Kullanılmıyor (OD-25) |

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

# --- Storage (PHASE 08 — Backblaze B2, D-098) ---
STORAGE_PROVIDER=b2               # b2 | local (local yalnızca APP_ENV=development + STORAGE_LOCAL_ROOT)
B2_KEY_ID=                        # bucket'a kısıtlı Application Key ID (yerelde: pnpm env:b2)
B2_APPLICATION_KEY=               # gizli; yerelde yalnızca pnpm env:b2 (yankısız girdi)
B2_BUCKET_NAME=                   # production'da geliştirme bucket'ı (cs-global-documents) reddedilir
B2_ENDPOINT=                      # https://s3.<B2_REGION>.backblazeb2.com (birebir)
B2_REGION=                        # ör. eu-central-003
STORAGE_MAX_TOTAL_BYTES=9000000000   # ZORUNLU (production/preview — D-151); OD-28: lansman ücretsiz 9 GB; 100 GB lansman sonrası, ayrı onayla
STORAGE_WARNING_BYTES=8000000000    # ZORUNLU (production/preview — D-151); OD-28: lansman 8 GB; 90 GB lansman sonrası, ayrı onayla

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

### 3.1 PHASE 06 notu — token anahtarları
`ACCESS_TOKEN_*` değişkenleri uygulamada doğrulanır (D-081): base64 32 bayt, JSON anahtar haritası, aktif kimlik haritada, anahtarlar birbirinden ve auth secret'larından farklı. Yerel geliştirmede `pnpm env:token-keys` eksik anahtarları `.env.local`'a ekler (üzerine yazmaz). Production'da anahtarlar yetkili kişi tarafından üretilir ve **güvenli şekilde yedeklenir** (kaybı tüm bağlantıları çözülemez/geçersiz yapar). Şifreleme anahtarı rotasyonu için yeniden şifreleme betiği henüz yoktur — PHASE 13 öncesi yazılmalıdır.

### 3.2 PHASE 07 notu — müşteri oturumu anahtarı
`CUSTOMER_SESSION_SECRET` (base64, 32 bayt) uygulamada doğrulanır: token anahtarlarından, `BETTER_AUTH_SECRET` ve `RATE_LIMIT_KEY_SECRET`'tan farklı olmalı (D-088). Yalnızca müşteri erişiminde okunur; eksik/hatalıysa müşteri paneli "şu anda erişilemiyor" gösterir, personel paneli etkilenmez. Yerelde `pnpm env:token-keys` eksikse ekler (üzerine yazmaz). Production'da ortam başına ayrı üretilir (`openssl rand -base64 32`), hosting env'inde saklanır ve yedeklenir. **Rotasyon:** değeri değiştirmek tüm müşteri oturumlarını sonlandırır; bağlantılar geçerli kalır, müşteri bağlantıyı yeniden açınca yeni oturum alır (kesinti yok, veri kaybı yok). Sızıntı şüphesinde derhal değiştirilir. HTTPS `APP_URL`'de cookie `__Host-cs_portal` + `Secure` olur — gerçek HTTPS doğrulaması PHASE 13 (P4-04 ile birlikte).

## 5. Secret Rotasyonu

| Secret | Etkisi | Prosedür |
|---|---|---|
| `BETTER_AUTH_SECRET` | Personel oturumları | `BETTER_AUTH_SECRETS` (çoğul) ile kademeli (PHASE 03'te doğrulanır) |
| `ACCESS_TOKEN_ENCRYPTION_KEYS` | Yok (çoklu anahtar) | Ekle → aktif ID → yeniden şifrele → eskiyi kaldır |
| `ACCESS_TOKEN_HMAC_KEY` | **Tüm bağlantılar geçersiz** | Yalnızca sızıntıda; tüm bağlantılar yenilenip yeniden paylaşılır |
| `CUSTOMER_SESSION_SECRET` | Tüm müşteri oturumları sonlanır (bağlantılar geçerli) | Doğrudan değiştir |
| `RATE_LIMIT_KEY_SECRET` | Rate limit sayaçları sıfırlanır | Doğrudan değiştir |
| `B2_APPLICATION_KEY` (B2 anahtarı), DB şifresi | Dosya işlemleri / kısa kesinti | B2 panelinde yeni bucket'a kısıtlı anahtar → env (yerelde `pnpm env:b2`, açık onayla) → eski anahtarı B2'de sil → `pnpm storage:verify` |

## 6. Ücretsiz Plan Değerlendirmesi

### 6.1 Doğrulanmış bilgiler (2026-11-24)

| Servis / Plan | Ticari kullanım | Kapasite | Diğer | Kaynak |
|---|---|---|---|---|
| **Vercel Hobby** | ❌ Terms §4: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* | 1M function çağrısı, 4 CPU-saat, 360 GB-saat bellek, 100 GB Fast Data Transfer; maks süre 300 sn; 2 GB / 1 vCPU; tek bölge; request body 4.5 MB | Cron: en sık **günde 1**, ±59 dk | vercel.com/legal/terms, vercel.com/docs/plans/hobby, /functions/limitations, /cron-jobs/usage-and-pricing |
| ~~Vercel Blob (Hobby)~~ | Kullanılmıyor (OD-25) | 1 GB | — | — |
| **Backblaze B2** (2026-11-25) | Ticari kullanım koşulları ve DPA **doğrulanmadı** (gerçek müşteri verisinden önce) | İlk **10 GB** ücretsiz; aylık ortalama depolamanın 3 katı indirme ücretsiz ($0.01/GB sonrası); Class A ücretsiz; Class B/C ve cap'ler panelden | Cap = günlük harcama sınırı, 00:00 GMT sıfırlama, %75/%100 uyarı; cap yoksa kullanım sınırsız; kredi kartı girilmedi | backblaze.com/cloud-storage/pricing, docs/cloud-storage-data-caps-and-alerts |
| **Neon Free** | Açık ifade bulunamadı ("Prototypes, side projects, and small teams") | 1 GB/proje (20 GB toplam), 100 CU-saat/proje/ay, 10 branch | Geri yükleme penceresi **6 saat**; SLA yok; aşımda compute askıya alınır / yazma bloklanır | neon.com/docs/introduction/plans |
| Vercel Pro (referans, **satın alınmayacak**) | ✅ | — | $20/ay/koltuk | vercel.com/pricing |
| Neon Launch (referans, **satın alınmayacak**) | ✅ | — | Kullandıkça öde, minimum yok | neon.com/pricing |

### 6.2 Kapasite değerlendirmesi
- Ortalama PDF 2 MB, başvuru başına ~8 evrak ve versiyonlarla ~10 dosya → başvuru başına ~20 MB.
- **Backblaze B2 uygulama kotası hedefi 100 GB ≈ 5 000 başvuru** (OD-26, D-140; önceki 9 GB ≈ 450 başvuru / 8 GB uyarı değerlerinin yerine). Otomatik silme olmadığından (OD-06) kapasite birikimlidir; 90 GB'ta panel uyarısı, 100 GB'ta yeni yükleme durur (mevcut dosyalar erişilebilir kalır). Aktif sınır, sağlayıcı hesabı hazırlığı (FILE_STORAGE §7.2) doğrulanana kadar 9 GB'ta kalabilir. Tahmini B2 maliyeti 100 GB ortalamada yıllık 7,51 USD (vergiler hariç). Uzun vadeli büyüme için ücretli kapasite kullanıcı kararıdır (PB-02 açık). (Önceki değerlendirme: Vercel Blob Hobby 1 GB ≈ 50 başvuru.)
- Neon Free 1 GB: metadata için uzun süre yeterli (binary yok). 100 CU-saat/ay, düşük trafikte scale-to-zero ile muhtemelen yeterli (ölçülmeli).
- Vercel Hobby function/bandwidth: küçük operasyon için muhtemelen yeterli; ancak ticari kullanım izni yok (PB-01).

### 6.3 PHASE 13 öncesi değerlendirilecek seçenekler (doğrulanmadı)
Aşağıdakiler **aday**dır; hiçbirinin ticari kullanım koşulu, kotası, güvenliği veya sürekliliği bu fazda doğrulanmamıştır:

| Kategori | Adaylar | Değerlendirme notu |
|---|---|---|
| Next.js full-stack hosting (ticari kullanıma açık ücretsiz katman) | Cloudflare Workers (OpenNext adaptörü), Netlify, Render, Google Cloud Run, Oracle Cloud Always Free (kendi sunucunda Node) | Next.js 16 özellik uyumu (Server Actions, `proxy.ts` Node runtime, streaming), Node 24 desteği, cold start, kredi kartı zorunluluğu |
| PostgreSQL | Neon Free (ticari kullanım teyidi), Supabase Free, sağlayıcıların ücretsiz katmanları, Oracle VM üzerinde self-hosted Postgres | Pause/askıya alma politikası, yedek, bölge, bağlantı yöntemi (interactive transaction) |
| Private object storage | **Seçildi: Backblaze B2 (OD-25)** — production için ayrı bucket/anahtar ve ticari koşul/DPA değerlendirmesi kaldı. (Önceki adaylar: Cloudflare R2, Oracle Object Storage, Supabase Storage — değerlendirme dışı bırakıldı) | Private erişim, kapasite, egress, kredi kartı gereksinimi |

**Değerlendirme kriterleri (her aday için):** ticari kullanım izni · depolama/DB kotası · bant genişliği · function limitleri · yedek/geri yükleme · veri konumu (KVKK) · güvenlik/uyumluluk belgeleri · DPA · erişilebilirlik/SLA · aşım ücretleri · **sert harcama limiti** (kredi kartı olmadan veya ücretlendirme kapatılabilir) · Next.js uyumu.

Storage sağlayıcısı değişirse yalnızca `src/server/storage/` altındaki adapter değişir (D-097; D-040 Superseded). **Hosting uyumluluk kriteri (PHASE 13, zorunlu):** 10 MiB ham PDF istek gövdesini kabul eden Node.js Route Handler (D-100) — ör. 4.5 MB gövde sınırlı Vercel Functions bu tasarımla uyumsuzdur; `worker_threads` + Node.js tip ayıklama (`.ts` worker) desteği; `pnpm storage:cleanup` için planlı bakım yolu. Hosting değişirse cron, region ve env yapılandırması değişir; uygulama kodu Node.js standartlarında kalır.

### 6.4 Beklenen maliyet

| Ortam | Maliyet |
|---|---|
| Development | **0** (yerel + Neon Free + Backblaze B2 ücretsiz 10 GB; kart yok, cap'ler $0) |
| Demo | **0** (Vercel Hobby + Neon Free + ayrı B2 bucket — oluşturulmadı; yalnızca sahte veri) |
| Production | **Hedef 0** — ticari kullanıma uygun ücretsiz altyapı bulunamazsa **production blocker** (PB-01). Ücretli plan yalnızca kullanıcı açıkça onaylarsa. Referans: Vercel Pro $20/ay + Neon Launch kullanım bazlı (~$5–10/ay tahmini, doğrulanmamış varsayımlarla). |

Harici servis yok: e-posta, SMS, antivirüs, Redis, kuyruk, APM, analytics, alan adı, ücretli DNS.

## 7. Yedekleme ve Geri Yükleme

- Neon Free geri yükleme penceresi **6 saat** — veri kaybı/yanlış silme için çok kısa; production sağlayıcısında yedek yeteneği bir seçim kriteridir (PB-08).
- Backblaze B2: bucket lifecycle "tüm versiyonları sakla"; uygulama yalnızca versiyona özgü siler (geri getirilemez). Replikasyon/Object Lock/ayrı yedek **yok ve doğrulanmadı**; tek kopya riski (PB-08). Gerçek müşteri verisinden önce yedekleme ve kurtarma stratejisi belirlenmelidir.
- ~~Geri yükleme provası production öncesi zorunlu (PHASE 13).~~ **OD-27 (2026-11-27):** uygulamaya özel yedek/geri yükleme ve prova kapsam dışı; veri kaybı kalan riski kullanıcı kabulü gerektirir (PB-08); sağlayıcı düzeyi geri yükleme manuel değerlendirilir (OPERATIONS_RUNBOOK §2).
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

## 14. Geliştirme Verisinin Production'a Taşınmaması (PHASE 10.2 — D-129)
- Production veritabanı **boş** oluşturulur ve yalnızca migration'larla kurulur; `neondb` (geliştirme) verisi, audit kayıtları (ör. PHASE 10.1 test izolasyonu olayının sentetik `TEST_EVENT` kaydı, id 970, ve PHASE 02 dönemi id 459), sentetik başvuru/hizmet/test oturumu kayıtları production'a **kopyalanmaz** (dump/restore yapılmaz).
- Production'da test komutları çalıştırılmaz; test izolasyon korumaları (D-129) yalnızca test araçlarıdır, production güvenlik kontrolü değildir.

## 15. PHASE 11 Notu — PDF teslimi ve görüntüleyici
- Hosting, Route Handler'da `Range`/`If-Range` istek başlıklarını ve `206`/`416` yanıtlarını değiştirmeden iletmelidir; `/api/files/*` ve `/api/portal/*/files/*` yanıtları paylaşılan önbelleğe/CDN'e alınmamalıdır (`private, no-store`). Edge/CDN katmanında Range birleştirme veya tam nesne önbellekleme yapılandırılmaz (D-104 koşulu).
- pdf.js worker'ı `/_next/static/chunks/` altında aynı kökenden sunulur; CSP `worker-src 'self'` gerektirir (proxy'de tanımlı). Harici CDN yok.
- Görüntüleme maliyet modeli ve günlük kapasite: [FILE_STORAGE.md](FILE_STORAGE.md) §7.1. Gerçek B2 Range doğrulaması PHASE 12.

## 16. Hosting Karşılaştırması (PHASE 12 — resmî belgeler, 2026-11-27)

Gereksinimler: ücretsiz ve ticari kullanıma uygun, mümkünse kartsız, Next.js 16 SSR + Server Actions + Route Handler akışı (Node.js), **10 MiB ham PDF gövdesi** (+ ek yük), HTTP Range/streaming/iptal, `worker_threads` (PDF doğrulama), HTTPS, secret yönetimi, log'larda token redaksiyonu, Neon/B2 erişimi.

| Aday | Ticari kullanım | Kart | İstek gövdesi | Hesaplama | Uygunluk |
|---|---|---|---|---|---|
| Vercel Hobby | **Hayır**: "only … for your personal or non-commercial use" (Terms §4); Hobby içeriğinin model eğitiminde kullanılabileceğine dair hüküm | Yok | **4,5 MB** ("request bodies up to 4.5 MB by default"; 20 MiB beta yalnız Pro/Enterprise) | 300 sn, 2 GB | **Uygun değil** (ticari + 10 MiB) |
| Netlify Free | Doğrulanamadı | Doğrulanamadı | Senkron yük sınırı doğrulanamadı (streaming: 60 sn, 20 MB yanıt); 300 kredi ≈ 15 GB bant | 1 GB | **Doğrulanamadı** |
| Cloudflare Workers Free | Kısıt bulunmadı (yalnız kart verisi işleme yasağı) | Yok | 100 MB (alan adı planı) | **10 ms CPU/istek**, 128 MB bellek; Next.js için önerilen yol `vinext` (beta) | **Uygun değil** (SSR + PDF doğrulama CPU'su; `worker_threads`/pdf.js uyumu doğrulanmadı) |
| Render Free | Doğrulanamadı (pazarlama metni "personal projects") | Ödeme yöntemi yoksa bant aşımında servis ay sonuna kadar askıya alınır | Doğrulanamadı | 15 dk boşta uyku (~1 dk uyanma), 750 saat/ay, 5 GB bant | **Koşullu** (ticari şart + gövde limiti doğrulanmalı; uyku süresi UX) |
| Railway Free | Doğrulanamadı | "no credit card" | Doğrulanamadı | Aylık 1 USD kaynak, 0,5 GB RAM, 5–10 dk uyku | **Muhtemelen yetersiz** (0,5 GB RAM + 256 MB doğrulama heap'i + Next.js) |
| Koyeb | Ücretsiz web instance'ı resmî fiyat sayfasında görünmüyor | Doğrulanamadı | — | — | **Uygun değil / doğrulanamadı** |

Sonuç: **ücretsiz ve ticari kullanıma uygun, 10 MiB yüklemeyi destekleyen doğrulanmış bir hosting bulunamadı → PB-01 açık.** Seçenekler (Product Owner kararı): küçük ücretli plan (ör. Vercel Pro $20/ay — OD-12 ile çelişir), yükleme mimarisi değişikliği (ör. doğrudan imzalı yükleme — D-100 güvenlik modelini değiştirir; önerilmez), şartları doğrulanmış başka bir sağlayıcı. Yeni hesap açılmadı, deployment yapılmadı.

Ek production gereksinimleri: HTTPS altında `__Host-` müşteri cookie'si ve `Secure` personel cookie'si, HSTS; güvenilen proxy başlıkları kullanılmaz (uygulama IP'ye dayanmaz); `/b/<token>` yolu için hosting erişim log'larında redaksiyon veya log kapatma (TM-15); `Range`/`If-Range` başlıkları ve 206/416 yanıtları değiştirilmeden iletilmeli; dosya yanıtları CDN önbelleğine alınmamalı.

## 17. Yedekleme (PHASE 12 güncellemesi)

Neon Free: 6 saat anlık geri yükleme penceresi ("up to 1 GB of changes"), 1 manuel snapshot, zamanlanmış yedek yok; uzun süreli koruma yalnızca `pg_dump` ile. Prosedürler: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §2. ~~Sentetik tatbikat: `pnpm test:restore-drill`.~~ (OD-27 ile kaldırıldı — özel yedek/geri yükleme kapsam dışı; yedek depolama maliyeti oluşturulmaz.) B2 versiyon geçmişi bağımsız yedek değildir; nesne yedeği kararı açıktır (PB-08). Yedek depolamanın maliyeti B2'de tutulursa OD-26 bütçesine dahil olur (ör. 10 GB ek yedek ≈ 0,83 USD/yıl).
