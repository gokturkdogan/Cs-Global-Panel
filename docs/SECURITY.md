# Güvenlik Mimarisi

> Tehdit modeli: [THREAT_MODEL.md](THREAT_MODEL.md) · Dosya güvenliği: [FILE_STORAGE.md](FILE_STORAGE.md) · KVKK: [DATA_PRIVACY.md](DATA_PRIVACY.md) · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)
> Referanslar: OWASP Top 10, OWASP ASVS 4.x, OWASP Cheat Sheet Series (Session Management, Authentication, File Upload, CSP).
> **Önemli:** OD-01…OD-23 ürün kararlarının kabul edilmiş olması, bu kararların güvenlik denetiminden geçtiği anlamına gelmez. Kalan riskler [THREAT_MODEL.md](THREAT_MODEL.md) §4'te.

## 1. İlkeler

1. **Security & Privacy by Design** — her fazın güvenlik gereksinimleri kendi fazında tamamlanır.
2. **Defense in depth** — proxy iyimser kontrol; asıl kontrol her giriş noktasında; DB kısıtları son savunma.
3. **Least privilege** — rol, kaynak, DB rolü, Blob token, konsol erişimi.
4. **Fail closed** — doğrulanamayan dosya erişilemez; doğrulanamayan oturum reddedilir.
5. **Kütüphaneyi yeniden yazma** — şifre hash, personel oturumu, CSRF, cookie: Better Auth ve Next.js.
6. **Gizli bilgi loglanmaz** — token, şifre, session/cookie değeri, PDF içeriği, gereksiz PII.
7. **Sabit güvenlik parametreleri** — şifre/oturum/dosya limitleri koddaki sabitlerdir; panelden değiştirilemez (OD-16, OD-22).

## 2. Personel Kimlik Doğrulaması (Better Auth)

