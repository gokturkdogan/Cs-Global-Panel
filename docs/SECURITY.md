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

## 2. Personel Kimlik Doğrulaması (Better Auth 1.7.27 — PHASE 03, uygulandı)

| Konu | Uygulama |
|---|---|
| Hesap modeli (OD-24) | Yalnızca iki hesap: bir ADMIN, bir EMPLOYEE — eşit yetki. `users_one_account_per_role` (UNIQUE `role`) + `role IN ('admin','employee')` → en fazla 2 hesap; eşzamanlı oluşturma bu kısıtla durur (testli). |
| Better Auth HTTP route'u | **Bağlanmaz** (D-060): `/api/auth/*` 404. Giriş/çıkış Server Action'ları sunucu tarafında `auth.api.signInUsername` / `signOut` çağırır. Kayıt, e-posta girişi, şifre değiştirme/sıfırlama, e-posta değiştirme, kullanıcı güncelleme/silme, impersonation, admin uç noktaları HTTP'den erişilemez (E2E: 11 yol 404). |
| Eklentiler | Yalnızca `username` + `nextCookies`. Admin plugin, organization, social login, OTP, magic link, 2FA **yok**. |
| Kayıt / hesap oluşturma | `emailAndPassword.enabled: false`, `disableSignUp: true`; ayrıca `databaseHooks.user.create.before` ve `account.create.before` → `false`: Better Auth üzerinden kullanıcı/hesap oluşturulamaz. Hesaplar yalnızca yerel CLI `pnpm auth:bootstrap` ile oluşturulur. |
| Giriş ekranı | Tek ortak ekran (`/login`): kullanıcı adı + şifre + göster/gizle. "Şifremi unuttum", "Kayıt ol", e-posta alanı **yok**. Başarılı giriş her iki hesap için `/dashboard`; yönlendirme parametresi kabul edilmez (open redirect yok). |
| Enumeration | Tek tip hata: "Kullanıcı adı veya şifre hatalı." Better Auth var olmayan kullanıcıda da şifre hash'ler (zamanlama farkı yok — kaynak koddan doğrulandı; aynı yanıt testli). |
| Şifre hash | Better Auth varsayılanı **scrypt** (`hashPassword` — CLI aynı fonksiyonu kullanır). Düz şifre hiçbir yerde saklanmaz/loglanmaz. |
| Şifre politikası | Min **8**, maks 128 (OD-22); baş/son boşluk yok; kullanıcı adını içeremez; en az 4 farklı karakter; iki hesabın şifreleri farklı (CLI, diğer hesabın hash'iyle karşılaştırır). 12+ karakterlik rastgele şifre önerilir. |
| Şifre sıfırlama | Yalnızca yerel CLI `pnpm auth:reset-password` (gizli giriş, tekrar): hash günceller, **yalnızca o hesabın** tüm oturumlarını siler (BR-135), audit `USER_PASSWORD_SET` + `USER_SESSIONS_REVOKED {count}`. Uygulama içinde şifre değişimi yok. |
| E-posta alanı | Better Auth zorunlu kılar; kişisel veri değil: `<id>@staff.invalid` (CHECK ile zorunlu, değişmez — TD-05 çözüldü). E-posta gönderimi yok. |
| Oturum süresi | `expiresIn = 7 gün`, `disableSessionRefresh: true` → kullanımla **uzamaz** (2 gün eski oturumda tekrarlı doğrulamayla `expires_at` değişmediği testli). Hareketsizlik zaman aşımı ve "beni hatırla" yok. |
| Oturum doğrulama | Cookie cache **kapalı**; her istekte veritabanından doğrulama (iptal/sıfırlama anında etkili). Değiştirilmiş, süresi dolmuş, silinmiş oturum reddedilir (testli). |
| Cookie | `cs.session_token` (production'da `__Secure-` önekli): `HttpOnly`, `SameSite=Lax`, `Path=/`, Domain yok (host-only), Max-Age 7 gün; `Secure` APP_URL https iken (`useSecureCookies`); https'te ad `__Secure-cs.session_token` + `Secure` + `HttpOnly` + `SameSite=Lax` — **yapılandırma düzeyinde integration testli (PHASE 04)**. Gerçek HTTPS tarayıcı doğrulaması deployment öncesi zorunlu (P4-04 → PHASE 13; sistem sertifika deposu değişikliği veya deployment gerektirdiği için yapılmadı). |
| CSRF | **İki katman (PHASE 04, D-069):** (1) `src/proxy.ts`, `/api/*` dışındaki tüm durum değiştiren isteklerde (`POST/PUT/PATCH/DELETE`) `Origin`'in APP_URL origin'iyle tam eşleşmesini ve `X-Forwarded-Host`/`Host`'un APP_URL host'uyla eşleşmesini ister; aksi halde **403 "İstek reddedildi."** (`no-store`). Origin yok, `"null"`, bozuk, farklı şema/port/alt alan adı ve güvenilmeyen Host reddedilir (unit + E2E). (2) Next.js Server Action Origin/Host kontrolü açık kalır. Reddedilen istek action'a ulaşmaz (rate limit/audit oluşmaz). Better Auth `trustedOrigins = [APP_URL]`; `disableCSRFCheck`/`disableOriginCheck` kullanılmaz. `X-Forwarded-Host` davranışı hosting'de doğrulanacak (PHASE 13). |
| IP / UA saklamama (OD-09) | `advanced.ipAddress.disableIpTracking: true` + `databaseHooks.session.create.before` IP/UA'yı `null` yapar + DB CHECK. Sahte `User-Agent`/`X-Forwarded-For` ile girişte satırların NULL kaldığı testli. |
| Giriş sınırlaması | §6 — uygulama limitleyicisi (`rate_limit_buckets`); Better Auth yerleşik limiter'ı kapalı (HTTP route'u yok). |
| Hesap pasifleştirme | **Yok** (OD-24). Olay müdahalesi: `pnpm auth:reset-password` → ilgili hesabın tüm oturumları sonlanır. |
| Telemetri | Better Auth telemetrisi kapalı (`telemetry.enabled: false`). |

### Sunucu tarafı oturum çözümü (uygulandı — `src/server/auth/staff.ts`)
```ts
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const requestHeaders = await headers();
  if (getSessionCookie(requestHeaders, { cookiePrefix: "cs" }) === null) return null; // DB'ye gitmez
  const session = await getAuth().api.getSession({ headers: requestHeaders });     // DB doğrulaması
  if (session === null || !isStaffRole(session.user.role)) return null;
  return { userId, username, accountType: role, sessionId };                       // rol yetki için kullanılmaz
});
export async function requireStaff() { const s = await getCurrentStaff(); if (!s) redirect("/login"); return s; }
```
`requireAdmin`, `requirePermission`, `can()` yoktur (OD-24).

## 3. Müşteri Bağlantısı (bearer credential)

### 3.1 Model (OD-01, OD-02, OD-04)
- Müşteri **yalnızca bağlantı** ile erişir: hesap, şifre, OTP, ek doğrulama yok.
- ⚠️ **Bağlantı bir bearer credential'dır.** Bağlantıyı ele geçiren (iletilmiş mesaj, WhatsApp yedeği, paylaşılan cihaz, ekran görüntüsü, ele geçirilmiş telefon, yanlış kişiye gönderim, log) **herkes** başvuruya — kişisel bilgilere, yüklü pasaport/kimlik/banka belgelerinin görüntülenmesine/indirilmesine ve evrak yüklemeye — erişebilir. Bağlantı **süresizdir**; personel iptal edene veya yenileyene kadar geçerlidir. Bu, kabul edilmiş bir ürün kararıdır; risk ortadan kalkmamıştır (THREAT_MODEL TM-13–TM-15).
- Bağlantı biçimi: `${APP_URL}/b/${token}` (path tabanlı). Ad, telefon, e-posta, başvuru numarası içermez.

### 3.2 Token üretimi ve saklama (OD-19)
- `crypto.randomBytes(32)` (Node CSPRNG) → **256 bit** → base64url (43 karakter).
- **Doğrulama:** `token_hash = HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` — DB sızıntısında anahtarsız offline doğrulama yapılamaz.
- **Tekrar görüntüleme:** `AES-256-GCM` (authenticated encryption), 96-bit rastgele IV, 128-bit tag, biçim `v1:<keyId>:<iv>:<ct>:<tag>` (base64url parçalar). **AAD (PHASE 06, D-080): `cs-access-token:v1:<applicationId>:<tokenId>`** — şifreli kopya başka başvuruya veya token satırına taşınırsa çözülmez.
- **Anahtarlar:** `ACCESS_TOKEN_HMAC_KEY`, `ACCESS_TOKEN_ENCRYPTION_KEYS` (JSON `{"k1":"<base64 32B>"}`), `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` — yalnızca sunucu env'inde, ortam başına ayrı değer, DB'de değil, repoda değil.
- **Rotasyon:** yeni şifreleme anahtarı ekle → aktif ID değiştir → yeniden şifreleme script'i → eskiyi kaldır. HMAC anahtarı rotasyonu tüm bağlantıların yenilenmesini gerektirir (yalnızca sızıntıda).
- Düz token: DB'de yok; uygulama logu, audit, hata mesajı, analytics'te yok. Yalnızca yetkili personel isteğinde sunucuda çözülür ve yanıt olarak döner (`ACCESS_LINK_VIEWED` audit'i, token'sız).

### 3.3 Yaşam döngüsü
| Olay | Etki |
|---|---|
| Oluşturma | Başvuru transaction'ında (`ACCESS_LINK_CREATED`) |
| Yenileme (personel — iki hesap eşit, onay penceresi) | Eski token `revoked_at` + `ROTATED`; yeni token; eski bağlantıyla açılmış oturumlar bir sonraki istekte reddedilir (`ACCESS_LINK_ROTATED`) |
| İptal (personel — iki hesap eşit, onay penceresi) | `REVOKED`; aktif bağlantı kalmaz; "Yeni bağlantı oluştur" ile yenisi üretilir (`ACCESS_LINK_REVOKED`) |
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

`next.config.ts` `headers()` + `src/proxy.ts` (nonce'lu CSP — **PHASE 03'te uygulandı**, D-064).

> **PHASE 03 durumu (D-064):** CSP her istekte yeni nonce ile `src/proxy.ts`'ten gelir: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'` (+ yalnızca development'ta `'unsafe-eval'`); `style-src 'self' 'nonce-…'`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` yalnızca https APP_URL'de. Tüm sayfalar dinamik render edilir (root layout `connection()`); `Cache-Control` dinamik sayfalarda `no-store` (E2E). `unsafe-inline` yok; CSP ihlali konsol hatası olarak E2E'de yakalanır.
>
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
| Personel girişi (kullanıcı adı) | `login:user:<hmac(username)>` | 10 **deneme** / 15 dk sabit pencere; başarılı giriş sayacı sıfırlar (PHASE 03, D-063) |
| Personel girişi (bilinmeyen kullanıcı adları) | `login:unknown-usernames` | 50 deneme / 15 dk — **yalnızca var olmayan** kullanıcı adlarıyla yapılan denemelerin ortak sayacı (PHASE 04, D-068). Var olan hesapların girişini etkilemez; aşımda kullanıcı adı başına satır oluşturulmaz ve genel "hatalı" mesajı (şifre yine hash'lenir). Önceki genel limit `login:global` (100/15 dk) DoS riski nedeniyle kaldırıldı. |
| Personel girişi (IP) | `login:ip:<hmac>` | **Uygulanmadı** — güvenilir istemci IP header'ı hosting'e bağlı (TD-04, PHASE 13) |
| Bağlantı açma | `link:ip:<hmac>` | 30 / 10 dk |
| Upload token | `upload:actor:<userId \| accessTokenId>` | 30 / 10 dk |
| Dosya görüntüleme/indirme | `file:actor:<userId \| accessTokenId>` | 120 / 10 dk |

Limit aşımı: Türkçe genel mesaj (girişte "Çok fazla giriş denemesi…"). Sayaçlar atomik (`INSERT … ON CONFLICT DO UPDATE`), denemede artar → eşzamanlı denemelerle aşılamaz (testli). Limiter/veritabanı hatasında giriş reddedilir (fail-closed). Kalıcı hesap kilidi yok. Süresi dolan anahtarlar her denemede sınırlı (100) temizlenir. Değerler `src/config/constants.ts`.

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

Genel Bakış (PHASE 04) okumaları audit'e yazılmaz. PHASE 03'te uygulanan: `USER_LOGIN`, `USER_LOGIN_FAILED` (`{ reason: INVALID_CREDENTIALS | RATE_LIMITED }`, aktör ANONYMOUS), `USER_LOGOUT`, `USER_CREATED` (SYSTEM, bootstrap), `USER_PASSWORD_SET` (SYSTEM), `USER_SESSIONS_REVOKED` (`{ count }`). `USER_UPDATED`, `USER_ROLE_CHANGED`, `USER_DEACTIVATED/REACTIVATED` OD-24 ile kullanılmaz.


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
| `ACCESS_LINK_SHARE_PREPARED` (PHASE 06, D-084) | USER | `{ accessTokenId }` — WhatsApp paylaşım mesajı hazırlandı; gönderim/teslim anlamına gelmez |
| `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` / `DOCUMENT_DELETED` | CUSTOMER / USER | `{ requirementId, fileId, versionNumber, onBehalfOfCustomer }` |
| `DOCUMENT_VALIDATION_REJECTED` | SYSTEM | `{ fileId, reason }` |
| `DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED` | USER / CUSTOMER | `{ fileId }` |
| `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` | USER | `{ requirementId, fileId, reviewId }` |
| `DOCUMENT_COMMENT_ADDED` / `INTERNAL_NOTE_ADDED` | USER | `{ id }` |
| `SERVICE_CREATED` / `SERVICE_UPDATED` / `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` | USER | `{ changedFields }` |
| `DOCUMENT_TEMPLATE_CREATED` / `DOCUMENT_TEMPLATE_UPDATED` | USER | `{ serviceId, changedFields }` (sıralama: `["sortOrder"]`) |
| `DOCUMENT_TEMPLATE_ACTIVATED` / `DOCUMENT_TEMPLATE_DEACTIVATED` (PHASE 05, D-076) | USER | `{ serviceId, changedFields }` |
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

## 9a. Veritabanı Güvenliği (PHASE 02)
- **En az yetki (D-054):** uygulama `cs_app_runtime` ile çalışır (SQL ile oluşturulmuş; `neon_superuser` üyesi değil, süper kullanıcı değil, rol/veritabanı oluşturamaz, hiçbir nesnenin sahibi değil). Tablo bazında yalnızca gereken yetkiler; DDL/TRUNCATE yok; audit yalnızca SELECT+INSERT. Runtime adresi başka rol kullanırsa uygulama bağlanmaz (D-055). Migration/yönetim rolü yalnızca CLI'da.
- **Aktarım:** uzak bağlantılarda `sslmode=verify-full` zorunlu (sertifika + ana makine doğrulaması).
- **Audit değiştirilemezliği:** runtime rolüne karşı yetki + trigger; tablo sahibi role karşı mutlak değildir (TM-41).
- **Hedef koruması:** tek veritabanı (D-059); `db:init` bu projeye ait olmayan tablo varsa durur; testler yalnızca kendi sentetik kayıtlarını siler; seed mevcut kayıtlara dokunmaz; `db:reset`/`db:drop` yok; Drizzle Studio yalnızca `127.0.0.1`. Gerçek veri öncesi ayrı production veritabanı: PB-06/TM-43.
- **Gizlilik:** bağlantı adresi/şifre loglanmaz, hata mesajlarında yer almaz; build sırasında canary secret değerleriyle client bundle taranır (`pnpm check:bundle`).
- RLS kullanılmaz; kaynak bazlı yetkilendirme sunucu tarafında zorunludur (§1).

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
| PB-06 | Ortam izolasyonu (production DB/storage/secret'ların ayrılması). D-059 (tek veritabanı) nedeniyle gerçek müşteri verisi girmeden önce ayrı production veritabanı veya yazılı risk kabulü gerekir (TM-43). | DEPLOYMENT §1, §12.4 |
| PB-07 | Tüm yetkilendirme negatif testleri ve güvenlik E2E senaryolarının geçmesi | TESTING_STRATEGY |
| PB-08 | Yedek/geri yükleme yeteneğinin seçilen ücretsiz planda doğrulanması | DEPLOYMENT §7 |
| PB-09 | Bağımlılık taraması temiz | |
| PB-10 | Better Auth IP/UA saklamama ve kapalı uç noktaların testle doğrulanması — **PHASE 03'te testle doğrulandı** (IP header güvenilirliği hosting'de, TD-04) | TD-04 |
| PB-11 | Gerçek şirket iletişim bilgileri ve hizmet/evrak kataloğu | Pending input |

## 12. PHASE 04 Güvenlik Notları
- **Panel veri erişimi:** Genel Bakış yalnızca runtime rolüyle, salt okunur transaction'da, izinli kolonlarla okunur (telefon, e-posta, arama metni, token, iç not okunmaz — unit testle kolon listesi sabitlenmiş; integration ile DTO doğrulanmış). Silme talepli başvurular gösterilmez (BR-153). Hata mesajı Türkçe ve geneldir; log'da yalnızca hata türü/kodu.
- **Kimliği doğrulanmış testler (D-067):** uygulamada bypass/test endpoint'i/özel header yok; testler kısa ömürlü gerçek oturum satırı üretir. Gerçek hesapların credential kayıtları ve mevcut oturumları test başı/sonu karşılaştırılır.
- **CSP:** Radix kaydırma kilidinin `<style>` etiketi nonce'ludur (D-071); `'unsafe-inline'` yok. E2E'de panel sayfalarında konsol/CSP hatası yok.
- **Açık:** hesap başına kilitleme DoS'u (D-068 kalan risk), IP bazlı limit (TD-04), HTTPS'te `Secure` cookie'nin tarayıcıda doğrulanması (P4-04), axe taraması (PHASE 12).

## 13. PHASE 05 Güvenlik Notları (hizmet / evrak şablonu)
- **Yetki:** 7 Server Action'ın tamamı `requireStaff()` ile başlar (statik unit testi); iki hesap eşit; aktör ve `created_by`/`updated_by` yalnızca oturumdan. Oturumsuz erişim → `/login`; başka origin'den mutasyon → proxy 403 (E2E).
- **Girdi:** Zod `.strict()` — bilinmeyen alan (aktör, rol, dosya politikası, version) girdiyi reddeder; kimlikler UUID; `expectedVersion` ≥1; yön `up|down`. Ad için karakter beyaz listesi; çok satırlı metinde kontrol karakteri yok.
- **IDOR:** Evrak işlemleri `serviceId + requirementId` birlikte kilitlenir; başka hizmete ait evrak → `NOT_FOUND`, değişiklik yok (integration).
- **XSS:** Talimat/açıklama düz metin olarak saklanır; yalnızca React metni olarak render edilir (`dangerouslySetInnerHTML` yok); `<script>`/`onerror` yükleri E2E'de metin olarak görünür, diyalog/istek oluşmaz.
- **SQL:** Drizzle parametreli; arama LIKE desenine kaçışla parametre olarak gider.
- **Hata sızıntısı:** Kullanıcıya Türkçe genel mesajlar; log'da yalnızca PG hata kodu (unit/integration: log'da metin içeriği yok).
- **Bütünlük:** Optimistic lock + satır kilitleri (kayıp güncelleme yok); audit aynı transaction'da (audit hatasında mutasyon geri alınır); şablon mutasyonları snapshot tablolarına yazmaz (statik + integration).
- **Sabit dosya politikası:** Dosya tipi/boyutu/sayısı şablon alanı değil; ekranda salt okunur "Dosya kuralları (sabit)" kartı.

## 14. PHASE 06 Güvenlik Notları (başvuru ve müşteri bağlantısı)
- **Yetki:** 8 başvuru action'ı `requireStaff()` + Zod `.strict()` ile başlar (statik unit testi); aktör ve `created_by`/`updated_by`/`revoked_by` yalnızca oturumdan; statü, hizmet snapshot'ı, evrak listesi, token, başvuru numarası istemciden kabul edilmez (mass assignment testleri). Oturumsuz sayfa → `/login`; başka origin'den mutasyon → 403 (E2E).
- **IDOR:** Başvuru işlemleri kimlik + `deletion_requested_at IS NULL` ile; geçersiz/bilinmeyen/silme talepli kimlik → 404/`NOT_FOUND`.
- **Token:** D-080/D-081 — 256 bit CSPRNG, HMAC hash, AES-256-GCM kopya (AAD başvuru+token kimliği), fail-closed çözme, `APP_URL` kökü. Düz token: DB/log/audit/URL/tarayıcı depolaması/istemci bundle'ında yok (unit + integration + canary bundle + E2E depolama kontrolü). Liste toplu çözme yapmaz; bağlantı yalnızca açık aksiyonla, `no-store` dinamik sayfalarda, audit'lenerek döner. Trace kapalı, ekran görüntülerinde `data-sensitive` alanlar maskeli.
- **İptal/yenileme:** `applications FOR UPDATE` + beklenen aktif token kimliği → eski onay yeni bağlantıyı iptal edemez; en fazla bir aktif token (partial unique + testli yarış).
- **WhatsApp:** sabit `https://wa.me/` alan adı, rakam-only E.164, `encodeURIComponent`; yalnızca kullanıcı tıklamasıyla, `noopener noreferrer`; testlerde istek yakalanır.
- **Arama gizliliği:** PII içerebilen arama metni URL'ye yazılmaz (POST gövdesi); log'a kişisel veri yazılmaz.
- **Açık:** müşteri tarafı token doğrulaması ve oturum invalidation'ı PHASE 07; şifreleme anahtarı rotasyon betiği yok (PHASE 13 öncesi); bearer link riskleri (TM-13…TM-15, PB-04) aynen açık.
