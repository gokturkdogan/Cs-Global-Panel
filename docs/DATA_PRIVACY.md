# Veri Gizliliği ve KVKK

> ⚠️ **Bu doküman hukuki görüş değildir.** Teknik tasarımın KVKK (6698 sayılı Kanun) ve ikincil mevzuat açısından değerlendirilmesi gereken noktalarını listeler. Nihai kararlar için şirketin **KVKK konusunda uzman bir hukukçudan** görüş alması gerekir. Kullanılan sağlayıcılar (Vercel, Neon vb.) tek başına KVKK uyumu sağlamaz. Product Owner'ın OD-01…OD-23 kararlarını kabul etmesi, bu kararların hukuki uygunluğunun doğrulandığı anlamına gelmez.

## 1. Roller

| Taraf | Rol (değerlendirme önerisi) |
|---|---|
| CS Global | **Veri sorumlusu** |
| Hosting sağlayıcısı (geliştirme/demo: Vercel; production: açık — PB-01) | Veri işleyen |
| Veritabanı sağlayıcısı (Neon / production'da açık) | Veri işleyen |
| Object storage sağlayıcısı (Vercel Blob / production'da açık) | Veri işleyen |
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
- ⚠️ **Manuel silme tercihi, verilerin süresiz saklanması için hukuki dayanak oluşturmaz.** KVKK m.7 ve "Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik" kapsamındaki saklama ve periyodik imha yükümlülüklerini **şirket** takip etmeli; bir saklama ve imha politikası belirleyip ADMIN silme aracıyla uygulamalıdır. Bu, production öncesi açık hukuki gereksinimdir (PB-03).
- Yalnızca **teknik** temizlik otomatiktir (müşteri verisi saklama politikası değildir): tamamlanmamış yüklemeler, reddedilen dosyaların blob'ları, sahipsiz storage nesneleri, süresi dolmuş personel oturumları, süresi dolmuş rate limit anahtarları, yarım kalan silme işlemlerinin tamamlanması.
- Yedekler: seçilen DB planının geri yükleme penceresi süresince silinen veri yedekte kalabilir (Neon Free: 6 saat; ücretli planlarda daha uzun) — aydınlatma metninde belirtilmeli. Ek uzun süreli yedek alınmaz.

## 5. Silme

- **Başvuru silme (personel):** bağlantı iptali + müşteri oturumlarının anında geçersizliği + tüm dosya versiyonlarının storage'dan fiziksel silinmesi ve doğrulanması + tüm başvuru kayıtlarının (yorum, not, inceleme, geçmiş dahil) DB'den silinmesi. Yalnızca `deleted_at` güncellemek gerçek silme sayılmaz; böyle bir alan yoktur.
- **Kısmi hata:** başvuru erişilemez durumda kalır, silme idempotent olarak yeniden denenir; DB kaydı storage boşaltılmadan silinmez (sahipsiz kişisel veri kalmaz).
- **Audit:** yalnızca `APPLICATION_DELETION_REQUESTED` / `APPLICATION_DELETED` (başvuru ID'si, silen kullanıcı, dosya sayısı). Önceki audit kayıtları kişisel veri içermez ve korunur.
- **İlgili kişi talebi (m.11):** kişinin tüm başvuruları ad/telefon/e-posta araması ile personel tarafından bulunur ve personel tarafından silinir (müşteri eşleştirme olmadığından otomatik toplu silme yoktur). Yasal saklama yükümlülüğü olan veriler hukuki görüşe göre korunur.

## 6. Şifreleme

| Katman | Durum |
|---|---|
| Aktarım | TLS: tarayıcı ↔ hosting (HSTS), uygulama ↔ DB (`sslmode=verify-full` zorunlu; PHASE 02'de TLS 1.3 + doğrulanmış sertifika test edildi), uygulama ↔ storage (HTTPS) |
| Neon at-rest | AES-256 (Neon güvenlik dokümanı) |
| Vercel Blob at-rest | **Doğrulanmadı** — PHASE 08'de |
| Uygulama seviyesi | Bağlantı token'ı: HMAC hash + AES-256-GCM kopya; personel şifreleri scrypt |
| Belge uygulama seviyesi şifreleme | MVP'de yok (client upload ve doğrulama ile çelişir); private storage + erişim kontrolü + sağlayıcı at-rest şifrelemesi |

## 7. Erişim Kayıtları ve Olay Müdahalesi

- Belge görüntüleme/indirme audit'lenir (aktör, zaman, dosya ID). IP/cihaz bilgisi olmadığından, bağlantının kimin elinde olduğu tespit edilemeyebilir (THREAT_MODEL TM-25).
- **Olay müdahale planı (özet, PHASE 13'te detaylandırılır):**
  1. Tespit (audit anomalisi, sağlayıcı bildirimi, müşteri şikâyeti).
  2. Sınırlama: ilgili bağlantıları iptal et/yenile, ilgili hesabın şifresini `pnpm auth:reset-password` ile sıfırla (oturumlarını sonlandırır), secret'ları döndür.
  3. Değerlendirme: etkilenen kişi/veri kapsamı (audit'ten).
  4. Bildirim: Kurul kararı gereği veri ihlallerinin **en kısa sürede ve en geç 72 saat içinde** Kurul'a ve makul sürede ilgili kişilere bildirilmesi — hukukçu ile teyit edilmelidir.
  5. Kök neden analizi; DECISION_LOG/CHANGELOG kaydı.

## 8. Yurt Dışına Veri Aktarımı

- Geliştirme/demo altyapısı (Vercel `fra1`, Neon `aws-eu-central-1`) **Türkiye dışındadır**; sağlayıcılar ABD merkezlidir. Production sağlayıcısı henüz seçilmedi (PB-01) — seçimde veri konumu bir kriterdir.
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
| Development (PHASE 02 itibarıyla — D-059) | Neon Free projesinde **tek veritabanı** (`neondb`); testler ve seed aynı veritabanını kullanır | Ayrı Blob store (dev) | `.env.local` | Sahte |
| Preview / Demo | Neon Free non-prod projesi, preview branch'leri | Ayrı Blob store (demo) | Sağlayıcı Preview scope | Sahte |
| Production | **Ayrı proje/hesap** — sağlayıcı açık (PB-01) | **Ayrı store** | Production scope | Gerçek |

Ayrıntı: [DEPLOYMENT.md](DEPLOYMENT.md). ⚠️ D-059 (tek veritabanı) nedeniyle gerçek müşteri verisi bu veritabanına **girmeden önce** ayrı production veritabanı gerekir (PB-06, TM-43).
