# Veri Gizliliği ve KVKK

> ⚠️ **Bu doküman hukuki görüş değildir.** Teknik tasarımın KVKK (6698 sayılı Kanun) ve ilgili ikincil mevzuat açısından değerlendirilmesi gereken noktalarını listeler. Nihai kararlar için şirketin **KVKK konusunda uzman bir hukukçudan** görüş alması gerekir. Neon ve Vercel kullanımı tek başına KVKK uyumu sağlamaz.

## 1. Roller

| Taraf | Rol (değerlendirme önerisi) |
|---|---|
| CS Global | **Veri sorumlusu** |
| Vercel Inc. (hosting, Functions, Blob, loglar) | Veri işleyen |
| Neon / Databricks (veritabanı) | Veri işleyen |
| E-posta sağlayıcı (OTP — OD-08) | Veri işleyen |
| Tarama servisi / VM sağlayıcısı (OD-07) | Veri işleyen |
| GitHub (yalnızca kod; gerçek veri yok) | — (kişisel veri işlenmemeli) |

Her veri işleyen ile **veri işleme sözleşmesi (DPA)** ve KVKK m.12 kapsamında teknik/idari tedbir taahhütleri değerlendirilmeli. Neon dokümanlarında DPA'ya ilişkin bilgi **bulunamadı** (2026-11-24) — sağlayıcıdan doğrudan teyit gerekir.

## 2. İşlenen Veriler

