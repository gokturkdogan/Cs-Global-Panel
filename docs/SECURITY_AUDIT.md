# Güvenlik Denetimi — PHASE 12 (Testing & Security Audit)

> Tarih: 2026-11-27 · Kapsam: kaynak kod (HEAD `30a44e0` + çalışma ağacı), izole test ortamı, salt okunur Neon/B2 doğrulamaları.
> Bu belge bağımsız bir sızma testi sertifikası veya OWASP ASVS uyum beyanı **değildir**; ASVS Level 2 hedefli, kanıta dayalı bir iç denetimdir. Hukuki uyumluluk değerlendirmesi değildir.

## 1. Yöntem

- Referans: OWASP ASVS 4.0.x (Level 2 hedefli seçki: V2 kimlik doğrulama, V3 oturum, V4 erişim kontrolü, V5 girdi doğrulama/çıktı kodlama, V7 hata/log, V8 veri koruma, V9 iletişim, V12 dosya, V13 API, V14 yapılandırma), OWASP Top 10 (2021) ve ilgili Cheat Sheet'ler (Session Management, CSRF, XSS Prevention, File Upload, Logging). Güncel resmî sürüm metinleri bu oturumda ayrıca indirilmedi; kontrol başlıkları proje SECURITY.md eşlemesinden alınmıştır.
- Aktif testler **yalnızca** izole Docker PostgreSQL + geçici yerel depolama + sentetik veriyle (D-077/D-129). Neon üzerinde yalnızca salt okunur sorgular (parmak izi, yetki envanteri). Backblaze üzerinde yalnızca salt okunur çağrılar (`pnpm storage:inspect`; yazma/silme/içerik indirme yok). Sağlayıcı altyapısına tarama, fuzzing veya yük uygulanmadı.
- Her bulgu: kanıt (dosya/test/komut), kök neden, düzeltme, regresyon testi, yeniden test, kalan risk.
- Durumlar: OPEN, FIXED, VERIFIED, NOT VERIFIED, FALSE POSITIVE, RISK ACCEPTANCE REQUIRED. Risk kabulü Product Owner'a aittir.

## 2. Bulgu Kaydı

