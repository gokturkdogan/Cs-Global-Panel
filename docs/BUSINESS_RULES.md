# İş Kuralları

> Bu doküman iş kurallarının **tek doğruluk kaynağıdır**. Kural kimlikleri (`BR-xx`) kodda yorum/test adı olarak referans verilebilir.
> Statü geçişleri: [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) · Sabitler: [ARCHITECTURE.md](ARCHITECTURE.md) §11.
> Ürün kararları OD-01…OD-23 Product Owner tarafından **2026-11-24** tarihinde kabul edilmiştir ([DECISION_LOG.md](DECISION_LOG.md)). Kabul edilmiş olmaları, güvenlik veya hukuki uygunluğun onaylandığı anlamına gelmez ([THREAT_MODEL.md](THREAT_MODEL.md), [DATA_PRIVACY.md](DATA_PRIVACY.md)).
> Kimlik numaraları revizyonda kasıtlı olarak korunmuştur; kaldırılan kurallar "(kaldırıldı)" olarak işaretlidir.

## 1. Başvuru ve Müşteri Bilgileri (OD-10)

- **BR-01** Merkezi müşteri profili **yoktur**. Müşteri bilgileri (ad, soyad, telefon, e-posta) doğrudan **başvuru kaydında** tutulur. Her başvuru tam olarak bir hizmete bağlıdır.
- **BR-02** Her başvurunun kendi müşteri bilgileri, numarası, erişim bağlantısı, evrak listesi, dosyaları, statüsü ve geçmişi vardır.
- **BR-03** Başvurular birbirinden tamamen bağımsızdır: bir başvurunun bağlantısı/oturumu başka hiçbir başvuruya erişim sağlamaz; bir başvurudaki müşteri bilgisi değişikliği diğerlerini etkilemez; aynı ad/telefon/e-posta birden çok başvuruda bulunabilir.
- **BR-04** Telefon ve e-posta üzerinde **unique constraint yoktur**. Müşteri eşleştirme, mükerrer tespiti, birleştirme, önceki başvurularla otomatik ilişkilendirme **yapılmaz**.
- BR-05, BR-06 — (kaldırıldı: müşteri eşleştirme ve birleştirme, OD-10)
- **BR-07** Telefon `libphonenumber-js` ile varsayılan bölge `TR` kabul edilerek **E.164**'e normalize edilir (`+905321234567`). Geçersiz numara reddedilir. Ham girdi saklanmaz.
- **BR-08** E-posta: `trim` + küçük harf. Sağlayıcıya özgü dönüşüm (Gmail nokta vb.) yapılmaz. E-posta zorunlu bir başvuru bilgisidir; sistem e-posta **göndermez** (OD-08).
- **BR-09** Ad/soyad: baştaki/sondaki boşluklar kırpılır, çoklu boşluk teke indirilir; büyük/küçük harf girildiği gibi saklanır. Arama için ayrı `search_text` alanı tutulur (§8).
- **BR-09a** Zorunlu alanlar: ad, soyad, telefon, e-posta, hizmet. Şirket içi not isteğe bağlıdır.

## 2. Başvuru Numarası

- **BR-10** Biçim: `CS-{YYYY}-{NNNNNN}` (6 hane, soldan sıfır dolgulu). Yıl **Europe/Istanbul** saat dilimine göre belirlenir.
- **BR-11** Numara yıllık sayaç tablosundan, başvuru oluşturma transaction'ı içinde atomik olarak alınır (D-008). Eşzamanlı oluşturmada çakışma olmaz; `application_number` unique'tir.
- **BR-12** Numara **erişim anahtarı değildir**, değiştirilemez, silinen başvurunun numarası yeniden kullanılmaz.
- **BR-13** 999 999 aşılırsa hane sayısı genişler (`CS-2026-1000000`).

## 3. Hizmetler ve Evrak Şablonları

- **BR-20** Hizmetler kodda tanımlanmaz; yalnızca ADMIN panelden yönetir.
- **BR-21** Pasif hizmet yeni başvuruda seçilemez (sunucuda da doğrulanır). Mevcut başvurular etkilenmez.
- **BR-22** Hizmetler fiziksel olarak silinmez; pasifleştirilir.
- **BR-23** Evrak şablonu alanları: başlık, açıklama, talimat, zorunlu mu, sıra, aktif mi. Dosya tipi, boyut ve sayı **şablon alanı değildir** — tüm sistemde sabittir (BR-40, OD-16).
- BR-24 — (kaldırıldı: dinamik boyut üst sınırı, OD-16)
- **BR-25** Pasif evrak şablonu yeni başvurulara kopyalanmaz; mevcut snapshot'ları etkilemez.

