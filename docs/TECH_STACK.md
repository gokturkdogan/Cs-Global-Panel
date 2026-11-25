# Teknoloji Stack'i ve Sürüm Doğrulaması

> Doğrulama tarihi: **2026-11-24**
> Kaynaklar: npm registry (`npm view`), nodejs.org release index, vercel.com/docs, neon.com/docs, better-auth.com/docs, nextjs.org/docs.
> PHASE 01'de (2026-11-24) yeniden doğrulandı; kurulan paketler `package.json` içinde **exact** sürümle sabit, `pnpm-lock.yaml` repoda. **Kurulu sürümler için tek kaynak §0**; §2 doğrulama kaydıdır.

İlgili kararlar: [DECISION_LOG.md](DECISION_LOG.md) (D-002 … D-006, D-016, D-017, D-019, D-042 … D-051).

---

## 0. Kurulu Sürümler (PHASE 01 — 2026-11-24)

Tümü exact sürüm. Peer durumu `pnpm install` çıktısından; kaynak: npm registry (`npm view`), ilgili resmî dokümanlar.

**Runtime bağımlılıkları**

| Paket | Sürüm | Amaç | Peer durumu |
|---|---|---|---|
| `next` | 16.4.6 | Framework (App Router, Turbopack) | ✅ react/react-dom ^19 |
| `react` / `react-dom` | 19.3.1 | UI | ✅ |
| `zod` | 4.6.7 | Env doğrulama (sonraki fazlarda girdi doğrulama) | — |
| `server-only` | 0.0.1 | Sunucu modüllerinin client bundle'a girmesini derleme zamanında engeller | — |
| `geist` | 1.9.2 | Yerel font (`next/font/local`) | ✅ next >=13.2 |
| `lucide-react` | 1.78.0 | İkonlar | ✅ react ^19 |
| `radix-ui` | 1.8.1 | shadcn/ui primitifleri (Slot, Label, Separator; PHASE 04: Dialog — mobil drawer, DropdownMenu — hesap menüsü) | ✅ react ^19 |
| `get-nonce` | 1.0.1 (PHASE 04, D-071) | Radix kaydırma kilidinin `<style>` etiketine CSP nonce'u (react-style-singleton'ın nonce kaynağı; kilit dosyasındaki sürümle aynı, MIT, deprecated değil — npm registry ile doğrulandı) | — |
| `class-variance-authority` | 0.7.1 | Bileşen variant'ları (shadcn/ui) | ✅ clsx ^2.1.1 |
| `clsx` / `tailwind-merge` | 2.1.1 / 3.7.1 | `cn()` sınıf birleştirme | — |
| `drizzle-orm` | 0.45.4 (PHASE 02) | ORM, `node-postgres` sürücüsü, migrator | ✅ pg >=8 |
| `pg` | 8.23.1 (PHASE 02) | PostgreSQL sürücüsü (Pool, interaktif transaction) | ✅ |
| `better-auth` | 1.7.27 (PHASE 03) | Personel kimlik doğrulama (username plugin, scrypt, oturum) | ✅ next ^16, drizzle-orm ^0.45.2, drizzle-kit >=0.31.4, pg ^8 |
| `libphonenumber-js` | 1.13.17 (PHASE 06, D-085) | Telefon → E.164 normalizasyonu (BR-07); `libphonenumber-js/max` yalnızca sunucuda (istemci bundle'ına girmez). npm registry: MIT, 2026-11-19, deprecated değil, bağımlılıksız; `pnpm audit` yeni bulgu yok | — |

**Test altyapısı (npm bağımlılığı değil — PHASE 05, D-077):** Docker Engine 28.4.0 (Docker Desktop, yerel) + resmî `postgres:18-alpine` imajı (PostgreSQL 18.7, `builtin` C.UTF-8). Yalnızca `pnpm test:*:isolated` için; ücretsiz, geçici, 127.0.0.1. PHASE 05'te yeni npm bağımlılığı eklenmedi (Radix AlertDialog mevcut `radix-ui` paketinden; React Hook Form gereksiz bulundu).

**Development bağımlılıkları**

| Paket | Sürüm | Amaç | Peer durumu |
|---|---|---|---|
| `typescript` | **6.0.3** (D-002) | Tip denetimi | ✅ typescript-eslint `<6.1.0` |
| `@types/node` | 24.19.2 | Node 24 tipleri | ✅ |
| `@types/react` / `@types/react-dom` | 19.3.0 | React tipleri | ✅ |
| `eslint` | **10.15.0** (D-042) | Lint | ⚠️ 3 bilinen peer uyarısı (aşağıda) |
| `eslint-config-next` | 16.4.6 | Next.js + TypeScript + a11y kuralları (typescript-eslint 8.74.0 dahil) | ✅ eslint >=9 |
| `prettier` | 3.10.1 | Biçimlendirme | — |
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.5 | Tailwind CSS v4 (D-044) | ✅ |
| `vitest` | 5.1.1 | Unit test | ✅ vite ^8 |
| `vite` | 8.3.8 | Vitest'in zorunlu peer'i | ✅ |
| `@playwright/test` | 1.65.1 | E2E (Chromium + WebKit) | ✅ (next peer ^1.51.1) |
| `drizzle-kit` | 0.31.11 (PHASE 02) | Migration üretimi, `check`, Studio | ✅ |
| `@types/pg` | 8.23.1 (PHASE 02) | pg tipleri (ts6.0 etiketli) | ✅ |

**Bilinen peer uyarıları (D-042):** `eslint-plugin-react@7.37.5`, `eslint-plugin-import@2.32.0`, `eslint-plugin-jsx-a11y@6.10.2` peer aralıkları `eslint ^9`'da bitiyor; ESLint 10.15.0 ile "unmet peer" uyarısı verir. Next.js ESLint dokümanı ESLint 10'u desteklediğini ve bu uyarıyı belirtir. Uyarılar bastırılmadı; kurallar ESLint 10 altında çalıştırılarak doğrulandı.

**Araçlar (bağımlılık değil):** `pnpm@10.34.9` (`packageManager`, D-004), Node.js 24 LTS (`engines.node: 24.x`, `.nvmrc`: `24`), `shadcn@4.23.0` CLI (`pnpm dlx`), create-next-app@16.4.6 (yalnızca geçici dizinde şablon incelemesi için).

**Sonraki fazlara bırakılanlar (kurulmadı):** `react-hook-form`, `@hookform/resolvers` (ilk form fazı); `@vercel/blob` 2.9.0 (PHASE 08); `tw-animate-css` (animasyonlu bileşen gerekirse). Sürümler kurulum anında yeniden doğrulanır.

**PHASE 02'de kurulmayanlar:** `tsx` (Node 24 TypeScript'i doğrudan çalıştırır — D-057), `@neondatabase/serverless` (HTTP sürücüsü interaktif transaction/`FOR UPDATE` için uygun değil — D-006/D-055), `dotenv` (`process.loadEnvFile`).