| ID | Önem | Bileşen | Bulgu | Kanıt | Durum |
|---|---|---|---|---|---|
| SEC-01 | MEDIUM | Backblaze uygulama anahtarı | Anahtar bucket'a kısıtlı fakat uygulamanın ihtiyacından geniş: `writeBuckets` (bucket'ı public yapabilir), `writeBucketLifecycleRules`, `writeBucketReplications`, `writeBucketEncryption`, `writeBucketNotifications`, `writeBucketLogging`, `shareFiles`. Sızıntıda zarar büyür (public bucket, replikasyonla veri dışarı aktarma, lifecycle ile toplu silme, paylaşılabilir indirme yetkisi). | `pnpm storage:inspect` (2026-11-27): `excessRisky` 7 yetki; `missingRequired` boş | **OPEN — kullanıcı işlemi** (yeni en az yetkili anahtar; OPERATIONS_RUNBOOK §3.1, D-143) |
| SEC-02 | MEDIUM | Müşteri bağlantısı `/b/[token]` | GET isteği müşteri oturumu cookie'si yazar ve `/portal`'a yönlendirir. **Cookie saklayan** bir önizleme/tarama istemcisi bağlantıyı izlerse portal HTML'indeki kişisel veriyi (ad, başvuru no, statü, evrak adları) alır. Cookie saklamayan istemci veri göremez; 303 yanıtı token/kişisel veri içermez. Gerçek WhatsApp önizleyicisinin cookie davranışı doğrulanmadı. | `security-audit.spec.ts` "bağlantı önizleme/tarayıcı" — `SEC-02 … gördü: true` | **RISK ACCEPTANCE REQUIRED** (azaltma seçeneği D-141: oturumu yalnızca kullanıcı onayıyla açan ara sayfa; ürün akışı değişikliği → kullanıcı kararı) |
| SEC-03 | MEDIUM | Yedekten geri yükleme | Yedek alındıktan sonra iptal edilen token / kalıcı silinen başvuru, geri yüklenen veritabanında **yeniden etkin** olur (resurrection). Ayrıca nesneler başka bucket'a kopyalanırsa `VersionId`'ler değişir; veritabanındaki versiyon kimlikleri yeni depoda çözülmez. | `pnpm test:restore-drill` — `tokenRevokedAfterBackupIsActiveAgain: true`; `versionIdsChanged: 3/3`, `dbVersionIdsResolvableInNewBucket: 0/3`, `sha256Matches: 3/3` | **OPEN** — prosedürle azaltıldı (OPERATIONS_RUNBOOK §2.4–2.5: müşteri erişimi açılmadan tüm token'ların iptali, silme kayıtlarının yeniden uygulanması, SHA-256 ile versiyon eşleme); otomatik koruma yok → yeni blocker **PB-12** (Proposed) |
| SEC-04 | LOW | Veritabanı runtime rolü | `cs_app_runtime` `users` ve `accounts` tablolarında INSERT/UPDATE yetkisine sahip. Uygulama hesap oluşturmaz (CLI + Better Auth hook'u engeller); SQL enjeksiyonu bulunmadı. Savunma derinliği eksikliği. | Neon salt okunur yetki envanteri (`information_schema.role_table_grants`) | **OPEN** — öneri D-144 (yetki daraltma migration'ı; Neon değişikliği kullanıcı onayı gerektirir) |
| SEC-05 | LOW | `rate_limit_buckets` | Süresi dolmuş satır temizliği yalnızca giriş denemesinde (≤100 satır). Dosya rate limit ve görüntüleme audit işaretleri birikir (yavaş, sınırlı büyüme). | `src/server/auth/rate-limit.ts` — tek temizlik noktası | **OPEN** — PHASE 13 zamanlanmış teknik temizliğe (cron) eklenecek |
| SEC-06 | LOW | `/b/[token]` | Bağlantı girişinde uygulama düzeyi rate limit yok (TD-04, D-093). 256 bit token kaba kuvvetle bulunamaz; risk DB arama yükü (DoS). | `src/app/b/[token]/route.ts` | **OPEN** — hosting/edge koruması (PB-01 kapsamı) |
| SEC-07 | LOW | CI | CI, commit eden izole integration/E2E paketlerini çalıştırmıyordu (yalnızca statik + unit + build). | `.github/workflows/ci.yml` (önce) | **FIXED** (izole Docker işi, D-145) — uzak çalıştırma **NOT VERIFIED** |
| SEC-08 | LOW | Erişilebilirlik | "İçeriğe geç" bağlantısında `px-4 py-2`, Tailwind 4'te `sr-only`'nin `padding: 0`'ını eziyordu (gizli 32×16 kutu). | `accessibility.spec.ts` ilk çalıştırma | **FIXED & VERIFIED** (`focus:px-4 focus:py-2`; odakta ≥ 24 px — 4 proje) |
| SEC-09 | INFORMATIONAL | Test ortamı | İzole test kotası geliştiricinin `.env.local`'ından miras alınıyordu (CI'da kod varsayılanı 100 GB olurdu). | `scripts/test/isolated-db.ts` | **FIXED** (kota açıkça 9 / 8 GB) |
| SEC-10 | INFORMATIONAL | Bağımlılık | `esbuild ≤0.24.2` (moderate, GHSA dev-server) yalnızca `drizzle-kit` geliştirme bağımlılığı üzerinden; dev-server kullanılmıyor, çalışma zamanında yok. | `pnpm audit --json` | **FALSE POSITIVE (çalışma zamanı)** — kontrolsüz yükseltme yapılmadı |
| SEC-11 | INFORMATIONAL | HTTP Range | Bozuk/çoklu aralık için 416 (RFC 9110 §14.2 "MAY reject"); bilinmeyen birim yok sayılır. Standart dışı değil; uyumluluk etkisi: çoklu aralık isteyen istemciler tam dosya yerine 416 alır. | `byte-range.test.ts`, `file-delivery.test.ts` | Belgelendi (D-135) |
| SEC-12 | LOW | Dar/geniş ekran düzeni | Veritabanı sınırındaki boşluksuz uzun adlar (hizmet 150, ad/soyad 100, evrak 150 karakter) yatay taşma oluşturuyordu: 320 px'de hizmet/evrak listeleri ve başarı ekranı (34 px); masaüstünde hizmet tablosu (768/1024 px'de 133 px), başvuru tablosu hücreleri, başvuru detayı başlığı (`PageHeader` — 376 px) ve hizmet filtresi `<select>`'i (en uzun seçeneğe göre genişleyip grid hücresini taşırıyordu — 17–39 px). Güvenlik değil bütünlük/erişilebilirlik (WCAG 1.4.10). | İzole E2E: ilk tam koşu 320 px 34 px; düzeltme sonrası güçlendirilmiş test 768/1024 px 133 px ve WebKit başvurular 39 px; teşhis ölçümü (4 proje × 12 ekran) | **FIXED & VERIFIED** — `break-words` → `wrap-anywhere` (listeler, tablo hücreleri, `PageHeader` başlık/açıklama), `<select>` ve filtre hücrelerine `min-w-0`; `accessibility.spec.ts` kendi sınır uzunluklu verisini tohumlar ve `/dashboard/applications/new`'i kapsar; 4 proje × 12 ekran taşma 0 |
| SEC-13 | LOW | Test bütünlüğü | İzole integration paketi dosya sırasına bağımlıydı: bazı dosyalar geçici `test-` hesabını global teardown'a kadar bırakır (hesap başına rol benzersiz); `auth.test.ts` yaşam döngüsü boş hesap tablosu varsayar. Varsayılan sırada auth önce koştuğu için gizliydi; `--sequence.shuffle.files` ile auth sona düşünce `başlangıçta hiç hesap olmamalı` başarısız. | Seed 11 dosya karıştırma: düzeltmesiz exit 1 (auth son dosya); düzeltmeli seed 11/22/33 + varsayılan sıra exit 0 | **FIXED & VERIFIED** — yaşam döngüsü başlangıcında global teardown ile aynı geçici veri temizliği (`tests/support/temporary-test-data.ts`); assertion değişmedi, gerçek/önek dışı hesap varsa yine başarısız |

