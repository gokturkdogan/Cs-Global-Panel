# Cs-Global-Panel
CS Global Customer Panel

**CS Global Visa Management Platform** — CS Global'in vize danışmanlık süreçlerinde müşteri evraklarının toplanması, incelenmesi ve süreç takibi için geliştirilen web platformu.

- **Şirket Yönetim Paneli:** İki sabit şirket hesabı (ADMIN ve EMPLOYEE, eşit yetkili) için başvuru, evrak inceleme ve hizmet yönetimi.
- **Müşteri Paneli:** Başvuruya özel bağlantı ile doğrudan erişilen, mobil öncelikli evrak yükleme ve süreç takip ekranı.

> Bu platform bir konsolosluk veya resmî vize başvuru sistemi değildir.

## Durum

**PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage** tamamlandı (kullanıcı onayı bekleniyor). Personel girişi, şirket paneli, hizmet/evrak şablonu yönetimi, başvuru yönetimi, müşteri paneli (`/b/<token>` → imzalı 7 günlük oturum → `/portal/<bağlam>`) ve **PDF yükleme/değiştirme/görüntüleme** (müşteri ve personel — müşteri adına; yapısal PDF doğrulaması, versiyon geçmişi, depolama kotası) vardır. Dosyalar Backblaze B2 private bucket'ta (OD-25). İncelemeye gönderme ve evrak inceleme (PHASE 09) **henüz yoktur**. Platform gerçek müşteri kullanımına hazır değildir.

Sonraki faz: **PHASE 09 — Document Review & Application Workflow** (kullanıcı onayı olmadan başlanmaz). Güncel durum: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

## Teknoloji

- **Kurulu:** Better Auth 1.7.27 · Next.js 16.4.6 (App Router, Turbopack) · React 19.3.1 · TypeScript 6.0.3 (strict) · Tailwind CSS 4.3.5 · shadcn/ui (Radix) · Lucide · Geist · Zod 4 · ESLint 10 + Prettier · Vitest 5 · Playwright 1.65 · Drizzle ORM 0.45.4 + Drizzle Kit 0.31.11 + pg 8.23.1 · Neon PostgreSQL.
- **Dosya depolama:** Backblaze B2 (S3 uyumlu API, `@aws-sdk/client-s3` 3.1176.0) · yapısal PDF doğrulaması `pdfjs-dist` 6.5.438 (izole worker; antivirüs değildir).

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
| `pnpm test:integration` | Gerçek PostgreSQL ile integration testleri (projenin tek veritabanında; yalnızca kendi sentetik kayıtlarını siler) |
| `pnpm audit` | Bağımlılık güvenlik taraması (yüksek/kritik = hata) |
| `pnpm auth:bootstrap` | İki şirket hesabını (ADMIN, EMPLOYEE) oluşturur — yalnızca etkileşimli terminal, gizli şifre |
| `pnpm auth:reset-password` | Bir hesabın şifresini sıfırlar; yalnızca o hesabın oturumlarını sonlandırır |

## Ortam Değişkenleri