## 4. Snapshot (zorunlu)

- **BR-30** Başvuru oluşturulduğunda hizmetin **o anki aktif** evrak şablonları `application_document_requirements` tablosuna kopyalanır (başlık, açıklama, talimat, zorunluluk, sıra). Hizmet adı da `service_name_snapshot` olarak kopyalanır. Kaynak şablon ID'si yalnızca izlenebilirlik için saklanır (`source_requirement_id`, nullable).
- **BR-31** Şablonda sonradan yapılan değişiklikler mevcut başvuruları **etkilemez**.
- **BR-32** Hizmetin aktif evrak şablonu yoksa başvuru oluşturulamaz.
- **BR-33** Mevcut başvuruya sonradan özel evrak ekleme MVP'de yoktur; `source_requirement_id = NULL` olan satırlar ileride buna izin verir (ek alan/tablo oluşturulmaz).

## 5. Evrak Yükleme (OD-16, OD-17)

- **BR-40** Sabit kurallar (tüm hizmetler, tüm evraklar):
  - Yalnızca PDF (`application/pdf`, `.pdf`).
  - Dosya başına en fazla **10 MB = 10 × 1024 × 1024 = 10 485 760 bayt** (`MAX_PDF_SIZE_BYTES`). Arayüzde "10 MB" olarak gösterilir. Tüm katmanlar (client ön kontrolü, upload token, sunucu doğrulaması, testler) aynı sabiti kullanır.
  - Her evrak gereksinimi için **en fazla bir aktif PDF**.
  - Limitler yönetim panelinden değiştirilemez.
- **BR-41** Doğrulama katmanları: uzantı, MIME, `%PDF-` imzası, güvenli parser ile yapısal doğrulama, aktif içerik / gömülü dosya / şifreleme kontrolleri, boyut, storage anahtarı ve başvuru-evrak ilişkisi ([FILE_STORAGE.md](FILE_STORAGE.md) §6). Yapısal doğrulama antivirüs taraması **değildir**; dosyalar "virüssüz" olarak etiketlenmez (OD-07).
- **BR-42** Her yükleme yeni bir **değiştirilemez** dosya kaydıdır; yeniden yükleme önceki dosyanın üzerine yazmaz. Yeni dosya doğrulamayı geçtiğinde **aktif** olur, önceki aktif dosya `SUPERSEDED` olarak geçmişte kalır.
- **BR-43** Tek aktif PDF kuralı veritabanı kısıtıyla garanti edilir (evrak başına `status = 'ACTIVE'` en fazla bir satır). Ayrıca evrak başına aynı anda en fazla **bir devam eden yükleme** olabilir; yeni yükleme isteği, aynı evraktaki tamamlanmamış önceki yüklemeyi iptal eder.
- **BR-44** Yükleme / değiştirme / kaldırma yetkisi:

  | Başvuru statüsü | CUSTOMER | ADMIN, EMPLOYEE (müşteri adına) |
  |---|---|---|
  | `AWAITING_DOCUMENTS` | Yükle/değiştir/kaldır: `NOT_UPLOADED`, `UPLOADED` | Müşteriyle aynı |
  | `REVISION_REQUIRED` | Yükle/değiştir/kaldır: `NOT_UPLOADED`, `UPLOADED`, `REVISION_REQUIRED` | Müşteriyle aynı |
  | `UNDER_REVIEW` | **Hiçbir işlem** | **Yükle/değiştir** (kaldırma yok): tüm evrak statüleri (D9) |
  | `DOCUMENTS_APPROVED`, `IN_PROCESS`, `COMPLETED`, `CANCELLED` | Hiçbir işlem | Hiçbir işlem (önce ADMIN geri alma geçişi gerekir — [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)) |

  `APPROVED` ve `PENDING_REVIEW` evraklar müşteri tarafından hiçbir zaman değiştirilemez.