| Kategori | Örnek | Kaynak | Amaç |
|---|---|---|---|
| Kimlik | Ad, soyad | Personel girer | Hizmet sunumu |
| İletişim | Telefon, e-posta | Personel girer | İletişim, OTP |
| Belge içerikleri | Pasaport, kimlik, banka dökümü, iş sözleşmesi, ikametgâh | Müşteri / personel yükler | Danışmanlık hizmeti |
| İşlem güvenliği | Oturum kayıtları, audit, (hash'lenmiş) IP | Sistem | Güvenlik, hesap verebilirlik |
| Personel verisi | Ad, kullanıcı adı, e-posta, giriş kayıtları | ADMIN | Erişim yönetimi |

**Özel nitelikli veri riski:** Kimlik belgeleri din hanesi (eski kimlikler), sağlık raporu, biyometrik fotoğraf vb. içerebilir. Belge türlerine göre özel nitelikli veri işlenip işlenmediği hukuki olarak değerlendirilmeli; işleniyorsa KVKK m.6 ve Kurul'un özel nitelikli veriler için öngördüğü ek tedbirler uygulanmalıdır.

## 3. Veri Minimizasyonu

- Müşteriden yalnızca hizmet için gereken alanlar alınır (ad, soyad, telefon, e-posta). TC kimlik no, doğum tarihi vb. **form alanı olarak alınmaz**.
- Doğrulama için ek kişisel veri toplanmaz (C2 modeli reddedilme sebebi).
- Ham IP ve user-agent saklanmaz (Proposed, OD-09); güvenlik için HMAC'lenmiş IP yeterli.
- Audit metadata'sında kişisel veri değerleri yok; yalnızca ID ve değişen alan adları.
- Storage pathname'lerinde kişisel veri yok.
- Analytics / tracking yok.
- Dev/preview ortamlarında **yalnızca sahte veri** (seed). Gerçek müşteri verisi production dışına kopyalanmaz; Neon production branch'inden preview branch'i **oluşturulmaz**.

## 4. Saklama Süreleri (Proposed — hukuki onay gerekli, OD-06)

| Veri | Önerilen süre | Gerekçe / not |
|---|---|---|
| Tamamlanmamış upload | 24 saat | Teknik |
| Reddedilen dosyalar | 7 gün | İnceleme |
| Geçmiş dosya versiyonları | Başvuru terminal + 90 gün | Uyuşmazlık / itiraz süresi — hukukçu belirlemeli |
| Güncel belgeler | Başvuru terminal + **X** | Sözleşme, vergi/ticari defter yükümlülükleri, olası itiraz süreleri — **hukukçu belirlemeli** |
| Müşteri iletişim bilgileri | Son başvuru terminal + **X** | Aynı |
| OTP challenge | 24 saat | Teknik |
| Müşteri oturumları | Süre sonu + 7 gün | Teknik |
| Personel oturumları | Süre sonu + 30 gün | Güvenlik incelemesi |
| Audit log | 2 yıl | Hesap verebilirlik — hukukçu teyidi |
| Rate limit kayıtları | Pencere sonu | Teknik |
| DB yedekleri (Neon PITR) | Plan bazlı: Launch ≤7 gün, Scale ≤30 gün | Yedekten silme: silinen veri yedek penceresi dolana kadar yedekte kalır → aydınlatma metninde belirtilmeli |

Süreler `system_settings` alanlarında tutulur; **değer NULL iken otomatik silme işi çalışmaz** (yanlışlıkla veri silinmesini önlemek için güvenli varsayılan).

## 5. Silme ve Anonimleştirme

- **Müşteri talebiyle silme (KVKK m.11, m.7):** ADMIN aracı (PHASE 10, Proposed): başvuru(lar)ın blob'ları silinir → `application_document_files.blob_deleted_at`; müşteri alanları anonimleştirilir (`first_name='Silindi'`, `email`/`phone` → rastgele yer tutucu, `search_text` temizlenir, `anonymized_at`); serbest metin alanları (yorum, not, gerekçe) temizlenir; audit'e `CUSTOMER_ANONYMIZED` (PII'siz). Yasal saklama yükümlülüğü olan veriler hukuki görüşe göre korunur.
- **Fiziksel silme vs anonimleştirme:** İlişkisel bütünlük ve audit için satırlar anonimleştirilir; belgeler (en hassas veri) **fiziksel olarak** silinir.
- **Yedekler:** Neon PITR penceresi dolunca silinen veriler yedekten de çıkar; ek, uzun süreli yedek **alınmaz** (Proposed) — alınırsa şifreli, erişim kısıtlı ve aynı saklama politikasına tabi olmalı.
- **Blob silme doğrulaması:** silme işlemi sonrası `head()` ile var olmadığı doğrulanır.

## 6. Şifreleme

| Katman | Durum |
|---|---|
| Aktarım | TLS: tarayıcı ↔ Vercel (HSTS), uygulama ↔ Neon (`sslmode=verify-full` — PHASE 02'de doğrulanır), uygulama ↔ Blob (HTTPS) |
| Neon at-rest | AES-256 (Neon güvenlik dokümanı) |
| Vercel Blob at-rest | **Doğrulanmadı** — PHASE 08'de Vercel güvenlik/uyumluluk dokümanlarından teyit edilecek |
| Uygulama seviyesi | Erişim token'larının kopyası AES-256-GCM; OTP/oturum token'ları hash; şifreler scrypt |
| Belge uygulama seviyesi şifreleme | MVP'de **yok** (Proposed). Değerlendirme: Blob'a yüklemeden önce istemci tarafında şifreleme, tarama ve görüntülemeyi zorlaştırır; sunucu tarafı yeniden şifreleme client upload'ı engeller. Risk, private store + erişim kontrolü + sağlayıcı at-rest şifrelemesiyle yönetilir. |

## 7. Erişim Kayıtları ve Olay Müdahalesi

- Belge görüntüleme/indirme audit'lenir (KVKK m.12 erişim kayıtları beklentisi).
- **Olay müdahale planı (özet, PHASE 13'te detaylandırılır):**
  1. Tespit (audit anomalisi, sağlayıcı bildirimi, kullanıcı şikâyeti).
  2. Sınırlama: ilgili token'ları iptal et, oturumları sonlandır, şüpheli personel hesabını pasifleştir, secret'ları döndür.
  3. Değerlendirme: etkilenen kişi/veri kapsamı (audit'ten).
  4. Bildirim: KVKK Kurul kararı gereği veri ihlallerinin **en kısa sürede ve en geç 72 saat içinde** Kurul'a, etkilenen kişilere ise makul sürede bildirilmesi — hukukçu ile teyit edilmelidir.
  5. Kök neden analizi ve DECISION_LOG/CHANGELOG kaydı.

## 8. Yurt Dışına Veri Aktarımı

- Vercel ve Neon sunucuları **Türkiye dışında** (önerilen: Frankfurt — `fra1`, `aws-eu-central-1`). Neon'da Türkiye bölgesi yok (2026-11-24). Sağlayıcılar ABD merkezli şirketlerdir; destek/operasyon erişimi farklı ülkelerden olabilir.
- 2024 değişikliğiyle KVKK m.9 yurt dışı aktarımı; yeterlilik kararı, uygun güvenceler (ör. Kurul'un yayımladığı **standart sözleşmeler** — imzalandıktan sonra belirli süre içinde Kurul'a bildirim yükümlülüğü dahil) veya arızi istisnalar gibi dayanaklara bağlamıştır. **Hangi dayanağın kullanılacağı ve sağlayıcıların standart sözleşmeyi imzalayıp imzalamayacağı hukukçu tarafından değerlendirilmelidir.**
- Alternatif (değerlendirme amaçlı): Türkiye'de barındırma (yerli bulut/VPS + self-hosted Postgres + S3 uyumlu storage) yurt dışı aktarım sorununu azaltır ancak **stack değişikliği** gerektirir ve operasyon yükünü artırır. Kullanıcı onayı olmadan stack değiştirilmez; hukuki değerlendirme sonucu gerektirirse karar olarak sunulur.

## 9. Hukuki Değerlendirme Gerektiren Konular (Production Blocker)

1. Aydınlatma metni (KVKK m.10) — müşteri panelinde ilk girişte gösterim yeri ve metni; çalışanlar için ayrı metin.
2. İşleme hukuki sebepleri (m.5/m.6) — açık rıza gerekip gerekmediği; özel nitelikli veri durumu.
3. Yurt dışı aktarım dayanağı (m.9) ve sağlayıcı sözleşmeleri (DPA, standart sözleşme).
4. VERBİS kayıt yükümlülüğü değerlendirmesi.
5. Saklama ve imha politikası + periyodik imha süreleri (Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik).
6. Veri ihlali bildirim prosedürü.
7. İlgili kişi başvuru süreci (m.11, m.13) — başvuru kanalı ve yanıt süresi.
8. E-posta ile OTP gönderiminin ticari elektronik ileti mevzuatı (İYS) kapsamında olmadığının teyidi (işlemsel ileti).
9. Personel cihaz ve erişim politikası (belgelerin indirilmesi, yerel kopyalar).
10. WhatsApp üzerinden bağlantı paylaşımının (Meta) değerlendirilmesi — bağlantı kişisel veri içermez; ancak mesaj metni müşteri adını içeriyorsa minimizasyon (Proposed: hazır mesajda ad **kullanılmaz** veya yalnızca ad).

## 10. Ortam İzolasyonu

| Ortam | DB | Blob | Secret | Veri |
|---|---|---|---|---|
| Development | Neon non-prod projesi, `dev` branch | `blob-dev` store | Geliştirici `.env.local` | Sahte seed |
| Preview | Neon non-prod projesi, preview branch'leri (non-prod `main`'den) | `blob-preview` store | Vercel Preview scope | Sahte seed |
| Production | **Ayrı** Neon production projesi | `blob-prod` store | Vercel Production scope (yalnızca yetkili) | Gerçek |

Ayrıntı: [DEPLOYMENT.md](DEPLOYMENT.md).
