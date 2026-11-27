# Harici Doğrulama Planları (PHASE 12)

> Bu belgedeki doğrulamalar kullanıcı onayı veya kullanıcı erişimi gerektirir. PHASE 12'de **yalnızca Checkpoint A (salt okunur)** gerçekleştirildi.

## 1. Gerçek Backblaze B2 doğrulaması

### 1.1 Belgelenmiş garanti / deneysel sonuç / uygulama varsayımı

| Konu | Resmî belge (2026-11-27) | Deneysel (izole / sahte S3) | Uygulama varsayımı |
|---|---|---|---|
| Bucket versiyonlama | "buckets … are always versioned by default"; ada göre silmede "older versions … continue to exist" | — | Versiyona özgü silme kalıcıdır |
| GetObject Range + VersionId | S3 uyumluluk sayfasında desteklenmeyenler arasında **yok**; açık destek metni bulunamadı | Sahte S3: Range/versionId iletimi, 206, 200 reddi | B2 206 + `Content-Range` + `x-amz-version-id` döner (**doğrulanmadı**) |
| ListObjectVersions sayfalama | Bulunamadı | Yerel adapter + sahte | `IsTruncated`/marker ile tam liste |
| DeleteObject + versionId | Bulunamadı (S3 sayfası) | — | Yalnızca o versiyonu kalıcı siler (PHASE 08 smoke'ta 1 versiyon PASS) |
| Okuma/listeleme tutarlılığı | **Bulunamadı** (tutarlılık sayfası 404) | — | D-123: tek boş LIST kanıt sayılmaz |
| Cap aşımı davranışı | Cap = günlük harcama sınırı; %75/%100 uyarı; 00:00 GMT sıfırlama; isteklerin nasıl reddedildiği **belgelenmemiş** | — | 403 cap / 429 → LIMIT (yeniden deneme yok) |
| Object Lock / replikasyon | — | Mevcut anahtar Object Lock okuyamıyor (403); S3 replikasyon 501 | Kapalı varsayılır (panelden kullanıcı doğrular) |

Sonlu sayıda başarılı test, sağlayıcının gelecekteki tüm davranışlarını kanıtlamaz.

### 1.2 Checkpoint A — salt okunur (YAPILDI, 2026-11-27)

`pnpm storage:inspect` (yazma/silme/indirme yok):

- **Bucket:** `cs-global-documents`, `eu-central-003` erişilebilir.
- **Versiyonlama:** `Enabled`.
- **Varsayılan şifreleme:** AES256 (SSE-B2).
- **CORS:** yapılandırması yok.
- **Lifecycle:** kuralı yok (tüm versiyonlar saklanır).
- **Nesne sayısı:** 0 versiyon / 0 silme işareti.
- **Anonim listeleme:** 403, anonim nesne isteği 401.
- **Anahtar:** bucket'a kısıtlı, önek yok, süresiz. Gerekli yetkiler tam; **fazla yetkiler: 7** (SEC-01).

### 1.3 Checkpoint B — canlı mutasyon için onay talebi (BEKLİYOR)

Aşağıdaki plan **kullanıcının açık onayı olmadan çalıştırılmaz.**

| Başlık | Öneri |
|---|---|
| Hedef | **Tercih:** kullanıcının oluşturacağı ayrı test bucket'ı (`cs-global-verify-<tarih>`, private, aynı bölge) + yalnızca o bucket'a kısıtlı geçici anahtar (5 yetki). **Alternatif:** mevcut bucket'ta `_verification/` ve tek seferlik `applications/<test-uuid>/…` önekleri. Mevcut anahtar bucket genelidir: önek sınırı **yalnızca uygulama kodundadır**, sağlayıcı düzeyinde değildir. |
| İşlemler | PutObject, GetObject (tam + aralık), HeadObject, ListObjectVersions, DeleteObject(versionId), ada göre DeleteObject (silme işareti) |
| Nesne / versiyon | En fazla 12 anahtar, en fazla 20 fiziksel versiyon (1 anahtarda 3 versiyon; sayfalama için `MaxKeys=2` ile küçük sayfalar — 1000+ nesne oluşturulmaz) |
| Azami depolama | 60 MB (en büyük tek PDF 10 MiB, sentetik) |
| Azami egress | 80 MB |
| Azami istek | 300 (Class A/B/C) |
| Tahmini maliyet | 0 USD (ilk 10 GB ücretsiz; egress 3× kuralı/hesap cap'i 1 GB/gün içinde; işlemler ücretsiz) — mevcut günlük kullanım panelden kontrol edilmeden kesinleşmez |
| Veritabanı | Yalnızca izole Docker PostgreSQL (gerçek Neon'a kayıt yazılmaz) |
| Koşu manifesti | Her çalıştırma benzersiz `run-id`; oluşturulan her (anahtar, versionId) yerel manifestte; silme yalnızca manifestteki tam (anahtar, versionId) çiftleri — joker/önek/toplu silme yok |
| Temizlik | Manifestteki tüm versiyonlar versiyona özgü silinir; sonra tam liste ile yokluk doğrulanır; kalan nesne raporlanır |
| Hata kurtarma | Yarıda kalırsa manifest korunur; aynı manifestle temizlik yeniden çalıştırılır; manifest dışında hiçbir nesneye dokunulmaz |
| Gerçek dosyaların korunması | Mevcut bucket'ta gerçek nesne yok (0, Checkpoint A); yine de silme yalnız manifestten |

**Test matrisi (onay sonrası):**
1. **Yükleme ve okuma**
   - B2-01: sentetik yükleme ve bütünlük (MD5/ETag + SHA-256).
   - B2-02: kayıtlı versiyonla GET.
   - B2-03: kapalı/açık/sonek Range.
   - B2-04: `Content-Range`/`Content-Length`.
   - B2-05: tam ve kısmi aktarım bayt karşılaştırması.
   - B2-06: HEAD.
   - B2-07: istemci iptali ve gözlenen aktarım.
2. **Versiyonlar ve listeleme**
   - B2-08: aynı anahtarda 3 versiyon.
   - B2-09: silme işareti semantiği.
   - B2-10: tam versiyon listesi.
   - B2-11: sayfalama (`MaxKeys=2`).
3. **Silme**
   - B2-12: versiyona özgü silme.
   - B2-13: diğer test nesnesinin korunması.
   - B2-14: kısmi silme ve sürdürme.
4. **Uygulama tutarlılığı ve temizlik**
   - B2-15: uygulama iş akışıyla storage/DB tutarlılığı (izole DB).
   - B2-16: son yokluk doğrulaması.
   - B2-17: çok sayfalı mutabakat.
   - B2-18: temizlik.

**Kapsam dışı:** Object Lock, replikasyon ve cap tüketme senaryoları hesap ayarı değiştirilerek veya limit bilerek aşılarak oluşturulmaz.

### 1.4 Kullanıcı panel kontrol listesi (Backblaze)

Kart bilgisi veya kimlik bilgisi asistanla paylaşılmaz; tüm adımlar kullanıcıdadır.

1. **Fatura (Billing):**
   - Ödeme yöntemi durumu.
   - Fatura dönemi ve vergi (hesap ülkesine göre).
   - Güncel ay kullanımı: depolama GB-ay, egress GB.
2. **B2 Cloud Storage → Caps & Alerts:**
   - Depolama, Class B (indirme/okuma) ve Class C için günlük dolar cap'leri.
   - Uyarı e-postaları (%75/%100).
   - Değişiklikler 10 dakikaya kadar sürer.
   - **Not:** e-posta uyarısı bir harcama sınırı değildir; sınır cap'tir.
3. **Bucket ayarları:** Object Lock ve replikasyon durumu (salt okunur bakış).
4. **Uygulama anahtarları:** SEC-01 için yeni, en az yetkili anahtar (OPERATIONS_RUNBOOK §3.1).
5. **Bütçe kontrolü:** 100 GB ortalama depolamada ~7,51 USD/yıl (vergi hariç) + fazla egress $0,01/GB. Yıllık 10 USD hedeftir, garanti değildir.

### 1.5 100 GB etkinleştirme kapısı (D-140)

Sıra şöyledir; tamamlanmazsa aktif değer **9 GB / 8 GB** kalır.

1. Kullanıcı hesabı hazırlar.
2. Ödeme ve fatura durumu kullanıcı tarafından doğrulanır.
3. Cap'ler 100 GB'ı destekler.
4. Harcama kontrolü belirlenir.
5. Kullanıcı aktif değişikliği onaylar.
6. Env değeri `STORAGE_MAX_TOTAL_BYTES=100000000000` ve `STORAGE_WARNING_BYTES=90000000000` yapılır.
7. Uygulama yeniden başlatılır; panel kartında `/ 100 GB` görülür; `pnpm storage:inspect` temiz olur.

**Durum:** TARGET READY = EVET (kod + izole testler). ACTIVE CAPACITY VERIFIED = HAYIR.

## 2. Gerçek cihaz ve WhatsApp in-app tarayıcı kontrol listesi

Emülasyon sonucu gerçek cihaz PASS'i sayılmaz. Public geliştirme tüneli açılmaz. Test, sentetik başvuruyla ve kullanıcının erişebildiği izole ya da staging ortamında yapılır; bu ortam PHASE 13 hosting kararından sonra hazırlanacak.

| # | Adım | iPhone Safari | Android Chrome | WhatsApp iOS | WhatsApp Android | Desktop Safari |
|---|---|---|---|---|---|---|
| 1 | Personel bağlantıyı WhatsApp ile gönderir; önizleme kartında kişisel veri görünmez | — | — | ☐ | ☐ | — |
| 2 | Bağlantı açılır → panel; adres çubuğunda token yok | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | Yenile / geri / ileri; uygulama değiştirip dönme (oturum korunur) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | PDF seçici (Dosyalar/Drive), 10 MiB yükleme, ilerleme ve aşamalar | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | Yavaş/kesik ağda yükleme → anlaşılır hata, yeniden deneme, eski dosya korunur | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | Değiştirme; görüntüleyici sayfa/yakınlaştırma/sayfaya git/indir; yön değişimi; klavye | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | Düzeltme mesajı, gönder/yeniden gönder | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | Personel bağlantıyı yeniler → eski sekme reddedilir; süre dolumu | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | Başka müşteri bağlantısı açılınca eski bağlam reddedilir | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | Kalıcı silme sonrası bağlantı → "kullanılamıyor" | ☐ | ☐ | ☐ | ☐ | ☐ |
| 11 | Ekran okuyucu (VoiceOver/TalkBack) ile yükleme ve görüntüleyici | ☐ | ☐ | ☐ | ☐ | ☐ |

**Bağımsız WebKit doğrulaması:** kurumsal ağ uzantıları olmayan bir makinede tam izole E2E çalıştırılması (D-131 koşulu). **Yapılmadı.**