- **BR-45** Kural hem upload token üretiminde hem de dosyanın aktifleştirilmesi sırasında (transaction + satır kilidi altında) yeniden kontrol edilir. Arada başvuru/evrak durumu değiştiyse dosya `REJECTED (STATE_CHANGED)` olur ve blob silinir.
- **BR-46** Doğrulamayı geçmemiş dosya (`UPLOAD_PENDING`, `VALIDATING`, `REJECTED`, `EXPIRED`) görüntülenemez, indirilemez, tamamlanma oranına sayılmaz, gönderime uygun sayılmaz. Reddedilen dosya müşteriye anlaşılır Türkçe mesajla bildirilir; önceki aktif dosya (varsa) aktif kalır.
- **BR-47** Teknik temizlik: `REJECTED` ve `EXPIRED` dosyaların blob'ları hemen/temizlik işinde silinir (metadata kalır). Geçerli dosya versiyonları (`ACTIVE`, `SUPERSEDED`, `REMOVED`) **otomatik silinmez**; yalnızca ADMIN'in başvuru silme işlemiyle silinir (BR-150, OD-06).
- **BR-48** Personel bir evrağı `UNDER_REVIEW` sırasında değiştirdiğinde (OD-17): yeni versiyon oluşur → doğrulanır → aktif olur → **önceki onay yeni versiyona aktarılmaz** → evrak `PENDING_REVIEW` olur → önceki inceleme kayıtları korunur → audit kaydı oluşur.

## 6. Gönderim ve İnceleme

- **BR-50** "İncelemeye gönder" koşulları (sunucu tarafında):
  1. Başvuru statüsü `AWAITING_DOCUMENTS` veya `REVISION_REQUIRED`.
  2. Her **zorunlu** evrağın aktif dosyası var.
  3. Hiçbir evrakta devam eden yükleme (`UPLOAD_PENDING`/`VALIDATING`) yok.
  4. Hiçbir evrak (zorunlu veya isteğe bağlı) `REVISION_REQUIRED` statüsünde kalmamış.
- **BR-51** İsteğe bağlı evrakların eksikliği gönderimi engellemez.
- **BR-52** Gönderimde: başvuru → `UNDER_REVIEW`; `UPLOADED` evraklar → `PENDING_REVIEW`; `APPROVED` evraklar `APPROVED` kalır; `NOT_UPLOADED` değişmez.
- **BR-53** Gönderim idempotenttir: ikinci istek statü/versiyon kontrolünde başarısız olur, "Başvurunuz zaten incelemede" bilgisi döner, yan etki oluşmaz.
- **BR-54** Personel müşteri adına gönderebilir; geçmişte aktör `USER` + `on_behalf_of_customer = true`.
- **BR-55** Personel yalnızca `UNDER_REVIEW` başvurudaki evrakları inceleyebilir. Karar: `APPROVED` veya `REVISION_REQUIRED`.
- **BR-56** `REVISION_REQUIRED` kararında müşteriye yönelik açıklama zorunludur (10–1000 karakter); müşteri görür.
- **BR-57** Her inceleme kaydı **incelenen dosya versiyonuna** (`file_id`) bağlıdır. İnceleme isteği, personelin gördüğü `fileId`'yi taşır; sunucu bu dosyanın kilit altında hâlâ aktif dosya olduğunu doğrular. Değilse işlem `CONFLICT` ile reddedilir ("Evrak bu sırada güncellendi"). Böylece eski versiyona verilen onay yeni dosyayı onaylamaz (OD-17).
- **BR-58** Kararlar, başvuru `UNDER_REVIEW` iken değiştirilebilir (yeni review kaydı; eskisi silinmez). Eşzamanlı kararlar optimistic locking ile çözülür (§9).
- **BR-59** "Düzeltmeye geri gönder" (`UNDER_REVIEW → REVISION_REQUIRED`): `PENDING_REVIEW` evrak kalmamış **ve** ≥1 evrak `REVISION_REQUIRED`.
- **BR-60** "Evrakları onayla" (`UNDER_REVIEW → DOCUMENTS_APPROVED`): `PENDING_REVIEW` / `REVISION_REQUIRED` kalmamış, tüm zorunlu evraklar `APPROVED`, aktif dosyası olan tüm isteğe bağlı evraklar `APPROVED`.
- **BR-61** Başvuru statü geçişleri **manueldir** (D-027).
- **BR-62** Onaylanmış ve değişmemiş evraklar yeniden yükleme gerektirmez; ADMIN geri alma geçişlerinde (T10–T12) yalnızca açıkça seçilen evrakların onayı geçersiz kılınır (OD-05).

## 7. Versiyonlama

