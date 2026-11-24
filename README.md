# Cs-Global-Panel
CS Global Customer Panel

**CS Global Visa Management Platform** — CS Global'in vize danışmanlık süreçlerinde müşteri evraklarının toplanması, incelenmesi ve süreç takibi için geliştirilen web platformu.

- **Şirket Yönetim Paneli:** Yönetici ve çalışanlar için başvuru, evrak inceleme, hizmet ve çalışan yönetimi.
- **Müşteri Paneli:** Başvuruya özel güvenli bağlantı ile erişilen, mobil öncelikli evrak yükleme ve süreç takip ekranı.

> Bu platform bir konsolosluk veya resmî vize başvuru sistemi değildir.

## Durum

**PHASE 00 — Proje temeli ve mimari** (yalnızca dokümantasyon). Uygulama kodu henüz bulunmamaktadır. Güncel durum: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

## Teknoloji

Next.js 16 · React 19 · TypeScript 6 · Tailwind CSS 4 · shadcn/ui · Drizzle ORM · Neon PostgreSQL · Better Auth · Vercel Private Blob · Vitest · Playwright. Doğrulanmış sürümler: [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Dokümantasyon

| Doküman | İçerik |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Geliştirme talimatları ve kurallar |
| [Proje Genel Bakış](docs/PROJECT_OVERVIEW.md) | Amaç, kavramlar, doküman haritası |
| [Ürün Gereksinimleri](docs/PRODUCT_REQUIREMENTS.md) | Fonksiyonel / fonksiyonel olmayan gereksinimler |
| [İş Kuralları](docs/BUSINESS_RULES.md) | Tüm iş kuralları |
| [State Machine'ler](docs/STATE_TRANSITIONS.md) | Başvuru, evrak ve dosya statüleri |
| [Yetki Matrisi](docs/AUTHORIZATION_MATRIX.md) | Rol ve kaynak bazlı yetkiler |
| [Mimari](docs/ARCHITECTURE.md) | Katmanlar, klasör yapısı, route'lar, cache |
| [API Sözleşmeleri](docs/API_CONTRACTS.md) | Server Actions ve Route Handlers |
| [Veritabanı Şeması](docs/DATABASE_SCHEMA.md) | Tablolar ve ER diyagramı |
| [Güvenlik](docs/SECURITY.md) · [Tehdit Modeli](docs/THREAT_MODEL.md) | Güvenlik mimarisi ve riskler |
| [Dosya Depolama](docs/FILE_STORAGE.md) | PDF yükleme, tarama, saklama |
| [Veri Gizliliği (KVKK)](docs/DATA_PRIVACY.md) | KVKK değerlendirme noktaları |
| [Tasarım Sistemi](docs/DESIGN_SYSTEM.md) | Renkler, tipografi, bileşenler |
| [Test Stratejisi](docs/TESTING_STRATEGY.md) | Test planı ve kabul kriterleri |
| [Deployment](docs/DEPLOYMENT.md) | Ortamlar, env değişkenleri, maliyet |
| [Roadmap](docs/DEVELOPMENT_ROADMAP.md) | Faz planı |
| [Karar Kaydı](docs/DECISION_LOG.md) · [Changelog](docs/CHANGELOG.md) | Kararlar ve değişiklikler |

## Kurulum

PHASE 01'de eklenecektir.
