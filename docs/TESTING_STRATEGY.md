# Test Stratejisi

> Araçlar: **Vitest 5.x** (unit + integration), **Playwright 1.65.x** (E2E, desktop + mobil emülasyon). PHASE 00'da test implement edilmemiştir.
> Güvenlik ve test her fazın parçasıdır; PHASE 12 yalnızca tam regresyon + denetim fazıdır.

## 1. Test Piramidi ve Ortamlar

| Seviye | Kapsam | Ortam | Çalışma |
|---|---|---|---|
| Unit | Saf domain fonksiyonları, Zod şemaları, kripto yardımcıları, formatlama | Node, I/O yok | Her commit (yerel + CI) |
| Integration | Servisler + gerçek Postgres (transaction, kısıt, kilit, yetki) | Neon non-prod projesinde **test branch'i** (her CI çalışmasında oluşturulup silinir — PHASE 02'de karar) veya yerel Docker Postgres (geliştirici tercihi) | Her PR |
| E2E | Tarayıcıdan uçtan uca akış | Preview deployment veya yerel `next start` + test DB + Blob dev store | Her PR (kritik senaryolar), gece (tam set) |
| Manuel | Gerçek cihaz (iOS Safari, Android Chrome, WhatsApp in-app), ekran okuyucu | Preview | PHASE 07, 08, 11, 12 |

Test verisi: **yalnızca sahte** (ör. "Test Müşteri", `+905550000001`, `test+1@example.com`). Fixture PDF'leri `tests/fixtures/` altında üretilmiş sahte belgelerdir.

## 2. Unit Testler

| Alan | Örnek vakalar |
|---|---|
| Validation şemaları | Zorunlu alanlar, uzunluk sınırları, `.strict()` fazla alan reddi, Türkçe hata mesajları |
| Statü geçiş kuralları | Matristeki **her** hücre (izinli/izinsiz × rol); terminal statülerden çıkış reddi; guard'lar (BR-50, BR-59, BR-60) |
| Evrak statü geçişleri | D1–D8; zorunlu/isteğe bağlı farkı (D8) |
| Token üretimi | 32 bayt, base64url, 43 kr., benzersizlik (10k üretim çakışmasız), HMAC deterministik, AES-GCM round-trip, yanlış AAD/anahtar ile çözme hatası |
| Token süre sonu | `expires_at`, terminal + N gün, iptal |
| OTP | 6 hane, süre, deneme sayısı, timing-safe karşılaştırma |
| Tamamlanma hesapları | BR-110…BR-114: isteğe bağlılar paydada değil; PENDING/REJECTED/ERROR/REVISION_REQUIRED sayılmaz; yuvarlama; zorunlu evrak yok durumu |
| İzin kontrolleri | `can(role, permission)` tüm matris; `applicationScopeFilter` her iki kapsam |
| Dosya adı sanitizasyonu | Türkçe karakter, emoji, kontrol karakteri, path traversal (`../`), çok uzun ad, uzantısız |
| Dosya doğrulama | `%PDF-` imzası, aktif içerik tespiti (düz/hex-escape/object stream), şifreli PDF |
| Normalizasyon | Telefon (çeşitli TR formatları → E.164, geçersizler), e-posta, Türkçe arama katlaması (`İ/ı/I/i`) |
| Başvuru numarası formatı | Yıl (Europe/Istanbul sınırı: 31.12 23:30 TRT), dolgu, 7 haneye taşma |
| Tarih formatlama | UTC → Europe/Istanbul |
| Log redaksiyonu | Token/şifre/OTP içeren nesnelerin maskelenmesi |

## 3. Integration Testler

