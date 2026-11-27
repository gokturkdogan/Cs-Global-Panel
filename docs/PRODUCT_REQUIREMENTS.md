# Ürün Gereksinimleri (PRD)

> Kaynak: PHASE 00 brief'i + Product Owner kararları OD-01…OD-23 (2026-11-24, [DECISION_LOG.md](DECISION_LOG.md)). Ayrıntılar: [BUSINESS_RULES.md](BUSINESS_RULES.md), [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).
> Ürün yaklaşımı: basit, anlaşılır, **sıfır aylık maliyet hedefli** (Backblaze B2 hariç: yıllık ~10 USD — OD-26), harici servis ihtiyacı minimum, mevcut WhatsApp operasyonunu kolaylaştıran bir MVP. Gelecek ihtimaller için kod/tablo/servis oluşturulmaz.

## 1. Roller

| Rol | Tanım |
|---|---|
| **ADMIN** | Tek ADMIN hesabı. EMPLOYEE ile **birebir aynı** uygulama yetkileri (OD-24); fark yalnızca hesap türü ve işlem geçmişindeki kimliktir. |
| **EMPLOYEE** | Tek EMPLOYEE hesabı. Uygulamanın **tüm** işlevlerine ADMIN ile eşit erişir (atama yok — OD-03). |
| **CUSTOMER** | Hesapsız; yalnızca kendisine gönderilen bağlantı ile kendi başvurusuna erişir (OD-01). |

## 2. Fonksiyonel Gereksinimler

### 2.1 Personel kimlik doğrulama
- **FR-01** Kullanıcı adı + şifre ile giriş. Kayıt, "Şifremi unuttum", self-servis sıfırlama **yok**.
- **FR-02** Yalnızca iki şirket hesabı vardır (bir ADMIN, bir EMPLOYEE); üçüncü hesap oluşturulamaz (OD-24).
- **FR-03** İki hesap yerel CLI ile güvenli şekilde oluşturulur (`pnpm auth:bootstrap`, gizli şifre girişi); varsayılan veya hardcoded şifre yok.
- **FR-04** — (kaldırıldı: hesap pasifleştirme — OD-24)
- **FR-05** Şifre yalnızca yerel CLI ile sıfırlanır (`pnpm auth:reset-password`); ilgili hesabın tüm oturumları sonlanır, diğer hesap etkilenmez.
- **FR-06** — (kaldırıldı: uygulama içi oturum sonlandırma yönetimi — OD-24)
- **FR-07** Hiçbir hesap uygulama içinden şifre, kullanıcı adı veya rol değiştiremez; hesap yönetim ekranı yoktur. İlk girişte zorunlu şifre değişimi yok.
- **FR-08** Şifre min 8 karakter; oturum en fazla 7 gün, uzatılmaz; hareketsizlik zaman aşımı yok (sabit).

### 2.2 Hizmet ve evrak şablonu yönetimi (personel)
- **FR-10** Hizmet oluşturma, düzenleme, aktif/pasif, sıralama.
- **FR-11** Hizmete evrak gereksinimi ekleme/düzenleme/pasifleştirme/sıralama: başlık, açıklama, talimat, zorunlu/isteğe bağlı.
- **FR-12** Pasif hizmet yeni başvuruda seçilemez; mevcut başvurular etkilenmez.
- **FR-13** Dosya kuralları tüm sistemde sabit: yalnızca PDF, dosya başına 10 MB, evrak başına 1 aktif PDF (panelden değiştirilemez).

### 2.3 Başvuru oluşturma (personel)
- **FR-20** Form: İsim*, Soyisim*, Telefon*, E-posta*, Hizmet* (aktif hizmetler combobox), Şirket içi not.
- **FR-21** Müşteri bilgileri her başvuruda yeniden girilir; müşteri profili, eşleştirme, mükerrer kontrolü, birleştirme **yok** (OD-10).
- **FR-22** Tek transaction: başvuru (müşteri bilgileriyle) → numara → bağlantı → evrak snapshot → `AWAITING_DOCUMENTS` → oluşturan → geçmiş → audit.
- **FR-23** Başvuru numarası `CS-YYYY-NNNNNN`, eşzamanlı oluşturmada çakışmasız.
- **FR-24** Sonuç ekranı: başarı mesajı, ad-soyad, başvuru no, hizmet, bağlantı, "Bağlantıyı kopyala", "WhatsApp ile paylaş", "Başvuru detayına git".
- **FR-25** WhatsApp paylaşımı: müşterinin telefonu ve kişiselleştirilmiş sabit mesajla WhatsApp'ı açar (BR-161); onay penceresinde hedef ad ve telefon gösterilir; gönderimi çalışan manuel yapar; API/otomatik gönderim/şablon düzenleme yok.