- Örnek dosya: [`.env.example`](.env.example) — gerçek değer içermez. Yerelde `.env.local` kullanılır; **gerçek env dosyaları git tarafından ignore edilir ve asla commit edilmez.**
- `APP_ENV`, `APP_URL` (development'ta isteğe bağlı) ve veritabanı için `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (aşağıda). Sonraki fazların değişkenleri ilgili fazda eklenir: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §3.
- Değişkenler yalnızca sunucuda okunur (`src/server/env.ts`, Zod); `NEXT_PUBLIC_*` kullanılmaz. Doğrulama ilk kullanımda yapılır; production'da eksik veya geçersiz değer, o değeri kullanan işlemi hata ile durdurur (fail-closed).

## Veritabanı (Neon PostgreSQL)

Tek veritabanı (D-059): Neon projesindeki `neondb` uygulama, migration, seed ve testler için ortak kullanılır. Kurulum: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §12. Bağlantı bilgilerini yalnızca `.env.local`'a yazın; sohbete, terminal çıktısına veya issue'lara yapıştırmayın.

| Komut | Amaç | Not |
|---|---|---|
| `pnpm db:verify` | Salt okunur bağlantı kontrolü (sürüm, TLS, roller, tablolar, migration sayısı) | Hiçbir şey yazmaz |
| `pnpm db:init` | En az yetkili `cs_app_runtime` rolünü oluşturur/şifresini eşitler, rol zaman aşımlarını tanımlar | Bu projeye ait olmayan tablo varsa durur |
| `pnpm db:migrate` | Bekleyen migration'ları uygular (sahip rol, pooler olmayan bağlantı) | Önce `db:init` |
| `pnpm db:seed` | Demo hizmet ve evrak şablonları ekler (idempotent; personel hesabı yok) | Gerçek katalog varken dikkat |
| `pnpm db:studio` | Drizzle Studio'yu yalnızca `127.0.0.1`'de açar | Gerçek kişisel veri varken kullanmayın |
| `pnpm db:generate` | Şema değişikliğinden yeni migration üretir (SQL incelenmeli) | Bağlantı gerekmez |
| `pnpm db:check` | Migration dosyalarının tutarlılık kontrolü | Bağlantı gerekmez |

Kurallar: uygulanmış migration dosyası değiştirilmez (yeni migration yazılır); `drizzle-kit push`, `db:reset`/`db:drop` yoktur; Seed verileri **demo** amaçlıdır, resmî vize evrak gereksinimi değildir.

## Şirket Hesapları (PHASE 03)

Yalnızca **iki** şirket hesabı vardır: bir ADMIN, bir EMPLOYEE — **eşit yetkili** (OD-24). Uygulamada kayıt, hesap yönetimi veya şifre değiştirme yoktur.

1. `.env.local`'da `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY_SECRET` tanımlı olmalı ve `pnpm db:migrate` çalıştırılmış olmalı.
2. Kendi terminalinizde `pnpm auth:bootstrap` çalıştırın; kullanıcı adlarını ve şifreleri (gizli, iki kez) girin. Şifreleri kimseyle paylaşmayın, sohbete yazmayın.
3. `pnpm dev` → `http://localhost:3000/login`.

Şifre unutulursa: `pnpm auth:reset-password`.

## Müşteri Bağlantı ve Oturum Anahtarları (PHASE 06–07)

Başvuru oluşturmak ve bağlantı göstermek için `.env.local`'da `ACCESS_TOKEN_*` anahtarları, müşteri panelinin açılması için `CUSTOMER_SESSION_SECRET` gerekir. `pnpm env:token-keys` yalnızca eksik olanları ekler (mevcutların üzerine yazmaz, değer göstermez). `CUSTOMER_SESSION_SECRET` değişirse yalnızca açık müşteri oturumları sonlanır (bağlantılar geçerli kalır). Anahtarları değiştirmeyin veya kaybetmeyin: mevcut müşteri bağlantıları çözülemez/geçersiz olur.

## Dosya Depolama — Backblaze B2 (PHASE 08)

1. Backblaze panelinde bucket'a kısıtlı bir **Application Key** oluşturun (Master Application Key değil).
2. Kendi terminalinizde `pnpm env:b2` çalıştırın: keyID görünür, Application Key **gizli** girilir; değerler sohbete/komut satırına yazılmaz, `.env.local`'a eklenir (mevcut değerler korunur, izin 600). Bucket, uç nokta, bölge ve kota ayarlarını da ekler.
3. `pnpm storage:verify` — tek ve kontrollü canlı test (≈10 API çağrısı): erişim, sentetik `_verification/` nesnesi yazma/okuma/SHA-256, imzasız erişimin reddi, yalnızca kendi nesnesinin tüm versiyonlarının silinmesi.
4. Bakım (varsayılan **dry-run**): `pnpm storage:reconcile` (sağlayıcı ↔ DB mutabakatı; `--apply` yalnızca kota durumunu yazar) ve `pnpm storage:cleanup` (yarım/başarısız yüklemelerin nesneleri; `--apply` ile versiyona özgü silme). Aktif ve önceki geçerli versiyonlar asla silinmez.

B2 yapılandırması yoksa yalnızca dosya işlemleri "şu anda işlenemiyor" der; panelin diğer bölümleri çalışır. Otomatik testler gerçek B2 kullanmaz (izole testler geçici yerel private depolama ile).

## Testler

Testler projenin tek veritabanını kullanır (`.env.local`). Gerçek hesaplar varken testler hesaplara yalnızca okuma/etkisiz işlem yapar; kimliği doğrulanmış testler her test için 30 dakikalık geçici oturum oluşturup siler (D-067). Gerçek şifreler testlerde kullanılmaz.

```bash
pnpm test                 # unit
pnpm test:integration     # gerçek veritabanı (sentetik kayıtlar silinir/geri alınır)
pnpm test:e2e             # production build + Playwright (Chrome, WebKit, mobil)
E2E_SCREENSHOTS=1 pnpm test:e2e   # ayrıca screenshots/ (maskeli, commit edilmez)

# İzole geçici veritabanı (Docker gerekir; gerçek veritabanına dokunmaz — D-077)
pnpm test:integration:isolated   # eşzamanlılık + geçici hesaplarla tüm hesap testleri
pnpm test:e2e:isolated           # tarayıcıdan mutasyonlar, müşteri bağlantısı/oturumu, çoklu sekme, PDF yükleme dahil
```

Ortak veritabanında mutasyon testleri yalnızca geri alınan transaction'larda çalışır; commit eden testler yalnızca izole ortamda.
