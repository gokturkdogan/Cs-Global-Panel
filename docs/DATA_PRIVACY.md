# Veri Gizliliği ve KVKK

> ⚠️ **Bu doküman hukuki görüş değildir.** Teknik tasarımın KVKK (6698 sayılı Kanun) ve ikincil mevzuat açısından değerlendirilmesi gereken noktalarını listeler. Nihai kararlar için şirketin **KVKK konusunda uzman bir hukukçudan** görüş alması gerekir. Kullanılan sağlayıcılar (Vercel, Neon vb.) tek başına KVKK uyumu sağlamaz. Product Owner'ın OD-01…OD-23 kararlarını kabul etmesi, bu kararların hukuki uygunluğunun doğrulandığı anlamına gelmez.

## 1. Roller

| Taraf | Rol (değerlendirme önerisi) |
|---|---|
| CS Global | **Veri sorumlusu** |
| Hosting sağlayıcısı (geliştirme/demo: Vercel; production: açık — PB-01) | Veri işleyen |
| Veritabanı sağlayıcısı (Neon / production'da açık) | Veri işleyen |
| Object storage sağlayıcısı (**Backblaze B2**, EU Central — OD-25; production bucket'ı henüz yok) | Veri işleyen (DPA/ticari koşullar doğrulanmadı) |
| WhatsApp / Meta | Bağlantı ve kişiselleştirilmiş mesaj (ad, soyad, hizmet adı) bu kanaldan **personel tarafından manuel** gönderilir; şirketin mevcut WhatsApp kullanımı kapsamında değerlendirilmelidir |
| GitHub | Yalnızca kod; kişisel veri işlenmez |

E-posta sağlayıcısı ve antivirüs servisi **yoktur** (OD-07, OD-08) — bu kanallardan veri aktarımı olmaz.
Her veri işleyen ile veri işleme sözleşmesi (DPA) ve KVKK m.12 tedbirleri değerlendirilmeli; ücretsiz planlarda DPA ve sözleşme koşullarının sunulup sunulmadığı **doğrulanmalıdır** (Neon dokümanlarında DPA bilgisi bulunamadı — 2026-11-24).

## 2. İşlenen Veriler

| Kategori | Örnek | Kaynak | Amaç |
|---|---|---|---|
| Kimlik | Ad, soyad | Personel girer (her başvuruda yeniden — OD-10) | Hizmet sunumu |
| İletişim | Telefon, e-posta | Personel girer | İletişim (WhatsApp), kayıt |
| Belge içerikleri | Pasaport, kimlik, banka dökümü, iş sözleşmesi, ikametgâh | Müşteri / personel yükler | Danışmanlık hizmeti |
| İşlem güvenliği | Audit kayıtları (aktör ID, işlem, zaman) | Sistem | Hesap verebilirlik |
| Personel verisi | İki hesap: kullanıcı adı, görünen ad; e-posta alanı kişisel veri değildir (`<id>@staff.invalid`); giriş audit kayıtları | Yerel CLI (işletmeci) | Erişim yönetimi |

**Saklanmayanlar (OD-09):** IP adresi, hash'lenmiş/HMAC'lenmiş IP, user-agent, tarayıcı/cihaz/işletim sistemi bilgisi uygulama veritabanında tutulmaz. İstisna: rate limiting için HMAC'lenmiş, pencere süresiyle sınırlı, en fazla ~24 saat yaşayan **teknik anahtarlar** (DATABASE_SCHEMA §4.12) — audit veya izleme amacıyla kullanılmaz.
**Hosting sağlayıcısının altyapı logları** (request path, IP vb.) bu politikanın dışındadır ve sağlayıcının kendi politikasına tabidir; uygulama bunları kontrol edemez. Bu loglar müşteri bağlantı token'larını içerebilir (SECURITY §4).

**Özel nitelikli veri riski:** kimlik belgeleri din hanesi (eski kimlikler), sağlık raporları, biyometrik fotoğraf içerebilir; KVKK m.6 kapsamı ve ek tedbirler hukuki olarak değerlendirilmelidir.

## 3. Veri Minimizasyonu

- Müşteriden yalnızca ad, soyad, telefon, e-posta ve hizmet alınır; TC kimlik no, doğum tarihi vb. form alanı yoktur.
- Her başvuru bağımsızdır (OD-10): veri başvurular arasında birleştirilmez, profil oluşturulmaz. Sonuç: aynı kişinin verisi birden çok başvuruda **kopyalanmış** olarak bulunabilir; silme talebinde ilgili tüm başvuruların personel tarafından aranıp silinmesi gerekir (§5).
- Audit metadata'sında kişisel veri değeri yok; yalnızca ID ve değişen alan adları.
- Storage pathname'lerinde kişisel veri yok.
- Analytics / tracking yok.
- Dev/preview/demo ortamlarında **yalnızca sahte veri**.
- WhatsApp mesajı ad, soyad ve hizmet adını içerir (OD-21) — bu, mesajın Meta altyapısından geçtiği anlamına gelir; aydınlatma metninde değerlendirilmelidir.

## 4. Saklama (OD-06)

- MVP'de **otomatik saklama süresi yönetimi ve otomatik silme yoktur**: başvurular, müşteri bilgileri ve geçerli dosya versiyonları süreye bağlı olarak silinmez; panelde saklama ayarı yoktur.
- Veriler yalnızca **personelin manuel silme işlemiyle** silinir (iki hesap eşit — OD-24) (BR-150…BR-154).
- ⚠️ **Manuel silme tercihi, verilerin süresiz saklanması için hukuki dayanak oluşturmaz.** KVKK m.7 ve "Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik" kapsamındaki saklama ve periyodik imha yükümlülüklerini **şirket** takip etmeli; bir saklama ve imha politikası belirleyip personel silme aracıyla (iki hesap — OD-24) uygulamalıdır. Bu, production öncesi açık hukuki gereksinimdir (PB-03).
- Yalnızca **teknik** temizlik otomatiktir (müşteri verisi saklama politikası değildir): tamamlanmamış yüklemeler, reddedilen dosyaların blob'ları, sahipsiz storage nesneleri, süresi dolmuş personel oturumları, süresi dolmuş rate limit anahtarları. (PHASE 10: yarım kalan kalıcı silmeler otomatik tamamlanmaz; personel "Silme İşlemini Sürdür" ile devam ettirir — D-116. Teknik temizlik komutları elle çalıştırılır — D-105.)
- Yedekler: seçilen DB planının geri yükleme penceresi süresince silinen veri yedekte kalabilir (Neon Free: 6 saat; ücretli planlarda daha uzun) — aydınlatma metninde belirtilmeli. Ek uzun süreli yedek alınmaz.

## 5. Silme

- **Başvuru silme (personel):** bağlantı iptali + müşteri oturumlarının anında geçersizliği + tüm dosya versiyonlarının storage'dan fiziksel silinmesi ve doğrulanması + tüm başvuru kayıtlarının (yorum, not, inceleme, geçmiş dahil) DB'den silinmesi. Yalnızca `deleted_at` güncellemek gerçek silme sayılmaz; böyle bir alan yoktur.
- **Kısmi hata:** başvuru erişilemez durumda kalır, silme idempotent olarak yeniden denenir; DB kaydı storage boşaltılmadan silinmez (sahipsiz kişisel veri kalmaz). PHASE 10'da uygulandı (D-116, D-117); yeniden deneme personelin "Silme İşlemini Sürdür" isteğiyle yapılır (arka plan/zamanlanmış iş yoktur).
- **Audit:** yalnızca `APPLICATION_DELETION_REQUESTED` / `APPLICATION_DELETED` (başvuru ID'si, silen kullanıcı, dosya sayısı). Önceki audit kayıtları kişisel veri içermez ve korunur.
- **İlgili kişi talebi (m.11):** kişinin tüm başvuruları ad/telefon/e-posta araması ile personel tarafından bulunur ve personel tarafından silinir (müşteri eşleştirme olmadığından otomatik toplu silme yoktur). Yasal saklama yükümlülüğü olan veriler hukuki görüşe göre korunur.

## 6. Şifreleme

| Katman | Durum |
|---|---|
| Aktarım | TLS: tarayıcı ↔ hosting (HSTS), uygulama ↔ DB (`sslmode=verify-full` zorunlu; PHASE 02'de TLS 1.3 + doğrulanmış sertifika test edildi), uygulama ↔ storage (HTTPS zorunlu — `B2_ENDPOINT` yalnızca `https://s3.<bölge>.backblazeb2.com`) |
| Neon at-rest | AES-256 (Neon güvenlik dokümanı) |
| Backblaze B2 at-rest | **SSE-B2** (AES-256, sağlayıcı yönetimli anahtar) bucket varsayılanı + her yazmada `x-amz-server-side-encryption: AES256` istenir ve yanıtta doğrulanır (D-096). Canlı doğrulama `pnpm storage:verify` ile (kullanıcının anahtarı girmesine bağlı). SSE-C/müşteri anahtarı kullanılmaz. |
| Uygulama seviyesi | Bağlantı token'ı: HMAC hash + AES-256-GCM kopya (PHASE 06'da uygulandı — D-080); personel şifreleri scrypt |
| Belge uygulama seviyesi şifreleme | MVP'de yok; private bucket + yalnızca sunucu üzerinden yetkili erişim + sağlayıcı at-rest şifrelemesi (SSE-B2) |

## 7. Erişim Kayıtları ve Olay Müdahalesi

- Belge görüntüleme/indirme audit'lenir (aktör, zaman, dosya ID). IP/cihaz bilgisi olmadığından, bağlantının kimin elinde olduğu tespit edilemeyebilir (THREAT_MODEL TM-25).
- **Olay müdahale planı (özet, PHASE 13'te detaylandırılır):**
  1. Tespit (audit anomalisi, sağlayıcı bildirimi, müşteri şikâyeti).
  2. Sınırlama: ilgili bağlantıları iptal et/yenile, ilgili hesabın şifresini `pnpm auth:reset-password` ile sıfırla (oturumlarını sonlandırır), secret'ları döndür.
  3. Değerlendirme: etkilenen kişi/veri kapsamı (audit'ten).
  4. Bildirim: Kurul kararı gereği veri ihlallerinin **en kısa sürede ve en geç 72 saat içinde** Kurul'a ve makul sürede ilgili kişilere bildirilmesi — hukukçu ile teyit edilmelidir.
  5. Kök neden analizi; DECISION_LOG/CHANGELOG kaydı.

## 8. Yurt Dışına Veri Aktarımı

- Geliştirme/demo altyapısı (Vercel `fra1`, Neon `aws-eu-central-1`, Backblaze B2 `eu-central-003`) **Türkiye dışındadır**; sağlayıcılar ABD merkezlidir. Production sağlayıcısı henüz seçilmedi (PB-01) — seçimde veri konumu bir kriterdir.
- KVKK m.9 (2024 değişikliği): yeterlilik kararı, uygun güvenceler (ör. Kurul'un **standart sözleşmeleri** ve bildirim yükümlülüğü) veya arızi istisnalar. **Hangi dayanağın kullanılacağı ve ücretsiz plan sağlayıcılarının gerekli sözleşmeleri sağlayıp sağlamadığı hukukçu tarafından değerlendirilmelidir.**
- Türkiye'de barındırma alternatifi stack değişikliği gerektirebilir; kullanıcı onayı olmadan stack değiştirilmez.

## 9. Hukuki Değerlendirme Gerektiren Konular (PB-03)

1. Aydınlatma metni (m.10) — müşteri paneli ve WhatsApp mesajı bağlamında; personel için ayrı metin.
2. İşleme hukuki sebepleri (m.5/m.6); özel nitelikli veri durumu.
3. Yurt dışı aktarım dayanağı (m.9) ve sağlayıcı sözleşmeleri (ücretsiz planlar dahil).
4. VERBİS kayıt yükümlülüğü.
5. **Saklama ve imha politikası** — otomatik silme olmadığından şirketin manuel süreci (OD-06).
6. Veri ihlali bildirim prosedürü.
7. İlgili kişi başvuru süreci (m.11, m.13).
8. **Bearer bağlantı + OTP yokluğu + süresiz geçerliliğin** m.12 "uygun güvenlik düzeyi" yükümlülüğü açısından değerlendirilmesi (THREAT_MODEL TM-13).
9. Antivirüs taraması olmadan belge kabulünün m.12 açısından değerlendirilmesi.
10. Kişiselleştirilmiş WhatsApp mesajının (ad, soyad, hizmet) Meta üzerinden iletilmesi.
11. Personel cihaz ve erişim politikası (iki şirket hesabının da tüm başvurulara ve silme dahil tüm işlemlere erişimi, belgelerin yerel kopyaları).

## 10. Ortam İzolasyonu

| Ortam | DB | Storage | Secret | Veri |
|---|---|---|---|---|
| Development (PHASE 02 itibarıyla — D-059) | Neon Free projesinde **tek veritabanı** (`neondb`); testler ve seed aynı veritabanını kullanır | B2 bucket `cs-global-documents` (geliştirme); otomatik testler geçici yerel depolama | `.env.local` | Sahte |
| Preview / Demo | Neon Free non-prod projesi, preview branch'leri | Ayrı B2 bucket (oluşturulmadı) | Sağlayıcı Preview scope | Sahte |
| Production | **Ayrı proje/hesap** — sağlayıcı açık (PB-01) | **Ayrı store** | Production scope | Gerçek |

Ayrıntı: [DEPLOYMENT.md](DEPLOYMENT.md). ⚠️ D-059 (tek veritabanı) nedeniyle gerçek müşteri verisi bu veritabanına **girmeden önce** ayrı production veritabanı gerekir (PB-06, TM-43).

## 11. PHASE 06 Uygulama Notları
- Müşteri verisi (ad, soyad, E.164 telefon, küçük harf e-posta) yalnızca başvuru satırında; `search_text` aynı verinin katlanmış kopyasıdır (arama için, istemciye gönderilmez). Liste telefon/e-posta göstermez (veri minimizasyonu); detay personele gösterir.
- Audit kayıtlarında müşteri adı, telefon, e-posta, bağlantı veya mesaj yoktur (yalnızca kimlikler ve değişen alan adları).
- Personel arama metni URL'ye, tarayıcı geçmişine ve erişim loglarına yazılmaz.
- WhatsApp mesajı (ad, soyad, hizmet adı, bağlantı) personelin açık eylemiyle WhatsApp/Meta'ya aktarılır (§1, §9 madde 10 — değerlendirme açık). Sistem mesajı göndermez; testlerde `wa.me` istekleri yakalanır.
- Testler yalnızca sentetik veriyle ve izole geçici veritabanında başvuru oluşturur; gerçek müşteri verisi kullanılmadı.

## 12. PHASE 07 Uygulama Notları (müşteri paneli)
- Müşteri oturum cookie'si yalnızca teknik kimlikler (başvuru ve token kimliği, bağlam kimliği, zaman damgaları) ve imza içerir; ad, telefon, e-posta, token **yoktur**. Kesinlikle gerekli (oturum) cookie'sidir; analytics/üçüncü taraf cookie yoktur. Aydınlatma metninde belirtilmesi PB-03 kapsamında.
- Panel müşteriye yalnızca adını/soyadını, başvuru numarasını, hizmet adını, tarihi, statüyü, evrak listesini ve düzeltme açıklamalarını gösterir; telefon ve e-posta panelde ve sayfa yükünde yoktur (veri minimizasyonu).
- Bağlantı açılışı ve panel görüntüleme veritabanına yazmaz (son kullanım, IP, user-agent, cihaz kaydı yok — OD-09, BR-105).
- Geçersiz/iptal/süresi dolmuş/bağlam uyuşmazlığı ekranları kişisel veri içermez.
- Bağlantı bearer credential olduğundan bağlantıya sahip herkes bu verileri görebilir (TM-13, PB-04 — açık).
- Testler yalnızca sentetik veriyle ve izole geçici veritabanında; gerçek müşteriye bağlantı gönderilmedi.

## 12a. PHASE 08 Uygulama Notları (dosya depolama — Backblaze B2)
- **AB bölgesi tek başına KVKK uyumu sağlamaz.** Backblaze B2 EU Central seçimi veri konumunu AB ile sınırlar; ancak sağlayıcı ABD merkezlidir ve yurt dışına aktarım (KVKK m.9) değerlendirmesi, veri işleme sözleşmesi (DPA), ticari kullanım koşulları, saklama/imha ve yedekleme gereksinimleri **gerçek müşteri verisi kullanılmadan önce** hukukçu tarafından değerlendirilmelidir (PB-03).
- Bucket private; CORS kapalı; public/imzalı URL yok; anahtar bucket'a kısıtlı (OD-25). Dosyalar yalnızca yetkili route'lardan akış olarak sunulur; her görüntüleme/indirme audit'lenir (aktör + dosya kimliği; dosya adı/IP/UA yok).
- Nesne anahtarında kişisel veri yok (yalnızca UUID); orijinal dosya adı yalnızca DB metadata'sında; log ve audit'te dosya adı, PDF içeriği, SHA-256 yok.
- Saklama: kayıtlı geçerli versiyonlar otomatik silinmez (OD-06); kapasite dolduğunda da silinmez. Teknik temizlik yalnızca başarısız/yarım yüklemelerin nesnelerini siler (saklama politikası değildir).
- B2 lifecycle "tüm versiyonları sakla": uygulama dışından (panelden) silinen bir dosya için silme işareti ve eski versiyon kalır; kalıcı silme versiyona özgüdür. Başvuru silmenin storage aşaması (tüm fiziksel versiyonlar) PHASE 10.
- Gerçek müşteri PDF'i hiçbir ortamda kullanılmadı; testler sentetik PDF üretir, gerçek B2'ye otomatik testlerde bağlanılmaz.

## 12b. PHASE 09 Uygulama Notları (iş akışı)
- Müşteriye yalnızca: statü + tarih zaman çizelgesi, evrak statüleri, düzeltme açıklamaları, müşteriye görünür yorumlar (yazar yok). Gösterilmeyen: iptal/geçiş gerekçeleri, personel kullanıcı adları, aktörler, iç notlar, audit.
- Serbest metinler kendi tablolarında; audit metadata'sına kopyalanmaz.
- İptal ve tamamlama veriyi silmez, bağlantıyı iptal etmez (OD-04, OD-06); kalıcı silme PHASE 10.

## 12c. PHASE 10 Uygulama Notları (iç notlar, işlem geçmişi, kalıcı silme)
- **Şirket içi notlar** yalnızca personel tarafından görülür (ayrı tablo, müşteri modüllerinde ESLint yasağı, müşteri DTO'sunda yok — sentinel testleriyle doğrulandı). Notlar hassas bilgi içerebilir: personel arayüzü notlara **şifre, kart bilgisi veya gereksiz hassas kişisel veri yazılmaması** gerektiğini belirtir. Not metni audit'e kopyalanmaz; notlar düzenlenemez/silinemez ve yalnızca kalıcı başvuru silmede başvuruyla birlikte silinir.
- **İşlem geçmişi ekranı** kişisel veri araştırma aracı değildir: ad/telefon/e-posta/serbest metin araması yoktur; yalnızca tarih, işlem türü, aktör türü, personel, kayıt türü ve başvuru (numara sunucuda UUID'ye çözülür, URL'ye yazılmaz) filtreleri vardır. Ham metadata gösterilmez.
- **Audit saklama ile kalıcı silme sınırı:** kalıcı silmeden sonra başvurunun canlı kişisel verileri, PDF'leri, notları, yorumları ve geçmişi silinir; `audit_logs` kayıtları kalır (başvuru UUID'si, eylem kodları, sayılar, personel kimliği). Bu kalan kayıtlar doğrudan kişisel veri içermez; ancak başvuru UUID'si gibi **dolaylı tanımlayıcılar** başka kaynaklarla (ör. şirketin kendi yazışmaları, yedekler) birleştirildiğinde bir kişiyle ilişkilendirilebilir. Bu nedenle kalan audit kayıtları otomatik olarak "anonim veri" sınıflandırılmaz; audit saklama süresi ve gerekçesi şirketin saklama ve imha politikasında belirlenmelidir (PB-03). Uygulamada otomatik audit silme yoktur.
- **Yedek ve sağlayıcı kopyaları:** canlı veritabanı satırlarının ve B2 nesne versiyonlarının silinmesi; Neon geri yükleme penceresi/WAL, sağlayıcı yedekleri, sağlayıcı logları veya şirket dışı kopyalardaki verilerin anında silindiği anlamına **gelmez**. Silme penceresi kullanıcıya bunu belirtir; sistem "tüm kopyalar silindi" garantisi vermez.
- **Hukuki uygunluk:** silme onayı (gerekçe + başvuru numarası) personelin bilinçli kararını kaydeder; silmenin KVKK saklama/imha yükümlülüklerine uygunluğunu teknik olarak doğrulamaz. Otomatik saklama süresi, otomatik silme, kapasite nedeniyle silme ve toplu silme yoktur. Aynı ad/telefon/e-postaya sahip diğer başvurular bağımsızdır ve otomatik silinmez.
- Production öncesi doğrulanacaklar (PB-03 kapsamında açık): KVKK yükümlülükleri, yurt dışına aktarım, saklama ve imha politikası, hukuki saklama yükümlülükleri, yedek saklama süreleri, veri işleme sözleşmeleri, audit saklama.

## PHASE 11 Notu — görüntüleme ve ölçüm
- Uygulama içi görüntüleyici PDF baytlarını yalnızca sekme belleğinde tutar; IndexedDB, localStorage, Cache API veya Service Worker'a yazmaz; kapatınca bellek serbest bırakılır (statik test). Yanıtlar `no-store`.
- Parça (Range) isteklerinin görüntüleme audit'i aktör + dosya başına 10 dakikada bir yazılır (D-135); işaret anahtarı `rate_limit_buckets`'ta kısa ömürlüdür ve yalnızca teknik kimlikler içerir (kişisel veri, IP, UA yok).
- Performans ölçümleri yalnızca izole geçici ortamda sentetik veriyle yapılır; sonuç dosyaları URL, token, cookie veya kişisel veri içermez; ekran görüntüleri yalnızca sentetik veridir. Yeni telemetri/analytics yok.

## 13. PHASE 12 — Hukuki/Mahremiyet Hazırlık Kontrol Listesi (hukuk görüşü değildir)

Kaynak: 6698 sayılı KVKK resmî metni (mevzuat.gov.tr, 2024 değişiklikleri dahil; metin bu oturumda .doc'tan okundu, resmî metinle teyit edilmeli). kvkk.gov.tr'ye bu oturumda TLS hatası nedeniyle erişilemedi → Kurul kararları (72 saat ihlal bildirimi, VERBİS muafiyet eşikleri) **doğrulanmadı**.

| Konu | Durum | Not |
|---|---|---|
| Veri sorumlusu / veri işleyen | Karar bekliyor | CS Global veri sorumlusu; Neon (Databricks) ve Backblaze veri işleyen (Backblaze DPA Module 2: controller-to-processor, AB SCC 2021/914 Module 2) |
| İşleme amacı / hukuki sebep (md. 5) | Hukuk görüşü gerekli | Vize danışmanlığı hizmeti |
| Özel nitelikli veri (md. 6) | Hukuk görüşü gerekli | Biyometrik/genetik veri özel nitelikli; pasaport/kimlik taraması kendiliğinden aynı kategoriye konmaz — bağlama göre (ör. biyometrik fotoğraf) değerlendirilmeli |
| Aydınlatma (md. 10) | Metin hazırlanmalı | Kimlik, amaç, alıcılar (yurt dışı sağlayıcılar), yöntem/hukuki sebep, haklar |
| Yurt dışı aktarım (md. 9, 2024) | **Açık** | Yeterlilik kararı yoksa uygun güvenceler (standart sözleşme imzadan itibaren **5 iş günü** içinde Kuruma bildirilir); Neon AWS Frankfurt + Grafana Labs (ABD) alt işleyen; Backblaze "may be transferred to … United States"; AB bölgesi tek başına uyum sağlamaz |
| Saklama/imha | Karar bekliyor | OD-06: otomatik silme yok; kalıcı silme manuel (BR-150…); tamamlanan başvuru, audit ve yedek saklama süreleri belirlenmemiş |
| İlgili kişi hakları (md. 11) | Prosedür gerekli | Silme talebi → kalıcı silme akışı + yedeklerdeki kopyalar (OPERATIONS_RUNBOOK §2.4) |
| İhlal bildirimi (md. 12/5) | Prosedür taslağı | "en kısa sürede" ilgiliye ve Kurula; OPERATIONS_RUNBOOK §4.7 |
| VERBİS (md. 16) | Hukuk görüşü gerekli | Muafiyet eşiği doğrulanmadı |
| Sağlayıcı DPA / alt işleyenler | Kısmen incelendi | Backblaze DPA Module 1/2 mevcut, alt işleyen değişikliği ≥7 gün önceden; Neon "Product Specific Schedule" (Databricks MCSA), alt işleyenler Databricks listesi (bu oturumda okunmadı) |
| GDPR uygulanabilirliği | Değerlendirilmeli | Şirketin AB'deki faaliyetlerine bağlı |

**Kullanıcı karar listesi:** gerekli müşteri verileri (minimizasyon), tamamlanan başvuruların saklama süresi, audit saklama süresi, yedek saklama süresi ve şifrelemesi, silme taleplerinin yedeklere etkisi, bearer bağlantı kalan riski (PB-04, SEC-02), antivirüssüz kabul kalan riski (PB-05), yurt dışı aktarım mekanizması. Teknik denetim hukuki uyumluluk sertifikası değildir; yeni otomatik saklama/silme oluşturulmadı (OD-06).