| Alan | Vakalar |
|---|---|
| DB transaction | Başvuru oluşturmanın ortasında hata → hiçbir satır kalmaz, sayaç geri alınır |
| Müşteri oluşturma | Yeni / mevcut müşteriye bağlama; eşleşme adayları; otomatik birleştirme yok |
| Başvuru oluşturma | Numara üretimi; **eşzamanlı 20 oluşturmada** benzersiz ve boşluksuz numaralar; idempotency key tekrarında tek kayıt |
| Snapshot | Şablon sonradan değişti/eklendi/pasifleşti → eski başvuru değişmedi; pasif şablon kopyalanmadı; pasif hizmetle oluşturma reddedildi |
| Kimlik doğrulama | Username girişi; yanlış şifre; pasif kullanıcı; public sign-up uç noktası kapalı; e-posta ile giriş kapalı |
| Rol yetkilendirme | Her admin-only action'ı EMPLOYEE ile çağır → `FORBIDDEN`; kapsam dışı başvuru → `NOT_FOUND` |
| Upload metadata | Token üretimi kuralları (BR-44), sayı limiti, pathname'in sunucuda belirlenmesi, callback + confirm idempotency |
| Versiyonlama | Değiştirme → yeni versiyon + eski `removed_at`; incelenmiş dosya geçmişte kalır; incelenmemiş dosya blob'u silinir |
| İnceleme akışı | D4/D5/D6, BR-56 (gerekçe zorunlu), BR-59/BR-60 guard'ları |
| Bağlantı iptali | İptal/yenileme → mevcut müşteri oturumları geçersiz; eski token reddedilir |
| Audit | Her mutasyon bir audit kaydı; metadata'da yasak alan yok; `UPDATE/DELETE audit_logs` uygulama rolüyle hata |
| Eşzamanlılık | Aynı anda iki gönderim → biri başarılı, diğeri `CONFLICT`/`GUARD_FAILED`; inceleme sırasında upload tamamlama → reddedilir; iki personelin aynı evrağa eşzamanlı kararı → biri `CONFLICT` |
| Rate limit | Eşik aşımında `RATE_LIMITED`; pencere sonunda sıfırlanma |
| Cache izolasyonu | İki farklı müşteri oturumuyla ardışık `/portal` isteği → her biri yalnızca kendi verisi; yanıt `Cache-Control: no-store` |

## 4. Yetkilendirme Negatif Test Matrisi

[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) içindeki her ❌ ve 🔶 hücresi için en az bir test. Testler tablo-güdümlü (`it.each`) yazılır: `(actor, action, resource) → beklenen sonuç`. Yeni bir action eklendiğinde matris testine eklenmesi **Definition of Done** şartıdır.

## 5. E2E Testler (Playwright)

### 5.1 Zorunlu ana senaryo (tek uzun test, adım adım)
1. Admin giriş yapar.
2. Admin hizmet oluşturur.
3. Admin hizmete evrak gereksinimleri ekler (2 zorunlu, 1 isteğe bağlı, biri çoklu dosyalı).
4. Admin çalışan hesabı oluşturur (geçici şifre).
5. Çalışan giriş yapar, şifresini değiştirir.
6. Çalışan yeni müşteri başvurusu oluşturur.
7. Müşteri bağlantısı oluşur (sonuç ekranı, kopyala, WhatsApp linki biçimi).
8. Müşteri (mobil viewport, ayrı browser context) bağlantıyı açar, OTP'yi doğrular (test e-posta sağlayıcısı / test modunda yakalanan kod — PHASE 07'de mekanizma).
9. Müşteri PDF'leri yükler (ilerleme görünür; "Kontrol ediliyor" → "Yüklendi").
10. Müşteri incelemeye gönderir.
11. Çalışan evrakları inceler.
12. Bir evrak için düzeltme ister (gerekçeli).
13. Müşteri açıklamayı görür.
14. Müşteri evrağı yeniden yükler.
15. Müşteri tekrar gönderir.
16. Çalışan evrakları onaylar → "Evrakları onayla".
17. Başvuru "İşlemde" olur.
18. Başvuru tamamlanır.
19. Müşteri güncel süreci (salt okunur) görür.