- **BR-70** Dosya kayıtları değiştirilemez; yalnızca statü/yaşam döngüsü alanları kontrollü güncellenir.
- **BR-71** `version_number`, dosya **aktif olduğunda** evrak başına artan tam sayı olarak atanır (geçerli versiyonlar boşluksuz: v1, v2, …).
- **BR-72** Bir evrağın geçmişi: tüm geçerli dosya versiyonları + tüm inceleme kayıtları (karar, gerekçe, inceleyen, tarih, incelenen versiyon). Personel tüm geçerli versiyonları görebilir; müşteri yalnızca aktif dosyayı görür.
- **BR-73** Versiyonlar süreye bağlı olarak silinmez (OD-06).

## 8. Arama ve Görüntüleme

- **BR-80** Arama Türkçe karakter duyarsızdır: `applications.search_text` = ad + soyad + e-posta + telefon (E.164 ve `0`'lı yerel biçim), Türkçe küçük harf (`İ→i`, `I→ı`) + katlama (`ı→i, ğ→g, ü→u, ş→s, ö→o, ç→c`). Sorgu metni aynı fonksiyondan geçer. Başvuru numarası birebir aranır.
- **BR-81** Zaman damgaları `timestamptz` (UTC); gösterim `Europe/Istanbul`, `dd.MM.yyyy HH:mm`.
- **BR-82** Başvuru listesi tektir; arşiv yoktur (OD-23). Statü filtreleri: Tüm Başvurular, Evrak Bekleniyor, İncelemede, Düzeltme Bekleniyor, Evraklar Onaylandı, Başvuru İşlemde, Tamamlandı, İptal Edildi. Ek filtreler: hizmet, oluşturma tarihi aralığı.

## 9. Eşzamanlılık

- **BR-90** `applications` ve `application_document_requirements` tablolarında `version` kolonu ile optimistic locking. Uyuşmazlıkta "Bu kayıt başka biri tarafından güncellendi, lütfen sayfayı yenileyin."
- **BR-91** Gönderim, inceleme, statü geçişi, dosya aktifleştirme, bağlantı yenileme/iptal ve silme transaction içinde ilgili satırları `SELECT ... FOR UPDATE` ile kilitler; guard'lar kilit altında değerlendirilir. Kilit sırası: applications → requirements → files.
- **BR-92** Yükleme tamamlama (Blob callback veya client confirm) idempotenttir.

## 10. Müşteri Erişimi (OD-01, OD-02, OD-04, OD-18, OD-19)

- **BR-100** Her başvurunun aynı anda **en fazla bir aktif** bağlantısı vardır (DB partial unique index + transaction). Bağlantı birden çok cihazdan kullanılabilir.
- **BR-101** Bağlantı **süresizdir**. Yalnızca şu durumlarda geçersiz olur: yetkili personel iptal ettiğinde, yeni bağlantı oluşturulduğunda (yenileme), başvuru silindiğinde. Zamana veya statüye bağlı otomatik iptal **yoktur**; `COMPLETED`/`CANCELLED` başvurularda bağlantı açık kalır, panel salt okunurdur.
- **BR-102** Geçerli bağlantıyı açan müşteri **ek bir adım olmadan** kendi başvuru paneline erişir: hesap, şifre, OTP, onay yoktur. Bağlantı bir **bearer credential**'dır: bağlantıyı ele geçiren herkes başvuruya erişebilir ([SECURITY.md](SECURITY.md) §3).
- **BR-103** Bağlantı açıldığında sunucu, başvuruya bağlı 7 günlük bir müşteri oturumu oluşturur ve kullanıcıyı token içermeyen `/portal` adresine yönlendirir. Oturum süresi dolduğunda aynı geçerli bağlantıyla yeniden erişilir. Oturum süresi ile bağlantı geçerliliği bağımsızdır.
- **BR-104** Bağlantı iptali/yenilenmesi veya başvuru silinmesi, o bağlantıyla açılmış **tüm müşteri oturumlarını anında** geçersiz kılar (her istekte bağlantı durumu kontrol edilir).
- **BR-105** Link önizleme botları ve crawler'lar başvuru durumunu **değiştiremez**: bağlantıyı açmak (GET) hiçbir veriyi değiştirmez ve audit kaydı oluşturmaz.
- **BR-106** ADMIN ve EMPLOYEE bağlantı yönetiminde eşit yetkilidir: görüntüle, kopyala, WhatsApp ile paylaş, iptal et, yenile, iptal edilmişin yerine yeni oluştur. İptal ve yenileme onay penceresi gerektirir ve audit'lenir (token audit'e yazılmaz).
- **BR-107** Bağlantı URL'si yalnızca sunucu yapılandırmasındaki `APP_URL` ile üretilir; request `Host` header'ı kullanılmaz (OD-20).