| Konu | Uygulama |
|---|---|
| Giriş | Username plugin, `POST /api/auth/sign-in/username`. E-posta ile giriş kapalı. |
| Kayıt | Public sign-up yok (`emailAndPassword.disableSignUp: true` — seçenek adı doğrulandı). Hesapları yalnızca ADMIN, Server Action içinde `auth.api` (admin plugin `createUser`) ile oluşturur. |
| Giriş ekranı | Yalnızca kullanıcı adı + şifre. "Şifremi unuttum", "Kayıt ol", "Yeni hesap oluştur" **yok** (OD-11). |
| Kapalı uç noktalar | `disabledPaths` (seçenek varlığı doğrulandı) ile: `/sign-up/email`, `/sign-in/email`, `/change-password`, `/change-email`, `/update-user`, `/delete-user`, `/request-password-reset`, `/reset-password`, `/is-username-available`. `admin/*` uç noktalarının HTTP'den çağrılması `hooks.before` (path bazlı `APIError` — doğrulandı) ile engellenir. `disabledPaths`'in `auth.api` sunucu çağrılarını da engelleyip engellemediği **dokümante değil** → PHASE 03'te test edilir (TD-03). |
| Enumeration | Tek tip hata: "Kullanıcı adı veya şifre hatalı." Pasif hesap da aynı mesajı alır. |
| Şifre hash | Better Auth varsayılanı **scrypt** — değiştirilmez. |
| Şifre politikası | Min **8**, maks 128 (`minPasswordLength`/`maxPasswordLength` varsayılanları; seçenek adları doğrulandı) — OD-22. Şifreyi yalnızca ADMIN belirler (`setUserPassword`); mevcut şifre hiçbir yerde gösterilmez/loglanmaz. Risk: THREAT_MODEL TM-09. |
| Şifre değişimi | ADMIN yeni şifre atadığında aynı Server Action'da `revokeUserSessions` çağrılır → kullanıcının tüm oturumları sonlanır (BR-135). |
| Oturum süresi | `session.expiresIn = 7 gün`, `session.disableSessionRefresh: true` → oturum `updateAge`'e bağlı olarak **uzatılmaz** (seçenek doğrulandı; "süre sonunun uzamadığı" etkisi PHASE 03'te testle kanıtlanır). Hareketsizlik zaman aşımı yok (OD-22). |
| Cookie cache | **Kapalı** — iptal edilen oturum anında geçersiz olsun. |
| Cookie | `HttpOnly`, production'da `Secure` (`useSecureCookies: true`), `SameSite=Lax`. |
| CSRF | Better Auth origin kontrolü + `trustedOrigins = [APP_URL]`. Server Actions için Next.js Origin/Host kontrolü. `disableCSRFCheck` / `disableOriginCheck` **asla**. |
| IP / UA saklamama (OD-09) | `advanced.ipAddress.disableIpTracking: true` (doğrulandı: yeni oturumlarda istemci adresini kaydetmez; **yerleşik rate limiter'ı da kapatır**). User-agent için `databaseHooks.session.create.before` dönüşünde `userAgent: null` (genel `{ data }` değiştirme mekanizması doğrulandı; session özelinde PHASE 03'te test). Son savunma: `sessions` tablosunda `CHECK (ip_address IS NULL AND user_agent IS NULL)`. |
| Giriş sınırlaması | Yerleşik limiter kapalı olduğundan `hooks.before` (`/sign-in/username`) içinde uygulama limitleyicisi (`rate_limit_buckets`): IP başına 15 dk'da 20 deneme; kullanıcı adı başına 15 dk'da 10 **başarısız** deneme → 15 dk geçici blok (aynı genel mesaj). IP yalnızca HMAC'lenmiş, kısa ömürlü anahtar olarak (DATABASE_SCHEMA §4.12). Vercel'de güvenilir istemci IP header'ı PHASE 03'te doğrulanır. |
| Pasifleştirme | Admin plugin `banUser` → giriş engeli + tüm oturumların iptali (doğrulandı). Ek olarak `requireStaff()` her istekte `banned` kontrol eder. |
| Impersonation | Kullanılmaz; uç noktalar engellenir. |
| İlk ADMIN (bootstrap) | `pnpm admin:bootstrap` (PHASE 03): hedef DB'de aktif ADMIN varsa reddeder; kullanıcı adını argüman, şifreyi **gizli etkileşimli prompt** ile alır (env/argv/shell geçmişinde şifre yok); `auth.api` ile oluşturur; audit `USER_CREATED` (`SYSTEM`). Hardcoded şifre yok. |
| ADMIN kurtarma | `pnpm admin:recover` (PHASE 03): DB erişimi olan yetkili operatör, mevcut bir ADMIN'e gizli prompt ile yeni şifre atar veya pasif bir ADMIN'i yeniden etkinleştirir; tüm oturumlarını iptal eder; audit `USER_PASSWORD_SET` (`SYSTEM`). Yalnızca CLI, HTTP uç noktası yok. |

### Sunucu tarafı oturum çözümü (taslak)
```ts
// src/server/auth/session.ts (PHASE 03)
export const requireStaff = cache(async (permission?: Permission) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) redirect('/login');
  if (permission && !can(session.user.role, permission)) forbidden();
  return toActor(session);
});
```

## 3. Müşteri Bağlantısı (bearer credential)

### 3.1 Model (OD-01, OD-02, OD-04)
- Müşteri **yalnızca bağlantı** ile erişir: hesap, şifre, OTP, ek doğrulama yok.
- ⚠️ **Bağlantı bir bearer credential'dır.** Bağlantıyı ele geçiren (iletilmiş mesaj, WhatsApp yedeği, paylaşılan cihaz, ekran görüntüsü, ele geçirilmiş telefon, yanlış kişiye gönderim, log) **herkes** başvuruya — kişisel bilgilere, yüklü pasaport/kimlik/banka belgelerinin görüntülenmesine/indirilmesine ve evrak yüklemeye — erişebilir. Bağlantı **süresizdir**; personel iptal edene veya yenileyene kadar geçerlidir. Bu, kabul edilmiş bir ürün kararıdır; risk ortadan kalkmamıştır (THREAT_MODEL TM-13–TM-15).
- Bağlantı biçimi: `${APP_URL}/b/${token}` (path tabanlı). Ad, telefon, e-posta, başvuru numarası içermez.

