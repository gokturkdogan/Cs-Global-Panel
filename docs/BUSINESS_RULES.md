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
- *Uygulama notu (PHASE 06):* Sayaç artışı başvuru transaction'ıyla birlikte geri alınır; başarısız oluşturma numara tüketmez. Ayrıntı: D-078.

## 3. Hizmetler ve Evrak Şablonları

- **BR-20** Hizmetler kodda tanımlanmaz; personel (iki hesap eşit — OD-24) panelden yönetir.
- **BR-21** Pasif hizmet yeni başvuruda seçilemez (sunucuda da doğrulanır). Mevcut başvurular etkilenmez.
- **BR-22** Hizmetler fiziksel olarak silinmez; pasifleştirilir.
- **BR-23** Evrak şablonu alanları: başlık, açıklama, talimat, zorunlu mu, sıra, aktif mi. Dosya tipi, boyut ve sayı **şablon alanı değildir** — tüm sistemde sabittir (BR-40, OD-16).
- BR-24 — (kaldırıldı: dinamik boyut üst sınırı, OD-16)
- **BR-25** Pasif evrak şablonu yeni başvurulara kopyalanmaz; mevcut snapshot'ları etkilemez.
- *Uygulama notları (PHASE 05 — ürün kuralı eklemez):* Hizmet adı büyük/küçük harf duyarsız benzersizdir (`lower(name)` index'i; `İ/i` dahil). Evrak şablonları aktif ve pasif birlikte tek sıradadır; pasif evrak yerini korur. Şablon talimatları düz metindir. Pasifleştirme onaylıdır; silme yoktur. Aktif evrakı olmayan aktif hizmette uyarı gösterilir (BR-32 bilgilendirmesi). Ayrıntı: D-072…D-076.

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

  | Başvuru statüsü | CUSTOMER | Personel (müşteri adına) |
  |---|---|---|
  | `AWAITING_DOCUMENTS` | Yükle/değiştir/kaldır: `NOT_UPLOADED`, `UPLOADED` | Müşteriyle aynı |
  | `REVISION_REQUIRED` | Yükle/değiştir/kaldır: `NOT_UPLOADED`, `UPLOADED`, `REVISION_REQUIRED` | Müşteriyle aynı |
  | `UNDER_REVIEW` | **Hiçbir işlem** | **Yükle/değiştir** (kaldırma yok): tüm evrak statüleri (D9) |
  | `DOCUMENTS_APPROVED`, `IN_PROCESS`, `COMPLETED`, `CANCELLED` | Hiçbir işlem | Hiçbir işlem (önce gerekçeli geri alma/yeniden açma geçişi gerekir — [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)) |

  `APPROVED` ve `PENDING_REVIEW` evraklar müşteri tarafından hiçbir zaman değiştirilemez.
- **BR-45** Kural hem upload token üretiminde hem de dosyanın aktifleştirilmesi sırasında (transaction + satır kilidi altında) yeniden kontrol edilir. Arada başvuru/evrak durumu değiştiyse dosya `REJECTED (STATE_CHANGED)` olur ve blob silinir.
- **BR-46** Doğrulamayı geçmemiş dosya (`UPLOAD_PENDING`, `VALIDATING`, `REJECTED`, `EXPIRED`) görüntülenemez, indirilemez, tamamlanma oranına sayılmaz, gönderime uygun sayılmaz. Reddedilen dosya müşteriye anlaşılır Türkçe mesajla bildirilir; önceki aktif dosya (varsa) aktif kalır.
- **BR-47** Teknik temizlik: `REJECTED` ve `EXPIRED` dosyaların blob'ları hemen/temizlik işinde silinir (metadata kalır). Geçerli dosya versiyonları (`ACTIVE`, `SUPERSEDED`, `REMOVED`) **otomatik silinmez**; yalnızca ADMIN'in başvuru silme işlemiyle silinir (BR-150, OD-06).
- **BR-48** Personel bir evrağı `UNDER_REVIEW` sırasında değiştirdiğinde (OD-17): yeni versiyon oluşur → doğrulanır → aktif olur → **önceki onay yeni versiyona aktarılmaz** → evrak `PENDING_REVIEW` olur → önceki inceleme kayıtları korunur → audit kaydı oluşur.
- *Uygulama notları (PHASE 08 — ürün kuralı eklemez; D-100, D-103):* Yükleme sunucu üzerinden tek istekte yapılır: doğrulama storage'a yazmadan **önce**; reddedilen dosya için kayıt/nesne oluşmaz (BR-46'daki `REJECTED` yalnızca aktivasyonda durum değişikliği — `STATE_CHANGED` — için kullanılır). BR-43: evrakta **süresi dolmamış** devam eden yükleme varsa yeni istek "Devam eden bir yükleme var" ile reddedilir (paralel iki istek eski aktif dosyayı bozmaz ve asla iki aktif dosya oluşturmaz); süresi dolmuş yarım yükleme iptal (`EXPIRED`) edilir. BR-47 teknik temizliği elle çalıştırılan `pnpm storage:cleanup` ile (ücretli cron yok). Onaylı evrak personel tarafından değiştirildiğinde ayrıca `DOCUMENT_APPROVAL_INVALIDATED` audit'i yazılır. BR-44'teki **"kaldır"** (ve D2/D8) bu fazda uygulanmadı — PHASE 09. Depolama kotası (9 GB) dolarsa yeni yükleme reddedilir; mevcut dosyalar silinmez (D-101).

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
- **BR-62** Onaylanmış ve değişmemiş evraklar yeniden yükleme gerektirmez; geri alma geçişlerinde (T10–T12) yalnızca açıkça seçilen evrakların onayı geçersiz kılınır (OD-05).
- *Uygulama notları (PHASE 09 — ürün kuralı eklemez; D-108…D-112):* Gönderim (müşteri ve personel müşteri adına) aynı BR-50 guard'larını kilit altında, gerçek aktif dosya ve süresi dolmamış bekleyen yükleme verisiyle uygular; personel eksik evrakı/bekleyen yüklemeyi/düzeltmeyi atlayamaz. BR-53: tekrar istek "Başvurunuz zaten incelemede" ile reddedilir. Zorunlu evrakı olmayan hizmette BR-50 koşulları boş kümede sağlanır (gönderim izinli — kural metni). Evrak kararları başvuru statüsünü değiştirmez; T2/T3 manuel aksiyonlardır. Önceden onaylanan evraklar düzeltme turunda korunur (BR-52: `APPROVED` kalır). Yeni dosya aktif olunca önceki onay devralınmaz (BR-48; PHASE 08 aktivasyonu). İptal ve tamamlama müşteri bağlantısını iptal etmez (BR-101).