## 11. İlerleme Göstergeleri

### 11.1 Başvuru süreci
5 adım: **1 Kayıt Oluşturuldu → 2 Evrak Yükleme → 3 Evrak İnceleme → 4 Başvuru İşlemleri → 5 Süreç Tamamlandı**

| Statü | Gösterim |
|---|---|
| `AWAITING_DOCUMENTS` | 1 tamam, 2 aktif |
| `UNDER_REVIEW` | 1–2 tamam, 3 aktif |
| `REVISION_REQUIRED` | 1 tamam, 2 aktif + **"Düzeltme bekleniyor"** uyarı rozeti |
| `DOCUMENTS_APPROVED` | 1–3 tamam, 4 bekliyor |
| `IN_PROCESS` | 1–3 tamam, 4 aktif |
| `COMPLETED` | Tümü tamam — "CS Global danışmanlık süreciniz tamamlandı." (vize sonucu ifadesi yok) |
| `CANCELLED` | Gösterge yerine nötr bilgi kartı: "Bu başvuru iptal edilmiştir." |

Gösterge vize onay olasılığı veya sonuç garantisi ifade etmez.

### 11.2 Evrak tamamlanma
- **BR-110** Payda: **zorunlu** evrak sayısı. İsteğe bağlı evraklar paydaya girmez.
- **BR-111** Pay: aktif dosyası olan **ve** statüsü `REVISION_REQUIRED` olmayan zorunlu evraklar. Doğrulaması süren yeni dosya, önceki aktif dosya varsa sayımı değiştirmez; yoksa sayılmaz ("Kontrol ediliyor"). Reddedilen dosya sayılmaz.
- **BR-112** Ayrı "onaylanan" göstergesi: `APPROVED` zorunlu evrak / zorunlu evrak toplamı.
- **BR-113** Metin: "3 / 5 zorunlu evrak yüklendi · %60". Yüzde aşağı yuvarlanır; %100 yalnızca tam tamamlanmada.
- **BR-114** Zorunlu evrak yoksa "Zorunlu evrak bulunmuyor" gösterilir.

## 12. Yorumlar ve Notlar

- **BR-120** İki ayrı tablo: `document_comments` (müşteriye görünür) ve `application_internal_notes` (yalnızca personel).
- **BR-121** Müşteri tarafı veri erişim fonksiyonları `application_internal_notes` tablosunu hiçbir koşulda sorgulamaz; müşteri DTO'ları whitelist alanlardan oluşur ([ARCHITECTURE.md](ARCHITECTURE.md) §5).
- **BR-122** Müşteri yorum yazamaz (MVP).
- **BR-123** Yorum/not düzenleme ve silme yoktur (başvuru silinmesi hariç).

## 13. Personel Hesapları (OD-11, OD-22)

- **BR-130** Kullanıcı adı: 3–30 karakter, `a-z 0-9 . _`, küçük harfe normalize, benzersiz. Yalnızca ADMIN belirler/değiştirir.
- **BR-131** Şifre: min **8**, maks 128 karakter (sabit). Şifreyi yalnızca ADMIN belirler; mevcut şifre hiçbir zaman görüntülenemez. EMPLOYEE kendi şifresini/kullanıcı adını değiştiremez; self-servis sıfırlama, "Şifremi unuttum", kayıt ekranı **yoktur**. İlk girişte zorunlu şifre değişimi **yoktur**.
- **BR-132** Pasifleştirme tüm oturumları iptal eder; pasif kullanıcı giriş yapamaz. Hesaplar silinmez (audit bütünlüğü).
- **BR-133** ADMIN kendi hesabını pasifleştiremez, kendi rolünü düşüremez; sistemde en az bir aktif ADMIN bulunmalıdır.
- **BR-134** EMPLOYEE hiçbir hesap yönetimi işlemi yapamaz.
- **BR-135** Şifre değiştirildiğinde ilgili kullanıcının **tüm** oturumları iptal edilir.
- **BR-136** Personel oturumu en fazla **7 gün** sürer ve **uzatılmaz** (sliding yok); hareketsizlik zaman aşımı yoktur.

## 14. Arşivleme — (kaldırıldı, OD-23)