### 5.2 Güvenlik senaryoları
| # | Senaryo | Beklenen |
|---|---|---|
| S01 | Müşteri A'nın oturumuyla müşteri B'nin dosya ID'si | 404 |
| S02 | Müşteri A, B'nin başvurusunu URL/payload manipülasyonuyla görmeye çalışır | Yalnızca A'nın verisi |
| S03 | Geçersiz, iptal edilmiş, süresi dolmuş token | Genel hata sayfası, veri yok |
| S04 | Yenilenmiş bağlantının eski oturumu | Oturum geçersiz → yeniden doğrulama |
| S05 | Çalışan admin sayfasına gider / admin action'ı çağırır | Erişim yok / `FORBIDDEN` |
| S06 | Pasifleştirilen çalışanın açık oturumu | Bir sonraki istekte login'e yönlenir |
| S07 | PDF olmayan dosya (uzantı .pdf) | Reddedilir, Türkçe mesaj |
| S08 | Sahte MIME type | Reddedilir |
| S09 | Limit üstü dosya | Reddedilir |
| S10 | Tarama bekleyen dosyayı görüntüleme | 404 |
| S11 | Onaylanmış evrağı değiştirme (UI + doğrudan action) | Reddedilir |
| S12 | İnceleme sırasında eş zamanlı dosya değiştirme | Reddedilir, blob silinir |
| S13 | Aynı başvurunun iki kez gönderilmesi (çift tık + paralel istek) | Tek geçiş |
| S14 | Hizmet şablonu değiştikten sonra eski başvuru | Evrak listesi değişmemiş |
| S15 | Hassas verinin cache üzerinden sızmaması | Ardışık farklı oturumlar; header kontrolü |
| S16 | Şirket içi notların müşteri paneline sızmaması | Bilinen not metni (benzersiz işaretçi string) müşteri HTML'inde ve RSC (`text/x-component`) yanıtlarında **yok** |
| S17 | Origin'siz / yabancı Origin'li Server Action POST | Reddedilir |
| S18 | OTP brute-force | 5 denemede kilit |
| S19 | XSS payload'lı müşteri adı ve dosya adı | Escape edilmiş, script çalışmaz |
| S20 | Güvenlik header'ları | CSP, HSTS, nosniff, Referrer-Policy, X-Robots-Tag mevcut |

### 5.3 Mobil E2E (zorunlu)
Playwright projeleri: `Mobile Safari (iPhone 13/14 profili)`, `Mobile Chrome (Pixel 7 profili)`, `Desktop Chrome`, `Desktop Safari (WebKit)`.
Müşteri paneli testleri her mobil projede çalışır: bağlantı → doğrulama → yükleme → gönderim → düzeltme akışı.

## 6. Responsive ve Erişilebilirlik Testleri

- Genişlikler: **320, 360, 375, 390, 414, 430, 768, 1024, 1440** px — müşteri panelinin her ana ekranı için:
  - Yatay overflow yok (`scrollWidth <= clientWidth`).
  - Dokunma hedefleri ≥ 44×44 (bounding box kontrolü, birincil aksiyonlar).
  - Süreç göstergesi taşmıyor; uzun dosya adı layout'u bozmuyor (200 karakterlik fixture).
  - Görsel regresyon ekran görüntüleri (Playwright `toHaveScreenshot`, PHASE 11).
- Otomatik a11y: axe taraması (kritik/ciddi ihlal = test başarısız).
- Manuel: VoiceOver (iOS Safari), TalkBack (Android Chrome), yalnızca klavye ile tam akış.
- **WhatsApp in-app tarayıcısı** ve **iOS Safari / Android Chrome** gerçek cihaz testi: bağlantı açma, OTP (uygulama değiştirip dönme), dosya seçici, yükleme, PDF görüntüleme. Sonuçlar PROJECT_STATE'e yazılır (otomatikleştirilemez).

## 7. Diğer

- **Performans:** dashboard ve liste sorguları için `EXPLAIN ANALYZE` (seed: 10k başvuru) — index kullanımı doğrulanır; Lighthouse mobil (müşteri paneli) — hedef Performans ≥ 90, Erişilebilirlik ≥ 95 (PHASE 11).
- **Bağımlılık:** `pnpm audit --prod` (yüksek/kritik = blok).
- **Bundle:** client chunk'larında secret adları/`server-only` modüllerinin bulunmadığı kontrolü (PHASE 01'de script).
- **Statik analiz:** `tsc --noEmit` (strict), ESLint (sıfır hata), Prettier check.

## 8. CI Kapıları (PHASE 01'de kurulur, fazlar ilerledikçe genişler)

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck` · `pnpm lint` · `pnpm format:check`
3. `pnpm test:unit`
4. `pnpm test:integration` (PHASE 02+)
5. `pnpm build`
6. `pnpm test:e2e` (PHASE 04+; kritik set)
7. `pnpm audit`

CI platformu: GitHub Actions (Proposed; ücretsiz dakika limitleri PHASE 01'de kontrol edilir).

## 9. Kabul Kriterleri (genel)

- Bir özellik; unit + (uygunsa) integration + (kullanıcı akışıysa) E2E testleriyle birlikte tamamlanmış sayılır.
- Yetkilendirme matrisi testleri %100 hücre kapsamı.
- State machine geçiş matrisi %100 hücre kapsamı.
- Domain modülleri için satır kapsamı ≥ %90 (genel kapsam hedefi yok — anlamlı testler esas).
- Test edilmemiş iş **tamamlandı olarak raporlanmaz**.
