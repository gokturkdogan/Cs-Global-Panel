# Proje Genel Bakış — CS Global Visa Management Platform

## 1. Amaç

CS Global, vize danışmanlık müşterilerinden evrakları bugün büyük ölçüde WhatsApp üzerinden toplamaktadır. Bu platform; evrak talimatlarının iletilmesini, belgelerin toplanmasını, incelenmesini ve müşteriye geri bildirim verilmesini **tek, güvenli, merkezi bir web uygulamasına** taşır. Müşteriyle iletişim mevcut WhatsApp düzeniyle devam eder; platform bu düzene hazır bağlantı ve mesaj sağlar.

> Bu sistem bir konsolosluk veya resmî vize başvuru sistemi **değildir**. "Süreç Tamamlandı" vizenin onaylandığı anlamına gelmez.

## 2. Ürün Yaklaşımı (2026-11-24 kararları)

- Mümkün olduğunca **basit, anlaşılır, düşük maliyetli** (hedef: aylık 0; Backblaze B2 için yıllık ~10 USD bütçe — OD-26), güvenli ve sürdürülebilir.
- Gereksiz özellik, soyutlama, tablo, bağımlılık ve harici servis yok.
- Müşteri teknik bilgiye ihtiyaç duymadan, telefonundan kullanır (mobile-first).
- Yönetim paneli sade; mavi-beyaz kurumsal tasarım.

## 3. Arayüzler

| Arayüz | Kullanıcı | Erişim | Öncelik |
|---|---|---|---|
| Şirket Yönetim Paneli (`/dashboard`) | İki sabit hesap: ADMIN, EMPLOYEE — eşit yetki (OD-24) | Kullanıcı adı + şifre (yerel CLI ile oluşturulur), server-side session, ortak personel erişim kontrolü (RBAC yok) | Desktop-first, responsive |
| Müşteri Paneli (`/portal`) | Müşteri (hesapsız) | Başvuruya özel **süresiz bearer bağlantı** → doğrudan erişim, 7 günlük oturum | **Mobile-first (zorunlu)** |

Her iki arayüz aynı Next.js uygulamasındadır (modüler monolit).

## 4. Temel Kavramlar

| Terim (TR) | Kod adı | Açıklama |
|---|---|---|
| Başvuru | `application` | Bir hizmet için açılmış bağımsız dosya. **Müşteri bilgilerini de içerir** (merkezi müşteri profili yok). Kendi numarası, bağlantısı, evrakları, statüsü, geçmişi vardır. |
| Başvuru numarası | `applicationNumber` | `CS-2026-000001`. Erişim anahtarı değildir. |
| Hizmet | `service` | Danışmanlık hizmeti; panelden dinamik yönetilir. |
| Evrak şablonu | `serviceDocumentRequirement` | Hizmete tanımlı evrak gereksinimi. |
| Başvuru evrak gereksinimi | `applicationDocumentRequirement` | Başvuru oluşturulurken şablondan kopyalanan **snapshot**. |
| Dosya versiyonu | `applicationDocumentFile` | Yüklenen PDF'in metadata kaydı; evrak başına **en fazla bir aktif** versiyon, öncekiler geçmişte. |
| İnceleme | `documentReview` | Belirli bir dosya versiyonu için Onay / Düzeltme kararı. |
| Müşteri yorumu | `documentComment` | Müşterinin görebildiği açıklama. |
| Şirket içi not | `applicationInternalNote` | Yalnızca personel görür. |
| Erişim bağlantısı | `applicationAccessToken` | Başvuru başına tek aktif, yüksek entropili, süresiz, iptal/yenilenebilir bağlantı. |
| Müşteri oturumu | portal cookie | Bağlantı açılınca oluşan, 7 günlük, imzalı cookie (tablo yok). |

## 5. Kapsam Dışı (MVP)

Ayrıntılı liste: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) §5.

## 6. Doküman Haritası

| Doküman | İçerik |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Gereksinimler, kullanıcı hikâyeleri, kapsam dışı |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | İş kuralları (tek doğruluk kaynağı) |
| [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) | Başvuru / evrak / dosya state machine'leri |
| [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) | Rol ve kaynak bazlı yetkiler |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Mimari, klasör yapısı, route'lar, cache, sabitler |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Server Actions ve Route Handler sözleşmeleri |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Tablolar, kısıtlar, ER diyagramı |
| [TECH_STACK.md](TECH_STACK.md) | Doğrulanmış sürümler ve uyumluluk |
| [SECURITY.md](SECURITY.md) | Güvenlik mimarisi, production blocker'ları |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Tehdit modeli, birleşik riskler |
| [FILE_STORAGE.md](FILE_STORAGE.md) | PDF depolama, doğrulama, silme |
| [DATA_PRIVACY.md](DATA_PRIVACY.md) | KVKK değerlendirme noktaları |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tasarım sistemi |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Test stratejisi |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Ortamlar, ücretsiz altyapı değerlendirmesi |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Faz planı |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Güncel durum, teknik kararlar, blocker'lar |
| [DECISION_LOG.md](DECISION_LOG.md) | Kararlar |
| [CHANGELOG.md](CHANGELOG.md) | Değişiklik geçmişi |

Çelişki durumunda öncelik: **BUSINESS_RULES → STATE_TRANSITIONS → AUTHORIZATION_MATRIX → SECURITY → diğerleri**.
