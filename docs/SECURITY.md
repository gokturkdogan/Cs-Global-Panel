# Güvenlik Mimarisi

> Tehdit modeli: [THREAT_MODEL.md](THREAT_MODEL.md) · Dosya güvenliği: [FILE_STORAGE.md](FILE_STORAGE.md) · KVKK: [DATA_PRIVACY.md](DATA_PRIVACY.md) · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)
> Referanslar: OWASP Top 10, OWASP ASVS 4.x, OWASP Cheat Sheet Series (Session Management, Authentication, File Upload, CSP).
> **Önemli:** OD-01…OD-23 ürün kararlarının kabul edilmiş olması, bu kararların güvenlik denetiminden geçtiği anlamına gelmez. Kalan riskler [THREAT_MODEL.md](THREAT_MODEL.md) §4'te.

## 1. İlkeler

1. **Security & Privacy by Design** — her fazın güvenlik gereksinimleri kendi fazında tamamlanır.
2. **Defense in depth** — proxy iyimser kontrol; asıl kontrol her giriş noktasında; DB kısıtları son savunma.
3. **Least privilege** — rol, kaynak, DB rolü, bucket'a kısıtlı B2 anahtarı, konsol erişimi.
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
1. `GET /b/[token]`: token biçim kontrolü (uzunluk veritabanından önce) → `HMAC(token)` ile arama → `revoked_at IS NULL` ve başvuru silinme sürecinde değil. *IP bazlı rate limit (IP başına 10 dk'da 30) TD-04 çözülene kadar uygulanmaz — PHASE 13 / hosting edge koruması (D-093).*
2. Geçerliyse: **müşteri oturum cookie'si** set edilir ve `303 → APP_URL/portal/<bağlam>` (D-087, D-090). Token adres çubuğunda kalmaz (ilk URL tarayıcı geçmişinde kalabilir). Geçici yapılandırma/veritabanı hatası → `303 /link-unavailable`.
3. Geçersizse: `303 → /link-invalid` — "Bu bağlantı geçerli değil. Lütfen CS Global ile iletişime geçin." Geçersiz/iptal/silinmiş arasında ayrım yapılmaz; token hata mesajında yer almaz.
4. GET hiçbir başvuru verisini değiştirmez ve audit kaydı oluşturmaz (BR-105) — link önizleme botları için güvenli.

**Müşteri oturumu (D-032, D-088 — PHASE 07'de uygulandı):** `__Host-cs_portal` cookie'si (yerel http'de `cs_portal`, `Secure` yok); değer = `base64url(payload).base64url(HMAC-SHA256(CUSTOMER_SESSION_SECRET, payloadPart))`; `payload = { v:1, typ:"cs-portal", aid: applicationId, tid: accessTokenId, ctx: bağlamKimliği, iat, exp: iat + 7 gün }`. `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`. **Uzatılmaz.**
- Her müşteri isteğinde (`requireCustomerAccess(context)`): imza (timing-safe) → şema + `exp` (sunucuda) → URL bağlamı = `ctx` → DB'den `tid` ile token: `revoked_at IS NULL`, `application_id = aid`, başvurunun `deletion_requested_at IS NULL`. Bu sunucu tarafı doğrulama, iptal/yenileme/silmenin **anında** etkili olmasını sağlar (BR-104).
- Oturum tablosu yoktur: tek tek oturum iptali gereksinimi bulunmadığından (iptal bağlantı seviyesinde) satır tutmak gereksizdir.
- Süre dolunca aynı bağlantıyla yeniden erişilir (OD-22).
- Aynı tarayıcıda başka başvurunun bağlantısı açılırsa cookie yeni başvuruya ve yeni bağlama geçer; eski sekme bir sonraki istekte "Bu sayfa artık güncel değil" gösterir, diğer başvurunun verisini göstermez (D-090, TM-40). Aynı bağlantı yeniden açılırsa bağlam korunur.
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

> **PHASE 11 durumu (D-136):** sayfa CSP'sine yalnızca `worker-src 'self'` eklendi (pdf.js worker'ı aynı kökenden, Turbopack worker chunk'ı; joker, `blob:`, `data:`, `unsafe-eval`, `wasm-unsafe-eval` yok — statik test + E2E). Müşteri düzenine de Radix kaydırma kilidi için belge nonce'u verilir (D-071 deseni). PDF yanıtları: `Accept-Ranges: bytes`, opak `ETag`, 206/416 (D-135); CORS yok; `no-store`. Görüntüleyici PDF baytlarını kalıcı depolamaya yazmaz; annotation/form/betik/XFA/WASM kapalı.
>
> **PHASE 03 durumu (D-064):** CSP her istekte yeni nonce ile `src/proxy.ts`'ten gelir: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'` (+ yalnızca development'ta `'unsafe-eval'`); `style-src 'self' 'nonce-…'`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` yalnızca https APP_URL'de. Tüm sayfalar dinamik render edilir (root layout `connection()`); `Cache-Control` dinamik sayfalarda `no-store` (E2E). `unsafe-inline` yok; CSP ihlali konsol hatası olarak E2E'de yakalanır.
>
> **PHASE 01 durumu (D-048):** Tüm yanıtlarda `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Robots-Tag` ve script çalıştırmayı etkilemeyen temel CSP (`base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`) gönderilir; `X-Powered-By` kapalı. E2E ile doğrulandı. Henüz uygulanmayanlar: nonce'lu `script-src`/`style-src` CSP (PHASE 03, `proxy.ts`), rota bazlı `no-referrer` (PHASE 07/08), `Cache-Control: no-store` (korumalı rotalarla birlikte), PDF yanıtı CSP'si (PHASE 08).

| Header | Değer | Kapsam |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'nonce-{n}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' <blob-upload-host>; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` | Tüm sayfalar. Blob upload host'u PHASE 08'de kesinleşir; Tailwind/shadcn uyumu PHASE 01'de test edilir. |
| `Content-Security-Policy` (PDF yanıtı) | `default-src 'none'; sandbox; frame-ancestors 'self'` | `/api/files/*` (tarayıcı PDF görüntüleyici uyumu PHASE 08'de test) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Tümü (sağlayıcı alt alan adında `preload` kullanılmaz) |
| `X-Content-Type-Options` | `nosniff` | Tümü |
| `Referrer-Policy` | `no-referrer` (`/b`, `/portal`, `/link-invalid`, `/link-unavailable`, `/api/files`), `strict-origin-when-cross-origin` (diğer) | PHASE 07'de müşteri yollarında uygulandı |
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
| `APPLICATION_STATUS_CHANGED` (PHASE 09 — T2, T3, T5–T12) | USER | `{ from, to, transitionCode, count? }` (gerekçe metni yok; gerekçe statü geçmişinde) |
| `APPLICATION_SUBMITTED` / `APPLICATION_RESUBMITTED` (PHASE 09) | CUSTOMER / USER | `{ from, to, transitionCode, count, onBehalfOfCustomer }` |
| `APPLICATION_DELETION_REQUESTED` / `APPLICATION_DELETED` (PHASE 10) | USER | `{ fileCount }` / `{ fileCount, count }` (başvuru ID'si `application_id` kolonunda; gerekçe metni, PII, dosya adı, nesne anahtarı yok) |
| `APPLICATION_DELETION_FAILED` (PHASE 10, D-116) | USER | `{ reason, count }` — `reason` güvenli hata kodu (`STORAGE_UNAVAILABLE`, `STORAGE_FORBIDDEN`, `UNKNOWN_OBJECT` …), `count` = bekleyen versiyon sayısı; yalnızca hata kategorisi değişince |
| `ACCESS_LINK_CREATED` / `ACCESS_LINK_ROTATED` / `ACCESS_LINK_REVOKED` / `ACCESS_LINK_VIEWED` | USER | `{ accessTokenId }` |
| `ACCESS_LINK_SHARE_PREPARED` (PHASE 06, D-084) | USER | `{ accessTokenId }` — WhatsApp paylaşım mesajı hazırlandı; gönderim/teslim anlamına gelmez |
| `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` (PHASE 08) | CUSTOMER / USER | `{ fileId, requirementId, versionNumber, from, to, onBehalfOfCustomer? }` (personelde `onBehalfOfCustomer: true`) |
| `DOCUMENT_DELETED` (PHASE 09 — kaldırma) | CUSTOMER / USER | `{ fileId, requirementId, versionNumber, from, to, onBehalfOfCustomer? }` — dosya `REMOVED` (fiziksel silme değil) |
| `DOCUMENT_APPROVAL_INVALIDATED` (PHASE 08) | USER | `{ fileId, requirementId, from: APPROVED, to: PENDING_REVIEW }` — onaylı evrak personel tarafından değiştirildi (BR-48) |
| `DOCUMENT_VALIDATION_REJECTED` (PHASE 08) | CUSTOMER / USER | `{ requirementId, reason }` (yapısal ret) veya `{ fileId, requirementId, reason: STATE_CHANGED }` (aktivasyonda durum değişti) |
| `DOCUMENT_UPLOAD_FAILED` (PHASE 08) | CUSTOMER / USER | `{ fileId, requirementId, reason }` — storage/aktivasyon hatası (`STORAGE_ERROR`, `STORAGE_LIMIT`, `STORAGE_AMBIGUOUS`, `STORAGE_NO_VERSION`, `ACTIVATION_FAILED`) |
| `DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED` (PHASE 08) | USER / CUSTOMER | `{ fileId, requirementId }` — storage okumasından önce |
| `STORAGE_RECONCILED` (PHASE 08) | SYSTEM | `{ counts }` — `pnpm storage:reconcile --apply` |
| `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` (PHASE 09) | USER | `{ requirementId, fileId, reviewId, from, to, transitionCode? }` (açıklama metni yok) |
| `DOCUMENT_COMMENT_ADDED` / `INTERNAL_NOTE_ADDED` (PHASE 09 / PHASE 10) | USER | `{ id, requirementId? }` (metin yok) |
| `SERVICE_CREATED` / `SERVICE_UPDATED` / `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` | USER | `{ changedFields }` |
| `DOCUMENT_TEMPLATE_CREATED` / `DOCUMENT_TEMPLATE_UPDATED` | USER | `{ serviceId, changedFields }` (sıralama: `["sortOrder"]`) |
| `DOCUMENT_TEMPLATE_ACTIVATED` / `DOCUMENT_TEMPLATE_DEACTIVATED` (PHASE 05, D-076) | USER | `{ serviceId, changedFields }` |
| `TECHNICAL_CLEANUP_EXECUTED` | SYSTEM | `{ counts }` — `pnpm storage:cleanup --apply` (PHASE 08) |

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
| PB-02 | Storage kapasitesi yeterliliği | Backblaze B2 kotası hedefi 100 GB ≈ 5 000 başvuru (OD-26; yıllık ~10 USD bütçe; aktif değer hesap hazırlığına kadar 9 GB); otomatik silme yok → birikimli (DEPLOYMENT §6, D-101, D-140). Açık. |
| PB-03 | KVKK hukuki değerlendirmesi (aydınlatma, yurt dışı aktarım, saklama/imha, VERBİS, ihlal prosedürü) | DATA_PRIVACY §9 |
| PB-04 | Bearer link + OTP yok + süresiz bağlantı + belge indirme birleşik riskinin **yazılı risk kabulü** | THREAT_MODEL TM-13–TM-15 |
| PB-05 | Antivirüs taraması olmadan PDF kabulünün **yazılı risk kabulü** ve personel cihaz önlemleri | THREAT_MODEL TM-16 |
| PB-06 | Ortam izolasyonu (production DB/storage/secret'ların ayrılması). D-059 (tek veritabanı) nedeniyle gerçek müşteri verisi girmeden önce ayrı production veritabanı veya yazılı risk kabulü gerekir (TM-43). | DEPLOYMENT §1, §12.4 |
| PB-07 | Tüm yetkilendirme negatif testleri ve güvenlik E2E senaryolarının geçmesi | TESTING_STRATEGY |
| PB-08 | Yedek/geri yükleme yeteneğinin seçilen ücretsiz planda doğrulanması | DEPLOYMENT §7 |
| PB-09 | Bağımlılık taraması temiz | |
| PB-10 | Better Auth IP/UA saklamama ve kapalı uç noktaların testle doğrulanması — **PHASE 03'te testle doğrulandı** (IP header güvenilirliği hosting'de, TD-04) | TD-04 |
| PB-11 | Gerçek şirket iletişim bilgileri ve hizmet/evrak kataloğu | Pending input |
| PB-12 (Proposed, PHASE 12) | Geri yükleme sonrası silinmiş veri / iptal edilmiş erişimin geri dönmesinin önlenmesi (SEC-03, TM-60) | OPERATIONS_RUNBOOK §2.4 |
| PB-13 (Proposed, PHASE 12) | En az yetkili B2 anahtarı (SEC-01) + gerçek sağlayıcı doğrulaması (Range, versiyon silme, listeleme/mutabakat, cap davranışı) | VERIFICATION_PLANS §1 |

> **PHASE 12 durumları (2026-11-27):** PB-01 OPEN; PB-02 BLOCKED BY EXTERNAL ACTION; PB-03 OPEN; PB-04, PB-05 RISK ACCEPTANCE REQUIRED; PB-06 OPEN; PB-07, PB-09, PB-10 VERIFIED — ACCEPTANCE PENDING; PB-08 PARTIALLY VERIFIED; PB-11 BLOCKED BY EXTERNAL ACTION; PB-12 OPEN; PB-13 BLOCKED BY EXTERNAL ACTION. Ayrıntı ve kanıt: [SECURITY_AUDIT.md](SECURITY_AUDIT.md) §5. Hiçbiri kapatılmadı.

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

## 15. PHASE 07 Güvenlik Notları (müşteri paneli)
- **Giriş:** `GET /b/[token]` (D-087) — biçim kontrolü veritabanından önce; HMAC ile tek sorgu; yan etkisiz (veri/audit değişmez — integration + E2E); geçersiz/iptal/yenilenmiş/silinmekte ayrımsız `/link-invalid`; geçici hata `/link-unavailable`; yönlendirme `APP_URL`'den; token log/hata/yönlendirme hedefinde yok.
- **Oturum:** D-088/D-089 — imzalı, 7 gün sabit, kayan süre yok; ayrı `CUSTOMER_SESSION_SECRET` (diğer anahtarlardan farklı olması doğrulanır); her istekte token aktifliği ve başvuru silinme durumu veritabanından → iptal/yenileme/silme tüm oturumları bir sonraki istekte kapatır (farklı tarayıcıdaki oturum dahil — E2E).
- **Çoklu sekme (TM-40):** D-090 — URL bağlamı = cookie bağlamı; başka başvuru açıldığında eski sekme veri göstermez (yenileme, geri/ileri, sekmeye dönüş, eşzamanlı açılış — E2E). Mutasyon tarafı D-095 sözleşmesiyle PHASE 08/09'da.
- **Personel/müşteri ayrımı:** müşteri yolları personel oturumunu okumaz; müşteri cookie'si personel paneline erişim vermez (E2E); ESLint sınırı (D-091) iç not/audit/token/auth modüllerini engeller.
- **Veri:** müşteri DTO'su açık kolon listesi; telefon, e-posta, teknik kimlikler, iç notlar, audit, aktörler, token yok (integration + E2E HTML/RSC kontrolü). Snapshot metinleri düz metin (XSS yükleri inert — E2E).
- **Başlıklar:** müşteri yollarında `no-referrer`, `private, no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow, noarchive`, meta `robots noindex`, nonce'lu CSP (satır içi stil yok — ilerleme çubuğu SVG); üçüncü taraf kaynak yok (E2E: harici istek yok, konsol/CSP hatası yok).
- **Log:** geliştirme sunucusu istek log'u `/b/` yollarını yazmaz, Server Function argümanlarını loglamaz (D-093; dev smoke: log'da token ve `/b/` yolu yok). Production altyapı logları (TM-15) kontrolümüz dışında.
- **Kötüye kullanım:** 256 bit token tahmini pratikte imkânsız; uygulama içi IP limiti TD-04'e bağlı olarak yok (D-093). OTP veya yeni kimlik doğrulama eklenmedi (OD-01).
- **Açık:** gerçek cihaz testleri (iOS Safari, Android Chrome, WhatsApp uygulama içi tarayıcı — cookie davranışı dahil) yapılmadı; HTTPS'te `__Host-` + `Secure` cookie'nin gerçek tarayıcıda doğrulanması (P4-04 ile birlikte PHASE 13); `CUSTOMER_SESSION_SECRET` production yedekleme/rotasyon prosedürü (DEPLOYMENT); bearer link riskleri (TM-13…TM-15, PB-04) aynen açık.

## 16. PHASE 08 Güvenlik Notları (PDF yükleme ve Backblaze B2)
- **Kimlik ve kapsam:** personel dosya route'ları yalnızca `getCurrentStaff()` (yoksa 401; iki hesap eşit, RBAC yok); müşteri route'ları yalnızca `requireCustomerAccess(context)` (D-095) — başvuru yalnızca oturumdan, evrak/dosya başka başvuruya aitse 404, bağlam uyuşmazlığı 409. Aynı tarayıcıda iki cookie olsa da her route yalnızca kendi kimliğini okur (yetki yükselmesi yok). Aktivasyon transaction'ında token aktifliği ve oturum süresi yeniden kontrol edilir (iptal/yenileme yarışı).
- **CSRF / köken:** dosya route'ları proxy kapsamı dışındadır (D-100: proxy gövdeyi 10 MB'ta keser); route içinde Origin = APP_URL zorunlu (eksik/yabancı → 403). CORS kapalı; bucket CORS'u kapalı.
- **Girdi:** ham PDF (`Content-Type: application/pdf`), `Content-Length` zorunlu ve ≤ 10 485 760, gerçek bayt sayısı sınırlanır; Zod `.strict()` sorgu; dosya adı sanitize (§FILE_STORAGE 4) ve URL'ye yazılmaz.
- **Kaynak tüketimi:** süreç başına 4 eşzamanlı yükleme + sınırlı kuyruk; aktör başına rate limit (30 yükleme / 120 görüntüleme saatte); PDF doğrulama ayrı worker'da bellek/süre sınırlı ve ortam değişkenleri boş (secret sızmaz); 120 sn gövde zaman aşımı.
- **PDF:** yapısal doğrulama + nesne düzeyi aktif içerik taraması + pdf.js (D-099). **Antivirüs değildir** (OD-07, PB-05).
- **Storage:** private bucket, bucket'a kısıtlı anahtar (master key yok), anahtar/uç nokta/bucket yalnızca doğrulanmış env'den; HTTPS zorunlu; SSE-B2 her yazmada istenir ve doğrulanır; nesne anahtarı yalnızca UUID; storage çağrısı transaction/kilit içinde yok; silme yalnızca versiyona özgü; toplu silme yok. Ham sağlayıcı URL'si, nesne anahtarı, versiyon kimliği, imzalı URL istemciye gönderilmez. Storage hataları sınıflandırılır; sağlayıcı mesajı/anahtar log'a yazılmaz.
- **Yanıtlar:** `no-store`, `no-referrer`, `nosniff`, `X-Frame-Options: DENY`, `CORP: same-origin`, güvenli `Content-Disposition`; indirmede CSP `sandbox` (D-104). Uygulama geneli CSP/frame-ancestors zayıflatılmadı.
- **Secret'lar:** B2 anahtarı yalnızca `pnpm env:b2` (yankısız terminal girdisi) ile `.env.local`'a; sohbette istenmez; client bundle canary kontrolü B2 adlarını/değerlerini kapsar; CI gerçek B2 hesabı kullanmaz. `APP_ENV=production` geliştirme bucket'ını reddeder; testlerde B2 reddedilir.
- **Önizleme botları:** müşteri sayfası açılışında PDF baytı çekilmez; dosya route'ları müşteri oturumu gerektirir → bağlantı önizlemesi dosya indiremez (D-087 koşulu — WhatsApp önizleme davranışı gerçek cihazda doğrulanmadı).
- **Açık:** gerçek tarayıcılarda satır içi PDF görüntüleme (TD-12); gerçek belge setiyle yanlış pozitif ölçümü; B2 anahtar rotasyonu prosedürü (DEPLOYMENT §5) ve canlı `storage:verify` sonucu (kullanıcının anahtarı girmesine bağlı); cap aşımında gerçek S3 hata kodu; 10 MiB gövde kabul eden production hosting (PHASE 13); PB-01…PB-11 açık.

## 17. PHASE 09 Güvenlik Notları (iş akışı)
- Her personel mutasyonu kendi içinde `requireStaff()`; iki hesap eşit (RBAC/`requireAdmin` yok). Müşteri mutasyonları `requireCustomerAccess(contextId)` + kilit altında token/süre yeniden doğrulama; başvuru yalnızca oturumdan; başka başvurunun kaynağı → 404; bağlam uyuşmazlığı → ret, değişiklik yok (TM-40).
- Mass assignment yok: girdiler Zod `.strict()`; hedef statü, aktör, rol, evrak/dosya statüsü, storage anahtarı, audit metadata'sı istemciden alınmaz; statü yalnızca matristeki aksiyonla.
- Serbest metinler (düzeltme açıklaması, gerekçe, yorum) düz metin: satır sonu normalizasyonu, kontrol/yön karakteri reddi, uzunluk sınırı (sunucu); React metni olarak render (HTML çalışmaz — E2E).
- Gizlilik: iptal/geçiş gerekçesi ve personel adları müşteriye gönderilmez; müşteri zaman çizelgesi yalnızca statü + tarih; yorumlarda yazar yok. Audit metadata'sına yorum/gerekçe/açıklama metni yazılmaz (yalnızca kimlikler, statüler, geçiş kodu).
- Yorum idempotency (PHASE 09.1, D-113): istemci işlem anahtarı + veritabanı UNIQUE + içerik özeti; ağ tekrarı/eşzamanlı tekrar tek yorum ve tek audit üretir; anahtarın başka kapsamda kullanımı genel çakışma döner (sonuç ifşa edilmez).

## 18. PHASE 10 Güvenlik Notları (iç notlar, işlem geçmişi, kalıcı silme)
- **Yetki:** her yeni Server Action/sayfa kendi içinde `requireStaff()` (unit testle statik doğrulanır); iki hesap aynı menü, ekran ve aksiyonlar (E2E: ADMIN ve EMPLOYEE). `requireAdmin`, rol bazlı menü, hesap yönetimi yok.
- **İç not izolasyonu:** ayrı tablo; müşteri modülleri (`src/features/customer-portal`, `src/app/(customer)`, `src/app/api/portal`) `@/features/internal-notes|audit-logs|deletion` ve `applicationInternalNotes`/`applicationDeletion*` tablolarını içe aktaramaz (ESLint + unit statik test). Müşteri DTO'su (`getCustomerPortalView`) notları okumaz; sentinel testleri: integration (DTO JSON) ve E2E S16 (tüm projelerde müşteri HTML + RSC/fetch/script yanıt gövdeleri). Not metni audit/log/hata mesajına yazılmaz; Server Action yanıtı yalnızca `{ noteId, created }`.
- **Audit ekranı:** salt okunur; listeleme audit'e yazılmaz (özyineleme yok); ham metadata yerine allowlist sunumu; bilinmeyen anahtar/değer/eski event güvenli fallback; parametreli sorgu; PII araması yok; başvuru numarası URL'ye yazılmaz. Append-only korumalar (GRANT + trigger) değişmedi; integration testi runtime rolünün UPDATE/DELETE/TRUNCATE denemelerinin reddini doğrular. Tablo sahibi için mutlak değiştirilemezlik garantisi değildir (D-039).
- **Kalıcı silme:** onay = gerekçe + başvuru numarası (sunucuda karşılaştırılır) + `expectedVersion`; istemci "onaylandı" bayrağı, storage anahtarı veya versiyon kimliği kabul edilmez (`.strict()`); fiziksel silme yalnızca sunucu envanterindeki tam anahtar + versiyonla, başvuru öneki sondaki ayraçla; sahipliği doğrulanmamış nesne silinmez. Talep anında bağlantı iptali + `deletion_requested_at` → müşteri erişimi, oturum değişimi, yükleme rezervasyonu/aktivasyonu, iş akışı, yorum/not, bağlantı yönetimi ve dosya erişimi kapanır (katmanlı savunma: müşteri görünüm sorgusu da silme sürecindeki başvuruyu okumaz). DB trigger'ı (D-117) storage doğrulanmadan başvuru satırının runtime rolüyle silinmesini engeller. Kira ile eşzamanlı adım tekilleştirilir; storage çağrıları transaction/kilit içinde değildir; sınırlı toplu iş + sınırlı sayfa + sınırsız yeniden deneme yok. Sağlayıcı yetki/Object Lock reddi "nesne yok" sayılmaz; `NoSuchBucket` artık yapılandırma hatası.
- **Kalan riskler / doğrulanmayanlar:** ~~çok gecikmiş sağlayıcı PUT'unun bekleme payı sonrası sonlandırmadan sonra yazılması~~ — PHASE 10.1'de giderildi (D-121…D-125: kalıcı yazım girişimi takibi, yazım çiti, zamandan bağımsız sonlandırma; belirsiz sonuçta silme süresiz bekletilebilir); gerçek B2'de uygulama silme akışı, cap/rate limit ve Object Lock davranışı doğrulanmadı; kalan audit kayıtlarındaki dolaylı tanımlayıcılar (DATA_PRIVACY §12c); yedek/PITR kopyaları. PB-01…PB-11 açık.

## 19. PHASE 10.1 Güvenlik Notları (silme ↔ gecikmiş yazım)
- **Kök neden (PHASE 10):** silme, talepten önce başlamış bir PUT'un bittiğini "rezervasyon süresi + 5 dk" bekleyerek varsayıyordu; zaman aşımı/kira bitişi uzak sağlayıcıdaki yazımın bittiğini kanıtlamaz ve B2 belgeleri böyle bir süre sınırı vermez. SDK'nin gizli yeniden denemesi ayrıca takip edilmeyen ek versiyon üretebilirdi.
- **Düzeltme:** her PUT girişimi kalıcı kayıt (D-121); PUT öncesi commit edilen çit, silme talebiyle sıraya konur (D-122); kesin/belirsiz sonuç ayrımı, belirsiz yalnızca gözlemle çözülür (D-123); sonlandırma süreden bağımsız ve tüm girişimler son boş listelemeden önce çözülmüşse (D-124); DB koruması v2 + durum makinesi trigger'ları + geri alınamaz silme işareti (D-125); takipsiz eski kayıtlar kanıtsız (D-126).
- **Bypass yok:** "Zorla Sil", "Kontrolü Atla", "işlem çözüldü" düğmesi/uç noktası yok; runtime rolü `UNKNOWN`'ı `FAILED`/`FENCED` yapamaz (trigger), silme işaretini geri alamaz, girişim/işlem/envanter satırı silemez (yetki yok).
- **Sınır:** DB, sağlayıcının fiziksel durumunu doğrulayamaz; kanıtlar uygulama tarafından üretilir. Runtime kimlik bilgisi ele geçirilirse izinli geçişlerle kanıt taklit edilebilir (TM-41/42). B2 tutarlılık modeli belgelenmemiştir (varsayım; PHASE 12 gerçek sağlayıcı doğrulaması).