### 2.4 Başvuru yönetimi
- **FR-30** Tek liste (arşiv yok — OD-23): ad, telefon, e-posta, başvuru no ile arama (Türkçe karakter duyarsız); statü (Tüm Başvurular + 7 statü), hizmet, tarih filtreleri; server-side sayfalama.
- **FR-31** Detay: müşteri bilgileri, başvuru bilgileri, hizmet, statü, evraklar (aktif dosya + versiyon geçmişi), PDF görüntüle/indir, müşteri adına yükleme, inceleme, yorumlar, iç notlar, statü geçmişi, bağlantı, işlem geçmişi.
- **FR-32** Müşteri bilgilerini düzenleme (yalnızca o başvuruyu etkiler).
- **FR-33** Bağlantı yönetimi (iki hesap eşit): görüntüle, kopyala, WhatsApp ile paylaş, iptal, yenile, iptal edilmişin yerine yeni oluştur — iptal/yenileme onay pencereli ve audit'li.
- **FR-34** Şirket içi not ekleme.
- **FR-35** İptal (personel; gerekçeli).
- **FR-36** Personel: iptal edilmiş/tamamlanmış başvuruyu yeniden açma ve izin verilen önceki aşamalara döndürme (gerekçeli; evrak/onay/geçmiş korunur; seçilen evrakların onayı geçersiz kılınabilir).
- **FR-37** Personel: başvuruyu kalıcı olarak silme (onay penceresi, geri dönüşsüz uyarısı, bağlantı + oturumlar + tüm dosya versiyonları + kayıtlar; minimum audit).

### 2.5 Müşteri paneli
- **FR-40** Geçerli bağlantıyı açan müşteri **ek adım olmadan** panele erişir; bağlantı 7 günlük bir oturum oluşturur ve token'sız adrese yönlendirir. Oturum dolunca aynı bağlantıyla yeniden erişilir.
- **FR-41** Bağlantı süresizdir; yalnızca iptal, yenileme veya başvuru silme ile geçersizleşir.
- **FR-42** Ekran: geçici metin logo, hoş geldiniz, ad-soyad, telefon, e-posta, başvuru no, hizmet, oluşturma tarihi, statü, süreç göstergesi, evrak tamamlanma göstergesi, evrak kartları, "İncelemeye gönder", sabit şirket iletişim bilgileri (telefon, WhatsApp).
- **FR-43** Evrak kartı: başlık, açıklama, talimat, zorunlu/isteğe bağlı, durum, PDF yükleme, aktif dosya adı/boyutu/tarihi, görüntüle/indir, (izinliyse) değiştir/kaldır, düzeltme açıklaması, yorumlar.
- **FR-44** Gerçek yükleme ilerlemesi, Türkçe hata mesajları, çift gönderim engeli; tamamlanan yüklemeler yenilemede kaybolmaz.
- **FR-45** Müşteri iç notları, personel açıklamalarını, audit kayıtlarını, eski dosya versiyonlarını göremez.
- **FR-46** `COMPLETED`/`CANCELLED` (ve inceleme/işlem aşamalarında) panel salt okunurdur.

### 2.6 İnceleme ve iş akışı
- **FR-50** Gönderim: tüm zorunlu evrakların aktif dosyası var, devam eden yükleme yok, düzeltme bekleyen evrak kalmamış.
- **FR-51** Personel her evrağı bağımsız onaylar/düzeltme ister (müşteri açıklaması zorunlu); karar incelenen dosya versiyonuna bağlıdır.
- **FR-52** Tüm evraklar incelendikten sonra: düzeltmeye geri gönder veya evrakları onayla.
- **FR-53** Müşteri düzeltip yeniden gönderir; onaylı evraklar yeniden yükleme gerektirmez.
- **FR-54** `DOCUMENTS_APPROVED` → `IN_PROCESS` → `COMPLETED`.
- **FR-55** `UNDER_REVIEW` sırasında müşteri evrak değiştiremez; personel müşteri adına yükleyip değiştirebilir — yeni versiyon yeniden incelemeye girer, eski onay aktarılmaz.
- **FR-56** Müşteri adına yapılan işlemler geçmişte açıkça belirtilir.

### 2.7 Yönetim
- **FR-60** Dashboard: toplam, aktif, evrak bekleyen, incelemede, düzeltme bekleyen, işlemde, tamamlanan; son başvurular; inceleme bekleyenler.
- **FR-61** Audit log sayfası (personel, iki hesap eşit): filtre + sayfalama.
- Ayarlar sayfası **yok** (şirket iletişim bilgileri, limitler, şifre/oturum parametreleri sabit yapılandırmadır).