## 7. Versiyonlama

- **BR-70** Dosya kayıtları değiştirilemez; yalnızca statü/yaşam döngüsü alanları kontrollü güncellenir.
- **BR-71** `version_number`, dosya **aktif olduğunda** evrak başına artan tam sayı olarak atanır (geçerli versiyonlar boşluksuz: v1, v2, …).
- **BR-72b** (PHASE 11.1, OD-26) Depolama kapasitesi hedefi 100 GB (uyarı 90 GB); sınıra ulaşıldığında yeni yükleme durur, mevcut dosyalar erişilebilir kalır. Daha fazla kapasite eski başarılı versiyonların otomatik silinmesini getirmez (BR-47, OD-06 aynen).
- **BR-72a** (PHASE 11, D-135/D-136) Görüntüleme uygulama içi görüntüleyiciyle ve dosyanın yalnızca gereken bölümleri okunarak yapılır; indirme tam dosyadır. Görüntüleme kaydı (audit) aynı kişi ve dosya için 10 dakikada bir; indirme her seferinde kaydedilir. Kurallar (kim neyi görebilir) değişmedi.
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
- **BR-102** Geçerli bağlantıyı açan müşteri, genel bir ara sayfada **tek bir açık eylemle** ("Başvurumu Görüntüle" — D-141, PHASE 12.1) kendi başvuru paneline erişir: hesap, şifre, OTP yoktur. Ara sayfa müşteri verisi göstermez; düğme ikinci kimlik doğrulama faktörü değildir. Bağlantı bir **bearer credential**'dır: bağlantıyı ele geçiren herkes başvuruya erişebilir ([SECURITY.md](SECURITY.md) §3).
- **BR-103** Müşteri ara sayfada girişi onayladığında (yalnızca aynı köken POST; bağlantının GET/HEAD ile açılması oturum oluşturmaz — D-141) sunucu, başvuruya bağlı 7 günlük bir müşteri oturumu oluşturur ve kullanıcıyı token içermeyen `/portal/<bağlam>` adresine yönlendirir (bağlam kimliği teknik bir sekme ayırıcıdır, gizli değildir — D-090). Oturum süresi dolduğunda aynı geçerli bağlantıyla yeniden erişilir. Oturum süresi ile bağlantı geçerliliği bağımsızdır.
- **BR-104** Bağlantı iptali/yenilenmesi veya başvuru silinmesi, o bağlantıyla açılmış **tüm müşteri oturumlarını anında** geçersiz kılar (her istekte bağlantı durumu kontrol edilir).
- **BR-105** Link önizleme botları ve crawler'lar başvuru durumunu **değiştiremez** ve (PHASE 12.1, D-141) **müşteri verisine ulaşamaz**: bağlantıyı açmak (GET/HEAD) veritabanına erişmez, oturum/cookie oluşturmaz, hiçbir veriyi değiştirmez ve audit kaydı oluşturmaz. Açık giriş (POST) yalnızca müşteri oturumu oluşturur ve geçerli token başına sayaç tutar (D-150); başvuru verisini değiştirmez.
- **BR-106** İki şirket hesabı bağlantı yönetiminde eşit yetkilidir (OD-19, OD-24): görüntüle, kopyala, WhatsApp ile paylaş, iptal et, yenile, iptal edilmişin yerine yeni oluştur. İptal ve yenileme onay penceresi gerektirir ve audit'lenir (token audit'e yazılmaz).
- **BR-107** Bağlantı URL'si yalnızca sunucu yapılandırmasındaki `APP_URL` ile üretilir; request `Host` header'ı kullanılmaz (OD-20).
- *Uygulama notları (PHASE 07 — ürün kuralı eklemez):* Aynı tarayıcıda yalnızca bir başvuru paneli etkin olabilir: başka başvurunun bağlantısı açılınca önceki sekme "Bu sayfa artık güncel değil" gösterir ve kendi bağlantısı yeniden açılarak devam edilir; aynı bağlantıyı tekrar açmak önceki sekmeyi etkilemez (D-090). Oturum süresi kullanımla uzamaz (D-089).
- *Uygulama notları (PHASE 06 — ürün kuralı eklemez):* Bağlantı personele yalnızca açık aksiyonla (Göster/Kopyala/Paylaş) sunucuda çözülerek gösterilir ve audit'lenir; iptal/yenileme istemcinin gördüğü aktif bağlantı kimliğiyle yapılır. Müşteri telefon/e-posta düzeltmesi bağlantıyı kendiliğinden yenilemez; personele uyarı gösterilir (D-083, D-084).

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
- *Uygulama notu (PHASE 07, D-092):* Dosya yükleme PHASE 08'e kadar olmadığından pay, evrak statüsünden (`UPLOADED`/`PENDING_REVIEW`/`APPROVED`) hesaplanır; PHASE 08'de "Kontrol ediliyor" durumu BR-111'e göre eklenir.
- *Uygulama notu (PHASE 08):* Doğrulama yükleme isteği içinde tamamlandığından kalıcı bir "Kontrol ediliyor" durumu yoktur; bu evre yalnızca yükleme bileşeninde ("Sunucuda doğrulanıyor ve kaydediliyor") gösterilir. Evrak statüsü ancak aktivasyon commit edilince değişir; bu nedenle statü tabanlı sayım BR-111 ile tutarlıdır (aktif dosyası olan, `REVISION_REQUIRED` olmayan zorunlu evraklar).

