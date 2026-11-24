# Güvenlik Mimarisi

> Tehdit modeli: [THREAT_MODEL.md](THREAT_MODEL.md) · Dosya güvenliği: [FILE_STORAGE.md](FILE_STORAGE.md) · KVKK: [DATA_PRIVACY.md](DATA_PRIVACY.md) · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)
> Referanslar: OWASP Top 10 (2021 ve güncel sürümü), OWASP ASVS 4.x, OWASP Cheat Sheet Series (Session Management, Authentication, File Upload, CSP), WCAG 2.2 (erişilebilirlik ile ilgili güvenlik UX'i).

## 1. İlkeler

1. **Security & Privacy by Design** — her özelliğin güvenlik gereksinimi kendi fazında tamamlanır.
2. **Defense in depth** — proxy iyimser kontrol; asıl kontrol her giriş noktasında; DB kısıtları son savunma.
3. **Least privilege** — rol, kaynak kapsamı, DB rolü, Blob token, Vercel/Neon ekip erişimi.
4. **Fail closed** — doğrulanamayan her durum reddedilir (tarama hatası = görüntülenemez).
5. **Kütüphaneyi yeniden yazma** — şifre hash, session, CSRF, cookie: Better Auth ve Next.js mekanizmaları.
6. **Gizli bilgi loglanmaz** — token, şifre, OTP, session, PDF içeriği, gereksiz PII.

## 2. Personel Kimlik Doğrulaması (Better Auth)

| Konu | Uygulama |
|---|---|
| Giriş | Username plugin, `POST /api/auth/sign-in/username`. E-posta ile giriş uç noktası **kapatılır** (yalnızca username) — PHASE 03'te `disabledPaths` ile doğrulanacak. |
| Kayıt | Herkese açık sign-up **kapalı**. Hesaplar yalnızca ADMIN tarafından admin plugin `createUser` ile (server-side, `auth.api`) oluşturulur. `/sign-up/*` uç noktaları devre dışı. |
| Enumeration | `/is-username-available` devre dışı. Giriş hatası her durumda aynı mesaj: "Kullanıcı adı veya şifre hatalı." Pasif hesap da aynı mesajı alır. Yanıt süresi farkları Better Auth'un davranışıyla PHASE 03'te test edilir. |
| Şifre hash | Better Auth varsayılanı **scrypt** — değiştirilmez. |
| Şifre politikası | Min 12, maks 128 kr. (BR-131). Karmaşıklık kuralı yerine uzunluk + yaygın şifre listesi kontrolü (NIST 800-63B yaklaşımı; küçük gömülü liste, harici servis yok). |
| Session | Server-side DB session. `expiresIn` 7 gün → **Proposed 12 saat** (iş günü); `updateAge` 1 saat. **Cookie cache kapalı** (iptal anında etkili olsun). |
| Cookie | `HttpOnly`, `Secure` (`useSecureCookies: true` production'da zorlanır), `SameSite=Lax`, `__Secure-` öneki (Better Auth secure cookie davranışı PHASE 03'te doğrulanır). |
| CSRF | Better Auth origin kontrolü + `trustedOrigins` = yalnızca `APP_URL`. Server Actions için Next.js Origin/Host karşılaştırması. `disableCSRFCheck` / `disableOriginCheck` **asla** açılmaz. |
| Rate limit | Better Auth `rateLimit: { enabled: true, storage: "database", customRules: { "/sign-in/username": { window: 60, max: 5 } } }` (Proposed). IP header'ı Vercel için PHASE 03'te doğrulanıp `advanced.ipAddress.ipAddressHeaders` ile ayarlanır. |
| Brute-force (hesap bazlı) | IP bazlı limit tek başına dağıtık saldırıya yetmez → kullanıcı adı başına başarısız deneme sayacı (`rate_limit_buckets`, `login_fail:user:<hmac(username)>`: 15 dk'da 10 başarısız → 15 dk geçici blok, aynı genel hata mesajıyla). Better Auth hook'larıyla uygulanabilirliği PHASE 03'te doğrulanır. |
| Pasifleştirme | Admin plugin `banUser` → giriş engeli + tüm oturumların iptali. Ek olarak `requireStaff()` her istekte `banned` alanını kontrol eder. |
| Şifre sıfırlama | MVP: ADMIN `setUserPassword` ile geçici şifre belirler → `must_change_password = true` → kullanıcı ilk girişte şifre değiştirmeden başka sayfaya erişemez; şifre değişiminde diğer oturumlar iptal edilir (D-020). E-posta ile self-servis sıfırlama OD-11. |
| Impersonation | Kullanılmaz; hiçbir role `impersonate` izni verilmez (PHASE 03'te uç noktanın tamamen kapatılabildiği doğrulanır). |
| İlk ADMIN (bootstrap) | `pnpm admin:bootstrap` CLI script'i (PHASE 03): (1) hedef DB'de ADMIN varsa **çalışmayı reddeder**; (2) kullanıcı adı ve e-postayı argüman, şifreyi **etkileşimli gizli prompt** ile alır (env/argv'de şifre yok, shell geçmişine düşmez); (3) `auth.api` üzerinden oluşturur (aynı hash); (4) `must_change_password = true`; (5) audit `USER_CREATED` (`actor_type = SYSTEM`). Hardcoded şifre yok. Production'da yalnızca yetkili kişi, production DB URL'i ile bir kez çalıştırır. |

### Sunucu tarafı oturum çözümü
```ts
// src/server/auth/session.ts (taslak, PHASE 03)
export const requireStaff = cache(async (permission?: Permission) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.banned) redirect('/login');
  if (session.user.mustChangePassword) redirect('/dashboard/account?force=1');
  if (permission && !can(session.user.role, permission)) forbidden();
  return toActor(session);
});
```
Server Action'larda `redirect` yerine `ActionResult` hatası döner.

## 3. Müşteri Erişim Bağlantısı (token)

### 3.1 Üretim
- `crypto.randomBytes(32)` (Node CSPRNG) → **256 bit** → base64url (43 karakter, padding yok).
- URL: `${APP_URL}/b/${token}` (baseline) — ad, telefon, e-posta, başvuru numarası **içermez**.

### 3.2 Saklama — karşılaştırma

| Seçenek | Tekrar gösterilebilir mi | DB sızıntısında etki | Karmaşıklık |
|---|---|---|---|
| A. Düz metin | Evet | **Tüm bağlantılar ele geçer** | Düşük |
| B. Yalnızca hash (SHA-256) | **Hayır** — kaybedilirse yenilenmeli | Bağlantılar kullanılamaz | Düşük |
| C. Hash (HMAC) + şifreli kopya (AES-256-GCM, anahtar env'de) | Evet (yetkili personel) | DB tek başına yetmez; DB **ve** anahtar gerekir | Orta |
| D. Yalnızca hash + "göster" yerine her seferinde yenile | Hayır | Bağlantılar kullanılamaz | Düşük; ama her kopyalamada müşterinin eski linki ölür |

**Öneri: C (D-011, Proposed).** Brief personelin bağlantıyı tekrar görüp kopyalayabilmesini istiyor; B/D bunu karşılamaz.
- **Arama:** `token_hash = HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` — sabit zamanlı karşılaştırma gerekmez (hash eşitliği DB index'inde); pepper sayesinde DB sızıntısında offline doğrulama yapılamaz.
- **Şifreli kopya:** `AES-256-GCM`, 96-bit rastgele IV, `AAD = application_id` (ciphertext başka satıra taşınamaz). Biçim `v1:<keyId>:<iv>:<ct>:<tag>`.
- **Anahtarlar:** `ACCESS_TOKEN_ENCRYPTION_KEYS` (JSON: `{"k1":"<base64 32B>"}`) + `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`. Yalnızca Vercel env (Production/Preview/Development ayrı değerler), "Sensitive" işaretli. Repoda yok.
- **Rotasyon:** yeni anahtar eklenir → aktif ID değiştirilir → bakım script'i eski ciphertext'leri yeni anahtarla yeniden şifreler → eski anahtar kaldırılır. HMAC anahtarı rotasyonu tüm bağlantıların yenilenmesini gerektirir (yalnızca sızıntı durumunda).
- **Erişim:** çözme yalnızca `access_link:view_copy` yetkili personel isteğinde, server-side; her gösterim `ACCESS_LINK_VIEWED` audit kaydı oluşturur. Düz token hiçbir log/audit/hata mesajına yazılmaz.

### 3.3 Yaşam döngüsü
- Oluşturma: başvuru transaction'ında (ACCESS_LINK_CREATED).
- Yenileme (rotate): eski `revoked_at = now(), revoke_reason = 'ROTATED'` + yeni token + **ilgili tüm müşteri oturumları iptal** (ACCESS_LINK_ROTATED).
- İptal: `revoke_reason = 'REVOKED'` + oturumlar iptal (ACCESS_LINK_REVOKED). Yeni bağlantı için yenileme gerekir.
- Süre sonu: `expires_at` (BR-102) ve terminal statü + N gün (BR-103).
- Brute-force: 256 bit entropi pratikte tahmin edilemez; buna rağmen `/b/*` için IP başına limit (Proposed: 20 istek / 10 dk) — geçersiz denemeler limit sayacını artırır, aşımda 429 + genel hata sayfası.

## 4. Müşteri Doğrulama Modeli

### 4.1 Karşılaştırma

| Model | Güvenlik | Sürtünme | Bağımlılık / Maliyet | Risk |
|---|---|---|---|---|
| **A. Yalnızca bağlantı** | Bağlantıyı ele geçiren herkes pasaport/banka belgelerine erişir. WhatsApp yedekleri, iletilen mesajlar, paylaşılan cihazlar, log'lar sızıntı yolu. | En düşük | Yok | **Yüksek** — hassas belgeler için kabul edilemez |
| **B. Bağlantı + e-posta OTP + süreli oturum** | İki bağımsız kanal (WhatsApp + e-posta). Bağlantının sızması tek başına yetmez. | Orta (her yeni oturumda kod) | Transactional e-posta sağlayıcı (OD-08), KVKK yurt dışı aktarım değerlendirmesi | Düşük-orta; e-posta hesabı ele geçirilirse risk |
| **C1. Bağlantı + SMS OTP** | B'ye benzer; ancak SMS ve WhatsApp genelde aynı telefondadır → bağımsızlık düşük. SIM swap riski. | Düşük | SMS sağlayıcı maliyeti (mesaj başı), İYS / ticari ileti mevzuatı değerlendirmesi | Orta |
| **C2. Bağlantı + bilgi faktörü (ör. doğum tarihi, TC son 4 hane)** | Zayıf: bu bilgiler genelde yakın çevre tarafından bilinir; ek kişisel veri toplamayı gerektirir (veri minimizasyonuna aykırı). | Düşük | Yok | Orta-yüksek |
| **C3. Bağlantı + telefonun son 4 hanesi** | Zayıf: numara zaten WhatsApp'ta görünür. | Düşük | Yok | Yüksek |

**Öneri: B (D-012, Proposed — ürün kararı OD-01).** Sürtünmeyi azaltmak için:
- Oturum süresi makul (12 saat mutlak, 60 dk boşta) — müşteri aynı gün içinde tekrar kod girmez.
- OTP ekranında maskeli e-posta ("a***@g***.com adresine kod gönderilecek") ve "E-postama erişimim yok → CS Global ile iletişime geçin" yardım metni.
- Kod 6 hane, e-posta konusu kodu içermez (bildirim önizlemesinde görünmesin — Proposed), gövdede büyük puntolu kod.
- WhatsApp in-app tarayıcısında uygulama değiştirip geri dönüldüğünde form durumu korunur (kod elle girilir).

### 4.2 OTP kuralları (B modeli)
| Kural | Değer (Proposed, ayarlanabilir) |
|---|---|
| Kod | 6 hane, `crypto.randomInt(0, 1_000_000)`, sıfır dolgulu |
| Saklama | `HMAC-SHA256(OTP_HMAC_KEY, challengeId:code)` — düz kod saklanmaz/loglanmaz |
| Geçerlilik | 10 dakika, tek kullanımlık |
| Deneme | Challenge başına 5; aşılınca challenge geçersiz |
| Yeniden gönderme | 60 sn bekleme; token başına saatte 5, günde 10 gönderim |
| Doğrulama limiti | Token başına 15 dk'da 10 hatalı deneme → 15 dk kilit |
| Karşılaştırma | `crypto.timingSafeEqual` |
| Başarı | Challenge `consumed_at`; yeni `customer_session`; pre-auth cookie silinir; `CUSTOMER_ACCESS_GRANTED` audit |

### 4.3 Pre-auth ve müşteri oturumu
- `GET /b/[token]` → geçerliyse **`__Host-cs_preauth`** cookie: `HMAC imzalı {accessTokenId, exp: +15dk}`, `HttpOnly; Secure; SameSite=Lax; Path=/`. 303 → `/portal/verify`. Token artık adres çubuğunda/geçmişte **son URL** olarak kalmaz (ilk URL tarayıcı geçmişinde kalabilir — §5).
- Doğrulama sonrası **`__Host-cs_customer`** cookie: 256-bit rastgele değer; DB'de yalnızca SHA-256 hash'i. `HttpOnly; Secure; SameSite=Lax; Path=/`; `Max-Age` = mutlak süre.
- Her müşteri isteğinde: hash ile oturum bul → iptal/süre/boşta kontrolü → bağlı token iptal/süre kontrolü → başvuru ID'si kapsam olarak kullanılır.
- Oturum sabitleme (fixation) yok: oturum değeri yalnızca doğrulama **sonrasında** üretilir.
- "Çıkış yap" butonu oturumu iptal eder.
- Aynı tarayıcıda ikinci başvurunun bağlantısı açılırsa yeni doğrulama gerekir ve cookie yeni başvuruya geçer (tek aktif müşteri oturumu / tarayıcı — Proposed, KISS).

## 5. Token Sızıntı Yolları ve Önlemler

| Yol | Risk | Önlem |
|---|---|---|
| Vercel request/runtime logları (`/b/<token>` path) | Ekip üyeleri / log drain'ler token'ı görür | Uygulama logları path'i redakte eder; Vercel platform loglarına erişim en az yetkiyle; log drain kullanılmaz (MVP). **B modeli** ile token tek başına yetmez. Alternatif: fragment tabanlı token (aşağıda). |
| Tarayıcı geçmişi / paylaşılan cihaz | İlk URL geçmişte kalır | 303 ile hemen token'sız URL'e geçilir; B modelinde geçmişteki URL yeni doğrulama ister. |
| Referrer | Dış bağlantılara token sızması | `Referrer-Policy: no-referrer` (`/b`, `/portal`); portalda dış bağlantı minimum (`rel="noreferrer noopener"`). |
| Üçüncü taraf script / analytics | URL'i okur | Müşteri tarafında **hiçbir üçüncü taraf script yok**; CSP `script-src 'self' 'nonce-…'`; `connect-src` yalnızca self + Blob upload host'u. |
| WhatsApp link önizleme botu | GET ile açar | BR-105: GET hiçbir şey göndermez/tüketmez; sayfa `noindex`, Open Graph meta yok (önizlemede bilgi sızmaz). |
| Arama motoru indeksleme | Link bir yerde yayınlanırsa | `X-Robots-Tag: noindex, nofollow, noarchive` + `robots.txt` `Disallow: /`. **Bu bir güvenlik kontrolü değildir**, yalnızca hijyendir. |
| Müşterinin bağlantıyı başkasına iletmesi | Kasıtlı/kazara | B modeli; panelde "Bu bağlantı size özeldir" uyarısı. |
| Personel ekran görüntüsü / kopyala-yapıştır | | Bağlantı gösterimi audit'lenir. |

**Alternatif — fragment tabanlı bağlantı (D-013, Proposed, OD-02):** `https://.../b#<token>`. Fragment HTTP isteğine dahil edilmez → **sunucu/CDN/platform loglarında ve önizleme botlarında görünmez**. Sayfa küçük bir client script ile fragment'i okuyup POST (Server Action) ile değiştirir, `history.replaceState` ile siler. Maliyet: JavaScript zorunlu (zaten zorunlu), bazı in-app tarayıcılarda fragment korunmasının test edilmesi gerekir. Brief'teki örnek path tabanlı olduğu için baseline path tabanlıdır; öneri fragment tabanlıya geçilmesidir — **kullanıcı kararı**.

## 6. HTTP Güvenlik Header'ları

Uygulama: `next.config.ts` `headers()` (statik) + `src/proxy.ts` (nonce'lu CSP, rota bazlı).

| Header | Değer | Kapsam |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'nonce-{n}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.blob.vercel-storage.com; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` | Tüm sayfalar (nonce → dinamik render, zaten hepsi dinamik). `connect-src` Blob upload host'u PHASE 08'de kesinleşir. Tailwind/shadcn inline style ihtiyacı PHASE 01'de test edilir. |
| `Content-Security-Policy` (PDF yanıtı) | `default-src 'none'; sandbox; frame-ancestors 'self'` | `/api/files/*` — tarayıcı PDF görüntüleyici uyumluluğu PHASE 08'de test edilir |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (preload: domain kararından sonra) | Tümü |
| `X-Content-Type-Options` | `nosniff` | Tümü |
| `Referrer-Policy` | `no-referrer` (`/b`, `/portal`, `/api/files`), `strict-origin-when-cross-origin` (diğer) | |
| `X-Frame-Options` | `DENY` (CSP `frame-ancestors` ile birlikte, eski tarayıcılar için) | Tümü (PDF görüntüleme iframe kullanırsa `/api/files` için `SAMEORIGIN`) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Tümü |
| `Cross-Origin-Opener-Policy` | `same-origin` | Tümü |
| `Cache-Control` | `private, no-store, max-age=0` | `/dashboard`, `/portal`, `/b`, `/api` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` | Tümü (panel tamamen özel) |

## 7. Girdi Doğrulama ve Çıktı Kodlama

- Tüm girdiler Zod şemalarıyla (client'ta UX için, **server'da zorunlu**). Şemalar `features/*/schemas.ts` içinde paylaşılır.
- Bilinmeyen alanlar reddedilir (`z.object(...).strict()`) — mass assignment engeli.
- SQL: yalnızca Drizzle sorgu oluşturucu / parametreli `sql` template'i; string birleştirme ile SQL yasak.
- XSS: React varsayılan escape; `dangerouslySetInnerHTML` **yasak** (ESLint kuralı). Talimat/açıklama alanları düz metin; satır sonları CSS `white-space: pre-line` ile.
- Dosya adı: sanitize (FILE_STORAGE §4); `Content-Disposition` RFC 6266 `filename*` UTF-8 kodlaması.
- Redirect: yalnızca iç yollar (open redirect yok; `next`/`returnTo` parametreleri whitelist).

## 8. Audit Log

### 8.1 Event listesi

| Event | Aktör | Metadata (güvenli) |
|---|---|---|
| `USER_LOGIN` | USER | `{ method: 'username' }` |
| `USER_LOGIN_FAILED` | ANONYMOUS | `{ usernameHash }` (ham kullanıcı adı yok — Proposed) |
| `USER_LOGOUT` | USER | — |
| `USER_CREATED` / `USER_UPDATED` | USER/SYSTEM | `{ changedFields: [...] }` (değerler değil) |
| `USER_ROLE_CHANGED` | USER | `{ from, to }` |
| `USER_DEACTIVATED` / `USER_REACTIVATED` | USER | — |
| `USER_PASSWORD_RESET` / `USER_PASSWORD_CHANGED` | USER | — |
| `USER_SESSIONS_REVOKED` | USER | `{ count }` |
| `APPLICATION_CREATED` | USER | `{ serviceId, customerLinked: 'new'\|'existing' }` |
| `APPLICATION_UPDATED` | USER | `{ changedFields }` |
| `APPLICATION_ARCHIVED` / `APPLICATION_UNARCHIVED` | USER | — |
| `APPLICATION_STATUS_CHANGED` | USER/SYSTEM | `{ from, to }` |
| `APPLICATION_SUBMITTED` / `APPLICATION_RESUBMITTED` | CUSTOMER/USER | `{ onBehalfOfCustomer }` |
| `ACCESS_LINK_CREATED` / `ACCESS_LINK_ROTATED` / `ACCESS_LINK_REVOKED` | USER | `{ accessTokenId }` |
| `ACCESS_LINK_VIEWED` | USER | `{ accessTokenId }` |
| `ACCESS_LINK_INVALID_ATTEMPT` | ANONYMOUS | `{ reason: 'not_found'\|'revoked'\|'expired' }` (toplu/örneklemeli — log şişmesini önlemek için rate limit aşımında tek kayıt) |
| `CUSTOMER_OTP_SENT` / `CUSTOMER_OTP_FAILED` | CUSTOMER | `{ accessTokenId }` |
| `CUSTOMER_ACCESS_GRANTED` | CUSTOMER | `{ accessTokenId }` |
| `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` / `DOCUMENT_DELETED` | CUSTOMER/USER | `{ requirementId, fileId, versionNumber, onBehalfOfCustomer }` |
| `DOCUMENT_SCAN_REJECTED` | SYSTEM | `{ fileId, reasonCode }` |
| `DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED` | USER/CUSTOMER | `{ fileId }` |
| `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` | USER | `{ requirementId, reviewId }` (mesaj metni değil) |
| `DOCUMENT_COMMENT_ADDED` / `INTERNAL_NOTE_ADDED` | USER | `{ id }` |
| `SERVICE_CREATED` / `SERVICE_UPDATED` / `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` | USER | `{ changedFields }` |
| `DOCUMENT_TEMPLATE_CREATED` / `DOCUMENT_TEMPLATE_UPDATED` | USER | `{ serviceId, changedFields }` |
| `SETTINGS_UPDATED` | USER | `{ changedFields }` |
| `RETENTION_PURGE_EXECUTED` | SYSTEM | `{ counts }` |

### 8.2 Kurallar
- Asla: token, şifre, OTP, session değeri, cookie, PDF içeriği, dosya adı (Proposed — dosya adları kişisel veri içerebilir), tam ad/telefon/e-posta değerleri.
- Audit yazımı, iş işlemiyle **aynı transaction** içinde (işlem başarılıysa log var; log yazılamazsa işlem geri alınır). İstisna: başarısız giriş / geçersiz token denemeleri (transaction yok, best-effort).
- Değiştirilemezlik: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) §4.17.
- Saklama: Proposed 2 yıl (OD-06); IP: varsayılan HMAC'li hash, ham IP saklanmaz; user-agent saklanmaz (OD-09).

## 9. Secret Yönetimi

- Secret'lar yalnızca Vercel Environment Variables (ortam başına ayrı değer, "Sensitive" tipi) ve yerelde `.env.local` (gitignore'da).
- Repoda yalnızca `.env.example` (değersiz).
- ⚠️ Mevcut `.gitignore` Visual Studio şablonudur; `*.env` kalıbı `.env.local`, `.env.development.local` gibi dosyaları **kapsamaz** ve `node_modules`, `.next` girişleri yoktur. PHASE 01'in ilk adımı Next.js/Node uyumlu `.gitignore`'dur (D-031) — **güvenlik blocker'ı**.
- Secret üretimi: `openssl rand -base64 32` (her ortam için ayrı). Production secret'larını yalnızca yetkili kişi üretir ve girer.
- Secret scanning: GitHub secret scanning + push protection (repo ayarı, PHASE 13).
- Rotasyon prosedürü: DEPLOYMENT §5.

## 10. Bağımlılık Güvenliği

- Sürümler exact sabit, lockfile commit'li, `pnpm install --frozen-lockfile` (CI/Vercel).
- `pnpm audit` her fazın sonunda; yüksek/kritik açık faz geçişini bloklar (gerekçeli istisna DECISION_LOG'a).
- pnpm'in kurulum script'i kısıtlamaları (`onlyBuiltDependencies` / eşdeğeri) PHASE 01'de yapılandırılır.
- Dependabot veya Renovate (PHASE 13, Proposed).

## 11. Production Öncesi Güvenlik Blocker'ları

Aşağıdakiler tamamlanmadan **gerçek müşteri verisiyle production açılmaz**:

1. Müşteri doğrulama modeli kararı (OD-01) ve uygulanması.
2. Dosya güvenlik taraması çözümü seçimi (OD-07) ve kabul kriterlerinin geçmesi (FILE_STORAGE §6.4).
3. E-posta sağlayıcı seçimi + DPA (OD-08).
4. KVKK hukuki değerlendirmesi: aydınlatma metni, yurt dışı aktarım dayanağı, VERBİS, saklama süreleri (DATA_PRIVACY §9).
5. Vercel Pro + Neon ücretli plan (ticari kullanım; D-024).
6. Ortam izolasyonu: production DB/Blob/secret'ların preview/dev'den ayrılması.
7. Tüm yetkilendirme negatif testlerinin ve güvenlik E2E senaryolarının geçmesi (TESTING_STRATEGY).
8. Yedekleme/geri yükleme provası (DEPLOYMENT §7).
9. Bağımlılık taraması temiz.
10. `.gitignore` düzeltmesi (D-031).
