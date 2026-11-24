# Tehdit Modeli

> Yöntem: varlık + güven sınırı analizi, STRIDE sınıflandırması, OWASP Top 10 eşlemesi. Risk = Olasılık × Etki (Düşük / Orta / Yüksek / Kritik), **önlemlerden önceki** değerlendirmedir.
> Önlem ayrıntıları: [SECURITY.md](SECURITY.md), [FILE_STORAGE.md](FILE_STORAGE.md), [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

## 1. Varlıklar

| Varlık | Hassasiyet |
|---|---|
| Müşteri belgeleri (pasaport, kimlik, banka, iş sözleşmesi, ikametgâh) | **Kritik** |
| Müşteri iletişim bilgileri | Yüksek |
| Şirket içi notlar | Yüksek |
| Erişim token'ları, müşteri oturumları, OTP | Yüksek |
| Personel kimlik bilgileri / oturumları | Yüksek (ADMIN: kritik) |
| Secret'lar (DB URL, Blob token, şifreleme/HMAC anahtarları, auth secret) | **Kritik** |
| Audit log bütünlüğü | Orta |
| Hizmet / şablon yapılandırması | Düşük |

## 2. Güven Sınırları

1. İnternet ↔ Vercel (proxy, sayfalar, actions, route handlers)
2. Müşteri tarayıcısı ↔ Vercel Blob (doğrudan upload)
3. Vercel Blob → uygulama callback'i
4. Uygulama ↔ Neon (TLS)
5. Uygulama ↔ e-posta sağlayıcı / tarama servisi
6. Vercel Cron → uygulama
7. Geliştirici/operatör ↔ Vercel/Neon/GitHub konsolları

## 3. Tehdit Tablosu

| # | Tehdit (STRIDE / OWASP) | Senaryo | Etki | Risk | Önlem | Test |
|---|---|---|---|---|---|---|
| T01 | **IDOR** (E / A01) | Müşteri `fileId` veya başvuru ID'sini değiştirerek başka müşterinin belgesine erişir | Kritik veri sızıntısı | Kritik | Müşteri kapsamı yalnızca oturumdan; istemci ID'si kapsam değil; her dosya isteğinde `application_id` eşleşmesi; 404 | Integration + E2E: iki müşteri, çapraz erişim denemeleri (başvuru, dosya, yorum) |
| T02 | **Broken access control** (E / A01) | EMPLOYEE admin action'ını doğrudan POST ile çağırır | Yetki yükseltme | Yüksek | Her Server Action içinde RBAC; UI gizleme güvenlik değil | Matristeki her ❌ için negatif test |
| T03 | **Privilege escalation / mass assignment** (E / A01, A04) | Profil güncellemesinde `role: 'admin'` gönderilir | Hesap ele geçirme | Yüksek | `.strict()` Zod şemaları; rol yalnızca `user:set_role`; Better Auth `additionalFields` `input: false` | Unit (şema) + integration |
| T04 | **SQL injection** (T / A03) | Arama alanına SQL | DB tamamen | Yüksek | Drizzle parametreli sorgular; ham SQL string birleştirme yasak (lint + review) | Arama alanı fuzz testleri |
| T05 | **XSS** (T / A03) | Müşteri adı / dosya adı / yorumda script | Personel oturumu çalınması | Yüksek | React escape, `dangerouslySetInnerHTML` yasak, nonce'lu CSP, HttpOnly cookie | E2E: payload'lı ad/dosya adı render testi |
| T06 | **CSRF** (S / A01) | Personel başka sitede iken zararlı form | İstenmeyen mutasyon | Orta | Next.js Server Action Origin kontrolü, Better Auth origin kontrolü, SameSite=Lax, POST-only mutasyon | Origin'siz/yanlış Origin'li POST testi |
| T07 | **Session hijacking** (S / A07) | Cookie çalınması | Hesap ele geçirme | Yüksek | HttpOnly, Secure, HSTS, kısa oturum, XSS önlemleri, oturum iptali | Cookie flag testleri |
| T08 | **Session fixation** (S / A07) | Saldırgan önceden cookie set eder | Hesap ele geçirme | Orta | Oturum değeri yalnızca başarılı giriş/doğrulama sonrası üretilir; `__Host-` öneki | Integration |
| T09 | **Brute-force — personel girişi** (S / A07) | Şifre deneme | Hesap ele geçirme | Yüksek | IP + kullanıcı adı bazlı DB rate limit, min 12 kr. şifre, genel hata mesajı | Rate limit integration |
| T10 | **Brute-force — müşteri token** (S / A07) | `/b/*` tarama | Belge erişimi | Düşük (256 bit) | Entropi + IP limit + B modeli OTP | Rate limit testi |
| T11 | **Brute-force — OTP** (S / A07) | 6 haneyi deneme | Belge erişimi | Yüksek | 5 deneme/challenge, token başına kilit, 10 dk süre | Unit + integration |
| T12 | **Account enumeration** (I / A07) | Hata mesajı/süre farkı ile kullanıcı adı keşfi | Hedefli saldırı | Orta | Tek tip mesaj, `/is-username-available` kapalı, public sign-up yok | Test: var/yok kullanıcı yanıt eşitliği |
| T13 | **Token sızıntısı** (I / A02) | Log, referrer, geçmiş, WhatsApp yedekleri, iletme | Belge erişimi | Yüksek | B modeli, 303 ile URL temizleme, `no-referrer`, üçüncü taraf yok, log redaksiyon, iptal/yenileme, (opsiyonel) fragment tabanlı link | Header testleri; log çıktısı incelemesi |
| T14 | **Zararlı dosya yükleme** (T / A04, A08) | Exploit'li PDF, polyglot, sahte MIME | Personel cihazının ele geçirilmesi | **Kritik** | Katmanlı doğrulama + AV + CLEAN olmadan erişim yok + sandbox header'ları | FILE_STORAGE §6.4 test seti |
| T15 | **Yetkisiz storage erişimi** (I / A01, A05) | Blob URL tahmini / public erişim | Belge sızıntısı | Yüksek | Private store, public URL yok, signed URL yok, okuma yalnızca Route Handler; `BLOB_READ_WRITE_TOKEN` yalnızca server | Private blob URL'ine doğrudan istek → reddedilir |
| T16 | **Client upload token kötüye kullanımı** (T) | Token ile başka pathname'e / büyük dosya yükleme | Depolama kötüye kullanımı | Orta | Pathname sunucu belirler, içerik tipi + boyut + kısa süre, kayıt eşleşmesi | Integration |
| T17 | **Callback sahteciliği** (S) | `/api/uploads`'a sahte "tamamlandı" isteği | Sahte dosya kaydı | Orta | SDK doğrulaması + DB `PENDING` eşleşmesi + Blob'dan gerçek varlık/boyut kontrolü | Sahte callback testi |
| T18 | **Sensitive data exposure — RSC payload** (I / A01) | Şirket içi notlar müşteri sayfasının RSC/HTML payload'ında | Gizli bilgi sızıntısı | Yüksek | Ayrı müşteri DTO'ları, müşteri yolunda notlar tablosu import yasak (lint), açık kolon seçimi | E2E: müşteri sayfası HTML + RSC yanıtında not metni/anahtar kelime araması |
| T19 | **Cache poisoning / cache sızıntısı** (I / A05) | Kişiye özel sayfa paylaşılan cache'e girer | Başka kullanıcıya veri | Yüksek | `cacheComponents` kapalı, `use cache` yasak, `no-store`, tüm korumalı sayfalar dinamik | İki farklı oturumla ardışık istek; response header kontrolü |
| T20 | **Race condition** (T / A04) | İnceleme sırasında dosya değişimi; çift gönderim; eşzamanlı karar | Onaylanmamış dosyanın onaylı görünmesi | Yüksek | Kilit + version, guard'ların kilit altında kontrolü, idempotency | Paralel istek integration testleri |
| T21 | **Pasif hesabın aktif oturumu** (E / A07) | Pasifleştirilen çalışan açık sekmeden devam eder | Yetkisiz erişim | Yüksek | `banUser` oturumları iptal eder + her istekte `banned` kontrolü + cookie cache kapalı | E2E |
| T22 | **Denial of service** (D) | Upload/OTP/e-posta spam, büyük dosya, ağır arama | Maliyet, kesinti, e-posta itibarı | Orta | Rate limit (DB), boyut limitleri, sayfalama limiti (≤50), arama min 2 karakter, Vercel platform koruması | Limit testleri |
| T23 | **E-posta bombardımanı (OTP)** (D) | Geçerli token ile sürekli kod isteme | Müşteriyi rahatsız etme, maliyet | Orta | 60 sn bekleme, saatlik/günlük limit | Integration |
| T24 | **Bağımlılık açıkları** (A06) | Zafiyetli paket | Değişken | Orta | Exact sürüm, lockfile, `pnpm audit`, güncelleme süreci | CI audit |
| T25 | **Secret sızıntısı** (I / A02, A05) | `.env` commit, client bundle'a secret | Tam ele geçirme | **Kritik** | `.gitignore` düzeltmesi, `server-only`, `NEXT_PUBLIC_` disiplini, secret scanning, bundle kontrol script'i | Bundle grep; push protection |
| T26 | **Preview ortamında gerçek veri** (I) | Preview, production DB'ye bağlanır | KVKK ihlali | Yüksek | Ayrı Neon projesi + ayrı Blob store + env scope; preview deployment protection | Env yapılandırma denetimi (checklist) |
| T27 | **Audit log manipülasyonu** (R / A09) | Uygulama hatası veya saldırgan log siler | İnkâr edilebilirlik | Orta | DB rol yetkisi + trigger | Integration: UPDATE/DELETE denemesi hata verir |
| T28 | **Loglarda PII / token** (I / A09) | Hata loguna request body düşer | Veri sızıntısı | Orta | Redaksiyonlu logger, body loglanmaz | Log birim testi |
| T29 | **Open redirect** (S / A01) | `?next=https://evil` | Phishing | Düşük | Yalnızca iç yol whitelist | Unit |
| T30 | **Phishing / sahte bağlantı** (S) | Saldırgan müşteriye sahte CS Global linki gönderir | Kimlik/belge toplama | Orta | Tek resmî domain; panelde iletişim bilgisi; müşteri bilgilendirmesi (operasyonel); OTP'nin yalnızca kayıtlı e-postaya gitmesi | Operasyonel |
| T31 | **Insider erişimi** (I) | Çalışan yetkisi dahilinde toplu indirme | Veri sızıntısı | Orta | Audit (görüntüleme/indirme), ASSIGNED_ONLY kapsam seçeneği, rate limit, düzenli audit incelemesi | Audit raporu |
| T32 | **Konsol hesaplarının ele geçirilmesi** (E) | Vercel/Neon/GitHub hesabı | Tam ele geçirme | Kritik | MFA zorunlu, en az yetkili ekip üyeliği, ayrı production erişimi | Operasyonel checklist (PHASE 13) |

## 4. Kabul Edilen / Kalan Riskler (onay bekler)

| Risk | Durum |
|---|---|
| E-posta hesabı ele geçirilmiş müşteri (B modelinde) | Kalan risk — kabul önerilir |
| AV seçeneği (c) seçilirse bilinen zararlı yazılım imzalarının kontrol edilmemesi | Kullanıcı kararı (OD-07) |
| Vercel platform loglarında path-tabanlı token | B modeli ile azaltılır; fragment tabanlı link (OD-02) ile ortadan kalkar |
| ABD merkezli sağlayıcılara (Vercel, Neon/Databricks) veri aktarımı | Hukuki değerlendirme (DATA_PRIVACY §8) |

## 5. Gözden Geçirme

Tehdit modeli her fazın sonunda ilgili özellik için güncellenir; PHASE 12'de tam gözden geçirme ve sızma testi (manuel) yapılır.