## 12. Yorumlar ve Notlar

- **BR-120** İki ayrı tablo: `document_comments` (müşteriye görünür) ve `application_internal_notes` (yalnızca personel).
- **BR-121** Müşteri tarafı veri erişim fonksiyonları `application_internal_notes` tablosunu hiçbir koşulda sorgulamaz; müşteri DTO'ları whitelist alanlardan oluşur ([ARCHITECTURE.md](ARCHITECTURE.md) §5).
- **BR-122** Müşteri yorum yazamaz (MVP).
- **BR-123** Yorum/not düzenleme ve silme yoktur (başvuru silinmesi hariç).
- *Uygulama notları (PHASE 10 — ürün kuralı eklemez; D-115):* Şirket içi notlar başvuru detayındaki "Şirket İçi Notlar" bölümünden, her iki hesapça, başvurunun her statüsünde (COMPLETED/CANCELLED dahil — kural statü kısıtı koymaz) eklenir; silme sürecindeki başvuruya eklenemez. Düz metin 1–5000; idempotent (işlem anahtarı); statü değişmez; audit `INTERNAL_NOTE_ADDED { id }` (metin yok). Listeleme sınırlıdır (en yeni 50).
- *Uygulama notu (PHASE 09, D-112):* Müşteriye görünür yorumlar uygulandı (personel ekler; müşteri panelinde salt okunur, yazar gösterilmez; düz metin 1–2000; statü değiştirmez). İç notlar PHASE 10.

