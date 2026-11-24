# Teknoloji Stack'i ve Sürüm Doğrulaması

> Doğrulama tarihi: **2026-11-24**
> Kaynaklar: npm registry (`npm view`), nodejs.org release index, vercel.com/docs, neon.com/docs, better-auth.com/docs, nextjs.org/docs.
> Bu dokümandaki sürümler **PHASE 01'de yeniden doğrulanmalı** ve `package.json` içinde tam sürüm (exact) olarak sabitlenip `pnpm-lock.yaml` repoya eklenmelidir.

İlgili kararlar: [DECISION_LOG.md](DECISION_LOG.md) (D-002 … D-006, D-016, D-017, D-019).

---

## 1. Çalışma Ortamı (Yerel Makine — 2026-11-24)

| Araç | Yerel Sürüm | Durum |
|---|---|---|
| Node.js | 24.22.1 | LTS (Krypton). Güncel yama 24.22.3 (2026-11-10) — **yama güncellemesi önerilir**. |
| pnpm | 10.28.2 | Çalışır. `latest` = 12.23.0. Sürüm kararı PHASE 01'de (D-004). |
| Git | 2.54.0 | Uygun. |
| npm | 11.19.1 | Yalnızca registry sorguları için kullanıldı. |

### Node.js LTS durumu (nodejs.org/dist/index.json)

| Hat | Son sürüm | Durum |
|---|---|---|
| 27.x | 27.0.0-alpha | Kararsız — kullanılmaz |
| 26.x | 26.13.1 | **LTS (Lithium)** |
| 24.x | 24.22.3 | **LTS (Krypton)** |
| 22.x | 22.23.5 | LTS (Jod, bakım) |

Vercel Functions desteklenen Node sürümleri: **26.x (varsayılan), 24.x, 22.x** (vercel.com/docs/functions/runtimes/node-js/node-js-versions).

**Öneri (D-003, Proposed):** Node.js **24.x LTS**. Yerel ortamda kurulu, Vercel'de destekleniyor, tüm bağımlılıkların `engines` aralığına uyuyor. `package.json` → `"engines": { "node": "24.x" }` ile Vercel sürümü sabitlenir (Vercel varsayılanı 26 olduğundan sabitleme zorunludur). Node 26'ya geçiş ileride tek satırlık değişikliktir.

---

## 2. Doğrulanmış Paket Sürümleri (npm `latest` etiketi)

### Core

| Paket | latest | Notlar |
|---|---|---|
| `next` | 16.4.6 (2026-11-09) | `engines.node >=20.9.0`. Turbopack varsayılan bundler. `next lint` kaldırıldı. `middleware` → `proxy.ts`. |
| `react` / `react-dom` | 19.3.1 | Next peer: `^18.2.0 \|\| ^19.0.0` ✅ |
| `typescript` | **7.0.2** (latest) / 6.0.3 | ⚠️ Bkz. §3 — **6.0.3 kullanılacak**. |
| `@types/node` | 26.6.6 | Node 24 kullanılacağı için `@types/node@24.x` sabitlenmeli. |
| `@types/react` | 19.3.0 | |

### UI

| Paket | latest | Notlar |
|---|---|---|
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.5 | Tailwind v4 (CSS-first config). |
| `shadcn` (CLI) | 4.23.0 | Bağımlılık değil, kurulum CLI'ı. Bileşenler repoya kopyalanır. |
| `lucide-react` | 1.78.0 | |
| `geist` | 1.9.2 | Font. Alternatif `next/font/google` ile Inter. |
| `react-hook-form` | 7.92.0 | Peer: React 19 ✅ |
| `@hookform/resolvers` | 7.0.8 | Peer: `zod ^3.25 \|\| ^4`, `react-hook-form ^7.55` ✅ |
| `zod` | 4.6.7 | |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | 0.7.1 / 2.1.1 / 3.7.1 / 1.4.0 | shadcn/ui tarafından kurulan yardımcılar (shadcn init sırasında doğrulanacak). |
| `sonner` | 2.0.8 | Toast — yalnızca shadcn/ui önerirse. |

### Database

| Paket | latest | Notlar |
|---|---|---|
| `drizzle-orm` | **0.45.4** (latest) | `1.0.0-rc.6` ve `1.0.0-beta.22` mevcut ancak RC/beta → **kullanılmaz** (D-005). |
| `drizzle-kit` | 0.31.11 | |
| `pg` | 8.23.1 | Önerilen sürücü (D-006). |
| `@neondatabase/serverless` | 1.2.1 | Alternatif sürücü. `engines.node >=19`. |