### 3.2 Token üretimi ve saklama (OD-19)
- `crypto.randomBytes(32)` (Node CSPRNG) → **256 bit** → base64url (43 karakter).
- **Doğrulama:** `token_hash = HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` — DB sızıntısında anahtarsız offline doğrulama yapılamaz.
- **Tekrar görüntüleme:** `AES-256-GCM` (authenticated encryption), 96-bit rastgele IV, `AAD = application_id`, biçim `v1:<keyId>:<iv>:<ct>:<tag>`.
- **Anahtarlar:** `ACCESS_TOKEN_HMAC_KEY`, `ACCESS_TOKEN_ENCRYPTION_KEYS` (JSON `{"k1":"<base64 32B>"}`), `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` — yalnızca sunucu env'inde, ortam başına ayrı değer, DB'de değil, repoda değil.
- **Rotasyon:** yeni şifreleme anahtarı ekle → aktif ID değiştir → yeniden şifreleme script'i → eskiyi kaldır. HMAC anahtarı rotasyonu tüm bağlantıların yenilenmesini gerektirir (yalnızca sızıntıda).
- Düz token: DB'de yok; uygulama logu, audit, hata mesajı, analytics'te yok. Yalnızca yetkili personel isteğinde sunucuda çözülür ve yanıt olarak döner (`ACCESS_LINK_VIEWED` audit'i, token'sız).

### 3.3 Yaşam döngüsü
| Olay | Etki |
|---|---|
| Oluşturma | Başvuru transaction'ında (`ACCESS_LINK_CREATED`) |
| Yenileme (ADMIN/EMPLOYEE, onay penceresi) | Eski token `revoked_at` + `ROTATED`; yeni token; eski bağlantıyla açılmış oturumlar bir sonraki istekte reddedilir (`ACCESS_LINK_ROTATED`) |
| İptal (ADMIN/EMPLOYEE, onay penceresi) | `REVOKED`; aktif bağlantı kalmaz; "Yeni bağlantı oluştur" ile yenisi üretilir (`ACCESS_LINK_REVOKED`) |
| Başvuru silme | `APPLICATION_DELETION` + satır silinir |
| Zaman / statü | **Etkisi yok** (OD-04) |

Tek aktif bağlantı: DB partial unique index + `applications FOR UPDATE` (OD-18).

### 3.4 Bağlantının açılması ve müşteri oturumu
1. `GET /b/[token]`: rate limit (IP başına 10 dk'da 30 istek; HMAC'li kısa ömürlü anahtar) → token biçim kontrolü → `HMAC(token)` ile arama → `revoked_at IS NULL` ve başvuru silinme sürecinde değil.
2. Geçerliyse: **müşteri oturum cookie'si** set edilir ve `303 → /portal`. Token adres çubuğunda kalmaz (ilk URL tarayıcı geçmişinde kalabilir).
3. Geçersizse: `303 → /link-invalid` — "Bu bağlantı geçerli değil. Lütfen CS Global ile iletişime geçin." Geçersiz/iptal/silinmiş arasında ayrım yapılmaz; token hata mesajında yer almaz.
4. GET hiçbir başvuru verisini değiştirmez ve audit kaydı oluşturmaz (BR-105) — link önizleme botları için güvenli.

**Müşteri oturumu (D-032):** `__Host-cs_portal` cookie'si; değer = `base64url(payload).HMAC-SHA256(CUSTOMER_SESSION_SECRET)`; `payload = { v:1, tid: accessTokenId, aid: applicationId, iat, exp: iat + 7 gün }`. `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`. **Uzatılmaz.**
- Her müşteri isteğinde (`requireCustomer()`): imza (timing-safe) → `exp` → DB'den `tid` ile token: `revoked_at IS NULL`, `application_id = aid`, başvurunun `deletion_requested_at IS NULL`. Bu sunucu tarafı doğrulama, iptal/yenileme/silmenin **anında** etkili olmasını sağlar (BR-104).
- Oturum tablosu yoktur: tek tek oturum iptali gereksinimi bulunmadığından (iptal bağlantı seviyesinde) satır tutmak gereksizdir.
- Süre dolunca aynı bağlantıyla yeniden erişilir (OD-22).
- Aynı tarayıcıda başka başvurunun bağlantısı açılırsa cookie yeni başvuruya geçer.
- `CUSTOMER_SESSION_SECRET` rotasyonu tüm müşteri oturumlarını sonlandırır (bağlantılar geçerli kalır).
- Oturum sabitleme yok: cookie yalnızca geçerli token doğrulandıktan sonra sunucuda üretilir.

