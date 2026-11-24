# Ürün Gereksinimleri (PRD)

> Kaynak: PHASE 00 brief'i. İş kuralı ayrıntıları için [BUSINESS_RULES.md](BUSINESS_RULES.md), yetkiler için [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) esas alınır.
> Gereksinim kimlikleri (`FR-xx`, `NFR-xx`) test senaryolarında referans verilir.

## 1. Roller

| Rol | Tanım |
|---|---|
| **ADMIN** | Sistem yöneticisi. Tüm yetkiler + hizmet, çalışan, ayar, audit log yönetimi. |
| **EMPLOYEE** | Çalışan. Başvuru, müşteri, evrak, inceleme işlemleri. Yönetim işlemleri yok. |
| **CUSTOMER** | Hesapsız. Yalnızca kendi başvurusuna, bağlantı + doğrulama ile erişir. |

Çalışan görünürlük kapsamı (tüm başvurular / yalnızca atananlar) bir **ürün kararıdır** (OD-03). Mimari her ikisini destekler.

## 2. Fonksiyonel Gereksinimler

### 2.1 Kimlik doğrulama (personel)
- **FR-01** Personel kullanıcı adı + şifre ile giriş yapar. Herkese açık kayıt ekranı yoktur.
- **FR-02** Yeni personel hesabını yalnızca ADMIN oluşturur.
- **FR-03** İlk ADMIN güvenli bir bootstrap komutu ile oluşturulur; hardcoded şifre yoktur.
- **FR-04** ADMIN çalışanı pasifleştirebilir; pasif hesabın tüm oturumları anında geçersiz olur.
- **FR-05** ADMIN çalışan şifresini sıfırlayabilir (geçici şifre + ilk girişte zorunlu değişim — D-020).
- **FR-06** ADMIN bir çalışanın aktif oturumlarını sonlandırabilir.
- **FR-07** Kullanıcı kendi şifresini değiştirebilir.

### 2.2 Hizmet ve evrak şablonu yönetimi (ADMIN)
- **FR-10** Hizmet oluşturma, düzenleme, aktif/pasif yapma, sıralama.
- **FR-11** Hizmete evrak gereksinimi ekleme/düzenleme/pasifleştirme/sıralama; zorunlu/isteğe bağlı, açıklama, talimat, maks dosya boyutu, maks dosya sayısı.
- **FR-12** Pasif hizmet yeni başvuruda seçilemez; mevcut başvurular etkilenmez.
- **FR-13** İlk sürümde yalnızca PDF. Varsayılan maksimum dosya boyutu 10 MB (ayarlanabilir).

### 2.3 Başvuru oluşturma (ADMIN, EMPLOYEE)
- **FR-20** Form: İsim*, Soyisim*, Telefon*, E-posta*, Hizmet* (aktif hizmetlerden combobox), Şirket içi not (opsiyonel).
- **FR-21** Olası mükerrer müşteri (aynı telefon veya e-posta) tespit edilirse çalışana gösterilir; çalışan **açıkça** "mevcut müşteriye bağla" veya "yeni müşteri oluştur" seçer. Otomatik birleştirme yapılmaz.
- **FR-22** Tek transaction içinde: müşteri (oluştur/bağla) → başvuru → başvuru numarası → erişim bağlantısı → evrak snapshot → başlangıç statüsü `AWAITING_DOCUMENTS` → oluşturan kullanıcı → statü geçmişi → audit log.
- **FR-23** Başvuru numarası `CS-YYYY-NNNNNN`, eşzamanlı oluşturmada çakışmasız.
- **FR-24** Sonuç ekranı: başarı mesajı, ad-soyad, başvuru no, hizmet, bağlantı, "Bağlantıyı kopyala", "WhatsApp ile paylaş" (`https://wa.me/?text=` + hazır mesaj; API entegrasyonu yok), "Başvuru detayına git".

### 2.4 Başvuru yönetimi
- **FR-30** Listeleme: ad, telefon, e-posta, başvuru numarası ile arama (Türkçe karakter duyarsız); hizmet, statü, tarih aralığı filtreleri; server-side sayfalama.
- **FR-31** Detay: müşteri bilgileri, başvuru bilgileri, statü, evrak listesi, PDF görüntüle/indir, müşteri adına yükleme, inceleme, yorumlar, şirket içi notlar, statü geçmişi, bağlantı yönetimi, işlem geçmişi.
- **FR-32** Müşteri bilgilerini düzenleme (ADMIN, EMPLOYEE).
- **FR-33** Arşivleme (yalnızca ADMIN). Arşiv statüden bağımsız bir bayraktır.
- **FR-34** Bağlantıyı görüntüle/kopyala (ADMIN, EMPLOYEE); iptal et ve yenile (yetkiye göre — bkz. matris).
- **FR-35** Şirket içi not ekleme (ADMIN, EMPLOYEE).

