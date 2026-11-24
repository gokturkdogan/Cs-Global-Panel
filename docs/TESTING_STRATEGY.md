# Test Stratejisi

> Araçlar: **Vitest 5.1.1** (unit + integration), **Playwright 1.65.1** (E2E, desktop + mobil). PHASE 01'de altyapı kuruldu ve ilk testler yazıldı (§10).
> Güvenlik ve test her fazın parçasıdır; PHASE 12 tam regresyon + denetim fazıdır.

## 1. Seviyeler ve Ortamlar

| Seviye | Kapsam | Ortam | Çalışma |
|---|---|---|---|
| Unit | Saf domain, Zod şemaları, kripto, formatlama, PDF doğrulama kuralları | Node, I/O yok | Her commit |
| Integration | Servisler + gerçek Postgres (transaction, kısıt, kilit, yetki) | Projenin tek Neon veritabanı (D-059); testler yalnızca kendi sentetik kayıtlarını oluşturup siler | Yerelde (`pnpm test:integration`); CI'da veritabanı secret'ı olmadığından çalışmaz (PHASE 13 kararı) |
| E2E | Uçtan uca akış | Yerel `next start` veya preview + test DB + dev/demo storage | Her PR (kritik set), periyodik tam set |
| Manuel | Gerçek cihaz (iOS Safari, Android Chrome, WhatsApp in-app), ekran okuyucu | Preview/demo | PHASE 07, 08, 11, 12 |

Test verisi yalnızca **sahte** ("Test Müşteri", `+905550000001`, `test+1@example.com`). Fixture PDF'leri `tests/fixtures/` altında üretilmiş sahte belgelerdir. Ücretli test servisi kullanılmaz.

## 2. Unit Testler

| Alan | Vakalar |
|---|---|
| Şemalar | Zorunlu alanlar (ad, soyad, telefon, e-posta, hizmet), uzunluklar, `.strict()` fazla alan reddi, Türkçe mesajlar |
| Başvuru statü geçişleri | T1–T12'nin **her** hücresi × aktör (personel / CUSTOMER); matris dışı geçiş reddi (personel için de); T7–T12 gerekçe zorunluluğu; T8 hedefinin geçmişten belirlenmesi; T12 evrak seçimi zorunluluğu |
| Evrak statü geçişleri | D1–D10; D8 yalnızca isteğe bağlı; D9 yalnızca personel + `UNDER_REVIEW` |
| Dosya statüleri | Geçerli/geçersiz geçişler; `ACTIVE` olmayan dosyanın görüntülenememesi |
| Erişim | `requireStaff()`: oturumsuz → red; ADMIN ve EMPLOYEE aynı sonucu alır; rol hiçbir kararda kullanılmaz (OD-24) |
| Token | 32 bayt, base64url 43 kr., 10k üretimde çakışma yok, HMAC deterministik, AES-GCM round-trip, yanlış AAD/anahtarla çözme hatası |
| Portal cookie | İmza doğrulama (timing-safe), kurcalanmış payload reddi, `exp` sonrası red, 7 gün sabit (yenilenmez) |
| Tamamlanma hesapları | BR-110…BR-114 |
| Dosya adı sanitizasyonu | Türkçe karakter, emoji, kontrol karakteri, `../`, 300 karakter, uzantısız |
| PDF doğrulama kuralları | İmza, `%%EOF`, aktif içerik anahtarları (hex-escape dahil), `/Encrypt`, kaynak limitleri |
| Limit sabiti | `MAX_PDF_SIZE_BYTES === 10_485_760`; client ön kontrol ve sunucu aynı sabiti kullanır |
| Normalizasyon | Telefon (TR formatları → E.164), e-posta, Türkçe arama katlaması |
| WhatsApp URL | Telefon rakamları (`+` yok), BR-161 şablonu, `encodeURIComponent` (Türkçe karakter, `&`, `#`, satır sonu) |
| Başvuru numarası | Yıl sınırı (31.12 23:30 TRT), dolgu, 7 haneye taşma |
| Tarih | UTC → Europe/Istanbul |
| Log redaksiyonu | Token, şifre, cookie değeri, `/b/<token>` path'i maskelenir |

## 3. Integration Testler

