# İş Kuralları

> Bu doküman iş kurallarının **tek doğruluk kaynağıdır**. Kural kimlikleri (`BR-xx`) kodda yorum/test adı olarak referans verilebilir.
> Statü geçişlerinin ayrıntısı: [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md). Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).
> **Proposed** işaretli kurallar kullanıcı onayı bekler ([DECISION_LOG.md](DECISION_LOG.md)).

## 1. Müşteri ve Başvuru

- **BR-01** Müşteri (`customer`) ile başvuru (`application`) ayrı varlıklardır. Bir müşterinin 0..N başvurusu olabilir; her başvuru tam olarak bir müşteriye ve bir hizmete bağlıdır.
- **BR-02** Her başvurunun kendi numarası, erişim bağlantısı, evrak listesi, dosyaları, statüsü ve geçmişi vardır.
- **BR-03** Bir başvurunun bağlantısı/oturumu, aynı müşterinin **diğer başvurularına erişim sağlamaz**.
- **BR-04** Telefon veya e-postanın eşleşmesi **otomatik birleştirme sebebi değildir**.
- **BR-05 (Proposed, D-009)** Mükerrer tespiti: başvuru formunda normalize telefon (E.164) **veya** normalize e-posta eşleşen müşteriler "Olası eşleşmeler" olarak çalışana gösterilir. Çalışan açıkça seçim yapar:
  - "Bu müşteriye bağla" → mevcut müşteri kaydı kullanılır. Formdaki farklı iletişim bilgileri **otomatik üzerine yazılmaz**; çalışan "iletişim bilgilerini güncelle" seçeneğini ayrıca işaretlerse güncellenir (OD-10).
  - "Yeni müşteri oluştur" → yeni kayıt oluşturulur.
  - Seçim audit log'a yazılır.
- **BR-06** Var olan müşteri kayıtlarının birleştirilmesi (merge) MVP kapsamında değildir; ileride yalnızca ADMIN, audit'li ve geri alınamaz uyarısıyla yapılabilir.
- **BR-07** Telefon `libphonenumber-js` ile varsayılan bölge `TR` kabul edilerek **E.164**'e normalize edilir (`+905321234567`). Geçersiz numara reddedilir. Girilen ham değer saklanmaz.
- **BR-08** E-posta: `trim` + küçük harf (`toLowerCase`) normalize edilir. Gmail nokta/artı kaldırma gibi sağlayıcıya özgü dönüşümler **yapılmaz**.
- **BR-09** Ad/soyad: baştaki/sondaki boşluklar kırpılır, çoklu boşluk teke indirilir, büyük/küçük harf **kullanıcının girdiği gibi** saklanır. Arama için ayrı bir normalize alan (`search_text`) tutulur (bkz. §8).

## 2. Başvuru Numarası

- **BR-10** Biçim: `CS-{YYYY}-{NNNNNN}` (6 hane, soldan sıfır dolgulu). Yıl **Europe/Istanbul** saat dilimine göre belirlenir.
- **BR-11** Numara yıllık sayaç tablosundan, başvuru oluşturma transaction'ı içinde atomik olarak alınır (D-008). Eşzamanlı oluşturmalarda çakışma olmaz; `application_number` üzerinde unique constraint vardır.
- **BR-12** Numara **erişim anahtarı değildir**, müşteri doğrulamasında kullanılmaz, değiştirilemez, yeniden kullanılmaz.
- **BR-13** 999 999 sınırı aşılırsa hane sayısı genişler (`CS-2026-1000000`); format doğrulayıcıları buna izin verir.

## 3. Hizmetler ve Evrak Şablonları

