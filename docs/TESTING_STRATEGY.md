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
| Başvuru statü geçişleri | T1–T12'nin **her** hücresi × rol (ADMIN/EMPLOYEE/CUSTOMER); matris dışı geçiş reddi; T7–T12 gerekçe zorunluluğu; T8 hedefinin geçmişten belirlenmesi; T12 evrak seçimi zorunluluğu |
| Evrak statü geçişleri | D1–D10; D8 yalnızca isteğe bağlı; D9 yalnızca personel + `UNDER_REVIEW` |
| Dosya statüleri | Geçerli/geçersiz geçişler; `ACTIVE` olmayan dosyanın görüntülenememesi |
| Yetki | `can(role, permission)` tüm matris |
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
| Personel auth | Username girişi; yanlış şifre; pasif kullanıcı; kapalı uç noktalar (`sign-up/email`, `sign-in/email`, `change-password`, `update-user`, `request-password-reset`, `reset-password`, `is-username-available`, `admin/*` HTTP) → reddedilir; `auth.api` ile ADMIN işlemleri çalışır |
| Oturum parametreleri | Personel oturumu 7 gün sonra geçersiz ve aktivite ile **uzamaz**; ADMIN şifre atadığında kullanıcının tüm oturumları iptal; pasifleştirmede iptal |
| IP/UA saklamama | Giriş sonrası `sessions.ip_address` ve `user_agent` NULL; CHECK kısıtının dolu değeri reddettiği; `audit_logs`'ta IP kolonu olmadığı; rate limit anahtarlarının HMAC'li ve süreli olduğu |
| Giriş sınırlaması | IP ve kullanıcı adı eşikleri; pencere sonunda sıfırlanma; blok sırasında doğru şifrenin de genel mesajla reddi |
| Rol yetkilendirme | Her ADMIN-only action'ı EMPLOYEE ile çağır → `FORBIDDEN` |
| Bağlantı | Tek aktif token (eşzamanlı iki yenileme → tek aktif satır); yenileme/iptal → eski token reddi + portal cookie'nin bir sonraki istekte reddi; iptal sonrası "yeni oluştur"; süre/statü ile otomatik iptal **olmadığı** (COMPLETED/CANCELLED başvuruda bağlantı çalışır, panel salt okunur) |
| Bağlantı GET | `/b/[token]` hiçbir tabloyu değiştirmez (satır sayıları/updated_at aynı), audit yazmaz |
| Upload | Token kuralları (BR-44 rol × statü); pathname sunucuda; callback + confirm idempotency; tek devam eden yükleme; `ACTIVE` tekliği (paralel aktivasyon); `STATE_CHANGED` yarışı |
| Versiyonlama | Değiştirme → yeni `ACTIVE` (v+1), eski `SUPERSEDED`; reddedilen yeni dosya eski aktif dosyayı etkilemez |
| İnceleme | D4/D5/D6; BR-56; BR-57 — eski `fileId` ile karar → `CONFLICT`; personel `UNDER_REVIEW` yüklemesi sonrası evrak `PENDING_REVIEW`, eski onay aktarılmaz; BR-59/BR-60 guard'ları |
| ADMIN geçişleri | T8 iptal öncesi statüye döner; T9–T11 evrak/onay/geçmiş korunur; T12 yalnızca seçilen evrakları `REVISION_REQUIRED` yapar ve review kaydı oluşturur |
| Silme | İki aşama; aşama 1 sonrası tüm okumalar 404 ve portal cookie reddi; storage silme hatası enjekte edilince DB kayıtları kalır, yeniden deneme tamamlar; sonunda tüm alt tablolar boş, storage öneki boş, yalnızca minimum audit kayıtları |
| Audit | Her mutasyon bir kayıt; metadata'da yasak alan yok (PII, token, IP); `UPDATE/DELETE audit_logs` hata |
| Cache izolasyonu | İki farklı portal cookie'siyle ardışık `/portal` → her biri yalnızca kendi verisi; `Cache-Control: no-store` |
| Teknik temizlik | Süresi dolan `UPLOAD_PENDING` → `EXPIRED` + blob silinir; orphan blob silinir; `ACTIVE`/`SUPERSEDED`/`REMOVED` dosyalara **dokunulmaz** |

## 4. Yetkilendirme Negatif Test Matrisi

[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md)'deki her ❌ ve 🔶 hücresi için ≥1 test (`it.each` tablo güdümlü). Yeni action eklemek, matris testine satır eklemeyi gerektirir (Definition of Done).