## 3. Fonksiyonel Olmayan Gereksinimler

| ID | Gereksinim |
|---|---|
| NFR-01 | Arayüz Türkçe; kod, dosya, DB alanları İngilizce. |
| NFR-02 | Müşteri paneli mobile-first; 320–1440 px arası yatay taşma yok; dokunma alanı ≥ 44×44 px. |
| NFR-03 | WCAG 2.2 AA hedefi. |
| NFR-04 | UTC saklama, `Europe/Istanbul` gösterim. |
| NFR-05 | Her hassas okuma/yazma sunucuda yeniden yetkilendirilir. |
| NFR-06 | Hassas veri paylaşılan cache'te tutulmaz. |
| NFR-07 | Token, şifre, cookie değeri, PDF içeriği loglanmaz. |
| NFR-08 | Server-side sayfalama; index'li sorgular; N+1 yok. |
| NFR-09 | Stateless/serverless uyumlu; bellek içi rate limit ve yerel dosya sistemi production'da kullanılmaz. |
| NFR-10 | Gerçek müşteri verisi dev/test/preview/demo'da kullanılmaz. |
| NFR-11 | Safari iOS, Android Chrome, WhatsApp in-app tarayıcısı desteklenir. |
| NFR-12 | IP, user-agent, cihaz bilgisi uygulama DB'sinde saklanmaz (OD-09). |
| NFR-13 | Aylık altyapı maliyeti hedefi 0; ücretli servis kullanıcı onayı olmadan eklenmez (OD-12). **İstisna (OD-26, 2026-11-27):** Backblaze B2 depolama/trafik için yıllık ~10 USD bütçe; uygulama depolama hedefi 100 GB (uyarı 90 GB), PDF başına 10 MiB. Diğer altyapılarda hedef 0 sürer. |
| NFR-14 | Production; güvenlik risk kabulleri, hukuki değerlendirme ve ticari kullanıma uygun altyapı olmadan açılmaz (SECURITY §11). |

## 4. Kullanıcı Hikâyeleri (özet)

1. **Personel olarak**, müşteri bilgilerini girip hizmet seçerek başvuru oluşturmak ve kişiselleştirilmiş mesajla bağlantıyı WhatsApp'tan göndermek istiyorum.
2. **Müşteri olarak**, bağlantıya dokununca hiçbir şey girmeden kendi başvuru panelimi görmek istiyorum.
3. **Müşteri olarak**, PDF'lerimi telefonumdan yükleyip ilerlemeyi görmek ve tek tuşla incelemeye göndermek istiyorum.
4. **Personel olarak**, evrakları tek tek inceleyip onaylamak veya düzeltme istemek; gerekirse müşteri adına doğru belgeyi yüklemek istiyorum.
5. **Müşteri olarak**, hangi evrakın neden düzeltilmesi gerektiğini görüp yalnızca onu yeniden yüklemek istiyorum.
6. **Yönetici olarak**, hizmetleri ve evrak listelerini koddan bağımsız yönetmek istiyorum.
7. **Yönetici olarak**, gerektiğinde başvuruyu gerekçeyle geri almak/yeniden açmak ve talep halinde kalıcı olarak silmek istiyorum.
8. **Yönetici olarak**, kimin hangi işlemi ne zaman yaptığını görmek istiyorum.

## 5. Kapsam Dışı (MVP)

Önceki brief listesi (WhatsApp Business API, ödeme, faturalama, muhasebe, AI/OCR, PDF oluşturma/birleştirme, e-imza, konsolosluk/resmî entegrasyonlar, randevu, native mobil, canlı sohbet, multi-tenant, abonelik, finansal raporlama, çoklu dil, dark mode) **ve** ürün kararlarıyla çıkarılanlar: müşteri hesabı/profili, müşteri eşleştirme/birleştirme, OTP (e-posta/SMS), e-posta entegrasyonu, çalışan atama, arşivleme, ayarlar sayfası, otomatik saklama/silme, otomatik bağlantı süre sonu, dinamik dosya limitleri, evrak başına çoklu aktif dosya, harici antivirüs, self-servis şifre işlemleri, zorunlu ilk şifre değişimi, logo/iletişim/WhatsApp şablonu yönetimi, uygulamaya özel yedekleme/geri yükleme/felaket kurtarma altyapısı (OD-27 — sağlayıcıların yerleşik özellikleri sağlayıcı politikasına tabidir; veri kaybı kalan riski kullanıcı kabulündedir).

## 6. Kabul Kriterleri

Fazlara göre: [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md); test senaryoları: [TESTING_STRATEGY.md](TESTING_STRATEGY.md).