## 4. Token Sızıntı Yolları ve Önlemler

| Yol | Önlem | Kalan risk |
|---|---|---|
| **Hosting sağlayıcısının altyapı request logları** (`/b/<token>` path'i) | Uygulama loglarında path redaksiyonu; platform loglarına erişim en az yetkiyle; log drain yok | **Kontrolümüz dışında.** Vercel (veya başka sağlayıcı) request loglarında path'in tutulup tutulmadığı, ne kadar saklandığı ve kimlerin erişebildiği uygulama tarafından engellenemez. Sızıntının tamamen önlendiği **garanti edilemez**. |
| Uygulama logları / audit / hata mesajları | Redaksiyonlu logger; token hiçbir zaman loglanmaz; hata sayfaları token içermez | Kod hatası → test (S20) |
| Tarayıcı geçmişi / paylaşılan cihaz | 303 ile hemen token'sız URL | İlk URL geçmişte kalır; cihaza erişen bağlantıyı tekrar açabilir |
| Referrer | `Referrer-Policy: no-referrer` (`/b`, `/portal`, `/api/files`); dış linklerde `rel="noreferrer noopener"` | Düşük |
| Üçüncü taraf script / analytics | Müşteri sayfalarında **yok**; nonce'lu CSP | Düşük |
| Link önizleme botları (WhatsApp vb.) | GET state değiştirmez; `noindex`; Open Graph meta yok | Bot token'ı görür (önizleme servisi sağlayıcısında) |
| Arama motoru indeksleme | `X-Robots-Tag: noindex, nofollow, noarchive` + `robots.txt Disallow: /` — **güvenlik kontrolü değildir** | Bağlantı bir yerde yayınlanırsa |
| WhatsApp sohbeti, yedekleri, iletme | Mesajda "bu bağlantıyı paylaşmayınız" uyarısı; yanlış kişi riskine karşı paylaşım onay penceresi (BR-162); gerektiğinde personel iptal/yenileme | **Yüksek** — kontrolümüz dışında, süresiz geçerlilik nedeniyle uzun süre etkili |

## 5. HTTP Güvenlik Header'ları

`next.config.ts` `headers()` + `src/proxy.ts` (nonce'lu CSP).

> **PHASE 01 durumu (D-048):** Tüm yanıtlarda `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Robots-Tag` ve script çalıştırmayı etkilemeyen temel CSP (`base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`) gönderilir; `X-Powered-By` kapalı. E2E ile doğrulandı. Henüz uygulanmayanlar: nonce'lu `script-src`/`style-src` CSP (PHASE 03, `proxy.ts`), rota bazlı `no-referrer` (PHASE 07/08), `Cache-Control: no-store` (korumalı rotalarla birlikte), PDF yanıtı CSP'si (PHASE 08).

| Header | Değer | Kapsam |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'nonce-{n}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' <blob-upload-host>; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` | Tüm sayfalar. Blob upload host'u PHASE 08'de kesinleşir; Tailwind/shadcn uyumu PHASE 01'de test edilir. |
| `Content-Security-Policy` (PDF yanıtı) | `default-src 'none'; sandbox; frame-ancestors 'self'` | `/api/files/*` (tarayıcı PDF görüntüleyici uyumu PHASE 08'de test) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Tümü (sağlayıcı alt alan adında `preload` kullanılmaz) |
| `X-Content-Type-Options` | `nosniff` | Tümü |
| `Referrer-Policy` | `no-referrer` (`/b`, `/portal`, `/link-invalid`, `/api/files`), `strict-origin-when-cross-origin` (diğer) | |
| `X-Frame-Options` | `DENY` (`/api/files` için `SAMEORIGIN`, iframe görüntüleme kullanılırsa) | |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Tümü |
| `Cross-Origin-Opener-Policy` | `same-origin` | Tümü |
| `Cache-Control` | `private, no-store, max-age=0` | `/dashboard`, `/portal`, `/b`, `/api` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` | Tümü |

## 6. Rate Limiting (özet)

Tümü Postgres `rate_limit_buckets` (D-019); bellek içi sayaç kullanılmaz.

| Kapsam | Anahtar | Limit (sabit) |
|---|---|---|
| Personel girişi (IP) | `login:ip:<hmac>` | 20 / 15 dk |
| Personel girişi (kullanıcı adı, başarısız) | `login:user:<hmac(username)>` | 10 / 15 dk → 15 dk blok |
| Bağlantı açma | `link:ip:<hmac>` | 30 / 10 dk |
| Upload token | `upload:actor:<userId \| accessTokenId>` | 30 / 10 dk |
| Dosya görüntüleme/indirme | `file:actor:<userId \| accessTokenId>` | 120 / 10 dk |

Limit aşımı: `429` + Türkçe genel mesaj. Değerler `src/config/constants.ts` içindedir.

## 7. Girdi Doğrulama ve Çıktı Kodlama

- Tüm girdiler Zod (`.strict()`), sunucuda zorunlu.
- SQL: yalnızca Drizzle / parametreli `sql`; string birleştirme yasak.
- XSS: React escape; `dangerouslySetInnerHTML` yasak (lint); talimatlar düz metin.
- Dosya adı sanitizasyonu: FILE_STORAGE §4; `Content-Disposition` `filename*=UTF-8''…`.
- Redirect: yalnızca iç yollar.
- URL üretimi: yalnızca `APP_URL`; `Host` / `X-Forwarded-Host` ile URL üretilmez (OD-20).
- WhatsApp URL'si: telefon rakamları + `encodeURIComponent` (BR-160).

## 8. Audit Log

### 8.1 Event listesi

| Event | Aktör | Metadata (güvenli) |
|---|---|---|
| `USER_LOGIN` | USER | — |
| `USER_LOGIN_FAILED` | ANONYMOUS | — (kullanıcı adı, IP **yazılmaz**) |
| `USER_LOGOUT` | USER | — |
| `USER_CREATED` / `USER_UPDATED` | USER / SYSTEM | `{ changedFields }` (değerler değil) |
| `USER_ROLE_CHANGED` | USER | `{ from, to }` |
| `USER_DEACTIVATED` / `USER_REACTIVATED` | USER | — |
| `USER_PASSWORD_SET` | USER / SYSTEM | — (şifre asla) |
| `USER_SESSIONS_REVOKED` | USER | `{ count }` |
| `APPLICATION_CREATED` | USER | `{ serviceId }` |
| `APPLICATION_UPDATED` | USER | `{ changedFields }` |
| `APPLICATION_STATUS_CHANGED` | USER | `{ from, to, transitionCode }` |
| `APPLICATION_SUBMITTED` / `APPLICATION_RESUBMITTED` | CUSTOMER / USER | `{ onBehalfOfCustomer }` |
| `APPLICATION_DELETION_REQUESTED` / `APPLICATION_DELETED` | USER | `{ fileCount }` (başvuru ID'si `application_id` kolonunda; PII yok) |
| `ACCESS_LINK_CREATED` / `ACCESS_LINK_ROTATED` / `ACCESS_LINK_REVOKED` / `ACCESS_LINK_VIEWED` | USER | `{ accessTokenId }` |
| `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` / `DOCUMENT_DELETED` | CUSTOMER / USER | `{ requirementId, fileId, versionNumber, onBehalfOfCustomer }` |
| `DOCUMENT_VALIDATION_REJECTED` | SYSTEM | `{ fileId, reason }` |
| `DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED` | USER / CUSTOMER | `{ fileId }` |
| `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` | USER | `{ requirementId, fileId, reviewId }` |
| `DOCUMENT_COMMENT_ADDED` / `INTERNAL_NOTE_ADDED` | USER | `{ id }` |
| `SERVICE_CREATED` / `SERVICE_UPDATED` / `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` | USER | `{ changedFields }` |
| `DOCUMENT_TEMPLATE_CREATED` / `DOCUMENT_TEMPLATE_UPDATED` | USER | `{ serviceId, changedFields }` |
| `TECHNICAL_CLEANUP_EXECUTED` | SYSTEM | `{ counts }` |

Kaldırılan event'ler: `CUSTOMER_OTP_*`, `CUSTOMER_ACCESS_GRANTED`, `ACCESS_LINK_INVALID_ATTEMPT`, `APPLICATION_ARCHIVED/UNARCHIVED`, `SETTINGS_UPDATED`, `USER_PASSWORD_CHANGED`/`RESET` (→ `USER_PASSWORD_SET`), `RETENTION_PURGE_EXECUTED`.

### 8.2 Kurallar
- Asla: token, şifre, cookie/session değeri, PDF içeriği, dosya adı, ad/telefon/e-posta değerleri, IP, user-agent.
- Audit yazımı iş işlemiyle **aynı transaction**'da. İstisna: başarısız giriş (best-effort).
- Değiştirilemezlik: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) §4.13. Otomatik saklama süresi yok.

## 9. Secret Yönetimi

- Secret'lar yalnızca hosting sağlayıcısının ortam değişkenlerinde (ortam başına ayrı) ve yerelde `.env.local` (gitignore'da).
- Repoda yalnızca değersiz `.env.example`.
- `.gitignore` PHASE 01'in ilk adımında Next.js/Node uyumlu hale getirilir (D-031 — onaylandı): `node_modules`, `.next`, `.env`, `.env.local`, `.env.*.local` ve tüm gerçek env dosyaları, build çıktıları, test/coverage çıktıları (`coverage/`, `playwright-report/`, `test-results/`), yerel secret dosyaları. `.env.example` hariç tutulur.
- Secret üretimi: `openssl rand -base64 32` (ortam başına ayrı); production secret'larını yalnızca yetkili kişi üretir.
- GitHub secret scanning + push protection (PHASE 13).
- Rotasyon: [DEPLOYMENT.md](DEPLOYMENT.md) §5.

## 10. Bağımlılık Güvenliği

Exact sürümler, commit'li lockfile, `pnpm install --frozen-lockfile`, her faz sonunda `pnpm audit` (yüksek/kritik = blok). PHASE 01'de uygulandı (D-046): kurulum script'leri varsayılan olarak engelli (yalnızca `sharp`, `unrs-resolver` bilinçli olarak yok sayılır), `minimumReleaseAge: 1440` (24 saatten yeni sürüm kurulmaz), CI action'ları commit SHA'sıyla sabit, `pnpm check:bundle` ile client bundle secret kontrolü. Ücretli servis bağımlılığı yok.

## 11. Production Blocker'ları

Gerçek müşteri verisiyle production **açılmaz**, şunlar tamamlanana kadar:

| # | Blocker | Not |
|---|---|---|
| PB-01 | Ticari kullanıma uygun, ücretsiz (veya kullanıcının onayladığı) hosting / DB / storage seçimi | Vercel Hobby ticari kullanıma izin vermez (OD-12) |
| PB-02 | Storage kapasitesi yeterliliği | Vercel Blob Hobby: 1 GB (DEPLOYMENT §6) |
| PB-03 | KVKK hukuki değerlendirmesi (aydınlatma, yurt dışı aktarım, saklama/imha, VERBİS, ihlal prosedürü) | DATA_PRIVACY §9 |
| PB-04 | Bearer link + OTP yok + süresiz bağlantı + belge indirme birleşik riskinin **yazılı risk kabulü** | THREAT_MODEL TM-13–TM-15 |
| PB-05 | Antivirüs taraması olmadan PDF kabulünün **yazılı risk kabulü** ve personel cihaz önlemleri | THREAT_MODEL TM-16 |
| PB-06 | Ortam izolasyonu (production DB/storage/secret'ların ayrılması) | DEPLOYMENT §1 |
| PB-07 | Tüm yetkilendirme negatif testleri ve güvenlik E2E senaryolarının geçmesi | TESTING_STRATEGY |
| PB-08 | Yedek/geri yükleme yeteneğinin seçilen ücretsiz planda doğrulanması | DEPLOYMENT §7 |
| PB-09 | Bağımlılık taraması temiz | |
| PB-10 | Better Auth IP/UA saklamama ve kapalı uç noktaların testle doğrulanması | TD-03, TD-04 |
| PB-11 | Gerçek şirket iletişim bilgileri ve hizmet/evrak kataloğu | Pending input |