### Authentication

| Paket | latest | Notlar |
|---|---|---|
| `better-auth` | 1.7.27 (2026-11-20) | Peer: `next ^14\|\|^15\|\|^16` ✅, `react ^18\|\|^19` ✅, `drizzle-orm ^0.45.2` ✅, `drizzle-kit >=0.31.4` ✅, `vitest ... ^5.0.0` ✅ |

### File Storage

| Paket | latest | Notlar |
|---|---|---|
| `@vercel/blob` | 2.9.0 | `engines.node >=20`. Private storage için **>= 2.3** gerekli ✅ |
| `@vercel/functions` | 3.11.3 | `waitUntil`, DB pool yardımcıları — ihtiyaç doğarsa (PHASE 02'de değerlendirilecek). |

### Testing

| Paket | latest | Notlar |
|---|---|---|
| `vitest` | 5.1.1 | `engines.node ^22.12 \|\| ^24 \|\| >=26` ✅. Peer `vite ^6.4\|\|^7\|\|^8` (vite 8.3.8). |
| `@playwright/test` | 1.65.1 | Next peer `^1.51.1` ✅ |
| `@testing-library/react`, `jsdom` | 16.3.3 / 31.0.1 | Yalnızca client component testleri gerekirse. |

### Code Quality

| Paket | latest | Notlar |
|---|---|---|
| `eslint` | 10.15.0 | |
| `eslint-config-next` | 16.4.6 | Peer `eslint >=9`; bağımlılık `typescript-eslint ^8.56.0`. |
| `typescript-eslint` | 8.74.0 | Peer `typescript >=4.8.4 <6.1.0` ⚠️ |
| `prettier` | 3.10.1 | |

### Yardımcı (gerekçeli) bağımlılıklar

| Paket | latest | Gerekçe |
|---|---|---|
| `server-only` | 0.0.1 | Next.js resmî önerisi: server modüllerinin client bundle'a girmesini derleme zamanında engeller. |
| `libphonenumber-js` | 1.13.17 | Telefon numarasını E.164'e normalize etmek için. Kendi regex'imizi yazmak hataya açık. |

> `@t3-oss/env-nextjs` (0.13.11) değerlendirildi; **kullanılmaz**. Zod ile 20 satırlık bir `env.ts` yeterli (gereksiz bağımlılıktan kaçınma).

---

## 3. Kritik Uyumluluk Bulguları

### 3.1 TypeScript 7 ↔ ESLint uyumsuzluğu ⚠️
- npm `typescript@latest` = **7.0.2** (yeni native derleyici).
- `typescript-eslint@8.74.0` peer aralığı: `typescript >=4.8.4 <6.1.0`.
- `eslint-config-next@16.4.6` `typescript-eslint ^8.56.0`'a bağımlı.
- **Sonuç:** TS 7 ile `eslint-config-next` peer uyarısı/hatası verir. **TypeScript 6.0.3** (2026-04-16, Next 16 minimum TS 5.1 ✅) sabitlenecek (D-002).
- TS 7'ye geçiş, typescript-eslint desteği resmî olarak geldiğinde yeniden değerlendirilecek.

### 3.2 Drizzle 1.0 henüz stable değil
- Better Auth her iki hattı destekliyor (`^0.45.2 || >=1.0.0-rc.1`). Stable olan **0.45.x** kullanılır.

### 3.3 Next.js 16 değişiklikleri (nextjs.org/docs/app/guides/upgrading/version-16)
- `middleware.ts` → **`proxy.ts`** (export `proxy`), **Node.js runtime** (Edge desteklenmez).
- `cookies()`, `headers()`, `params`, `searchParams` yalnızca **async** erişim.
- `next lint` kaldırıldı → ESLint CLI doğrudan çalıştırılır.
- Turbopack `dev` ve `build` için varsayılan.
- `cacheComponents` (stabil) opt-in. `use cache`, `cacheLife`, `cacheTag` stabil. Taint API'leri **hâlâ experimental** — production güvenlik kontrolü olarak kullanılmaz.

### 3.4 Neon bağlantı yöntemi ve transaction desteği
- `neon()` HTTP sürücüsü: tek sorgu + **non-interactive** `sql.transaction([...])`. Interactive transaction **yok**.
- `Pool`/`Client` (WebSocket) ve `node-postgres` (TCP): interactive transaction **var**.
- Neon Drizzle rehberi Node.js sunucuları için `drizzle-orm/node-postgres` + `pg` öneriyor; migration'lar **pooler olmayan (direct)** URL ile çalışır.
- Pooled URL (`-pooler`) PgBouncer **transaction mode**'dur → oturum seviyesinde özellikler (session `SET`, session advisory lock, `LISTEN/NOTIFY`) kullanılmamalı. Bu kısıtlar PHASE 02'de `connection-pooling` dokümanından ayrıca doğrulanacak.
- **Öneri (D-006):** `drizzle-orm/node-postgres` + `pg.Pool` + pooled URL (runtime), direct URL (migration). Başvuru oluşturma gibi işlemler interactive transaction gerektirdiği için HTTP sürücüsü tek başına yeterli değildir.

### 3.5 Better Auth — doğrulanan özellikler
- **Username plugin:** `POST /sign-in/username`; e-posta olmadan girişe izin verir. Varsayılan uzunluk 3–30, alfanümerik + `_` + `.`; varsayılan normalizasyon lowercase. `disabledPaths: ["/is-username-available"]` ile enumeration engellenebilir.
- **Admin plugin:** `createUser`, `setRole`, `banUser` (girişleri engeller **ve tüm oturumları iptal eder**), `revokeUserSessions`, `setUserPassword`, `listUsers`; `createAccessControl` ile özel roller.
- **Kullanıcı tablosu e-posta gerektirir** (sign-up örneklerinde `email` zorunlu). Çalışanlar için kurumsal e-posta alanı tutulacak.
- **Şifre hash:** varsayılan **scrypt**; varsayılan uzunluk 8–128.
- **Session:** `expiresIn` 7 gün, `updateAge` 1 gün varsayılan; `freshAge` 1 gün. Cookie cache açıkken iptal edilen oturum cache süresi boyunca geçerli kalabilir → **cookie cache kapalı tutulacak**.
- **Cookie:** production'da `httpOnly` + `secure`, `SameSite=Lax`. CSRF için origin kontrolü + `trustedOrigins`.
- **Rate limit:** production'da varsayılan açık (10 sn / 100 istek); depolama varsayılanı **bellek** → serverless'ta güvenilir değil; **`storage: "database"`** kullanılacak. IP varsayılan olarak `X-Forwarded-For`'dan okunur → Vercel'e uygun header PHASE 03'te doğrulanıp `advanced.ipAddress.ipAddressHeaders` ile ayarlanacak.
- **Email OTP plugin** kullanıcı hesabına bağlıdır (bilinmeyen e-postada kullanıcı oluşturur) → **müşteri OTP'si için uygun değildir**; müşteri doğrulaması uygulama içinde yazılacak (bkz. [SECURITY.md](SECURITY.md) §4).
- **Database hooks** (`user`/`session`/`account` before/after) mevcut; başarısız giriş olayları DB hook'larıyla yakalanmaz → endpoint hook'ları PHASE 03'te incelenecek.
- **Doğrulanamayanlar:** core tabloların tam kolon listesi (doküman tablosu render edilmedi), admin plugin'in session alanı adı (`impersonatedBy` olduğu tahmin ediliyor), `emailAndPassword.disableSignUp` seçeneğinin adı, impersonation'ı tamamen kapatma seçeneği. → PHASE 03'te `npx auth@latest generate` çıktısı ve kaynak kod üzerinden doğrulanacak.
- Drizzle adapter import yolu dokümanlar arasında farklı (`better-auth/adapters/drizzle` vs `@better-auth/drizzle-adapter`) → PHASE 03'te kurulu sürümle doğrulanacak.

### 3.6 Vercel Blob — doğrulanan özellikler
- **Private storage mevcut** (`access: 'private'`, `@vercel/blob >= 2.3`). Private blob'ların public URL'si yoktur; okuma kimlik doğrulama gerektirir.
- Okuma: `get(pathname, { access: 'private' })` → stream; Route Handler üzerinden `new NextResponse(result.stream, ...)` ile servis edilmesi **dokümante edilmiş pattern**.
- Client upload: `handleUpload({ onBeforeGenerateToken, onUploadCompleted })` (`@vercel/blob/client`), client tarafında `upload(name, file, { access: 'private', handleUploadUrl })`. `allowedContentTypes`, `addRandomSuffix`, `tokenPayload` destekli. `maximumSizeInBytes` / `validUntil` (varsayılan 1 saat) — `handleUpload` için tam referans okunamadı, PHASE 08'de doğrulanacak.
- `onUploadCompleted` **localhost'ta çalışmaz** (Vercel geri çağıramaz) → tasarım bu callback'e tek başına bağımlı olmamalı (bkz. [FILE_STORAGE.md](FILE_STORAGE.md)).
- Callback 400 dönerse yeniden denenmez; 429/5xx'de 5 kez yeniden denenir → callback **idempotent** olmalı.
- `handleUpload` `BLOB_READ_WRITE_TOKEN` gerektirir (OIDC kabul etmez).
- Store bölgesi oluşturmada seçilir, **sonradan değiştirilemez**; `fra1` (Frankfurt) mevcut.
- Aynı pathname'e yazma varsayılan olarak reddedilir (`allowOverwrite` kapalı).
- Upload progress callback (`onUploadProgress`) PHASE 08'de doğrulanacak.

### 3.7 Vercel Functions limitleri
- Request body: **4.5 MB** (20 MiB public beta, Pro + özel ayar gerekli) → **PDF'ler function üzerinden geçirilmeyecek**, doğrudan Blob'a client upload yapılacak.
- Response body: 4.5 MB, **streaming yanıtlar hariç** → PDF indirme stream ile yapılır.
- Server Actions `bodySizeLimit` varsayılanı **1 MB**.
- Maks süre (Fluid compute): Hobby 300 sn; Pro 300 sn varsayılan / 800 sn maks.
- Fluid compute yeni projelerde varsayılan açık.
- Bölge: varsayılan `iad1`; Hobby tek bölge, Pro 5 bölge. **`fra1` mevcut**.

---

## 4. Planlar ve Ticari Kullanım (özet — ayrıntı [DEPLOYMENT.md](DEPLOYMENT.md) §6)

- **Vercel Hobby ticari kullanıma izin vermez:** Terms §4: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* → Production için **Vercel Pro** gerekir (D-024).
- **Neon Free:** "Prototypes, side projects" olarak konumlanmış, SLA yok, ticari kullanım hakkında açık ifade bulunamadı → production için **Launch veya Scale** önerilir.

---

## 5. Kullanılmayacak / Ertelenen Teknolojiler

| Teknoloji | Neden |
|---|---|
| Redis / Upstash | Rate limit ve oturumlar Postgres ile karşılanabiliyor (D-019). Gerçek ihtiyaç ölçülürse yeniden değerlendirilir. |
| Queue sistemleri | İlk sürümde gerekmiyor; dosya taraması senkron veya Vercel `waitUntil` ile yapılır (PHASE 08'de karar). |
| Express / NestJS | Modüler monolit — Next.js tek uygulama (D-001). |
| Prisma | Stack'te Drizzle seçili. |
| TypeScript 7 | ESLint ekosistemi uyumsuz (§3.1). |
| Drizzle 1.0 RC | Stable değil. |
| Next.js Taint API | Experimental. |
| `@t3-oss/env-nextjs` | Gereksiz bağımlılık. |
| VirusTotal vb. paylaşımlı tarama servisleri | Yüklenen dosyaları topluluğa açabilir — KVKK riski (bkz. [FILE_STORAGE.md](FILE_STORAGE.md) §6). |

## 6. Doğrulanamayan veya PHASE 01+ İçin Bekleyen Konular

1. pnpm 12'nin Vercel'de desteklenip desteklenmediği (D-004).
2. Better Auth core tablo kolonları ve plugin alan adları (PHASE 03).
3. `handleUpload` `maximumSizeInBytes` / `validUntil` / `onUploadProgress` kesin API'si (PHASE 08).
4. Neon PgBouncer transaction mode kısıtlarının tam listesi (PHASE 02).
5. Neon'da `pg_trgm` uzantısı desteği (PHASE 02).
6. Vercel'de güvenilir istemci IP header'ı (PHASE 03).
7. Vercel Cron'un Hobby/Pro sıklık limitleri (PHASE 08/13).
8. Bölgesel (fra1) Blob fiyatları (PHASE 13).
