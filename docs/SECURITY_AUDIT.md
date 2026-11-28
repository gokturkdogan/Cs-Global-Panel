# Güvenlik Denetimi — PHASE 12 (Testing & Security Audit) + PHASE 12.1 (Targeted Remediation)

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
| PB-02 | Depolama kapasitesi (OD-28: lansman 9 GB / 8 GB ücretsiz) | **OPEN — ücretsiz hesap limitlerinin doğrulanması** | Aktif ve production değeri 9/8 GB (D-151 zorunlu env); ücretli 100 GB aktivasyonu lansman gereksinimi DEĞİL (OD-28) | Ücretsiz katman limitleri ve hesap cap'lerinin 9 GB / günlük indirme / işlem kullanımını karşıladığının panelde doğrulanması | Kullanıcı (panel) | Evet | Bağımlı |
| PB-03 | KVKK değerlendirmesi | **OPEN** | DATA_PRIVACY §13 kontrol listesi | Hukuki görüş, aydınlatma, yurt dışı aktarım, VERBİS | Hukuk / Product Owner | Evet | Bağımlı |
| PB-04 | Bearer link yazılı risk kabulü | **RISK ACCEPTANCE REQUIRED** | SEC-02, TM-13, TM-14, TM-15, TM-59 | Yazılı kabul (veya D-141) | Product Owner | Evet | — |
| PB-05 | Antivirüssüz PDF yazılı risk kabulü | **RISK ACCEPTANCE REQUIRED** | Yapısal doğrulama testleri | Yazılı kabul + personel cihaz önlemleri | Product Owner | Evet | — |
| PB-06 | Production ortam izolasyonu | **OPEN** | D-098 (prod geliştirme bucket'ını reddeder), D-129 | Ayrı prod DB/bucket/anahtarlar | Kullanıcı + PHASE 13 | Evet | Bağımlı |
| PB-07 | Yetki/güvenlik testleri | **VERIFIED — ACCEPTANCE PENDING** | §3, §7 (izole tam paketler, iki E2E koşusu retry 0) | Gerçek cihaz/hosting HTTPS ayrı | Product Owner kabulü | Evet | — |
| PB-08 | Yedek/geri yükleme (OD-27 ile kapsam: veri kaybı kalan riski) | **RESIDUAL RISK / USER ACCEPTANCE REQUIRED** (OD-27; önceki: PARTIALLY VERIFIED) | Sentetik tatbikat PASS; Neon Free 6 saat geri yükleme, 1 manuel snapshot, zamanlanmış yedek yok | Yedek politikası + nesne yedeği + SEC-03 | Product Owner + PHASE 13 | Evet | Bağımlı |
| PB-09 | Bağımlılık taraması temiz | **VERIFIED — ACCEPTANCE PENDING** | `pnpm audit --audit-level=high` temiz; 1 moderate dev-only (SEC-10) | — | Product Owner kabulü | Evet | Yeniden tarama |
| PB-10 | Better Auth kapalı uç noktalar, IP/UA yok | **VERIFIED — ACCEPTANCE PENDING** | `auth.spec.ts`, kod | IP başlık güvenilirliği hosting'de (kullanılmıyor) | Product Owner kabulü | Evet | — |
| PB-11 | Gerçek iletişim bilgileri + katalog | **BLOCKED BY EXTERNAL ACTION** | Bekleyen girdi | Bilgiler | Product Owner | Evet | Bağımlı |
| PB-12 (**ACCEPTED** blocker, 2026-11-27) | Geri yükleme sonrası silinmiş veri/iptal edilmiş token geri dönüşü (OD-27 ile kapsam: sağlayıcı düzeyi geri yükleme kalan riski) | **RESIDUAL RISK / USER ACCEPTANCE REQUIRED** (OD-27 — özel araçlar kaldırıldı; manuel değerlendirme OPERATIONS_RUNBOOK §2) | SEC-03 | Prosedürün production'da uygulanması / otomasyon kararı | Product Owner | Evet | Bağımlı |
| PB-13 (**ACCEPTED** blocker, 2026-11-27) | En az yetkili B2 anahtarı + gerçek sağlayıcı doğrulaması (Range, versiyon silme, listeleme/mutabakat, cap davranışı) | **PARTIALLY VERIFIED** (anahtar yenileme + adım E tamam, 2026-11-28; Checkpoint B onay bekliyor) | SEC-01; Checkpoint B onayı yok | Anahtar yenileme + B2-01…B2-18 | Kullanıcı | Evet | Bağımlı |

## 6. Production Hazırlık Kontrol Listesi

- [ ] Hosting seçimi (ticari ücretsiz, 10 MiB gövde, Node.js, streaming, log redaksiyonu) — PB-01
- [ ] Ayrı production Neon projesi + B2 bucket + bağımsız anahtarlar — PB-06
- [ ] En az yetkili B2 anahtarı (SEC-01) ve `pnpm storage:inspect` temiz
- [ ] Gerçek B2 doğrulaması B2-01…B2-18 (Checkpoint B onayı) — PB-13
- [ ] Ödeme yöntemi, cap'ler, uyarılar (kullanıcı) ve 100 GB etkinleştirme kapısı — PB-02, D-140
- [ ] Veri kaybı ve sağlayıcı düzeyi geri yükleme kalan riskinin yazılı kabulü (OD-27 — özel yedek yok) — PB-08, PB-12
- [ ] KVKK: aydınlatma, yurt dışı aktarım, DPA, saklama/imha, VERBİS, ihlal prosedürü — PB-03
- [ ] Yazılı risk kabulleri — PB-04 (bearer link), PB-05 (antivirüs)
- [ ] HTTPS, `Secure`/`__Host-` cookie, HSTS doğrulaması (gerçek alan adında)
- [ ] Gerçek cihaz + WhatsApp in-app tarayıcı kontrol listesi (VERIFICATION_PLANS §2)
- [ ] Uzak GitHub CI'ın yeşil çalışması (izole iş dahil)
- [ ] Gerçek iletişim bilgileri ve katalog — PB-11

**Production GO/NO-GO: NO-GO** (açık blocker'lar; CRITICAL/HIGH kod bulgusu yok).

## 7. Kalite Kapıları (son kod hâli, 2026-11-27)

Tam tablo, ilk başarısızlıklar ve test sonrası kontroller: [PROJECT_STATE.md — Latest Verification Results (PHASE 12)](PROJECT_STATE.md). Özet: tüm kapılar exit 0; unit 495/495; integration `neondb` 58/0/17, izole 261/0/10 (varsayılan sıra + dosya karıştırma seed 11/22/33); E2E `neondb` 267/0/357; izole E2E #1 ve #2 507/0/117 (retry 0); `pnpm run audit` temiz (1 moderate dev-only). `neondb` parmak izi sabit (audit 155, son id 970).

## 8. PHASE 12.1 — Hedefli Düzeltmeler ve Bağımsız İnceleme (2026-11-27)

Kapsam: D-141…D-145 kullanıcı kararları, PB-12/PB-13 kabulü ve bağımsız kaynak kodu incelemesi (REVIEW-01…06). Önceki SEC-01…SEC-13 kayıtları ve geçmiş durumları yukarıda korunur; değişiklikler aşağıdadır. Tüm doğrulamalar izole Docker PostgreSQL + yerel/sahte sağlayıcı üzerinde; gerçek B2'de mutasyon yok.

### 8.1 SEC durum değişiklikleri

| Bulgu | PHASE 12 | PHASE 12.1 | Kanıt | Kalan risk |
|---|---|---|---|---|
| SEC-01 (MEDIUM) B2 anahtarı fazla yetkili | OPEN | **FIXED & VERIFIED** (2026-11-28) | Yeni anahtar: `storage:inspect` v4 — yalnızca 4 gerekli yetki, tek bucket, önek yok, riskli/beklenmeyen yok; adım E (`storage:verify`) PASS; eski anahtar kullanıcı tarafından iptal edildi, iptal sonrası inspect PASS | Yeni anahtar panelde görünmüyor (v4 API ile yönetim; neden doğrulanmadı) |
| SEC-02 (MEDIUM) bağlantı önizleme verisi | RISK ACCEPTANCE REQUIRED | **PARTIAL** (D-141 uygulandı) | GET/HEAD oturum 0, cookie 0, kişisel veri 0; cookie saklayan + yönlendirme izleyen istemci portal verisine ulaşamaz (`security-audit.spec.ts`, `customer-link.spec.ts` C1–C17) | Bilinçli POST yapan/bağlantıyı ele geçiren istemci (PB-04); gerçek WhatsApp doğrulanmadı |
| SEC-03 (MEDIUM) geri yükleme sonrası geri dönüş | OPEN | **PARTIAL** | `pnpm test:restore-drill` R-A…R-I + `pnpm ops:post-restore` (kilitleme + GO/NO-GO) | Başlamış-ama-nesnesi-silinmemiş silme tespit edilemez; bucket değişiminde eşleme uygulanamaz (D-148) → PB-12 OPEN |
| SEC-04 (LOW) runtime users/accounts yazma | OPEN | **FIXED & VERIFIED** (izole + `neondb`, 2026-11-27) | migration 0011; `privileges.test.ts` matris + 10 negatif test (Neon'da da PASS); auth yaşam döngüsü sahip rolüyle | — |
| SEC-05 (LOW) rate limit tablosu birikmesi | OPEN | **FIXED & VERIFIED** | `pnpm ops:rate-limit-cleanup` (dry-run/--apply, sınırlı); `rate-limit-cleanup.test.ts` (yalnızca süresi dolmuş satırlar; eşzamanlı artışta sınır aşılmaz) | Komut elle/planlı çalıştırılır (cron yok) |
| SEC-06 (LOW) `/b` rate limit yok | OPEN | **PARTIAL** (D-150) | geçerli token başına 30/saat; geçersiz token satır üretmez (`customer-link.spec.ts` SEC-06) | Hacimsel kötüye kullanım için edge/hosting koruması (PB-01) |
| SEC-07…SEC-13 | — | değişmedi (korundu; regresyon PASS) | son tam koşular | SEC-07 uzak CI doğrulanmadı |

### 8.2 Bağımsız inceleme bulguları (REVIEW-01…06)

| Bulgu | Önceki durum | Yeniden üretildi | Düzeltme | Test kanıtı | Güncel durum | Kalan risk |
|---|---|---|---|---|---|---|
| REVIEW-01 PDF audit tekilleştirme atomikliği → **SEC-14 (HIGH)** | Bilinmiyordu | **EVET** — audit reddedilirken 6 eşzamanlı parça isteğinden 5'i audit'siz teslim edildi; başarısız ilk istekten sonra işaret kaldı | İşaret + audit tek kısa transaction ([service.ts:904](../src/features/documents/service.ts#L904), çağrı :995); sağlayıcı okuması commit sonrası | `file-delivery.test.ts` REVIEW-01 A2/A3/A13, A5, A7/A10 + mevcut kilit/eşzamanlılık (22/22) | **FIXED & VERIFIED** | Audit "yetkili görüntüleme penceresi"dir, tam okuma kanıtı değildir |
| REVIEW-02 worker temizliği (başlatma hatası) → **SEC-15 (MEDIUM)** | Bilinmiyordu | **EVET** — ilk aralık 500/429/404/ağ hatası ve erken kapatmada 1 worker kaldı (eski kodla) | Kaynak oluşturulduğu anda serbest bırakma listesi; tek, idempotent `release` ([pdf-viewer.tsx:65](../src/features/documents/components/pdf-viewer/pdf-viewer.tsx#L65)) | `viewer-lifecycle.spec.ts` W2–W7, W10, W13–W15 (4 proje); statik test | **FIXED & VERIFIED** | Worker sayısı tüm bellek kaynaklarının kanıtı değildir |
| REVIEW-03 tuval kaynak sınırı → **SEC-16 (MEDIUM)** | Bilinmiyordu | **EVET** — 0,25 tabanı dev sayfada 56,25 MP (sınırın 3 katı); aşırı uzun sayfada güvenli hata yoktu | `computeCanvasSize` ([canvas-size.ts:30](../src/features/documents/components/pdf-viewer/canvas-size.ts#L30)): taban yok, kenar ≤ 8192, toplam ≤ 16 777 216, tamsayı yeniden doğrulama, okunaksız ölçekte güvenli hata | `canvas-size.test.ts` (10) + `viewer-lifecycle.spec.ts` REVIEW-03 (gerçek çizim yolu) | **FIXED & VERIFIED** | Ayrıştırıcı/çizici belleğinin mutlak sınırı değildir |
| REVIEW-04 geri yükleme kimliği ve geri dönüş (SEC-03 ile aynı kök neden) | SEC-03 OPEN | **EVET** — tatbikat: iptal/yenilenmiş 2 token, kapatılmış oturum, 3 silinmiş/silinmekte başvuru geri döndü; kopyada 5/5 VersionId değişti | `ops:post-restore` kilitleme + rapor; tam eşleme planı (uygulanmaz) | `test:restore-drill` (phase121 bölümü) | **PARTIAL** | PB-12 OPEN (başlamış silme tespit edilemez; D-148 kararı) |
| REVIEW-05 kapasite varsayılanı → **SEC-17 (MEDIUM)** | Bilinmiyordu | **EVET** — env yoksa 100 GB kod tavanı aktif oluyordu | production/preview'da zorunlu, development 9/8 GB ([config.ts:93](../src/server/storage/config.ts#L93)) | `tests/unit/documents.test.ts` REVIEW-05 (2 test) | **FIXED & VERIFIED** | Aktif değer yine kullanıcı onayıyla değişir |
| REVIEW-06 sağlayıcı yanıtı / belirsiz yazım → **SEC-18 (MEDIUM)** | D-135 koşullu | **EVET** — eksik VersionId kabul ediliyordu; kodsuz 404 "yok" sayılıyordu; aynı boyutlu farklı içerik CONFIRMED olabiliyordu | Sıkı versiyon kimliği ([b2.ts:230](../src/server/storage/b2.ts#L230), servis :1025), kodlu "yok" sınıflandırması (b2.ts:105), sınırlı SHA-256 gözlem doğrulaması ([service.ts:855](../src/features/documents/service.ts#L855)); `settleStorageWrite` gerçekten kaydedip kaydetmediğini döndürür | `b2-range.test.ts` P1–P3, P8, P9 (11); `documents.test.ts` P10, P12, P13; mevcut A–K, R1–R7 | **FIXED & VERIFIED (izole)** | Gerçek B2 başlık/hata davranışı NOT VERIFIED (Checkpoint B); P11 tasarımla güvenli (girişime özgü anahtar + benzersizlik indeksi) |

P14 (eşzamanlı gözlem/silme/temizlik) ve P15 (yetkisiz/HEAD sıfır GET) mevcut A–K, R1–R7 ve `file-delivery.test.ts` regresyonuyla korunur.

### 8.3 Özet (PHASE 12.1 sonrası)

| Önem | Bulunan (toplam) | Düzeltildi & doğrulandı | Açık | Risk kabulü gerekli |
|---|---|---|---|---|
| CRITICAL | 0 | 0 | 0 | 0 |
| HIGH | 1 (SEC-14) | 1 | 0 | 0 |
| MEDIUM | 7 (SEC-01…03, SEC-15…18) | 5 (SEC-01, SEC-15…18) | 2: SEC-02 kısmi; SEC-03 risk kabulü (OD-27) | SEC-02 kalanı (PB-04), SEC-03 |
| LOW | 7 | 5 (SEC-04, 05, 08, 12, 13) + SEC-07 uzak doğrulanmadı | SEC-06 kısmi | 0 |
| INFORMATIONAL | 3 | 1 | 0 | 0 |

Açık CRITICAL/HIGH: **0**. HIGH bulgu SEC-14 kod düzeyinde düzeltildi ve doğrulandı.

### 8.4 Hazırlık ayrımı

| Boyut | Durum |
|---|---|
| PHASE 12.1 mühendislik tamamlama | PARTIAL (yerel düzeltmeler tamam; Neon migration, gerçek sağlayıcı ve dış doğrulamalar bekliyor) |
| İzole güvenlik doğrulaması | PASS (bkz. PROJECT_STATE — kapı tablosu) |
| Gerçek sağlayıcı doğrulaması | NOT VERIFIED (Checkpoint B onaysız) |
| Operasyonel kurtarma hazırlığı | KAPSAM DIŞI (OD-27) — kalan risk kullanıcı kabulü bekliyor (PB-08, PB-12) |
| Hukuk/gizlilik hazırlığı | OPEN (PB-03) |
| Production hosting hazırlığı | OPEN (PB-01) |
| Production deployment | **NO-GO** |

## 9. OD-27 — Özel Yedek/Geri Yükleme Altyapısının Kaldırılması (2026-11-27)

Kullanıcı kararı OD-27 (ACCEPTED): uygulamaya özel yedekleme/geri yükleme/felaket kurtarma altyapısı kapsam dışı. Kaldırılanlar: `scripts/test/restore-drill.ts` (`pnpm test:restore-drill`), `scripts/ops/post-restore.ts` + `scripts/ops/post-restore-check.ts` (`pnpm ops:post-restore`: kilitleme, GO/NO-GO raporu, `planVersionMapping`). Ortak yardımcı veya çalışma zamanı kodu kaldırılmadı (bu dosyaları başka kod kullanmıyordu). Önceki kanıtlar (§3, §4, §8) tarihçe olarak korunur.

| Kayıt | Önceki | OD-27 sonrası | Gerekçe |
|---|---|---|---|
| SEC-03 (MEDIUM) geri yükleme sonrası geri dönüş | PARTIAL (araçlarla azaltılmış) | **RISK ACCEPTANCE REQUIRED** — teknik olarak ÇÖZÜLMEDİ | Kök neden (eski nokta sonraki iptal/silmeleri bilmez; kopyada VersionId değişir) sağlayıcı düzeyi geri yüklemede geçerli; azaltma artık manuel değerlendirmedir (OPERATIONS_RUNBOOK §2) |
| REVIEW-04 | PARTIAL | **RISK ACCEPTANCE REQUIRED** (SEC-03 ile aynı) | Aynı |
| PB-08 | PARTIALLY VERIFIED | **RESIDUAL RISK / USER ACCEPTANCE REQUIRED** | Özel yedek uygulaması ve tatbikat artık kabul kapısı değil; veri kaybı kalan riski, sağlayıcı politikaları ve hukuki saklama yükümlülükleri kullanıcıca değerlendirilmeli |
| PB-12 | OPEN | **RESIDUAL RISK / USER ACCEPTANCE REQUIRED** | Geri dönüş riski sağlayıcı düzeyi geri yüklemede sürer; otomatik koruma yok (kapatılmadı) |
| D-142 | CONDITIONALLY ACCEPTED | SUPERSEDED (OD-27) | — |
| D-148 | Proposed | WITHDRAWN (OD-27) | — |
| TM-60 | Runbook + araç | Kalan risk, manuel prosedür | — |

Güvenlik düzeltmeleri (D-141, SEC-05/06, SEC-14…18, migration 0011) ve veri bütünlüğü mekanizmaları (versiyon geçmişi, kalıcı silme, yazım girişimleri, mutabakat, kota, audit) değişmedi. Production: **NO-GO**.