### 2.5 Müşteri paneli
- **FR-40** Müşteri bağlantıyı açar → (önerilen) e-postasına gönderilen 6 haneli kodu girer → süreli müşteri oturumu açılır → token URL'den kaldırılır.
- **FR-41** Doğrulama tamamlanmadan hiçbir kişisel veri / belge / başvuru detayı gösterilmez.
- **FR-42** Ekran: logo, hoş geldiniz, ad-soyad, telefon, e-posta, başvuru no, hizmet, oluşturulma tarihi, güncel statü, süreç göstergesi, evrak tamamlanma göstergesi, evrak kartları, "İncelemeye gönder", iletişim alanı.
- **FR-43** Evrak kartı: başlık, açıklama, talimat, zorunlu/isteğe bağlı, durum, PDF yükleme, dosya adı, boyut, yükleme tarihi, görüntüle, (izinliyse) değiştir/kaldır, düzeltme açıklaması.
- **FR-44** Gerçek yükleme ilerlemesi, Türkçe hata mesajları, çift gönderim engeli; tamamlanan yüklemeler sayfa yenilemede kaybolmaz.
- **FR-45** Müşteri şirket içi notları, personele özel açıklamaları, audit kayıtlarını **göremez**.

### 2.6 İnceleme ve iş akışı
- **FR-50** Müşteri (veya müşteri adına çalışan) tüm zorunlu evraklar güvenlik kontrolünden geçmiş şekilde yüklendiğinde incelemeye gönderir.
- **FR-51** Çalışan her evrağı bağımsız onaylar veya düzeltme ister (müşteriye yönelik açıklama zorunlu).
- **FR-52** Çalışan tüm evrakları inceledikten sonra başvuruyu düzeltmeye geri gönderir veya evrakları onaylar.
- **FR-53** Müşteri düzeltilen evrakları yükleyip yeniden gönderir; onaylı evraklar kilitlidir.
- **FR-54** `DOCUMENTS_APPROVED` → `IN_PROCESS` → `COMPLETED`; her aşamada iptal mümkündür (bkz. [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)).
- **FR-55** Çalışanın müşteri adına yaptığı işlemler geçmişte açıkça belirtilir.

### 2.7 Yönetim
- **FR-60** Dashboard sayaçları (toplam, aktif, evrak bekleyen, incelemede, düzeltme bekleyen, işlemde, tamamlanan), son başvurular, inceleme bekleyenler.
- **FR-61** Audit log listesi: filtre (işlem türü, aktör, tarih, kaynak) + sayfalama (yalnızca ADMIN).
- **FR-62** Ayarlar: şirket bilgileri, iletişim bilgileri, müşteri paneli iletişim alanı, dosya limitleri, bağlantı güvenlik ayarları, saklama politikaları (yalnızca ADMIN).

## 3. Fonksiyonel Olmayan Gereksinimler

| ID | Gereksinim |
|---|---|
| NFR-01 | Arayüz Türkçe; kod, dosya, DB alanları İngilizce. |
| NFR-02 | Müşteri paneli mobile-first; 320–1440 px arası yatay taşma yok; dokunma alanı ≥ 44×44 px. |
| NFR-03 | WCAG 2.2 AA hedefi. |
| NFR-04 | Tüm tarih/saat UTC saklanır, `Europe/Istanbul` ile gösterilir. |
| NFR-05 | Her hassas okuma/yazma sunucu tarafında yeniden yetkilendirilir; proxy tek savunma değildir. |
| NFR-06 | Hassas veri hiçbir paylaşılan cache katmanında tutulmaz. |
| NFR-07 | Token, şifre, OTP, session secret, PDF içeriği loglara yazılmaz. |
| NFR-08 | Server-side sayfalama; listeleme sorguları index'li; N+1 yok. |
| NFR-09 | Stateless deployment (serverless uyumlu); bellek içi rate limit / yerel dosya sistemi production çözümü olarak kullanılmaz. |
| NFR-10 | Gerçek müşteri verisi dev/test/preview ortamlarında kullanılmaz. |
| NFR-11 | Safari iOS, Android Chrome ve WhatsApp in-app tarayıcısı desteklenir. |
| NFR-12 | Production, güvenlik blocker'ları ve hukuki değerlendirme tamamlanmadan açılmaz. |

## 4. Kullanıcı Hikâyeleri (özet)

1. **Çalışan olarak**, müşterinin bilgilerini girip hizmet seçerek bir başvuru oluşturmak ve müşteriye bağlantıyı WhatsApp ile göndermek istiyorum.
2. **Müşteri olarak**, telefonumdan bağlantıyı açıp kısa bir doğrulamadan sonra hangi evrakları nasıl yükleyeceğimi görmek istiyorum.
3. **Müşteri olarak**, PDF'lerimi yükleyip ilerlemeyi görmek ve hepsini tek tuşla incelemeye göndermek istiyorum.
4. **Çalışan olarak**, gönderilen evrakları tek tek inceleyip onaylamak veya düzeltme istemek istiyorum.
5. **Müşteri olarak**, hangi evrakın neden düzeltilmesi gerektiğini açıkça görmek ve yalnızca onu yeniden yüklemek istiyorum.
6. **Yönetici olarak**, hizmetleri ve bu hizmetlerin evrak listesini koddan bağımsız yönetmek istiyorum.
7. **Yönetici olarak**, kimin hangi işlemi ne zaman yaptığını görmek istiyorum.

## 5. Kabul Kriterleri

Fazlara göre kabul kriterleri [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), test senaryoları [TESTING_STRATEGY.md](TESTING_STRATEGY.md) içindedir.
