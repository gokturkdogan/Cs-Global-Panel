# Cs-Global-Panel
CS Global Customer Panel

**CS Global Visa Management Platform** — CS Global'in vize danışmanlık süreçlerinde müşteri evraklarının toplanması, incelenmesi ve süreç takibi için geliştirilen web platformu.

- **Şirket Yönetim Paneli:** Yönetici ve çalışanlar için başvuru, evrak inceleme, hizmet ve çalışan yönetimi.
- **Müşteri Paneli:** Başvuruya özel bağlantı ile doğrudan erişilen, mobil öncelikli evrak yükleme ve süreç takip ekranı.

> Bu platform bir konsolosluk veya resmî vize başvuru sistemi değildir.

## Durum

**PHASE 01 — Proje altyapısı** tamamlandı, kullanıcı onayı bekleniyor. Uygulama yalnızca **altyapı aşamasındadır**: çalışan bir Next.js iskeleti, tasarım sistemi, kod kalitesi ve test araçları vardır. Veritabanı, giriş sistemi, şirket paneli, müşteri paneli ve dosya yükleme **henüz yoktur**. Platform gerçek müşteri kullanımına hazır değildir.

Sonraki faz: **PHASE 02 — Database Foundation**. Güncel durum: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

## Teknoloji

- **Kurulu (PHASE 01):** Next.js 16.4.6 (App Router, Turbopack) · React 19.3.1 · TypeScript 6.0.3 (strict) · Tailwind CSS 4.3.5 · shadcn/ui (Radix) · Lucide · Geist · Zod 4 · ESLint 10 + Prettier · Vitest 5 · Playwright 1.65.
- **Sonraki fazlarda:** Drizzle ORM + Neon PostgreSQL (PHASE 02) · Better Auth (PHASE 03) · Vercel Private Blob (PHASE 08).

Hedef aylık altyapı maliyeti: 0. Kurulu sürümler: [docs/TECH_STACK.md](docs/TECH_STACK.md) §0.

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
| [Dosya Depolama](docs/FILE_STORAGE.md) | PDF yükleme, yapısal doğrulama, saklama |
| [Veri Gizliliği (KVKK)](docs/DATA_PRIVACY.md) | KVKK değerlendirme noktaları |
| [Tasarım Sistemi](docs/DESIGN_SYSTEM.md) | Renkler, tipografi, bileşenler |
| [Test Stratejisi](docs/TESTING_STRATEGY.md) | Test planı ve kabul kriterleri |
| [Deployment](docs/DEPLOYMENT.md) | Ortamlar, env değişkenleri, maliyet |
| [Roadmap](docs/DEVELOPMENT_ROADMAP.md) | Faz planı |
| [Karar Kaydı](docs/DECISION_LOG.md) · [Changelog](docs/CHANGELOG.md) | Kararlar ve değişiklikler |

## Gereksinimler

- **Node.js 24 LTS** (`.nvmrc`: `24`; `package.json` → `engines.node: 24.x`). Güncel güvenlik yaması önerilir.
- **pnpm 10.34.9** — `package.json` → `packageManager` alanıyla sabit. Kurulu pnpm 10 sürümü bu sürüme kendiliğinden geçer; alternatif olarak Corepack (`corepack enable`) kullanılabilir. npm/yarn kullanılmaz; tek lockfile `pnpm-lock.yaml`.

## Kurulum ve Çalıştırma

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # isteğe bağlı; PHASE 01 için varsayılanlar yeterli
pnpm dev                     # http://localhost:3000
```

| Komut | Amaç |
|---|---|
| `pnpm dev` | Geliştirme sunucusu (Turbopack) |
| `pnpm build` · `pnpm start` | Production build ve sunucu |
| `pnpm lint` | ESLint (uyarı da hata sayılır) |
| `pnpm typecheck` | Route tiplerini üretir + `tsc --noEmit` |
| `pnpm format` · `pnpm format:check` | Prettier yaz / kontrol et |
| `pnpm test` · `pnpm test:watch` | Vitest unit testleri (tek sefer / izleme) |
| `pnpm test:e2e` | Playwright E2E (production build üzerinde; ilk kez: `pnpm exec playwright install chromium webkit`) |
| `pnpm check` | lint + typecheck + format:check + test |
| `pnpm check:bundle` | Build sonrası client bundle'da secret adı kontrolü |
| `pnpm audit` | Bağımlılık güvenlik taraması (yüksek/kritik = hata) |

## Ortam Değişkenleri

- Örnek dosya: [`.env.example`](.env.example) — gerçek değer içermez. Yerelde `.env.local` kullanılır; **gerçek env dosyaları git tarafından ignore edilir ve asla commit edilmez.**
- PHASE 01'de yalnızca `APP_ENV` ve `APP_URL` vardır; ikisi de development'ta isteğe bağlıdır. Sonraki fazların değişkenleri (veritabanı, kimlik doğrulama, token anahtarları, storage) ilgili fazda eklenir: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §3.
- Değişkenler yalnızca sunucuda okunur (`src/server/env.ts`, Zod); `NEXT_PUBLIC_*` kullanılmaz. Doğrulama ilk kullanımda yapılır; production'da eksik veya geçersiz değer, o değeri kullanan işlemi hata ile durdurur (fail-closed).