- **BR-20** Hizmetler kodda tanımlanmaz; yalnızca ADMIN panelden yönetir.
- **BR-21** Pasif hizmet yeni başvuruda seçilemez (sunucu tarafında da doğrulanır). Mevcut başvurular etkilenmez.
- **BR-22** Hizmetler fiziksel olarak silinmez (başvurulardan referans edilirler); pasifleştirilir. Hiç başvurusu olmayan hizmetin silinmesi MVP'de yoktur.
- **BR-23** Evrak şablonu alanları: başlık, açıklama, talimat, zorunlu mu, izin verilen dosya tipi (MVP: yalnızca `application/pdf`), maks dosya boyutu (varsayılan sistem ayarı, 10 MB), maks dosya sayısı (varsayılan 1), sıra, aktif mi.
- **BR-24** Maks dosya boyutu, sistem genelindeki **üst sınırı** aşamaz (ayarlardaki `maxUploadSizeBytes`). Üst sınır Vercel Blob client upload ile uyumludur; function body limitine tabi değildir.
- **BR-25** Pasif evrak şablonu yeni başvurulara kopyalanmaz; mevcut snapshot'ları etkilemez.

## 4. Snapshot (zorunlu)

- **BR-30** Başvuru oluşturulduğunda hizmetin **o anki aktif** evrak şablonları `application_document_requirements` tablosuna **kopyalanır** (başlık, açıklama, talimat, zorunluluk, tip, boyut, sayı, sıra). Kaynak şablon ID'si yalnızca izlenebilirlik için saklanır (`source_requirement_id`, nullable).
- **BR-31** Şablonda sonradan yapılan her değişiklik (ekleme, düzenleme, pasifleştirme) mevcut başvuruları **etkilemez**.
- **BR-32** Hizmetin aktif evrak şablonu yoksa başvuru oluşturulamaz (anlamlı Türkçe hata).
- **BR-33** Mevcut başvuruya sonradan özel evrak ekleme MVP'de yoktur; veri modeli buna izin verir (`source_requirement_id = NULL`, `added_after_creation`).

## 5. Evrak Yükleme

- **BR-40** Yalnızca PDF. Doğrulama katmanları: uzantı, MIME, `%PDF-` imzası, yapısal ayrıştırma, aktif içerik kontrolü, zararlı yazılım taraması ([FILE_STORAGE.md](FILE_STORAGE.md)). Uzantı veya MIME tek başına güvenilir değildir.
- **BR-41** Dosya boyutu ve sayısı **sunucu tarafında** (upload token üretiminde ve tamamlanma doğrulamasında) kontrol edilir.
- **BR-42** Her yükleme yeni bir **değiştirilemez** dosya kaydıdır; var olan dosya üzerine yazılmaz (versiyonlama — §7).
- **BR-43** Bir evrak gereksiniminin "güncel dosya seti": `upload_status = UPLOADED` ve `removed_at IS NULL` olan dosyalardır. Set boyutu `max_file_count`'u aşamaz.
- **BR-44** Yükleme/kaldırma yalnızca şu durumlarda yapılabilir (müşteri ve personel için aynı — OD-17):

  | Başvuru statüsü | Değiştirilebilir evrak statüleri |
  |---|---|
  | `AWAITING_DOCUMENTS` | `NOT_UPLOADED`, `UPLOADED` |
  | `REVISION_REQUIRED` | `NOT_UPLOADED`, `UPLOADED`, `REVISION_REQUIRED` |
  | Diğer tüm statüler | Hiçbiri |

  `APPROVED` ve `PENDING_REVIEW` evraklar **hiçbir zaman** müşteri tarafından değiştirilemez.
- **BR-45** Kural, hem upload token üretiminde hem de yükleme tamamlanma kaydında (transaction + satır kilidi ile) yeniden kontrol edilir. Arada statü değiştiyse yüklenen dosya kabul edilmez ve silinir (race condition koruması).
- **BR-46** Güvenlik taraması `CLEAN` olmayan dosya: görüntülenemez, indirilemez, tamamlanma oranına sayılmaz, gönderime uygun sayılmaz. `REJECTED` dosya müşteriye anlaşılır Türkçe mesajla gösterilir ve güncel setten çıkarılır.
- **BR-47** İnceleme yapılmamış (hiçbir `document_review_files` kaydı olmayan) bir dosya kaldırıldığında blob hemen silinir. İncelenmiş bir dosya kaldırılırsa/değiştirilirse geçmiş versiyon olarak saklanır ve saklama politikasına tabidir ([DATA_PRIVACY.md](DATA_PRIVACY.md)).

