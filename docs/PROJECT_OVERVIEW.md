# Proje Genel Bakış — CS Global Visa Management Platform

## 1. Amaç

CS Global, vize danışmanlık müşterilerinden evrakları bugün büyük ölçüde WhatsApp üzerinden toplamaktadır. Bu platform; evrak talimatlarının iletilmesini, belgelerin toplanmasını, incelenmesini ve müşteriye geri bildirim verilmesini **tek, güvenli, merkezi bir web uygulamasına** taşır.

> Bu sistem bir konsolosluk veya resmî vize başvuru sistemi **değildir**. CS Global'in kendi danışmanlık sürecini yönettiği bir platformdur. "Süreç Tamamlandı" statüsü vizenin onaylandığı anlamına gelmez.

## 2. Hedefler

- WhatsApp üzerindeki evrak trafiğini azaltmak.
- Müşteriye hangi evrağı nasıl yükleyeceğini açıkça göstermek.
- Evrak toplama sürecini hizmet bazında standartlaştırmak.
- Çalışanların başvuruları tek panelden yönetmesini sağlamak.
- Müşteriye süreç takibi sunmak.
- Eksik / hatalı evrak takibini kolaylaştırmak.
- Hassas kişisel ve finansal belgeleri güvenli yönetmek (KVKK).

## 3. Arayüzler

| Arayüz | Kullanıcı | Erişim | Öncelik |
|---|---|---|---|
| Şirket Yönetim Paneli (`/dashboard`) | ADMIN, EMPLOYEE | Kullanıcı adı + şifre, server-side session, RBAC | Desktop-first, responsive |
| Müşteri Paneli (`/portal`) | Müşteri (hesapsız) | Başvuruya özel güvenli bağlantı + doğrulama (önerilen: e-posta OTP) + süreli müşteri oturumu | **Mobile-first (zorunlu)** |

Her iki arayüz **aynı Next.js uygulamasında** yer alır (modüler monolit).

## 4. Temel Kavramlar (Sözlük)

| Terim (TR) | Kod adı | Açıklama |
|---|---|---|
| Müşteri | `customer` | Kişi. Birden çok başvurusu olabilir. |
| Başvuru | `application` | Bir müşterinin bir hizmet için açılmış dosyası. Kendi numarası, bağlantısı, evrakları, statüsü, geçmişi vardır. |
| Başvuru numarası | `applicationNumber` | `CS-2026-000001` biçiminde görüntülenen referans. **Erişim anahtarı değildir.** |
| Hizmet | `service` | Danışmanlık hizmeti (ör. Almanya Çalışma Vizesi). Panelden dinamik yönetilir. |
| Evrak şablonu | `serviceDocumentRequirement` | Hizmete tanımlı evrak gereksinimi. |
| Başvuru evrak gereksinimi | `applicationDocumentRequirement` | Başvuru oluşturulurken şablondan kopyalanan **snapshot**. |
| Dosya | `applicationDocumentFile` | Yüklenen PDF'in metadata kaydı (dosya Blob'da). Değiştirilemez; her yükleme yeni kayıttır. |
| İnceleme | `documentReview` | Çalışanın bir evrak için verdiği karar (Onay / Düzeltme). |
| Müşteri yorumu | `documentComment` | Müşterinin görebildiği açıklama. |
| Şirket içi not | `applicationInternalNote` | **Yalnızca personel** görebilir. |
| Erişim bağlantısı | `applicationAccessToken` | Başvuruya özel, yüksek entropili, iptal/yenilenebilir bağlantı. |
| Müşteri oturumu | `customerSession` | Doğrulama sonrası oluşan süreli oturum. |

## 5. Kapsam Dışı (MVP)

WhatsApp Business API, otomatik WhatsApp mesajları, online ödeme, faturalama, muhasebe, yapay zekâ / OCR, PDF oluşturma / birleştirme, e-imza, konsolosluk ve resmî sistem entegrasyonları, randevu, native mobil uygulama, canlı sohbet, multi-tenant, abonelik, gelişmiş finansal raporlama, çoklu dil, dark mode.

## 6. Doküman Haritası

| Doküman | İçerik |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Fonksiyonel / fonksiyonel olmayan gereksinimler, kullanıcı hikâyeleri |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | İş kuralları (tek doğruluk kaynağı) |
| [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) | Başvuru / evrak / dosya state machine'leri |
| [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) | Rol ve kaynak bazlı yetki matrisi |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Mimari, klasör yapısı, katmanlar, route'lar, cache stratejisi |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Server Actions ve Route Handler sözleşmeleri |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Tablolar, kısıtlar, index'ler, ER diyagramı |
| [TECH_STACK.md](TECH_STACK.md) | Doğrulanmış sürümler ve uyumluluk |
| [SECURITY.md](SECURITY.md) | Güvenlik mimarisi (auth, müşteri bağlantısı, header'lar) |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Tehdit modeli |
| [FILE_STORAGE.md](FILE_STORAGE.md) | PDF depolama, yükleme, tarama, saklama |
| [DATA_PRIVACY.md](DATA_PRIVACY.md) | KVKK, veri saklama, silme, yurt dışı aktarım |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tasarım sistemi |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Test stratejisi ve kabul kriterleri |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Ortamlar, env değişkenleri, maliyetler |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Faz planı |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Güncel durum, açık kararlar |
| [DECISION_LOG.md](DECISION_LOG.md) | Kararlar |
| [CHANGELOG.md](CHANGELOG.md) | Değişiklik geçmişi |

Çelişki durumunda öncelik sırası: **BUSINESS_RULES → STATE_TRANSITIONS → AUTHORIZATION_MATRIX → SECURITY → diğerleri**. Çelişki fark edilirse düzeltilir ve CHANGELOG'a yazılır.