| Alan | Vakalar |
|---|---|
| Transaction | Başvuru oluşturmanın ortasında hata → hiçbir satır kalmaz, sayaç geri alınır |
| Başvuru oluşturma | Müşteri bilgileri başvuruda; aynı telefon/e-posta ile iki bağımsız başvuru (unique hatası yok); bir başvurudaki düzenleme diğerini etkilemez; **eşzamanlı 20 oluşturmada** benzersiz ve boşluksuz numara; idempotency key tekrarı tek kayıt |
| Snapshot | Şablon sonradan değişti/eklendi/pasifleşti → eski başvuru değişmez; pasif hizmetle oluşturma reddi; hizmet adı değişikliği `service_name_snapshot`'ı etkilemez |
| Personel auth | İki hesap modeli (en fazla bir ADMIN + bir EMPLOYEE; üçüncü hesap ve eşzamanlı bootstrap reddi); kullanıcı adıyla giriş; yanlış şifre / var olmayan kullanıcı → aynı genel hata; şifre düz metin saklanmaz; Better Auth HTTP uç noktaları (`/api/auth/*`) 404 |
| Oturum parametreleri | Personel oturumu 7 gün sonra geçersiz ve aktivite ile **uzamaz**; iki hesabın oturumları bağımsız; `auth:reset-password` yalnızca ilgili hesabın tüm oturumlarını iptal eder |
| IP/UA saklamama | Giriş sonrası `sessions.ip_address` ve `user_agent` NULL; CHECK kısıtının dolu değeri reddettiği; `audit_logs`'ta IP kolonu olmadığı; rate limit anahtarlarının HMAC'li ve süreli olduğu |
| Giriş sınırlaması | Kullanıcı adı ve genel eşikler; eşzamanlı denemelerde aşılamaması; pencere sonunda sıfırlanma; blok sırasında doğru şifrenin de reddi; backend hatasında fail-closed |
| Rol yetkilendirme | — (kaldırıldı: RBAC yok — OD-24). Yerine: her korumalı action/route için oturumsuz erişim reddi ve manipüle edilmiş aktör/rol bilgisinin etkisizliği |
| Bağlantı | Tek aktif token (eşzamanlı iki yenileme → tek aktif satır); yenileme/iptal → eski token reddi + portal cookie'nin bir sonraki istekte reddi; iptal sonrası "yeni oluştur"; süre/statü ile otomatik iptal **olmadığı** (COMPLETED/CANCELLED başvuruda bağlantı çalışır, panel salt okunur) |
| Bağlantı GET | `/b/[token]` hiçbir tabloyu değiştirmez (satır sayıları/updated_at aynı), audit yazmaz |
| Upload | Token kuralları (BR-44 rol × statü); pathname sunucuda; callback + confirm idempotency; tek devam eden yükleme; `ACTIVE` tekliği (paralel aktivasyon); `STATE_CHANGED` yarışı |
| Versiyonlama | Değiştirme → yeni `ACTIVE` (v+1), eski `SUPERSEDED`; reddedilen yeni dosya eski aktif dosyayı etkilemez |
| İnceleme | D4/D5/D6; BR-56; BR-57 — eski `fileId` ile karar → `CONFLICT`; personel `UNDER_REVIEW` yüklemesi sonrası evrak `PENDING_REVIEW`, eski onay aktarılmaz; BR-59/BR-60 guard'ları |
| Geri alma/yeniden açma geçişleri | T8 iptal öncesi statüye döner; T9–T11 evrak/onay/geçmiş korunur; T12 yalnızca seçilen evrakları `REVISION_REQUIRED` yapar ve review kaydı oluşturur (her iki hesapla) |
| Silme | İki aşama; aşama 1 sonrası tüm okumalar 404 ve portal cookie reddi; storage silme hatası enjekte edilince DB kayıtları kalır, yeniden deneme tamamlar; sonunda tüm alt tablolar boş, storage öneki boş, yalnızca minimum audit kayıtları |
| Audit | Her mutasyon bir kayıt; metadata'da yasak alan yok (PII, token, IP); `UPDATE/DELETE audit_logs` hata |
| Cache izolasyonu | İki farklı portal cookie'siyle ardışık `/portal` → her biri yalnızca kendi verisi; `Cache-Control: no-store` |
| Teknik temizlik | Süresi dolan `UPLOAD_PENDING` → `EXPIRED` + blob silinir; orphan blob silinir; `ACTIVE`/`SUPERSEDED`/`REMOVED` dosyalara **dokunulmaz** |

## 4. Yetkilendirme Negatif Test Matrisi

RBAC yoktur (OD-24). Her korumalı personel giriş noktası (Server Action, Route Handler, sayfa) için: oturumsuz erişim reddi; müşteri oturumuyla erişim reddi; her iki hesapla aynı sonuç. Müşteri için kapsam dışı kaynak = 404 ([AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)). Yeni action eklemek bu testlere satır eklemeyi gerektirir (Definition of Done).