## 5. E2E Testler (Playwright)

### 5.1 Zorunlu ana senaryo
1. Admin giriş yapar.
2. Admin hizmet oluşturur.
3. Admin hizmete evrak gereksinimleri ekler (2 zorunlu, 1 isteğe bağlı).
4. Admin çalışan hesabı oluşturur (kullanıcı adı + şifre).
5. Çalışan giriş yapar (zorunlu şifre değişimi **yok**).
6. Çalışan yeni başvuru oluşturur.
7. Sonuç ekranı: bağlantı, Kopyala, WhatsApp ile Paylaş (onay penceresinde ad + telefon; `wa.me` URL'si ve encode edilmiş mesaj doğrulanır — WhatsApp açılmaz).
8. Müşteri (mobil viewport, ayrı context) bağlantıyı açar → **doğrudan** `/portal` (ek adım yok); adres çubuğunda token yok.
9. Müşteri PDF'leri yükler (ilerleme görünür, "Kontrol ediliyor" → "Yüklendi").
10. Müşteri incelemeye gönderir.
11. Çalışan evrakları inceler.
12. Bir evrak için düzeltme ister (gerekçeli).
13. Müşteri açıklamayı görür.
14. Müşteri evrağı yeniden yükler (değiştir).
15. Müşteri tekrar gönderir.
16. Çalışan evrakları onaylar → "Evrakları onayla".
17. Başvuru "İşlemde".
18. Başvuru tamamlanır.
19. Müşteri güncel süreci salt okunur görür (bağlantı hâlâ geçerli).

### 5.2 Ek akışlar
- E1: Çalışan `UNDER_REVIEW` sırasında müşteri adına evrağı değiştirir → evrak yeniden "İnceleme Bekliyor"; eski onay geçmişte.
- E2: ADMIN `COMPLETED` başvuruyu gerekçeyle yeniden açar (T9) → T12 ile bir evrak için düzeltme ister → müşteri yeniden yükler.
- E3: ADMIN iptal edilmiş başvuruyu yeniden açar (T8) → iptal öncesi statü.
- E4: Çalışan bağlantıyı yeniler → eski bağlantıyla açık müşteri sekmesi bir sonraki işlemde "bağlantı geçersiz"e düşer; yeni bağlantı çalışır.
- E5: ADMIN başvuruyu siler (numara yazarak onay) → listede yok; bağlantı ve dosya URL'leri geçersiz.
- E6: ADMIN çalışana yeni şifre atar → çalışanın açık oturumu sonlanır.

### 5.3 Güvenlik senaryoları
| # | Senaryo | Beklenen |
|---|---|---|
| S01 | Müşteri A'nın cookie'siyle B'nin dosya ID'si | 404 |
| S02 | Müşteri A, B'nin başvurusunu URL/payload manipülasyonuyla görmeye çalışır | Yalnızca A'nın verisi |
| S03 | Geçersiz / iptal edilmiş token | `/link-invalid`, veri yok, token mesajda yok |
| S04 | Yenilenmiş/iptal edilmiş bağlantının açık oturumu | Bir sonraki istekte reddedilir |
| S05 | EMPLOYEE admin sayfası / admin action (hizmet, çalışan, audit, silme, T8–T12) | Erişim yok / `FORBIDDEN` |
| S06 | Pasifleştirilen çalışanın açık oturumu | Bir sonraki istekte login'e |
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
| S18 | Kapalı Better Auth uç noktalarına doğrudan istek (EMPLOYEE oturumuyla `change-password`, `update-user`; anonim `sign-up/email`, `request-password-reset`) | Reddedilir |
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
| `transactions-and-deletion.test.ts` | Drizzle transaction rollback/commit (pooler üzerinden), başvuru silmede CASCADE + audit'in kalması, RESTRICT, pasifleştirme, Drizzle şeması ↔ veritabanı kolon/nullability drift kontrolü, seed idempotency (mevcut demo kayıtlara dokunmadan), Türkçe arama (pg_trgm + `lower()` sınırlaması) |

Unit (veritabanısız): bağlantı adresi doğrulama ve hata mesajı sızıntısı, `parseDatabaseEnv`, migration SQL statik kontrolleri (yıkıcı ifade/secret yok, partial index'ler, her tabloya GRANT, journal eşleşmesi), Drizzle şemasının 17 tablo olması, seed verisi.

Test verileri sentetiktir (`example.invalid`, `+905550000001`, rastgele hex token hash'leri); gerçek müşteri bağlantısı değildir.