## 6. Gönderim ve İnceleme

- **BR-50** "İncelemeye gönder" koşulları (sunucu tarafında):
  1. Başvuru statüsü `AWAITING_DOCUMENTS` veya `REVISION_REQUIRED`.
  2. Her **zorunlu** evrak için güncel setinde ≥1 dosya var ve **tümü** `scan_status = CLEAN`.
  3. Hiçbir evrakın güncel setinde `scan_status ∈ {PENDING, ERROR}` dosya yok (taraması süren dosya varken gönderim engellenir).
  4. Hiçbir evrak (zorunlu veya isteğe bağlı) `REVISION_REQUIRED` statüsünde kalmamış (düzeltilmeli veya — isteğe bağlıysa — tüm dosyaları kaldırılmalı).
- **BR-51** İsteğe bağlı evrakların eksikliği gönderimi engellemez.
- **BR-52** Gönderimde: başvuru → `UNDER_REVIEW`; `UPLOADED` statüsündeki evraklar → `PENDING_REVIEW`; `APPROVED` evraklar `APPROVED` kalır; `NOT_UPLOADED` (isteğe bağlı) değişmez.
- **BR-53** Gönderim idempotenttir: aynı başvuru iki kez gönderilirse ikinci istek statü/versiyon kontrolünde başarısız olur ve "Başvurunuz zaten incelemede" bilgisi döner; yan etki oluşmaz.
- **BR-54** Personel müşteri adına gönderebilir; geçmişte aktör `USER` + "müşteri adına" bayrağı ile kaydedilir.
- **BR-55** Personel yalnızca `UNDER_REVIEW` başvurudaki `PENDING_REVIEW` evrakları inceleyebilir. Karar: `APPROVED` veya `REVISION_REQUIRED`.
- **BR-56** `REVISION_REQUIRED` kararında **müşteriye yönelik açıklama zorunludur** (min 10, maks 1000 karakter). Bu açıklama müşteri tarafından görülür.
- **BR-57** İnceleme kaydı, incelenen dosya setini (`document_review_files`) saklar; böylece hangi versiyonun onaylandığı/reddedildiği izlenir.
- **BR-58** Bir evrağın kararı, başvuru `UNDER_REVIEW` iken ve başvuru statüsü değişmeden önce aynı personel veya başka personel tarafından değiştirilebilir (yeni review kaydı; eski kayıt silinmez). Eşzamanlı kararlar optimistic locking ile çözülür (§9).
- **BR-59** "Düzeltmeye geri gönder" (`UNDER_REVIEW → REVISION_REQUIRED`): hiç `PENDING_REVIEW` evrak kalmamış **ve** ≥1 evrak `REVISION_REQUIRED`.
- **BR-60** "Evrakları onayla" (`UNDER_REVIEW → DOCUMENTS_APPROVED`): hiç `PENDING_REVIEW` / `REVISION_REQUIRED` kalmamış, tüm zorunlu evraklar `APPROVED`, yüklenmiş tüm isteğe bağlı evraklar `APPROVED`.
- **BR-61** Bu iki geçiş **manueldir** (personel butonla tetikler; D-027). Otomatik geçiş yoktur.

## 7. Versiyonlama

- **BR-70** Dosya kayıtları değiştirilemez (immutable); yalnızca `upload_status`, `scan_status`, `removed_at/by`, `blob_deleted_at` alanları kontrollü olarak güncellenir.
- **BR-71** Versiyon numarası evrak gereksinimi başına artan tam sayıdır (`version_number`); yüklemeyle birlikte atanır.
- **BR-72** Bir evrağın geçmişi: tüm dosya kayıtları + tüm review kayıtları (karar, gerekçe, inceleyen, tarih, incelenen dosyalar).
- **BR-73** Eski dosyalar süresiz saklanmaz; saklama süreleri [DATA_PRIVACY.md](DATA_PRIVACY.md) §4'te (Proposed, OD-06).