## 5. E2E Testler (Playwright)

### 5.1 Zorunlu ana senaryo
1. ADMIN hesabı giriş yapar (hesaplar `pnpm auth:bootstrap` ile oluşturulmuştur).
2. ADMIN hizmet oluşturur.
3. ADMIN hizmete evrak gereksinimleri ekler (2 zorunlu, 1 isteğe bağlı).
4. ADMIN çıkış yapar.
5. EMPLOYEE hesabı aynı giriş ekranından giriş yapar (zorunlu şifre değişimi **yok**).
6. EMPLOYEE yeni başvuru oluşturur.
7. Sonuç ekranı: bağlantı, Kopyala, WhatsApp ile Paylaş (onay penceresinde ad + telefon; `wa.me` URL'si ve encode edilmiş mesaj doğrulanır — WhatsApp açılmaz).
8. Müşteri (mobil viewport, ayrı context) bağlantıyı açar → **doğrudan** `/portal` (ek adım yok); adres çubuğunda token yok.
9. Müşteri PDF'leri yükler (ilerleme görünür, "Kontrol ediliyor" → "Yüklendi").
10. Müşteri incelemeye gönderir.
11. EMPLOYEE evrakları inceler.
12. Bir evrak için düzeltme ister (gerekçeli).
13. Müşteri açıklamayı görür.
14. Müşteri evrağı yeniden yükler (değiştir).
15. Müşteri tekrar gönderir.
16. EMPLOYEE evrakları onaylar → "Evrakları onayla".
17. Başvuru "İşlemde".
18. Başvuru tamamlanır.
19. Müşteri güncel süreci salt okunur görür (bağlantı hâlâ geçerli).

### 5.2 Ek akışlar
- E1: Personel `UNDER_REVIEW` sırasında müşteri adına evrağı değiştirir → evrak yeniden "İnceleme Bekliyor"; eski onay geçmişte.
- E2: EMPLOYEE `COMPLETED` başvuruyu gerekçeyle yeniden açar (T9) → T12 ile bir evrak için düzeltme ister → müşteri yeniden yükler (iki hesap eşit — OD-24).
- E3: ADMIN iptal edilmiş başvuruyu yeniden açar (T8) → iptal öncesi statü.
- E4: Personel bağlantıyı yeniler → eski bağlantıyla açık müşteri sekmesi bir sonraki işlemde "bağlantı geçersiz"e düşer; yeni bağlantı çalışır.
- E5: EMPLOYEE başvuruyu siler (numara yazarak onay) → listede yok; bağlantı ve dosya URL'leri geçersiz.
- E6: İşletmeci `pnpm auth:reset-password` ile EMPLOYEE şifresini sıfırlar → EMPLOYEE'nin açık oturumu sonlanır, ADMIN oturumu etkilenmez.

### 5.3 Güvenlik senaryoları
| # | Senaryo | Beklenen |
|---|---|---|
| S01 | Müşteri A'nın cookie'siyle B'nin dosya ID'si | 404 |
| S02 | Müşteri A, B'nin başvurusunu URL/payload manipülasyonuyla görmeye çalışır | Yalnızca A'nın verisi |
| S03 | Geçersiz / iptal edilmiş token | `/link-invalid`, veri yok, token mesajda yok |
| S04 | Yenilenmiş/iptal edilmiş bağlantının açık oturumu | Bir sonraki istekte reddedilir |
| S05 | Oturumsuz istek / müşteri oturumuyla personel sayfası veya action'ı | `/login`'e yönlendirme / 401 / reddedilir |
| S06 | Şifresi sıfırlanan hesabın açık oturumu | Bir sonraki istekte `/login`'e; diğer hesabın oturumu açık kalır |
| S07 | PDF olmayan dosya (`.pdf` uzantılı) | Reddedilir, Türkçe mesaj |
| S08 | Sahte MIME type | Reddedilir |
| S09 | 10 485 761 bayt | Reddedilir; 10 485 760 kabul |
| S10 | Doğrulaması bitmemiş dosyayı görüntüleme | 404 |
| S11 | Onaylanmış evrağı müşteri değiştirmeye çalışır (UI + doğrudan action) | Reddedilir |
| S12 | Müşteri `UNDER_REVIEW` sırasında yükleme/değiştirme/silme (doğrudan istek) | Reddedilir |
| S13 | Aynı başvurunun iki kez gönderilmesi (çift tık + paralel) | Tek geçiş |
| S14 | Şablon değişince eski başvuru | Evrak listesi değişmez |
| S15 | Cache sızıntısı | Ardışık farklı oturumlar; header kontrolü |
| S16 | İç not sızıntısı | Benzersiz işaretçi metin müşteri HTML'inde ve RSC yanıtlarında **yok** |
| S17 | Origin'siz / yabancı Origin'li Server Action ve `/api/uploads` | Reddedilir |
| S18 | Better Auth uç noktalarına doğrudan istek (`/api/auth/sign-up/email`, `/sign-in/email`, `/change-password`, `/update-user`, `/request-password-reset`, `/admin/*`) | 404 (route bağlı değil) |
| S19 | XSS payload'lı müşteri adı / dosya adı / yorum | Escape edilmiş |
| S20 | Token'ın uygulama loglarında, audit'te, hata sayfalarında bulunmaması | Bulunmaz |
| S21 | Güvenlik header'ları (CSP, HSTS, nosniff, Referrer-Policy `no-referrer` portalda, X-Robots-Tag) | Mevcut |
| S22 | Sahte `Host` header ile bağlantı oluşturma | Bağlantı `APP_URL` ile üretilir |
| S23 | Eski versiyonla inceleme kararı (iki sekme) | `CONFLICT` |
| S24 | Login brute-force | Eşikte genel mesajla blok |

### 5.4 Mobil E2E (zorunlu)
Playwright projeleri: `Mobile Safari (iPhone)`, `Mobile Chrome (Pixel)`, `Desktop Chrome`, `Desktop WebKit`. Müşteri paneli akışları her mobil projede: bağlantı → panel → yükleme → gönderim → düzeltme.

## 6. Responsive ve Erişilebilirlik

- Genişlikler: **320, 360, 375, 390, 414, 430, 768, 1024, 1440** px — müşteri panelinin ana ekranları için: yatay overflow yok; dokunma hedefleri ≥ 44×44; süreç göstergesi taşmıyor; 200 karakterlik dosya adı layout'u bozmuyor; görsel regresyon (PHASE 11).
- axe taraması (kritik/ciddi ihlal = başarısız); VoiceOver (iOS), TalkBack (Android), yalnızca klavye ile tam akış.
- **Gerçek cihaz:** WhatsApp in-app tarayıcısından bağlantı açma (cookie davranışı dahil), iOS Safari, Android Chrome; dosya seçici; yükleme; PDF görüntüleme/indirme. Sonuçlar PROJECT_STATE'e yazılır.

## 7. Diğer

- Performans: liste ve dashboard sorguları için `EXPLAIN ANALYZE` (seed: 10k başvuru); Lighthouse mobil (müşteri paneli) Perf ≥ 90, A11y ≥ 95.
- Bağımlılık: `pnpm audit --prod`.
- Bundle: client chunk'larında secret adı / `server-only` modülü yok.
- Statik analiz: `tsc --noEmit`, ESLint, Prettier.

## 8. CI Kapıları

1. `pnpm install --frozen-lockfile` · 2. `typecheck` · `lint` · `format:check` · 3. `test` (unit) · 4. `test:integration` (PHASE 02+) · 5. `build` · `check:bundle` · 6. `test:e2e` · 7. `pnpm audit --audit-level=high` · ayrıca gerçek env dosyalarının git tarafından ignore edildiği kontrolü.
CI: `.github/workflows/ci.yml` (GitHub Actions). Repo herkese açık olduğundan standart runner'lar ücretsizdir (2026-11-24); ücretli plan yok. Yalnızca resmî action'lar, commit SHA'sıyla sabit; pnpm `packageManager`'dan Corepack ile.

## 9. Kabul Kriterleri

- Özellik; unit + (uygunsa) integration + (kullanıcı akışıysa) E2E ile tamamlanmış sayılır.
- Yetki matrisi ve state machine matrisleri %100 hücre kapsamı.
- Domain modülleri satır kapsamı ≥ %90.
- Test edilmemiş iş tamamlandı olarak raporlanmaz.

Kaldırılan test alanları: OTP, müşteri eşleştirme/birleştirme, atama/kapsam, arşiv, ayarlar, otomatik bağlantı süre sonu, otomatik saklama/silme, dinamik dosya limitleri, çoklu dosya, harici AV (EICAR), zorunlu şifre değişimi, kendi şifresini değiştirme, hareketsizlik zaman aşımı.

## 10. PHASE 01 Test Altyapısı (uygulandı)

| Komut | Ne çalışır |
|---|---|
| `pnpm test` | Vitest, `tests/unit/**/*.test.ts`, Node ortamı, watch yok (`vitest run`) |
| `pnpm test:watch` | Vitest watch modu (yerel geliştirme) |
| `pnpm test:e2e` | Playwright; `pnpm build && pnpm start --port 3100` ile production build üzerinde |
| `pnpm check` | lint + typecheck + format:check + test |
| `pnpm check:bundle` | Build sonrası client bundle'da sunucu secret adı/sunucu modülü kontrolü |

- Vitest: `@` → `src`; `server-only` testte boş modüle çözülür (React Server ortamındaki davranışla aynı), böylece `src/server/*` saf fonksiyonları test edilebilir.
- Playwright projeleri: **Desktop Chrome**, **Mobile Chrome** (Pixel 7 emülasyonu), **Mobile Safari** (iPhone 15 emülasyonu, WebKit), **Desktop WebKit**. Tarayıcılar `playwright install chromium webkit` ile kullanıcı önbelleğine kurulur. Emülasyon gerçek cihaz testi yerine geçmez.
- Unit testler (26): sabitler (`MAX_PDF_SIZE_BYTES === 10_485_760`, PDF türü, şifre 8–128, 7 gün oturum, 256 bit token), şirket yapılandırması (iletişim alanları `null` veya geçerli E.164; şu an `null`), `parseServerEnv` (varsayılanlar, origin indirgeme, production'da https/zorunluluk, fail-closed `APP_ENV`, değerin hata mesajına sızmaması).
- E2E (başlangıç sayfası): 200 yanıt, başlık, `lang="tr"`, Türkçe içerik, konsol/sayfa hatası yok, harici istek yok, yerel Geist fontu, OS koyu tema tercihinde açık tema, mevcut cihazda yatay taşma yok, güvenlik header'ları, `robots.txt`; Desktop Chrome'da 320/375/390/768/1024/1440 px genişliklerde taşma yok.
- `tests/integration/` ve `tests/fixtures/` gerçek kullanım başladığı fazda oluşturulur.

## 11. PHASE 02 Integration Testleri

`pnpm test:integration` (`vitest.integration.config.ts`): `.env.local`'daki tek veritabanında çalışır (D-059). Global setup bekleyen migration'ları uygular. Dosyalar sırayla çalışır; her dosya kendi sentetik kayıtlarını rastgele kimliklerle oluşturur ve sahip rolle yalnızca bunları siler. Audit kayıtları değiştirilemez olduğu için testlerin audit satırları veritabanında kalır. Gerçek müşteri verisi bulunan veritabanında çalıştırılmamalıdır (TM-43).

| Dosya | Kapsam |
|---|---|
| `privileges.test.ts` | İstemci tarafı TLS (doğrulanmış sertifika), rol, PostgreSQL sürümü, rol düzeyi zaman aşımları, 17 tablo, pg_trgm, uygulanmış migration sayısı, tüm zaman kolonlarının `timestamptz` olması; runtime rolünün öznitelikleri, sahipliği, **tablo × yetki matrisinin tamamı**, DDL/TRUNCATE/trigger kapatma/`drizzle` şeması/TEMP reddi; audit değiştirilemezliği (runtime ve sahip) ve metadata beyaz listesi |
| `constraints.test.ts` | INV-01…INV-12, INV-14, INV-16, INV-17; BR-04; snapshot bağımsızlığı |
| `concurrency.test.ts` | Bağımsız bağlantılarla: eşzamanlı aktif token, aktif dosya, versiyon numarası, optimistic lock, `FOR UPDATE` + `lock_timeout`, 10 eşzamanlı başvuru numarası (biri rollback) |
| `transactions-and-deletion.test.ts` | Drizzle transaction rollback/commit (pooler üzerinden), başvuru silmede CASCADE + audit'in kalması, RESTRICT, Drizzle şeması ↔ veritabanı kolon/nullability drift kontrolü, seed idempotency (mevcut demo kayıtlara dokunmadan), Türkçe arama (pg_trgm + `lower()` sınırlaması) |

Unit (veritabanısız): bağlantı adresi doğrulama ve hata mesajı sızıntısı, `parseDatabaseEnv`, migration SQL statik kontrolleri (yıkıcı ifade/secret yok, partial index'ler, her tabloya GRANT, journal eşleşmesi), Drizzle şemasının 17 tablo olması, seed verisi.

Test verileri sentetiktir (`example.invalid`, `+905550000001`, rastgele hex token hash'leri); gerçek müşteri bağlantısı değildir.

## 12. PHASE 03 Testleri (uygulandı)

| Seviye | Dosya | Kapsam |
|---|---|---|
| Unit | `tests/unit/auth-policy.test.ts` | Kullanıcı adı normalizasyonu/biçimi; şifre politikası (8–128, boşluk, kullanıcı adı, çeşitlilik); giriş şemasının `role`/`userId` gibi fazladan alanları reddetmesi; `parseAuthEnv` (eksik/kısa/aynı secret, Secure cookie) |
| Unit | `tests/unit/migrations.test.ts` | Migration 0003: hesap türü başına tek hesap, e-posta iç kimlik CHECK'i; yıkıcı ifadeler yalnızca gerekçeli izin listesiyle |
| Integration | `tests/integration/auth.test.ts` | **Geçici hesaplarla (D-065):** eşzamanlı bootstrap (tam olarak 1 ADMIN + 1 EMPLOYEE, karışma yok), tekrar çalıştırma, üçüncü hesap reddi (sahip rol dahil), kullanıcı adı/e-posta/rol kısıtları (rollback), scrypt hash, girdi kuralları, Better Auth üzerinden kayıt reddi, ADMIN/EMPLOYEE girişi, bağımsız oturumlar, IP/UA NULL (sahte header'larla), 7 gün, genel hata, sliding yok, değiştirilmiş/süresi dolmuş cookie reddi, çıkışın yalnızca kendi oturumunu sonlandırması, şifre sıfırlamanın yalnızca ilgili hesabın oturumlarını iptal etmesi + audit. **Rate limit:** kullanıcı adı 10/15 dk, sıfırlama, eşzamanlı 20 denemede en fazla 10, pencere sonu, HMAC anahtar, ~~genel 100 limiti~~ (PHASE 04'te bilinmeyen-ad limitiyle değişti), veritabanı hatasında fail-closed |
| E2E | `tests/e2e/auth.spec.ts` | Ortak giriş ekranı (e-posta/kayıt/şifremi unuttum yok), şifre göster/gizle, CSP nonce'un her istekte farklı olması, oturumsuz `/dashboard` → `/login`, 11 Better Auth yolunun 404 olması; **geçici hesaplarla:** iki hesabın aynı ekrandan girişi, aynı panel içeriği, cookie öznitelikleri (HttpOnly, Lax, Path, host-only, 7 gün), çıkış ve sonrasında erişim reddi, yanlış şifre genel Türkçe hata, open redirect yok, CSRF (sahte Origin → 500, oturum yok — PHASE 04'te 403) |
| E2E | `tests/e2e/foundation.spec.ts` | `/` → `/login`; giriş ekranında konsol/CSP hatası yok, harici istek yok, font, açık tema, 6 genişlikte taşma yok, güvenlik header'ları (nonce'lu CSP, `no-store`), robots |

Gerçek hesaplar oluşturulduktan sonra hesap gerektiren testler gerekçesiyle atlanır (NOT VERIFIED); gerçek cihaz testi ve https üzerinde `Secure` cookie doğrulaması yapılmadı.

> **D-065 koşullu onay:** Bu atlama geçicidir ve kalıcı strateji olarak kabul edilmez. PHASE 04'te (P4-01) gerçek hesapları riske atmayan, authentication bypass veya test amaçlı public endpoint oluşturmayan, güvenli ve tekrar çalıştırılabilir bir integration/E2E stratejisi geliştirilecektir.

## 13. PHASE 04 Testleri (uygulandı) — kalıcı kimliği doğrulanmış test stratejisi (D-067)

**Strateji:** Tek veritabanı (Product Owner kararı). Gerçek hesaplar varken şifreyle giriş testleri çalışmaz (şifreler bilinmez/istenmez); kimliği doğrulanmış tüm testler `tests/support/staff-session.ts` ile **test başına kısa ömürlü (30 dk) oturum** kullanır: runtime rolüyle `sessions` satırı (`test-session-*`) + Better Auth'un doğruladığı imzalı cookie. Uygulamada bypass, test endpoint'i, özel header veya test kullanıcısı yoktur. Test sonunda kendi oturumları silinir; global setup/teardown yarıda kalanları temizler. Playwright trace kapalı (cookie diske yazılmaz). Hesap yokken (temiz kurulum) PHASE 03'ün geçici hesaplı tam yaşam döngüsü testleri çalışır.

| Seviye | Dosya | Kapsam |
|---|---|---|
| Unit | `tests/unit/request-origin.test.ts` | Köken kontrolü: aynı origin/host kabul; güvenli metotlar; başka origin, alt alan adı, şema, port, Origin yok, `"null"`, bozuk Origin, güvenilmeyen/eksik Host, APP_URL yok/bozuk → ret; PUT/PATCH/DELETE; `resolveAppUrl` (production'da fail-closed) |
| Unit | `tests/unit/dashboard-ui.test.tsx` | Statü etiketlerinin eksiksiz ve STATE_TRANSITIONS ile aynı olması; rozet metin + dekoratif ikon; sayaç tanımları (Evrak Bekleyen = evrak + düzeltme); sorgunun yalnızca izinli kolonları okuması (statik); menü (4 öğe, ayar/hesap/çalışan yok, aktif öğe kuralı); Europe/Istanbul tarih biçimi; Türkçe baş harf; boş/hata/yükleniyor durumlarının ayrılığı (`renderToStaticMarkup`); son başvurular sütunları ve bağlantısız satırlar |
| Integration | `tests/integration/auth.test.ts` | **Gerçek hesaplar varken (salt okunur/etkisiz):** tam olarak 2 hesap + e-posta iç kimlik; rollback içinde üçüncü hesap reddi; eşzamanlı no-op bootstrap; politikaya aykırı şifre sıfırlamanın yazmadan reddi; kayıt reddi; yanlış şifre/var olmayan kullanıcı aynı 401; oturum yapılandırması (7 gün, sliding yok, cookie cache yok); test oturumu iki hesap için doğrulanır, IP/UA NULL, kullanımla uzamaz; değiştirilmiş imza/başka secret/süresi dolmuş reddi; çıkışın yalnızca kendi oturumunu silmesi. Başta/sonda gerçek hesap parmak izi ve mevcut gerçek oturumlar karşılaştırılır. **Rate limit (D-068):** kullanıcı adı 10/15 dk, eşzamanlı 20'de 10, pencere sonu, bilinmeyen adlar ortak limiti (eşzamanlı 60 denemede tam 50 kabul, aşımda satır oluşmaz), limit dolu iken var olan hesabın engellenmemesi, fail-closed. **Secure cookie (P4-04, yapılandırma):** https'te `__Secure-cs.session_token` + Secure/HttpOnly/Lax, http'de önekisiz |
| Integration | `tests/integration/dashboard.test.ts` | REPEATABLE READ transaction'da önce/sonra farkı (sentetik kayıtlar **geri alınır**): sayaç tanımları, silme talepli kaydın dışlanması, son 5 sırası (eşitlikte numara), inceleme kuyruğu sırası ve filtresi, DTO'da telefon/e-posta/kimlik yok, veritabanı hatasında ayrı hata sonucu ve log'da bağlantı bilgisi yok, salt okunur transaction'ın gerçek veritabanında çalışması |
| E2E | `tests/e2e/dashboard.spec.ts` | Genel Bakış (başlık, açıklama, konum yolu `aria-current`, pasif Yeni Başvuru, 4 sayaç, bölümler, `no-store`, CSP nonce, konsol hatası yok); iki hesabın birebir aynı buton/bağlantı/başlıkları; menü gezinmesi + aktif öğe + hazır olmayan modüller; panel içi 404; atlama bağlantısı; mobil drawer (odak, Escape + odak iadesi, overlay, kapat butonu, kaydırma kilidi); hesap menüsünden çıkış (oturum satırı silinir); sidebar kullanıcı/çıkış; sunucuda iptal edilmiş, süresi dolmuş, değiştirilmiş oturum reddi; 320/375/390/768/1024/1440/1920 px'te taşma yok, sidebar yalnızca ≥1024px ve 248px (Chrome + WebKit); sayaçların veritabanıyla eşitliği + boş durum metinleri; sentetik başvurunun son başvurular ve kuyrukta görünmesi, telefon/e-posta/kimliğin HTML'de olmaması (veri testleri yalnızca Desktop Chrome, sıralı) |
| E2E | `tests/e2e/auth.spec.ts` | P4-02: sahte/`null`/bozuk Origin, farklı port, Origin'siz POST, güvenilmeyen X-Forwarded-Host → 403 "İstek reddedildi." + `no-store` + cookie yok; aynı origin'den gelen istek proxy'den geçer; GET Origin'siz çalışır. Geçici hesaplı giriş testleri yeni panele uyarlandı (hesap menüsünden çıkış) |

**Doğrulanmayanlar:** gerçek hesaplar varken doğru şifreyle giriş/Set-Cookie, bootstrap'ın hesap oluşturması ve şifre sıfırlamanın etkisi (yalnızca hesap yokken — PHASE 03); veri yükleme hatası durumunun E2E'si (paylaşılan veritabanında yetki geri alma riskli olduğu için unit + integration ile); axe taraması (paket kurulu değil — PHASE 12); gerçek cihaz/ekran okuyucu; HTTPS'te tarayıcı `Secure` cookie'si; gerçek GitHub CI çalışması.

## 14. PHASE 05 Testleri (uygulandı) — izole mutasyon testleri (D-077)

**Ortamlar:** (1) Ortak `neondb` — gerçek hesaplar var: unit, rollback'li integration (dış transaction + SAVEPOINT; hizmet/evrak/başvuru/audit dahil her şey geri alınır), salt okunur E2E. (2) **İzole geçici PostgreSQL** (`pnpm test:integration:isolated`, `pnpm test:e2e:isolated`; Docker `postgres:18-alpine`, container test sonunda silinir): commit eden eşzamanlılık testleri, tarayıcıdan mutasyon E2E'si ve geçici hesaplarla şifreyle giriş/bootstrap/şifre sıfırlama. Mutasyon testleri `isIsolatedTestDatabase()` (işaret + yerel adres + geçici veritabanı adı) doğrulanmadan çalışmaz.

| Seviye | Dosya | Kapsam |
|---|---|---|
| Unit | `tests/unit/services.test.ts` | BR-80 katlaması (İ/I/ı/Ş/Ç/â, birleşik nokta), SQL `translate` eşlemesinin JS ile aynılığı, LIKE kaçışı; ad kuralları (kırpma, boşluk tekleme, karakter beyaz listesi, kod noktası uzunluğu), çok satırlı metin (CRLF, kontrol karakteri, HTML aynen), mass assignment (7 yasak alan), UUID/version/yön, liste filtresi varsayılanları; statik: 7 action `run` → `requireStaff` + Zod, şablon katmanı snapshot tablolarına yazmaz, audit `tx` ile, DTO'da oluşturan kimliği yok |
| Integration | `tests/integration/services.test.ts` | **Rollback (her ortam):** oluşturma (aktör, version, sıra, audit, audit'te ad yok), Türkçe büyük/küçük harf ad çakışması → DUPLICATE, güncelleme/eski version CONFLICT/no-op, aktif/pasif + aktif evrak sayısı, NOT_FOUND, evrak sırası 10/20/30 + XSS metni aynen, IDOR (başka hizmetin evrakı), sıralama (uç no-op, pasif konum, version artmaz, diğer hizmet etkilenmez), audit hatasında atomik geri alma (log'da içerik yok), liste araması/filtre/sayılar/LIKE, **snapshot bütünlüğü** (8 değişiklik türü; yeni başvuru güncel aktif şablonları alır). **İzole:** eşzamanlı hizmet düzenleme (1 başarı + 1 CONFLICT, tek audit), pasifleştirme–düzenleme yarışı, 6 eşzamanlı evrak ekleme (10…60), eşzamanlı taşıma (ardışık/benzersiz sıra), PHASE 06 kilit sözleşmesi (`FOR SHARE` okuyucu şablon kilidinde bekler) |
| E2E | `tests/e2e/services.spec.ts` | **Salt okunur (her ortam):** liste (başlık, açıklama, Yeni Hizmet, arama, filtre, `no-store`, konsol hatası yok), sonuç yok/boş katalog ayrımı, filtre `aria-current`, geçersiz/bilinmeyen kimlik 404, oturumsuz → giriş, başka origin'den mutasyon 403, iki hesabın aynı buton/bağlantı/alanları, mevcut hizmet detayı salt okunur, 7 genişlikte taşma yok (Chrome + WebKit). **İzole (4 proje):** Türkçe doğrulama + odak + `aria-invalid`, çift tıklamada tek kayıt, aktör ve audit; Türkçe büyük harf ad çakışması + veri korunur; iki hesabın eşzamanlı düzenlemesinde çakışma + "Sayfayı yenile"; evrak ekleme, XSS talimatı inert (diyalog yok), zorunluluk, sıralama (odak, yenilemede korunur), pasifleştirme onayı (Escape iptal, odak iadesi), yeniden aktifleştirme; hizmet pasifleştirme onayı, aktif evrak yok uyarısı, Türkçe arama + filtre |

**Doğrulanmayanlar:** CI'da izole testler (Docker hedefi yok); axe; gerçek cihaz/ekran okuyucu; uygulama içi gezinmede kaydedilmemiş değişiklik uyarısı (yalnızca gösterge).
