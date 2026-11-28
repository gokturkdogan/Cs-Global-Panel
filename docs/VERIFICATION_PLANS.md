# Harici Doğrulama Planları (PHASE 12)

> Bu belgedeki doğrulamalar kullanıcı onayı veya kullanıcı erişimi gerektirir. PHASE 12 ve 12.1'de **yalnızca Checkpoint A (salt okunur)** gerçekleştirildi (son: 2026-11-27, PHASE 12.1 — durum değişmedi: 0 nesne, versiyonlama açık, SSE-B2, CORS/lifecycle yok; anahtarda 7 riskli + 6 gereksiz okuma yetkisi).

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

**Checkpoint A — yeni en az yetkili runtime anahtarı (2026-11-27, salt okunur, `storage:inspect` v4):** yetkiler tam olarak `deleteFiles, listFiles, readFiles, writeFiles`; tek bucket `cs-global-documents`; önek yok; süresiz; S3 uç noktası eşleşiyor; riskli/beklenmeyen yetki yok; nesne listesi (listFiles) başarılı — 0 versiyon / 0 silme işareti; anonim liste 403. Bucket yapılandırma okumaları (HeadBucket, versiyonlama, şifreleme, CORS, lifecycle) yetki olmadığı için **beklenen 403** (önceki anahtarla 2026-11-27'de: versiyonlama Enabled, SSE-B2, CORS/lifecycle yok). Gerçek dosya işlemleri (PUT/GET/DELETE) bu anahtarla henüz doğrulanmadı — OPERATIONS_RUNBOOK §3.1 adım E (ayrı onay). Eski anahtar iptal edilmedi.

**Runtime anahtar doğrulaması — OPERATIONS_RUNBOOK §3.1 adım E (2026-11-28, kullanıcı onayıyla, `pnpm storage:verify`, tek çalıştırma):** mevcut bucket'ta tek sentetik nesne (`_verification/<rastgele>.pdf`, 400 bayt). PutObject (SSE-B2 + `x-amz-version-id`) PASS; HEAD (VersionId'li, boyut) PASS; GET (VersionId'li, SHA-256) PASS — adapter yanıtın aynı `VersionId`'yi döndürmesini zorunlu tuttuğundan (D-147) gerçek B2'nin tam GET yanıtında başlığı döndürdüğü de doğrulandı (aralıklı GET Checkpoint B'de); imzasız erişim path-style ve virtual-host HTTP 401 (friendly URL: bağlantı kurulamadı — kesin ret kanıtı değil); versiyona özgü silme (1 versiyon) + tam yokluk PASS. Başlangıç envanteri 0 nesne; kalan test nesnesi 0. İstek: 7 imzalı B2 isteği + 3 imzasız deneme (2'si sağlayıcıya ulaştı). Aktarım: 400 bayt yükleme + 400 bayt indirme (+ küçük liste/HEAD yanıtları). Neon'a erişim yok. Eski anahtar iptali için hazır (kullanıcı işlemi).

### 1.3 Checkpoint B — canlı mutasyon için TEK onay talebi (BEKLİYOR — PHASE 12.1 güncel)

Aşağıdaki plan **kullanıcının açık onayı olmadan çalıştırılmaz.** D-143 onayı canlı mutasyon yetkisi değildir. Önkoşul (önerilen): §3.1'e göre oluşturulmuş en az yetkili yeni anahtar.

| Başlık | Öneri |
|---|---|
| Hedef | **Tercih:** kullanıcının oluşturacağı ayrı test bucket'ı (`cs-global-verify-<tarih>`, private, aynı bölge) + yalnızca o bucket'a kısıtlı geçici anahtar (`listFiles, readFiles, writeFiles, deleteFiles`). **Alternatif:** mevcut bucket'ta `_verification/<run-id>/` ve tek seferlik `applications/<test-uuid>/…` önekleri. Bucket geneli anahtarda önek sınırı **yalnızca uygulama kodundadır**, sağlayıcı düzeyinde yalıtım değildir. |
| İşlemler | PutObject, GetObject (tam + kapalı/açık/sonek aralık, VersionId'li), HeadObject, ListObjectVersions (`MaxKeys=2` sayfalama), DeleteObject(versionId), ada göre DeleteObject (silme işareti), istemci iptali |
| Nesne / versiyon | En fazla 12 anahtar, 20 fiziksel versiyon (1 anahtarda 3 versiyon; 1000+ nesne oluşturulmaz) |
| Azami depolama | 100 MB (tek PDF ≤ 10 MiB, sentetik) — anlık; test sonunda 0 |
| Azami egress | 100 MB |
| Azami istek | 500 (Class A/B/C toplam) |
| Tahmini maliyet | ~0 USD (ilk 10 GB depolama ücretsiz; Class A/B/C ücretsiz; egress ortalama depolamanın 3 katına kadar ücretsiz — 0 nesneli hesapta bu pay küçük olabilir, en kötü durum 100 MB × 0,01 USD/GB ≈ 0,001 USD). **Kullanıcı panelinde güncel kullanım ve cap'ler görülmeden kesinleşmez.** Limitler otomatik harcama yetkisi değildir. |
| Veritabanı | Yalnızca izole Docker PostgreSQL (gerçek Neon'a kayıt yazılmaz) |
| Sahiplik manifesti | Her çalıştırma benzersiz `run-id`; oluşturulan her (anahtar, versionId) yerel manifestte (secret yok); silme yalnızca manifestteki tam çiftler — joker/önek/toplu silme, global purge yok |
| Durdurma koşulları | Beklenmeyen yetki/403, cap/429, manifest dışı nesne görülmesi, VersionId uyuşmazlığı, ilk hata sonrası otomatik yeniden deneme YOK; sayaç (istek/bayt) sınıra ulaşınca dur |
| Temizlik ve kurtarma | Manifestteki tüm versiyonlar versiyona özgü silinir → tam liste ile yokluk; yarıda kalırsa manifest korunur ve aynı manifestle sürdürülür; kalan nesne raporlanır |
| Kapsam dışı | Object Lock, replikasyon, cap tüketme; hesap ayarı değişikliği; gerçek müşteri dosyası |

**Ayrım (2026-11-27):** Checkpoint B yalnızca kullanıcının oluşturacağı AYRI test bucket'ında ve yalnızca o bucket'a kısıtlı, süreli (ör. 24 saat) geçici anahtarla yapılır; geçici anahtar çalıştırma anında gizli istemle alınır, `.env.local`'a yazılmaz. Yeni runtime anahtarının mevcut bucket'taki doğrulaması (OPERATIONS_RUNBOOK §3.1 adım E, `pnpm storage:verify`) ayrı bir onay kalemidir.

**İstek/bayt bütçesi (temizlik ve son doğrulama DAHİL, üst sınır):** yükleme + bütünlük ~12; HEAD ~6; aralık/tam GET ~20; iptal ~2; 3 versiyon + silme işareti ~4; sayfalı versiyon listeleri ~20; versiyona özgü silme + kısmi/sürdürme ~25; uygulama akışı (izole DB) ~40; son yokluk ve tam liste ~15; temizlik ~25 → **≈ 170 istek** (sınır 500). Depolama zirvesi ≈ 35 MB (3 × 10 MiB + küçük nesneler; sınır 100 MB). Egress ≈ 60 MB (tam okumalar + bütünlük okuması; sınır 100 MB). Fiziksel versiyon + silme işareti toplamı ≤ 20.

**PHASE 12.1 ek doğrulamaları (D-147):** B2-02'de yanıtın `x-amz-version-id` döndürdüğü (eksikse uygulama fail-closed teslim etmez — bu nedenle production öncesi ZORUNLU), mevcut olmayan anahtar/versiyon için hata kodu adı (`NoSuchKey`/`NoSuchVersion`), 206 + `Content-Range` + `Content-Length` biçimi, aralık yok sayıldığında 200 davranışı, belirsiz yazım gözlemi için HEAD + sınırlı SHA-256 okuması.

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

### 1.5 100 GB etkinleştirme kapısı (D-140) — OD-28 ile LANSMAN SONRASINA ERTELENDİ

İlk lansman ücretsiz planla 9 GB / 8 GB yapılır; ödeme yöntemi eklenmez, ücretli plan etkinleştirilmez, otomatik geçiş yoktur. Aşağıdaki kapı yalnızca lansman sonrası, ayrı kullanıcı onayıyla kapasite artışı için geçerlidir.

Sıra şöyledir; tamamlanmazsa aktif değer **9 GB / 8 GB** kalır.

1. Kullanıcı hesabı hazırlar.
2. Ödeme ve fatura durumu kullanıcı tarafından doğrulanır.
3. Cap'ler 100 GB'ı destekler.
4. Harcama kontrolü belirlenir.
5. Kullanıcı aktif değişikliği onaylar.
6. Env değeri `STORAGE_MAX_TOTAL_BYTES=100000000000` ve `STORAGE_WARNING_BYTES=90000000000` yapılır.
7. Uygulama yeniden başlatılır; panel kartında `/ 100 GB` görülür; `pnpm storage:inspect` temiz olur.

**Durum:** TARGET READY = EVET (kod + izole testler). ACTIVE CAPACITY VERIFIED = HAYIR — **lansman gereksinimi değil (OD-28)**. Lansman için gerekli olan: ücretsiz hesap limitlerinin ve cap'lerin 9 GB / 8 GB kullanımını karşıladığının panelde doğrulanması (§1.4).

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