**Transitive notu:** `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader@2.6.5` npm'de deprecated ("Merged into tsx"); yalnızca development aracı, runtime'a girmez. esbuild kurulum script'i pnpm politikasıyla engelli; drizzle-kit çalıştığı doğrulandı.

**Kullanılmadı (D-043):** `cn` (shadcn'in 0.x sınıf birleştirme paketi), `shadcn` paketinin runtime bağımlılığı olarak eklenmesi, `@tailwindcss/turbopack`.

---

## 1. Çalışma Ortamı (Yerel Makine — 2026-11-24)

| Araç | Yerel Sürüm | Durum |
|---|---|---|
| Node.js | 24.22.1 | LTS (Krypton). Güncel yama 24.22.3 (2026-11-10) — **yama güncellemesi önerilir**. |
| pnpm | 10.28.2 (global) → proje içinde **10.34.9** | `packageManager` ile proje düzeyinde sabit (D-004, Accepted); global kurulum değiştirilmedi. |
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

**Karar (D-003, Accepted — OD-13):** Node.js **24.x LTS**; Node 26 kullanılmaz; güncel güvenlik yaması tercih edilir (yerelde 24.22.1 → 24.22.3 güncellemesi önerilir, bu fazda yapılmaz). Yerel ortamda kurulu, Vercel'de destekleniyor, tüm bağımlılıkların `engines` aralığına uyuyor. `package.json` → `"engines": { "node": "24.x" }` ile Vercel sürümü sabitlenir (Vercel varsayılanı 26 olduğundan sabitleme zorunludur). 

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
- **Sonuç:** TS 7 ile `eslint-config-next` peer uyarısı/hatası verir. **TypeScript 6.0.3** (2026-04-16, Next 16 minimum TS 5.1 ✅) kullanılır (D-002 — **Accepted**, PHASE 01'de kuruldu).

### 3.1a ESLint 9 deprecated ↔ ESLint 10 peer uyarıları (PHASE 01)
- `eslint@9.39.5` npm'de deprecated; ESLint 9 hattı 2026-08-06'dan beri EOL (eslint.org/version-support).
- `eslint-config-next` içindeki üç eklenti ESLint 10'u henüz peer olarak listelemiyor; Next.js dokümanı ESLint 10 desteğini ve bu uyarıyı belgeliyor (nextjs.org/docs/app/api-reference/config/eslint, 2026-11-18).
- **Karar:** ESLint 10.15.0 (D-042).
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

### 3.5 Better Auth — doğrulanan özellikler (PHASE 03 güncellemesi: aşağıdaki admin plugin, `disabledPaths` ve `hooks.before` maddeleri OD-24/D-060 ile kullanılmaz)

- **PHASE 03 (1.7.27, kurulu paket ve kaynak koddan doğrulandı):** `better-auth/crypto` → `hashPassword`, `verifyPassword`; kök → `generateId`; `better-auth/next-js` → `nextCookies`; `better-auth/cookies` → `getSessionCookie`; `session.disableSessionRefresh`, `session.cookieCache`, `advanced.ipAddress.disableIpTracking`, `advanced.useSecureCookies`, `advanced.cookiePrefix`, `databaseHooks.{user,account,session}.create.before`, `telemetry.enabled` (varsayılan `false`). Username plugin girişi: kullanıcı adını normalize ederek arar; kullanıcı yoksa da şifre hash'ler (zamanlama eşitleme); `emailAndPassword.enabled: false` iken çalışır (integration testi). Güvenlik bildirimleri (GHSA) 1.7.16 ve öncesinde kapatılmış; bunlardan GHSA-fvxx-76fc-893x (cookie cache/ikincil depolama ile iptal edilen oturum) cookie cache kapalı olduğu için de etkisiz.

> İlk doğrulama 2026-11-24 (username, admin, rate-limit, session, cookies, security sayfaları); ek doğrulama aynı gün (options reference, database hooks, hooks, rate-limit, session-management sayfaları).
- **Username plugin:** `POST /sign-in/username`; e-posta olmadan giriş. Varsayılan uzunluk 3–30, alfanümerik + `_` + `.`; lowercase normalizasyon. `is-username-available` devre dışı bırakılabilir.
- **Admin plugin:** `createUser`, `setRole`, `banUser` (girişi engeller **ve tüm oturumları iptal eder**), `revokeUserSessions`, `setUserPassword`, `listUsers`; `createAccessControl` ile roller.
- **Kullanıcı tablosu e-posta gerektirir.** E-posta entegrasyonu olmadığından (OD-08) personel e-posta politikası TD-05.
- **Şifre:** varsayılan hash **scrypt**; `emailAndPassword.minPasswordLength` (varsayılan **8**), `maxPasswordLength` (varsayılan **128**) — OD-22 ile uyumlu; `emailAndPassword.disableSignUp` (varsayılan `false`) mevcut. ✅
- **`disabledPaths`** üst seviye seçenek olarak mevcut ("Disable specific auth paths"). ✅ `/change-password`, `/request-password-reset`, `/reset-password`, `/update-user` için örnek yok ve **`auth.api` sunucu çağrılarını da engelleyip engellemediği dokümante değil** → TD-03.
- **`hooks.before`** (`createAuthMiddleware`) ile path bazlı istek reddi (`APIError`) mümkün. ✅ Hook'ların `auth.api` çağrılarında da çalışıp çalışmadığı doğrulanmadı → TD-03.
- **Session:** `expiresIn` varsayılan 7 gün, `updateAge` 1 gün; `session.disableSessionRefresh` "session is not updated regardless of the updateAge option" ✅ — süre sonunun uzamadığı etkisi çıkarımdır, PHASE 03'te testle kanıtlanır (OD-22). Cookie cache açıkken iptal edilen oturum cache süresince geçerli kalabilir → **cookie cache kapalı**.
- **Cookie:** production'da `httpOnly` + `secure`, `SameSite=Lax`. CSRF: origin kontrolü + `trustedOrigins`.
- **IP tracking:** `advanced.ipAddress.disableIpTracking: true` → yeni oturumlarda istemci adresi kaydedilmez **ve yerleşik HTTP rate limiter kapanır** ✅. Bu nedenle giriş sınırlaması uygulama limitleyicisiyle yapılır (SECURITY §2). User-agent'ı kapatan ayrı bir seçenek bulunamadı → `databaseHooks.session.create.before` ile `{ data }` değiştirme (genel mekanizma ✅, session özelinde doğrulanmadı) + DB CHECK → TD-04.
- **Rate limit custom storage:** yalnızca `customStorage.consume(key, rule)` (atomik kontrol+artırma) ✅ — `disableIpTracking` ile HTTP limiter kapandığından kullanılmayacak.
- **Database hooks:** `user`/`session`/`account` before/after; before hook `{ data }` döndürürse payload değişir ✅.
- **Email OTP plugin:** kullanıcı hesabına bağlı — müşteri OTP'si kapsam dışı olduğundan (OD-01) kullanılmaz.
- **Doğrulanamayanlar:** core tabloların tam kolon listesi; admin plugin session alanı adı; impersonation'ı tamamen kapatma seçeneği; admin plugin ile kullanıcı adı güncelleme yöntemi; Drizzle adapter import yolu (`better-auth/adapters/drizzle` vs `@better-auth/drizzle-adapter`). → PHASE 03.

### 3.6 Vercel Blob — doğrulanan özellikler
- **Private storage mevcut** (`access: 'private'`, `@vercel/blob >= 2.3`). Private blob'ların public URL'si yoktur; okuma kimlik doğrulama gerektirir.
- Okuma: `get(pathname, { access: 'private' })` → stream; Route Handler üzerinden `new NextResponse(result.stream, ...)` ile servis edilmesi **dokümante edilmiş pattern**.
- Client upload: `handleUpload({ onBeforeGenerateToken, onUploadCompleted })` (`@vercel/blob/client`), client tarafında `upload(name, file, { access: 'private', handleUploadUrl })`. `allowedContentTypes`, `addRandomSuffix`, `tokenPayload` destekli. `maximumSizeInBytes` / `validUntil` (varsayılan 1 saat) — `handleUpload` için tam referans okunamadı, PHASE 08'de doğrulanacak.
- `onUploadCompleted` **localhost'ta çalışmaz** (Vercel geri çağıramaz) → tasarım bu callback'e tek başına bağımlı olmamalı (bkz. [FILE_STORAGE.md](FILE_STORAGE.md)).
- Callback 400 dönerse yeniden denenmez; 429/5xx'de 5 kez yeniden denenir → callback **idempotent** olmalı.
- `handleUpload` `BLOB_READ_WRITE_TOKEN` gerektirir (OIDC kabul etmez).
- Store bölgesi oluşturmada seçilir, **sonradan değiştirilemez**; `fra1` (Frankfurt) mevcut.
- Aynı pathname'e yazma varsayılan olarak reddedilir (`allowOverwrite` kapalı).
- Upload progress callback API'si PHASE 08'de doğrulanacak (TD-11).

### 3.7 Vercel Functions limitleri
- Request body: **4.5 MB** (20 MiB public beta, Pro + özel ayar gerekli) → **PDF'ler function üzerinden geçirilmeyecek**, doğrudan Blob'a client upload yapılacak.
- Response body: 4.5 MB, **streaming yanıtlar hariç** → PDF indirme stream ile yapılır.
- Server Actions `bodySizeLimit` varsayılanı **1 MB**.
- Maks süre (Fluid compute): Hobby 300 sn; Pro 300 sn varsayılan / 800 sn maks.
- Fluid compute yeni projelerde varsayılan açık.
- Bölge: varsayılan `iad1`; Hobby tek bölge, Pro 5 bölge. **`fra1` mevcut**.

---

## 4. Planlar ve Ticari Kullanım (özet — ayrıntı [DEPLOYMENT.md](DEPLOYMENT.md) §6)

- **Hedef aylık maliyet 0** (OD-12). Ücretli plan kullanıcı onayı olmadan kullanılmaz.
- **Vercel Hobby ticari kullanıma izin vermez:** Terms §4: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* → Geliştirme/demo için kullanılır; production hosting kararı açıktır (PB-01).
- **Vercel Hobby cron:** en sık günde bir, ±59 dk hassasiyet (vercel.com/docs/cron-jobs/usage-and-pricing, 2026-11-24) — günlük teknik temizlik için yeterli. Sayfa, Cron Jobs'un ileride "Schedules"a taşınacağını belirtiyor.
- **Vercel Blob Hobby:** 1 GB — gerçek kullanım için kapasite yetersiz olabilir (PB-02).
- **Neon Free:** "Prototypes, side projects, and small teams"; SLA yok; ticari kullanım hakkında açık ifade bulunamadı; geri yükleme penceresi 6 saat.

---

## 5. Kullanılmayacak Teknolojiler

| Teknoloji | Neden |
|---|---|
| E-posta sağlayıcıları (Resend, SendGrid, SMTP) | OD-08 — e-posta entegrasyonu yok |
| SMS sağlayıcıları | OD-01 — OTP yok |
| Antivirüs (ClamAV, ticari tarama API'leri, VirusTotal) | OD-07 — harici AV yok; VirusTotal ayrıca dosyaları paylaşabildiği için KVKK açısından kabul edilemez |
| Redis / Upstash | Rate limit Postgres'te (D-019); maliyet hedefi |
| Queue sistemleri | PDF doğrulama senkron; ihtiyaç yok |
| Express / NestJS | Modüler monolit (D-001) |
| Prisma | Stack'te Drizzle |
| TypeScript 7 | typescript-eslint uyumsuz (§3.1) |
| ESLint 9 | Deprecated / EOL (§3.1a) |
| Drizzle 1.0 RC | Stable değil |
| Next.js Taint API | Experimental |
| `@t3-oss/env-nextjs` | Gereksiz bağımlılık |
| Analytics / APM / hata izleme SaaS | Müşteri tarafında üçüncü taraf yasak; maliyet hedefi |

## 6. Doğrulanamayan veya Sonraki Fazlarda Doğrulanacak Konular

1. pnpm 10.34.9'un (Corepack/`packageManager`) seçilecek hosting build ortamında kullanıldığı (PHASE 13; Vercel'de doğrulanmadı — deployment yapılmadı).
2. Better Auth: `disabledPaths`/`hooks.before` ile `auth.api` etkileşimi (TD-03); user-agent'ın yazılmaması (TD-04); core tablo kolonları (PHASE 03).
3. `handleUpload` `maximumSizeInBytes` / `validUntil` / ilerleme callback'i kesin API'si (TD-11, PHASE 08).
4. Neon PgBouncer transaction mode kısıtları (PHASE 02).
5. Neon'da `pg_trgm` desteği (PHASE 02).
6. Hosting sağlayıcısında güvenilir istemci IP header'ı (TD-04, PHASE 03).
7. Vercel Blob at-rest şifreleme ve sürüm/yedek özelliği (PHASE 08).
8. Ticari kullanıma uygun ücretsiz production altyapısı (TD-07, PHASE 13).
9. PDF parser kütüphanesi (TD-06, PHASE 08).

## 7. Yeniden Doğrulama Kaydı

| Tarih | Kapsam | Sonuç |
|---|---|---|
| 2026-11-24 (ilk) | npm registry, nodejs.org, Vercel/Neon/Better Auth/Next.js dokümanları | §2–§4 |
| 2026-11-24 (revizyon) | npm `latest`: next, react, typescript, typescript-eslint (peer `<6.1.0`), eslint, eslint-config-next (`typescript-eslint ^8.56.0`), drizzle-orm, drizzle-kit, pg, better-auth, @vercel/blob, vitest, @playwright/test, tailwindcss, zod, pnpm; Node 24 son yama; Better Auth options/hooks/rate-limit/session; Vercel cron limitleri | Sürümler değişmemiş; Node 24 son yaması **24.22.3**; TS 7 uyumsuzluğu sürüyor; Better Auth bulguları §3.5'e işlendi. Diğer paketler (lucide-react, geist, react-hook-form, @hookform/resolvers, libphonenumber-js, @types/*, shadcn CLI) revizyonda **yeniden sorgulanmadı** — ilk doğrulama değerleri geçerli kabul edilmiştir. |
| 2026-11-24 (PHASE 01) | Kurulan tüm paketler: `dist-tags`, yayın tarihi, `peerDependencies`, `engines`, deprecated durumu; Node 24 güvenlik yamaları; ESLint sürüm politikası; Next.js ESLint ve Tailwind Next.js rehberleri; shadcn CLI | §0. Yeni bulgular: ESLint 9 deprecated/EOL (D-042); `@types/node` 24.x son sürümü 24.19.2; lucide-react `latest` 1.79.0 (<24 saat — `minimumReleaseAge` nedeniyle 1.78.0); create-next-app şablonu `cacheComponents: true` açıyor (D-044). Node 24.22.3 bir **güvenlik** sürümü (yerelde 24.22.1). `pnpm audit`: bilinen açık yok. |
| 2026-11-24 (PHASE 02) | drizzle-orm, drizzle-kit, pg, @types/pg, better-auth: `latest`, yayın tarihi (>24 saat), deprecated, peer, engines; Better Auth 1.7.27 tablo alanları (izole kurulum, `getAuthTables`) ve Drizzle adapter eşlemesi (kaynak kod); Neon: roller, pooler, Free plan, bölgeler, `pg_trgm`, SSL, scale-to-zero (neon.com/docs) | Sürümler değişmemiş, hepsi `latest`. `pnpm audit`: aşağıdaki faz raporunda. |
| 2026-11-24 (PHASE 03) | better-auth 1.7.27: `latest`, yayın 2026-11-20 (>24 saat), deprecated değil, peer uyumu, GitHub güvenlik bildirimleri; Next.js 16.4.6 CSP/proxy rehberi (`node_modules/next/dist/docs`) | Kuruldu. `pnpm audit --prod` aynı dev-only esbuild bulgusunu Better Auth'un opsiyonel `drizzle-kit` peer'i üzerinden gösterir (runtime'da yüklenmez). |

## 8. PHASE 07 Notu
Yeni bağımlılık yok. Kullanılan Next.js 16.4.6 yapılandırması kurulu dokümandan doğrulandı (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md`): `logging.incomingRequests.ignore` (regex dizisi) ve `logging.serverFunctions: false`; dev smoke testinde `/b/` istekleri log'a yazılmadı. Tailwind 4 `wrap-anywhere` yardımcı sınıfı (`overflow-wrap: anywhere`) kullanıldı. Oturum imzası Node `crypto` (HMAC-SHA256, `timingSafeEqual`) ile; harici oturum/JWT kütüphanesi yok.