## 13. Personel Hesapları (OD-24, OD-11, OD-22)

- **BR-130** Sistemde **tam olarak iki** şirket hesabı vardır: bir ADMIN, bir EMPLOYEE (OD-24). Üçüncü hesap oluşturulamaz (veritabanı kısıtı). İki hesap birebir aynı uygulama yetkilerine sahiptir; hesap türü yalnızca tanımlama ve işlem geçmişinde ayırt etme içindir.
- **BR-131** Kullanıcı adı: 3–30 karakter, `a-z 0-9 . _`, küçük harfe normalize, benzersiz; iki hesabın kullanıcı adları farklıdır. Şifre: min **8**, maks 128 karakter (sabit); iki hesabın şifreleri farklı olmalı ve kullanıcı adını içermemelidir. Mevcut şifre hiçbir zaman görüntülenemez.
- **BR-132** Hesaplar yalnızca yerel CLI ile bir kez oluşturulur (`pnpm auth:bootstrap`); mevcut hesapların üzerine yazılmaz. Uygulamada kayıt, hesap oluşturma, silme, pasifleştirme, rol değiştirme, kullanıcı adı değiştirme **yoktur**.
- **BR-133** Hiçbir hesap uygulama içinden kendi veya diğer hesabın şifresini değiştiremez; "Şifremi unuttum" ve self-servis sıfırlama yoktur. Şifre yalnızca güvenilir işletmecinin yerel CLI'ı ile sıfırlanır (`pnpm auth:reset-password`). İlk girişte zorunlu şifre değişimi yoktur.
- **BR-134** — (kaldırıldı: EMPLOYEE'ye özgü kısıtlar — OD-24)
- **BR-135** Şifre sıfırlandığında **yalnızca ilgili hesabın** tüm oturumları iptal edilir; diğer hesabın oturumları etkilenmez. Bir hesabın çıkışı diğerini etkilemez.
- **BR-136** Personel oturumu en fazla **7 gün** sürer ve **uzatılmaz** (sliding yok); hareketsizlik zaman aşımı ve "beni hatırla" yoktur.

## 14. Arşivleme — (kaldırıldı, OD-23)

- BR-140, BR-141 — (kaldırıldı). Arşiv statüsü/alanı/sayfası yoktur; tüm başvurular tek listede statü filtreleriyle yönetilir (BR-82).

## 15. Manuel Silme (OD-06)

- **BR-150** Başvuruyu her iki şirket hesabı da silebilir (OD-24; başvuru numarası yazılarak onay, gerekçe ve audit zorunlu). Otomatik başvuru/müşteri verisi silme ve saklama süresi yönetimi **yoktur**.
- **BR-151** Silme, başvuru numarasının yazılmasını isteyen açık bir onay penceresi ve "Bu işlem geri alınamaz" uyarısı gerektirir.
- **BR-152** Silme kapsamı: bağlantılar (iptal + satır silme), tüm müşteri oturumları (bağlantı kontrolü ile anında), **tüm dosya versiyonlarının blob'ları** (private storage), evrak gereksinimleri, dosya kayıtları, incelemeler, yorumlar, iç notlar, statü geçmişi ve başvuru kaydı. Soft delete (yalnızca `deleted_at`) **gerçek silme sayılmaz**.
- **BR-153** Silme iki aşamalıdır: (1) başvuru `deletion_requested_at` ile **anında erişilemez** yapılır (bağlantı ve tüm okumalar reddedilir); (2) blob'lar silinip doğrulandıktan sonra DB kayıtları silinir. Blob silme kısmen başarısız olursa başvuru erişilemez durumda kalır; ADMIN "Silmeyi tamamla" ile veya günlük temizlik işiyle güvenli şekilde yeniden denenir (idempotent).
- **BR-154** Minimum audit: `APPLICATION_DELETION_REQUESTED` ve `APPLICATION_DELETED` — yalnızca başvuru ID'si, silen kullanıcı, silinen dosya sayısı. Müşteri adı, telefon, e-posta, dosya adı **yazılmaz**. Önceki audit kayıtları PII içermediği için korunur.
- **BR-155** KVKK kapsamındaki saklama ve imha yükümlülüklerini **şirket** takip eder; manuel silme tercihi, verilerin süresiz saklanması için hukuki dayanak oluşturmaz ([DATA_PRIVACY.md](DATA_PRIVACY.md) §4).
- *Uygulama notları (PHASE 10 — ürün kuralı eklemez; D-116…D-118):* Silme her iki hesapça başlatılır ve sürdürülür (OD-24; BR-153'teki "ADMIN 'Silmeyi tamamla'" → iki hesapta "Silme İşlemini Sürdür"). Ücretli/zamanlanmış iş olmadığından (D-105) "günlük temizlik işi" ile otomatik yeniden deneme yoktur; yarım kalan silme personel isteğiyle, güvenli ve idempotent olarak devam eder. Silme başvuru statüsünden bağımsızdır (her statüde başlatılabilir; T1–T12'ye yeni statü eklenmedi; silme sürecindeki başvuru yeniden açılamaz). Talepten önce başlamış yüklemelerin storage yazımları sonuçlanana kadar fiziksel silme bekler. Kalıcı silme iptal, tamamlama, bağlantı iptali, dosya kaldırma veya versiyon değiştirmeyle aynı şey değildir. Tekil dosya/eski versiyon kalıcı silme yoktur (BR-47). Toplu silme yoktur; aynı müşteri bilgilerine sahip başka başvurular etkilenmez. Silinen başvurunun numarası tekrar kullanılmaz. BR-154 audit'ine `APPLICATION_DELETION_FAILED { reason (kod), count }` eklendi (yalnızca hata kategorisi değişince; PII yok). **PHASE 10.1 (D-124):** silme talebinden önce başlamış bir yüklemenin sonucu kanıtlanamazsa silme güvenle bekletilir ve süre geçse de tamamlanmaz; sonuç hiç kanıtlanamazsa başvuru (müşteri erişimi kapalı, kayıtlar korunur) teknik incelemeye kadar silme sürecinde kalabilir. Personel için atlama/zorla silme yoktur.

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

## PHASE 12.1 — OD-27

- **BR-190** Uygulama, kendi yedekleme veya geri yükleme mekanizmasını sunmaz (OD-27). Veri kaybında uygulamaya özel kurtarma garantisi yoktur. Sağlayıcı düzeyi olağanüstü geri yükleme yalnızca kullanıcı ve yetkili operatör kararıyla, ortam müşterilere açılmadan ve veri bütünlüğü değerlendirilmeden yapılır (OPERATIONS_RUNBOOK §2). Bu kural BR-47 (başarılı PDF versiyonları otomatik silinmez) ve kalıcı silme kurallarını değiştirmez.