- BR-140, BR-141 — (kaldırıldı). Arşiv statüsü/alanı/sayfası yoktur; tüm başvurular tek listede statü filtreleriyle yönetilir (BR-82).

## 15. Manuel Silme (OD-06)

- **BR-150** Başvuruyu yalnızca **ADMIN** silebilir. Otomatik başvuru/müşteri verisi silme ve saklama süresi yönetimi **yoktur**.
- **BR-151** Silme, başvuru numarasının yazılmasını isteyen açık bir onay penceresi ve "Bu işlem geri alınamaz" uyarısı gerektirir.
- **BR-152** Silme kapsamı: bağlantılar (iptal + satır silme), tüm müşteri oturumları (bağlantı kontrolü ile anında), **tüm dosya versiyonlarının blob'ları** (private storage), evrak gereksinimleri, dosya kayıtları, incelemeler, yorumlar, iç notlar, statü geçmişi ve başvuru kaydı. Soft delete (yalnızca `deleted_at`) **gerçek silme sayılmaz**.
- **BR-153** Silme iki aşamalıdır: (1) başvuru `deletion_requested_at` ile **anında erişilemez** yapılır (bağlantı ve tüm okumalar reddedilir); (2) blob'lar silinip doğrulandıktan sonra DB kayıtları silinir. Blob silme kısmen başarısız olursa başvuru erişilemez durumda kalır; ADMIN "Silmeyi tamamla" ile veya günlük temizlik işiyle güvenli şekilde yeniden denenir (idempotent).
- **BR-154** Minimum audit: `APPLICATION_DELETION_REQUESTED` ve `APPLICATION_DELETED` — yalnızca başvuru ID'si, silen kullanıcı, silinen dosya sayısı. Müşteri adı, telefon, e-posta, dosya adı **yazılmaz**. Önceki audit kayıtları PII içermediği için korunur.
- **BR-155** KVKK kapsamındaki saklama ve imha yükümlülüklerini **şirket** takip eder; manuel silme tercihi, verilerin süresiz saklanması için hukuki dayanak oluşturmaz ([DATA_PRIVACY.md](DATA_PRIVACY.md) §4).

## 16. WhatsApp Paylaşımı (OD-21)

- **BR-160** "WhatsApp ile Paylaş", başvurudaki telefon numarası ve sabit şablonla `https://wa.me/<E.164 rakamları>?text=<URL-encoded mesaj>` bağlantısını açar. Gönderimi çalışan manuel yapar; API/otomatik gönderim yoktur; şablon panelden düzenlenemez.
- **BR-161** Şablon (placeholder'lar başvuru verisiyle doldurulur):
  ```
  Sayın [FIRST_NAME] [LAST_NAME],

  CS Global'i tercih ettiğiniz için teşekkür ederiz.

  [SERVICE_NAME] danışmanlık süreciniz için size özel başvuru paneliniz oluşturulmuştur.

  Aşağıdaki bağlantı üzerinden gerekli evraklarınızı yükleyebilir ve başvuru sürecinizi takip edebilirsiniz.

  [APPLICATION_LINK]

  Güvenliğiniz için bu bağlantıyı başka kişilerle paylaşmayınız.

  Saygılarımızla,
  CS Global
  ```
  `[SERVICE_NAME]` = `service_name_snapshot`. Telefon `+` olmadan rakamlara dönüştürülür; mesaj `encodeURIComponent` ile kodlanır.
- **BR-162** Paylaşım öncesi onay penceresinde hedef müşteri adı-soyadı ve telefon numarası açıkça gösterilir (yanlış kişiye gönderim riskini azaltmak için).

## 17. Şirket İletişim Bilgileri ve Logo (OD-14, OD-15)

- **BR-170** Tüm müşteriler aynı CS Global iletişim bilgilerini görür: şirket telefonu ve WhatsApp iletişim bağlantısı. Değerler merkezi uygulama yapılandırmasında (`src/config/company.ts`) tanımlanır; panelden düzenlenemez; başvuruya özel danışman yoktur.
- **BR-171** Gerçek değerler sağlanana kadar ilgili alanlar **disabled/placeholder** ("İletişim bilgisi yakında eklenecek") gösterilir; uydurma numara kullanılmaz.
- **BR-172** Logo geçici metin logodur ("CS Global"), tek bir paylaşılan bileşenden (`Logo`) gelir; gerçek logo olarak sunulmaz. Logo yönetimi yoktur.