**Özet**

| Önem | Bulunan | Düzeltildi & doğrulandı | Açık | Risk kabulü gerekli |
|---|---|---|---|---|
| CRITICAL | 0 | 0 | 0 | 0 |
| HIGH | 0 | 0 | 0 | 0 |
| MEDIUM | 3 | 0 | 2 (SEC-01, SEC-03) | 1 (SEC-02) |
| LOW | 7 | 3 (SEC-08, SEC-12, SEC-13) + 1 düzeltildi/uzakta doğrulanmadı (SEC-07) | 3 (SEC-04, SEC-05, SEC-06) | 0 |
| INFORMATIONAL | 3 | 1 (SEC-09) | 0 | 0 |

Kod düzeyinde istismar edilebilir CRITICAL/HIGH açık bulunmadı. Production engelleri ayrıca §5'tedir (bulgu sayılmaz; hazırlık eksikleridir).

## 3. Doğrulanan Kontroller (özet ve kanıt)

| Alan | Sonuç | Kanıt |
|---|---|---|
| Personel kimlik doğrulama | PASS (yerel) | `src/server/auth/auth.ts`: Better Auth yalnızca `auth.api` (HTTP route yok — `find src/app -name route.ts` yalnızca dosya ve `/b` route'ları); e-posta/kayıt kapalı; `user/account.create` hook'ları `false`; oturum 7 gün, yenilenmez, cookie cache kapalı; IP/UA saklanmaz. `signInAction`: genel hata, bilinmeyen kullanıcı adında sahte hash (uygulama + Better Auth `username/index.mjs:170`), kullanıcı adı HMAC'li sayaç + bilinmeyen adlar ortak sayacı (IP/proxy başlığı kullanılmaz → sahte `X-Forwarded-For` etkisiz). `auth.spec.ts` kapalı uç noktalar. |
| Eşit personel yetkisi | PASS | `requireStaff()` tek kontrol; RBAC yok; E2E iki hesap aynı ekran/aksiyon (önceki fazlar + bu fazın regresyonu). |
| Müşteri token güvenliği | PASS | `src/server/access-tokens/crypto.ts`: `randomBytes(32)` (256 bit), kanonik base64url, HMAC-SHA256 arama, AES-256-GCM (rastgele 96 bit IV, 128 bit tag, AAD başvuru+token), çoklu anahtar kimliği; müşteri oturumu HMAC imza + `timingSafeEqual`, `__Host-` (https), HttpOnly, SameSite=Lax. |
| Müşteri oturum izolasyonu | PASS (emülasyon) | `security-audit.spec.ts` HEAD/Range matrisi; `portal.spec.ts`, `workflow.spec.ts` çoklu sekme/eski bağlam/iptal/yenileme/süre; `file-delivery.test.ts` kapsam. |
| Yetki matrisi / IDOR | PASS | Dosya uç noktaları: anonim → 401, müşteri → personel route 401, personel → müşteri route 401, A→B dosyası 404 (boyut/ETag/Content-Range/PDF baytı yok), bağlam uyuşmazlığı, iptal → reddedildi; yetkisiz istek sağlayıcıya 0 GET (`file-delivery.test.ts`, B11). Server action'lar önceki fazların yetki testleri (`privileges`, `operations`, `workflow`). |
| CSRF / köken | PASS | Server Action'lar Next.js Origin/Host kontrolü + proxy köken kontrolü (D-069); dosya yükleme route'larında `isSameOriginRequest` (Origin zorunlu) — `documents.spec.ts` yabancı/eksik köken 403. |
| XSS | PASS | Kaynakta `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` yok. `security-audit.spec.ts`: ad, hizmet, evrak adı/talimatı, yorum, iç not, düzeltme açıklaması, dosya adı yükleri personel (5 ekran) + müşteri panelinde çalışmaz, düz metin görünür (4 proje). |
| SQL enjeksiyonu | PASS | Drizzle parametreli sorgular; `sql\`\`` şablonları parametre bağlar; dinamik tanımlayıcı yok (sıralama/filtre allowlist — `parseAuditFilters`, liste şemaları). |
| Güvenlik başlıkları / önbellek | PASS (yerel HTTP) | Nonce CSP + `worker-src 'self'`, `frame-ancestors 'none'`, `nosniff`, `no-store`, `no-referrer` (müşteri/dosya), CORP; çıkış sonrası geri tuşu içerik göstermiyor (Chrome, WebKit). HSTS/Secure cookie production HTTPS'te **doğrulanmadı**. |
| Log/sızıntı | PASS (uygulama) / NOT VERIFIED (hosting) | Hata logları yalnızca kod/ad; iç not müşteri yüküne girmez (S16 + XSS testi); client bundle canary kontrolü; perf/ekran görüntüsü artifact'larında yalnızca sentetik veri. Hosting erişim loglarında token redaksiyonu doğrulanmadı. |
| Rate limit | PASS | Sınıflar normalize uzunlukla (tam 1 MiB sınırı, If-Range uyuşmazlığı → transfer); müşteri A 600 HEAD sonrası 429, müşteri B ve personel etkilenmez; reddedilen istek dosya baytı/Content-Range içermez; sayaç maliyeti ~13–23 ms/istek (yerel). |
| PDF yükleme | PASS | Sentetik korpus (`pdf-validation.test.ts`, `documents.test.ts`): 10 MiB sınırı ±1, boş, PDF olmayan, polyglot, kesik, bozuk xref, şifreli, JS/Launch/SubmitForm/GoToR/RichMedia/XFA, gömülü dosya, sıkıştırma bombası, derin iç içelik, çok sayfalı; izole worker + süre/heap/sayfa/nesne sınırları. **Antivirüs değildir** (PB-05). |
| PDF görüntüleyici (D-136) | PASS (emülasyon) | Harici `/URI` bağlantısı + form alanı içeren PDF: tıklamada gezinme/popup/harici istek yok, DOM'a bağlantı/giriş alanı eklenmez; 5 aç/kapat sonrası 0 worker; pdf.js 6.5.438'de `eval`/`new Function` yok; WASM kapalı; annotation katmanı kapalı; tuval ≤ 16,7 MP; kalıcı depolama yok (statik test). Gerçek cihaz **doğrulanmadı**. |
| Range / sürüm / audit (D-135) | PASS (izole) | `byte-range.test.ts` (29), `b2-range.test.ts` (7, sahte S3), `file-delivery.test.ts` (19): tam/kapalı/açık/sonek, EOF ötesi, bozuk/çoklu/taşma/boş, If-Range; sağlayıcıya yalnız aralık + kayıtlı VersionId; 200/uyuşmazlık → 502; kısa/uzun gövde; iptal. Audit tekilleştirme: deterministik kilit testi (`pg_stat_activity` kilit beklemesi), 6 eşzamanlı istek → 1 kayıt, ADMIN/EMPLOYEE/müşteri ayrı, indirme bastırılmaz. Audit "yetkili erişim (görüntüleme oturumu)" semantiğidir; belgenin tamamen okunduğunu kanıtlamaz. Gerçek B2 **doğrulanmadı**. |
| Veritabanı en az yetki | PASS (bir LOW) | Neon: runtime hiçbir nesnenin sahibi değil, rol üyeliği yok, `public` CREATE/TEMP yok; audit yalnız INSERT/SELECT + UPDATE/DELETE/TRUNCATE trigger'ı; SEC-04. |
| Eşzamanlılık / silme / yazım güvenliği | PASS (izole) | A–K (`deletion-write-safety.test.ts`), R1–R7 (`reconcile-safety.test.ts`), 09.1 matrisi (`concurrency.test.ts`), kota 100 GB sınırları (`storage-capacity.test.ts`). |
| Yedek/geri yükleme | PARTIAL | Sentetik tatbikat PASS (şema/kısıt/indeks/trigger/yetki/parmak izi aynı; audit değiştirilemez; silme koruması); SEC-03 açık; Neon Free'de zamanlanmış yedek yok (PB-08). |
| Erişilebilirlik | PARTIAL | `accessibility.spec.ts`: adsız kontrol yok, dokunma hedefi (2.5.8), 320 px taşma yok, diyalog odak kapanı (4 proje). Kontrast, ekran okuyucu, gerçek cihaz **doğrulanmadı**. Tam WCAG uyum iddiası yoktur. |

## 4. Tehdit Kapsamı Matrisi (PHASE 12)

| Tehdit | TM | Azaltma | Test / kanıt | Sonuç | Kalan risk |
|---|---|---|---|---|---|
| Kimlik doğrulama atlatma / hesap yönetimi uç noktaları | TM-02, TM-09, TM-12, TM-23 | Sunucu tarafı `requireStaff`, HTTP auth route yok | `auth.spec.ts`, `privileges.test.ts` | PASS | Düşük |
| IDOR / çapraz müşteri | TM-01, TM-02, TM-03 | Kapsam yalnız oturumdan; 404 | `security-audit.spec.ts`, `file-delivery.test.ts` | PASS | Düşük |
| Çalınan / iptal edilmiş bağlantı | TM-11, TM-13, TM-14, TM-15 | İptal/yenileme anında; HMAC arama | `portal.spec.ts`, `file-delivery.test.ts` | PASS | Bearer doğası (PB-04) |
| Eski bağlam / çoklu sekme | TM-40 | URL bağlamı = cookie bağlamı | `workflow.spec.ts`, `portal.spec.ts` | PASS | Düşük |
| Oturum hırsızlığı / sabitleme / müşteri cookie sahteciliği | TM-07, TM-08, TM-22, TM-49 | HttpOnly, SameSite, 7 gün sabit, DB doğrulama | kod + `auth.spec.ts` | PASS (yerel) | HTTPS doğrulanmadı |
| XSS / CSRF / SQLi | TM-04, TM-05, TM-06 | React kaçışı, nonce CSP, Origin, parametreli SQL | `security-audit.spec.ts`, `documents.spec.ts` | PASS | Düşük |
| Kötü amaçlı PDF | TM-16, TM-53, TM-58 | Yapısal doğrulama, izole worker, görüntüleyici aktif içerik kapalı | `pdf-validation.test.ts`, `security-audit.spec.ts` | PASS | Antivirüs yok (PB-05) |
| Kaynak / bant genişliği tüketimi | TM-31, TM-50, TM-57 | Sınıf bazlı rate limit, 416 sağlayıcısız, kota | `security-audit.spec.ts`, `file-delivery.test.ts` | PASS | Hesap cap'i ayrıca |
| Yarış koşulları | TM-21, TM-52, TM-55 | Kilit sırası, expectedVersion, kalıcı yazım girişimi | A–K, `concurrency.test.ts` | PASS | Düşük |
| Belirsiz yazım / eksik silme | TM-27, TM-28, TM-55, TM-56 | Gözlemle çözüm, fail-closed sonlandırma | A–K, R1–R7 | PASS (izole) | Gerçek B2 doğrulanmadı |
| Kimlik bilgisi sızıntısı | TM-33, TM-39, TM-42, TM-48, TM-51 | Env-only, bundle canary | `check:bundle`, `storage:inspect` | PARTIAL | SEC-01 |
| Yedek kaybı / silinmiş verinin geri dönüşü | TM-29, TM-60 (yeni) | Runbook | `test:restore-drill` | PARTIAL | SEC-03, PB-08 |
| Log sızıntısı / iç not sızıntısı | TM-15, TM-19, TM-54 | Kod/ad loglama | kod + testler | PASS (uygulama) | Hosting logları |
| Tarayıcı önbelleği | TM-20 | `no-store` | geri tuşu testi | PASS (2 motor) | bfcache garanti değildir |
| WhatsApp önizleme | TM-59 (yeni) | GET yan etkisiz; 303 veri içermez | `security-audit.spec.ts` | PARTIAL | SEC-02 |
| Audit manipülasyonu / yüksek yetkili rol | TM-35, TM-41 | Append-only trigger, runtime en az yetki | Neon yetki envanteri, `test:restore-drill` (42501) | PASS | SEC-04 |
| Test ortamı mutasyonu | TM-34, TM-43, TM-45 | D-129 korumaları + parmak izi | `test-isolation.test.ts`, her koşu | PASS | Düşük |
| Sağlayıcı kesintisi / ücretsiz altyapı | TM-30, TM-52 | Fail-closed 503, kayıt korunur | `file-delivery.test.ts` | PASS | İzlenmeli |
| Bağımlılık ele geçirme | TM-32 | Sabit sürüm, script engeli, 24 saat bekleme, audit | `pnpm-workspace.yaml`, `pnpm audit` | PASS | Düşük |

## 5. Production Blocker Matrisi (PB-01…PB-11 + önerilen)

| PB | Gereksinim | Durum | Kanıt | Kalan eksik | Gerekli işlem / sahibi | Kullanıcı onayı | PHASE 13 |
|---|---|---|---|---|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage | **OPEN** | DEPLOYMENT §16: Vercel Hobby ticari değil + 4,5 MB gövde; Cloudflare Free 10 ms CPU; Render/Railway ticari koşul doğrulanmadı | 10 MiB yükleme + ticari ücretsiz hosting bulunamadı | Hosting kararı / Product Owner | Evet | Bağımlı |
| PB-02 | Depolama kapasitesi | **BLOCKED BY EXTERNAL ACTION** | D-140 kod hazır; aktif 9 GB | Ödeme/cap hazırlığı | Kullanıcı (panel) | Evet | Bağımlı |
| PB-03 | KVKK değerlendirmesi | **OPEN** | DATA_PRIVACY §13 kontrol listesi | Hukuki görüş, aydınlatma, yurt dışı aktarım, VERBİS | Hukuk / Product Owner | Evet | Bağımlı |
| PB-04 | Bearer link yazılı risk kabulü | **RISK ACCEPTANCE REQUIRED** | SEC-02, TM-13, TM-14, TM-15, TM-59 | Yazılı kabul (veya D-141) | Product Owner | Evet | — |
| PB-05 | Antivirüssüz PDF yazılı risk kabulü | **RISK ACCEPTANCE REQUIRED** | Yapısal doğrulama testleri | Yazılı kabul + personel cihaz önlemleri | Product Owner | Evet | — |
| PB-06 | Production ortam izolasyonu | **OPEN** | D-098 (prod geliştirme bucket'ını reddeder), D-129 | Ayrı prod DB/bucket/anahtarlar | Kullanıcı + PHASE 13 | Evet | Bağımlı |
| PB-07 | Yetki/güvenlik testleri | **VERIFIED — ACCEPTANCE PENDING** | §3, §7 (izole tam paketler, iki E2E koşusu retry 0) | Gerçek cihaz/hosting HTTPS ayrı | Product Owner kabulü | Evet | — |
| PB-08 | Yedek/geri yükleme | **PARTIALLY VERIFIED** | Sentetik tatbikat PASS; Neon Free 6 saat geri yükleme, 1 manuel snapshot, zamanlanmış yedek yok | Yedek politikası + nesne yedeği + SEC-03 | Product Owner + PHASE 13 | Evet | Bağımlı |
| PB-09 | Bağımlılık taraması temiz | **VERIFIED — ACCEPTANCE PENDING** | `pnpm audit --audit-level=high` temiz; 1 moderate dev-only (SEC-10) | — | Product Owner kabulü | Evet | Yeniden tarama |
| PB-10 | Better Auth kapalı uç noktalar, IP/UA yok | **VERIFIED — ACCEPTANCE PENDING** | `auth.spec.ts`, kod | IP başlık güvenilirliği hosting'de (kullanılmıyor) | Product Owner kabulü | Evet | — |
| PB-11 | Gerçek iletişim bilgileri + katalog | **BLOCKED BY EXTERNAL ACTION** | Bekleyen girdi | Bilgiler | Product Owner | Evet | Bağımlı |
| PB-12 (Proposed) | Geri yükleme sonrası silinmiş veri/iptal edilmiş token geri dönüşünün önlenmesi | **OPEN** | SEC-03 | Prosedürün production'da uygulanması / otomasyon kararı | Product Owner | Evet | Bağımlı |
| PB-13 (Proposed) | En az yetkili B2 anahtarı + gerçek sağlayıcı doğrulaması (Range, versiyon silme, listeleme/mutabakat, cap davranışı) | **BLOCKED BY EXTERNAL ACTION** | SEC-01; Checkpoint B onayı yok | Anahtar yenileme + B2-01…B2-18 | Kullanıcı | Evet | Bağımlı |

## 6. Production Hazırlık Kontrol Listesi

- [ ] Hosting seçimi (ticari ücretsiz, 10 MiB gövde, Node.js, streaming, log redaksiyonu) — PB-01
- [ ] Ayrı production Neon projesi + B2 bucket + bağımsız anahtarlar — PB-06
- [ ] En az yetkili B2 anahtarı (SEC-01) ve `pnpm storage:inspect` temiz
- [ ] Gerçek B2 doğrulaması B2-01…B2-18 (Checkpoint B onayı) — PB-13
- [ ] Ödeme yöntemi, cap'ler, uyarılar (kullanıcı) ve 100 GB etkinleştirme kapısı — PB-02, D-140
- [ ] Yedek politikası (pg_dump sıklığı/saklama, nesne yedeği) + geri yükleme sonrası prosedür — PB-08, PB-12
- [ ] KVKK: aydınlatma, yurt dışı aktarım, DPA, saklama/imha, VERBİS, ihlal prosedürü — PB-03
- [ ] Yazılı risk kabulleri — PB-04 (bearer link), PB-05 (antivirüs)
- [ ] HTTPS, `Secure`/`__Host-` cookie, HSTS doğrulaması (gerçek alan adında)
- [ ] Gerçek cihaz + WhatsApp in-app tarayıcı kontrol listesi (VERIFICATION_PLANS §2)
- [ ] Uzak GitHub CI'ın yeşil çalışması (izole iş dahil)
- [ ] Gerçek iletişim bilgileri ve katalog — PB-11

**Production GO/NO-GO: NO-GO** (açık blocker'lar; CRITICAL/HIGH kod bulgusu yok).

## 7. Kalite Kapıları (son kod hâli, 2026-11-27)

Tam tablo, ilk başarısızlıklar ve test sonrası kontroller: [PROJECT_STATE.md — Latest Verification Results (PHASE 12)](PROJECT_STATE.md). Özet: tüm kapılar exit 0; unit 495/495; integration `neondb` 58/0/17, izole 261/0/10 (varsayılan sıra + dosya karıştırma seed 11/22/33); E2E `neondb` 267/0/357; izole E2E #1 ve #2 507/0/117 (retry 0); `pnpm run audit` temiz (1 moderate dev-only). `neondb` parmak izi sabit (audit 155, son id 970).