## 8. Arama ve Görüntüleme

- **BR-80** Arama Türkçe karakter duyarsızdır: `search_text` alanı ad + soyad + e-posta + telefon (E.164 ve `0`'lı yerel biçim) içerir ve şu katlama ile üretilir: Türkçe kurallarla küçük harf (`İ→i`, `I→ı`), ardından `ı→i, ğ→g, ü→u, ş→s, ö→o, ç→c`. Sorgu metni de aynı fonksiyondan geçer. Başvuru numarası ayrıca birebir/prefix aranır.
- **BR-81** Tüm zaman damgaları `timestamptz` (UTC) saklanır; arayüzde `Europe/Istanbul` ile `dd.MM.yyyy HH:mm` biçiminde gösterilir.

## 9. Eşzamanlılık

- **BR-90** `applications` ve `application_document_requirements` tablolarında `version` (integer) kolonu ile optimistic locking. Statü değiştiren her işlem `WHERE id = ? AND version = ?` ile güncellenir; etkilenen satır yoksa "Bu kayıt başka biri tarafından güncellendi, lütfen sayfayı yenileyin" hatası döner.
- **BR-91** Gönderim, inceleme kararı ve başvuru statü geçişleri tek transaction içinde başvuru satırını `SELECT ... FOR UPDATE` ile kilitler; guard'lar kilit altında değerlendirilir.
- **BR-92** Yükleme tamamlama (callback veya client confirm) idempotenttir: blob pathname unique'tir; ikinci çağrı mevcut kaydı döndürür.

## 10. Müşteri Erişimi

- **BR-100** Her başvurunun aynı anda **en fazla bir aktif** erişim bağlantısı vardır (OD-18). Yenileme eski bağlantıyı iptal eder ve yenisini üretir.
- **BR-101** Bağlantı iptali veya yenilenmesi, o bağlantıyla açılmış **tüm müşteri oturumlarını** geçersiz kılar.
- **BR-102** Bağlantı süre sonu yapılandırılabilir (Proposed varsayılan: oluşturma/yenilemeden itibaren 180 gün, OD-04). Süresi dolan bağlantı "Bağlantının süresi doldu, lütfen CS Global ile iletişime geçin" mesajı gösterir ve hiçbir veri içermez.
- **BR-103** `COMPLETED` / `CANCELLED` başvurularda müşteri paneli **salt okunur** çalışır. Bağlantı, terminal statüden itibaren Proposed 30 gün sonra otomatik geçersiz olur (OD-04).
- **BR-104** Müşteri doğrulama modeli: güvenli bağlantı + e-posta OTP + süreli müşteri oturumu (Proposed, D-012 / OD-01). Ayrıntı [SECURITY.md](SECURITY.md) §4.
- **BR-105** Link önizleme botları (WhatsApp vb.) bağlantıyı GET ile açtığında OTP gönderilmez, token tüketilmez, veri dönmez. OTP yalnızca kullanıcının butonla başlattığı POST ile gönderilir.

## 11. İlerleme Göstergeleri

### 11.1 Başvuru süreci (Application Progress)
5 adım: **1 Kayıt Oluşturuldu → 2 Evrak Yükleme → 3 Evrak İnceleme → 4 Başvuru İşlemleri → 5 Süreç Tamamlandı**

| Statü | Aktif adım | Gösterim |
|---|---|---|
| `AWAITING_DOCUMENTS` | 2 | 1 tamam, 2 aktif |
| `UNDER_REVIEW` | 3 | 1–2 tamam, 3 aktif |
| `REVISION_REQUIRED` | 2 | 1 tamam, 2 aktif + **uyarı rozeti "Düzeltme bekleniyor"** (3 "tekrar incelenecek" olarak soluk) |
| `DOCUMENTS_APPROVED` | 4 | 1–3 tamam, 4 bekliyor |
| `IN_PROCESS` | 4 | 1–3 tamam, 4 aktif |
| `COMPLETED` | 5 | Tümü tamam — metin: "CS Global danışmanlık süreciniz tamamlandı." (vize sonucu ifadesi **yok**) |
| `CANCELLED` | — | Gösterge yerine nötr bilgi kartı: "Bu başvuru iptal edilmiştir." |

Gösterge hiçbir zaman vize onay olasılığı veya sonuç garantisi ifade etmez.

### 11.2 Evrak tamamlanma (Document Completion Progress)
- **BR-110** Payda: başvurudaki **zorunlu** evrak sayısı. İsteğe bağlı evraklar paydaya girmez, oranı düşürmez.
- **BR-111** Pay ("yüklendi" sayılır): güncel setinde ≥1 dosya bulunan ve tüm güncel dosyaları `CLEAN` olan zorunlu evraklar; **hariç**: statüsü `REVISION_REQUIRED` olanlar.
  - Taraması `PENDING` → sayılmaz ("Kontrol ediliyor" etiketi).
  - Taraması `REJECTED`/`ERROR` → sayılmaz.
  - `APPROVED` → sayılır.
- **BR-112** Ayrı bir "onaylanan" göstergesi: `APPROVED` zorunlu evrak / zorunlu evrak toplamı. Yükleme ve onay ilerlemesi ayrı gösterilir.
- **BR-113** Metin örneği: "3 / 5 zorunlu evrak yüklendi · %60". Yüzde aşağı yuvarlanır (%99,9 → %99; %100 yalnızca tam tamamlanmada).
- **BR-114** Zorunlu evrak yoksa (tümü isteğe bağlı): gösterge "Zorunlu evrak bulunmuyor" olarak gösterilir ve gönderim yalnızca BR-50 (3)(4) ile kısıtlanır.

## 12. Yorumlar ve Notlar

- **BR-120** İki ayrı veri türü, iki ayrı tablo: `document_comments` (müşteriye görünür) ve `application_internal_notes` (yalnızca personel).
- **BR-121** Müşteri tarafı veri erişim fonksiyonları `application_internal_notes` tablosunu **hiçbir koşulda sorgulamaz**; müşteri DTO'ları whitelist alanlarla oluşturulur (bkz. [ARCHITECTURE.md](ARCHITECTURE.md) §5).
- **BR-122** Müşteri yorum yazamaz (MVP). Müşteri yalnızca personelin müşteriye görünür yorumlarını ve düzeltme gerekçelerini görür.
- **BR-123** Yorum/not düzenleme ve silme MVP'de yoktur (değiştirilemez kayıt); yanlış yorum yeni yorumla düzeltilir. (Proposed)

## 13. Personel Hesapları

- **BR-130** Kullanıcı adı: 3–30 karakter, `a-z 0-9 . _`, küçük harfe normalize, benzersiz.
- **BR-131** Şifre: min 12 karakter (Better Auth varsayılanı 8; politika gereği yükseltilir — Proposed), maks 128.
- **BR-132** Pasifleştirme (Better Auth `banUser`) tüm oturumları iptal eder. Pasif kullanıcı giriş yapamaz. Hesaplar silinmez (audit bütünlüğü).
- **BR-133** ADMIN kendi hesabını pasifleştiremez ve kendi rolünü düşüremez; sistemde en az bir aktif ADMIN bulunmalıdır.
- **BR-134** EMPLOYEE kendi rolünü/yetkisini değiştiremez, ADMIN oluşturamaz.

## 14. Arşivleme

- **BR-140** Arşivleme (`archived_at`) yalnızca ADMIN tarafından ve yalnızca `COMPLETED` veya `CANCELLED` başvurular için yapılır (Proposed). Arşivlenen başvuru varsayılan listede gizlenir, filtreyle görüntülenir, değiştirilemez. Arşivden çıkarma ADMIN yetkisindedir.
- **BR-141** Arşiv ≠ silme. Kalıcı silme saklama politikası kapsamında ayrı bir süreçtir ([DATA_PRIVACY.md](DATA_PRIVACY.md) §5).
