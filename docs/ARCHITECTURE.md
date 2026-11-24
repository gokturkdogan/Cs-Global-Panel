# Teknik Mimari

> Sürümler: [TECH_STACK.md](TECH_STACK.md) · API: [API_CONTRACTS.md](API_CONTRACTS.md) · Güvenlik: [SECURITY.md](SECURITY.md)
> Revizyon 2026-11-24: OD-01…OD-23 doğrultusunda sadeleştirildi (OTP, e-posta, müşteri profili/eşleştirme, atama, arşiv, ayarlar, harici AV kaldırıldı).

## 1. Mimari Özet

- **Tek repository, modüler monolit**, tek Next.js 16 (App Router) uygulaması; ayrı backend yok (D-001).
- **RSC varsayılan**; Client Component yalnızca etkileşim için (formlar, upload, combobox, dialog, kopyala/paylaş).
- **Mutasyonlar:** Server Actions. **Binary / harici callback / auth / bağlantı girişi / zamanlanmış iş:** Route Handlers (§6).
- **Katmanlar:** UI → giriş noktası (action/route) → feature servisleri (domain + use-case) → data access (Drizzle) → Postgres. Dosyalar private object storage'da, tek storage modülü arkasında.
- **Harici servis yok:** e-posta, SMS, antivirüs, kuyruk, Redis, analytics yok. Zorunlu altyapı: hosting + Postgres + private storage (OD-08, OD-07, OD-12).
- **Sabit yapılandırma:** şirket iletişim bilgileri, dosya limitleri, şifre/oturum parametreleri, rate limitler koddaki sabitlerdir; ayarlar sayfası/tablosu yok (§11).
- **Paylaşılan cache yok** (D-016).

## 2. Sistem Mimarisi

```mermaid
flowchart LR
    subgraph Clients
        S[Personel tarayıcısı<br/>Desktop]
        C[Müşteri tarayıcısı<br/>Mobil / WhatsApp in-app]
    end
    W[WhatsApp<br/>personel manuel paylaşır]

    subgraph Host["Hosting (dev/demo: Vercel fra1 · production: açık PB-01)"]
        P[proxy.ts<br/>CSP nonce, header'lar,<br/>iyimser yönlendirme]
        subgraph Next["Next.js 16 (Node.js runtime)"]
            RSC[Server Components<br/>dashboard / portal]
            SA[Server Actions]
            RH[Route Handlers<br/>/b/token,<br/>/api/uploads, /api/files, /api/cron]
            SVC[Feature servisleri<br/>state machine, kurallar]
            DAL[Data access<br/>server-only, DTO]
            AUTH[Better Auth<br/>username + admin]
            CA[Müşteri erişimi<br/>token HMAC/AES-GCM,<br/>imzalı oturum cookie'si]
            STG[Storage modülü]
            VAL[PDF yapısal doğrulama]
        end
        CRON[Günlük teknik temizlik]
    end

    DB[(Postgres — Neon<br/>aws-eu-central-1)]
    BLOB[(Private object storage<br/>Vercel Blob fra1)]

    S --> P --> RSC
    C --> P
    W -. "bağlantı /b/token" .-> C
    RSC --> DAL
    SA --> SVC --> DAL --> DB
    RH --> SVC
    AUTH --> DB
    CA --> DB
    SVC --> STG --> BLOB
    SVC --> VAL
    C -- "doğrudan PDF upload (client token)" --> BLOB
    BLOB -- "upload callback" --> RH
    CRON --> RH
```

## 3. Başvuru Oluşturma Akışı

```mermaid
sequenceDiagram
    autonumber
    actor E as Çalışan
    participant UI as /dashboard/applications/new
    participant A as createApplicationAction
    participant S as applicationService
    participant DB as Postgres (tek transaction)

    E->>UI: Ad, soyad, telefon, e-posta, hizmet, (not)
    UI->>A: submit(form, idempotencyKey)
    A->>A: Zod, requireStaff()
    A->>S: createApplication(input, actor)
    S->>DB: BEGIN
    S->>DB: idempotency kontrolü
    S->>DB: hizmet aktif mi? aktif şablon var mı?
    S->>DB: yıllık sayaç UPSERT RETURNING
    S->>DB: applications INSERT (müşteri bilgileri + service_name_snapshot, AWAITING_DOCUMENTS)
    S->>DB: application_document_requirements INSERT (snapshot)
    S->>S: token = CSPRNG 256 bit · hash = HMAC · enc = AES-256-GCM
    S->>DB: application_access_tokens INSERT
    S->>DB: application_status_history INSERT (NULL → AWAITING_DOCUMENTS)
    S->>DB: application_internal_notes INSERT (varsa)
    S->>DB: audit_logs INSERT (APPLICATION_CREATED, ACCESS_LINK_CREATED)
    S->>DB: COMMIT
    S-->>A: {applicationId, number, link, whatsappUrl}
    A-->>UI: Sonuç: başarı mesajı, ad-soyad, no, hizmet, bağlantı,<br/>Kopyala · WhatsApp ile Paylaş · Detaya git
```

Müşteri eşleştirme/mükerrer kontrolü yoktur (OD-10). Herhangi bir adım başarısız olursa her şey geri alınır.

## 4. Müşteri Erişim Akışı

```mermaid
sequenceDiagram
    autonumber
    actor M as Müşteri
    participant B as GET /b/[token]
    participant P as /portal
    participant DB as Postgres

    M->>B: WhatsApp'taki bağlantıyı açar
    B->>B: IP rate limit (HMAC'li kısa ömürlü anahtar)
    B->>DB: HMAC(token) ile ara · iptal değil · başvuru silinmiyor
    alt geçersiz
        B-->>M: 303 → /link-invalid (genel mesaj, token yok)
    else geçerli
        B-->>M: Set-Cookie __Host-cs_portal (imzalı, 7 gün) + 303 → /portal
    end
    M->>P: /portal (token'sız URL)
    P->>DB: cookie imzası + süre + token durumu kontrolü
    P-->>M: Başvuru, evraklar, yükleme
```

Ek doğrulama adımı yoktur (OD-01). GET hiçbir veriyi değiştirmez (BR-105). Ayrıntı: [SECURITY.md](SECURITY.md) §3.

## 5. Katmanlar ve Sorumluluklar

| Katman | Konum | Kural |
|---|---|---|
| UI (RSC) | `src/app/**/page.tsx`, `src/features/*/components` | Veriyi DAL fonksiyonlarıyla okur; yalnızca DTO alır. |
| UI (Client) | `"use client"` bileşenler | Yalnızca DTO / serileştirilebilir prop. Secret, DB, storage import edemez. |
| Giriş noktaları | `src/features/*/actions.ts`, `src/app/**/route.ts` | Zod → aktör → yetki → servis → `ActionResult`. İş kuralı içermez. |
| Servisler | `src/features/*/service.ts` | Transaction, guard, audit. `server-only`. |
| Domain (saf) | `src/features/*/domain/*.ts` | State machine'ler, tamamlanma hesapları, etiketler. I/O yok; unit test. |
| Data access | `src/features/*/queries.ts` | Drizzle sorguları, DTO eşleme, `deletion_requested_at IS NULL` filtresi. `server-only`. |
| Altyapı | `src/server/*` | Auth, DB, storage, PDF doğrulama, kripto, rate limit, audit, env. `server-only`. |

### DTO kuralı
- Personel ve müşteri DTO'ları ayrı tipler ve ayrı sorgu fonksiyonlarıdır (`getStaffApplicationDetail`, `getCustomerPortalView`).
- `src/features/portal/**` `application_internal_notes`, `audit_logs`, `users` şemalarını **import edemez** (ESLint `no-restricted-imports` — PHASE 01).
- Sorgular açık kolon listesiyle yapılır.

## 6. Server Actions vs Route Handlers

| Kullanım | Mekanizma | Gerekçe |
|---|---|---|
| Form mutasyonları (başvuru, müşteri bilgisi, hizmet, şablon, inceleme, statü geçişi, not, yorum, bağlantı yenile/iptal, silme) | **Server Action** | Proxy köken kontrolü (403, D-069) + yerleşik Origin/Host CSRF kontrolü, tipli sözleşme, küçük payload (<1 MB) |
| Müşteri gönderimi, dosya kaldırma, upload onayı | **Server Action** | Aynı; müşteri cookie'si action içinde doğrulanır |
| Personel girişi / çıkışı | **Server Action** (`auth.api`, D-060) | Better Auth HTTP route'u bağlanmaz; CSRF için Server Action origin kontrolü |
| Upload token + storage callback (`/api/uploads`) | **Route Handler** | `handleUpload` Request/Response bekler; callback harici HTTP çağrısıdır |
| PDF görüntüle/indir (`/api/files/[fileId]`) | **Route Handler** | Binary stream, özel header'lar |
| Bağlantı girişi (`/b/[token]`) | **Route Handler (GET)** | Cookie set + 303; sayfa render etmez |
| Teknik temizlik (`/api/cron/cleanup`) | **Route Handler** | Zamanlanmış GET; `CRON_SECRET` |

Server Actions public endpoint kabul edilir; her action kendi kontrolünü yapar.

## 7. Klasör Yapısı

```
.
├── CLAUDE.md
├── README.md
├── docs/
├── public/
├── scripts/
│   └── auth/{bootstrap,reset-password}.ts   # İki hesabı oluşturma / şifre sıfırlama (yerel CLI, PHASE 03)
├── tests/{unit,integration,e2e,fixtures}/
├── drizzle.config.ts          # PHASE 02
├── scripts/db/                # db:init, db:migrate, db:seed, db:verify, db:studio (Node 24 ile doğrudan)
├── next.config.ts
└── src/
    ├── proxy.ts
    ├── config/
    │   ├── constants.ts           # MAX_PDF_SIZE_BYTES, şifre/oturum/rate limit sabitleri
    │   └── company.ts             # Şirket telefonu, WhatsApp (değerler sağlanana kadar null)
    ├── app/
    │   ├── (auth)/login/page.tsx
    │   ├── (dashboard)/dashboard/
    │   │   ├── layout.tsx         # requireStaff() + DashboardShell (PHASE 04)
    │   │   ├── (overview)/{page,loading}.tsx   # Genel Bakış; iskelet yalnızca burada (404 için)
    │   │   ├── [...rest]/page.tsx # requireStaff() + notFound() (panel içi 404)
    │   │   ├── error.tsx, not-found.tsx
    │   │   ├── applications/{page,new/page,[id]/page}.tsx
    │   │   ├── services/{page,new/page,[id]/page}.tsx
    │   │   └── audit-logs/page.tsx                       # iki hesap eşit (OD-24)
    │   ├── (portal)/
    │   │   ├── b/[token]/route.ts
    │   │   ├── portal/{layout,page}.tsx
    │   │   └── link-invalid/page.tsx
    │   ├── api/{auth/[...all],uploads,files/[fileId],cron/cleanup}/route.ts
    │   ├── layout.tsx, not-found.tsx, error.tsx, global-error.tsx
    │   └── robots.ts
    ├── components/
    │   ├── ui/                    # shadcn/ui
    │   ├── shared/                # Logo, StatusBadge, EmptyState, ConfirmDialog...
    │   ├── dashboard/             # PHASE 04: Shell, Sidebar, MobileNavigation, Header, Breadcrumb, PageHeader, StatCard, Empty/Error/Loading, AccountMenu (DataTable PHASE 06)
    │   └── portal/
    ├── features/
    │   ├── auth/          {components, schemas}
    │   ├── applications/  {actions, service, queries, schemas, components, domain/}
    │   ├── services/      {actions, service, queries, schemas, components}
    │   ├── documents/     {actions, service, queries, schemas, components, domain/}
    │   ├── portal/        {actions, service, queries, components}
    │   └── audit/         {service, queries, components}
    ├── server/                    # Tümü `import 'server-only'`
    │   ├── env.ts
    │   ├── db/{client.ts, settings.ts, schema/*.ts, migrations/}   # PHASE 02
    │   ├── auth/{auth.ts, staff.ts, rate-limit.ts, password-policy.ts}   # PHASE 03 (permissions.ts yok — OD-24)
    │   ├── customer-access/{tokens.ts, portal-session.ts}
    │   ├── storage/{storage.ts, pdf-validation.ts}
    │   ├── security/{crypto.ts, rate-limit.ts, headers.ts}
    │   └── audit/log.ts
    └── lib/                       # İzomorfik saf yardımcılar
        ├── dates.ts, search.ts, phone.ts, result.ts, messages.ts, whatsapp.ts, utils.ts
        └── upload-client.ts       # uploadPdf() — client tarafı storage sınırı
```

**PHASE 02'de eklenenler:** `drizzle.config.ts`, `src/config/statuses.ts`, `src/server/db/{client.ts, settings.ts, schema/, migrations/}`, `scripts/db/`, `tests/integration/`, `vitest.integration.config.ts`.

**PHASE 01 itibarıyla mevcut olanlar:** `src/app/{layout.tsx, page.tsx, globals.css, robots.ts}`, `src/components/ui/{button,card,badge,alert,separator,input,label}.tsx`, `src/components/shared/logo.tsx`, `src/config/{company,constants}.ts`, `src/lib/utils.ts`, `src/server/env.ts`, `tests/{unit,e2e}/`, `scripts/check-client-bundle.mjs`, `.github/workflows/ci.yml`. Diğer klasörler gerçek kullanımları başladığı fazda oluşturulur (boş klasör/placeholder yok).

Önceki yapıdan kaldırılanlar: `features/customers`, `features/settings`, `server/email`, `server/customer-access/otp.ts`, `/dashboard/settings`, `/dashboard/account`, `/portal/verify`, `src/types` (gerçek ihtiyaç doğunca eklenir).

### Client/Server sınırı
1. `src/server/**`, `service.ts`, `queries.ts` ilk satırda `import 'server-only'`. **İstisna (D-057):** `src/server/db/schema/*` ve `src/server/db/settings.ts` Node CLI'ında (drizzle-kit, `scripts/db`) da yüklendiği için `server-only` içermez; secret içermezler ve client'tan import ESLint kuralıyla engellidir. Veritabanına bağlanan `src/server/db/client.ts` `server-only`'dir.
2. `NEXT_PUBLIC_*` değişken **yok**; bağlantılar sunucuda üretilir.
3. ESLint `no-restricted-imports`: `src/components/**` ve `src/lib/**` içinden `@/server/*` ve `server-only` yasak. `"use client"` dosyaları glob ile hedeflenemediğinden, onlar için güvence `server-only`'nin derleme zamanı hatasıdır.
4. `pnpm check:bundle` (`scripts/check-client-bundle.mjs`): build sonrası `.next/static` içinde sunucu env adları ve sunucu modülü işaretleri aranır; bulunursa başarısız olur (CI'da çalışır).

## 8. Route Mimarisi

| Route | Amaç | Roller | AuthN | AuthZ | Render | Cache | Hassas veri |
|---|---|---|---|---|---|---|---|
| `/` | `/login` veya `/dashboard`'a yönlendirme (PHASE 03). PHASE 01–02'de statik altyapı önizleme sayfası (veri/işlev yok) | Herkes | — | — | Redirect (PHASE 01: statik) | no-store (PHASE 01: hassas veri yok, statik) | Yok |
| `/login` | Personel girişi (yalnızca kullanıcı adı + şifre) | Anonim | — | Girişliyse yönlendir | RSC + client form | no-store | Yok |
| `/dashboard` | Sayaçlar, son başvurular, inceleme bekleyenler (PHASE 03: korumalı placeholder) | Personel | Staff session | `requireStaff` | RSC | no-store | Orta |
| `/dashboard/applications` | Tek liste; arama, statü/hizmet/tarih filtresi, sayfalama | Personel | ✅ | `requireStaff` | RSC | no-store | Yüksek |
| `/dashboard/applications/new` | Başvuru oluşturma + sonuç ekranı | Personel | ✅ | `requireStaff` | RSC + client form | no-store | Yüksek |
| `/dashboard/applications/[id]` | Detay: müşteri bilgisi, evraklar, inceleme, yorum, not, geçmiş, bağlantı, geri alma/yeniden açma/silme | Personel | ✅ | `requireStaff` + kaynak kontrolü | RSC + client adalar | no-store | **Çok yüksek** |
| `/dashboard/services` · `/new` · `/[id]` | Hizmet + evrak şablonu | Personel | ✅ | `requireStaff` | RSC + client form | no-store | Düşük |
| `/dashboard/audit-logs` | Genel işlem geçmişi | Personel | ✅ | `requireStaff` | RSC | no-store | Orta |
| `GET /b/[token]` | Token doğrula → cookie → 303 `/portal` | Anonim | Token | Token geçerliliği | Route Handler | no-store | Token |
| `/portal` | Müşteri paneli | CUSTOMER | Portal cookie | Tek başvuru | RSC + client adalar | no-store | **Çok yüksek** |
| `/link-invalid` | Genel geçersiz bağlantı mesajı | Herkes | — | — | RSC (statik içerik, no-store) | no-store | Yok |
| `POST /api/uploads` | Upload token / storage callback | Staff, CUSTOMER, storage | Session / callback doğrulaması | `file:upload` + BR-44 | Route Handler | no-store | Metadata |
| `GET /api/files/[fileId]` | PDF stream | Staff, CUSTOMER | Session | `file:view_download` | Route Handler | no-store | **Belge** |
| `GET /api/cron/cleanup` | Teknik temizlik | SYSTEM | `CRON_SECRET` | — | Route Handler | no-store | — |

Kaldırılan route'lar: `/dashboard/settings`, `/dashboard/account`, `/portal/verify`, arşiv görünümleri.

## 9. Cache Stratejisi (Next.js 16)

Doğrulanan davranış: Cache Components opt-in; kapalıyken `fetch` cache'lenmez, `cookies()`/`headers()` okuyan sayfalar dinamik; Route Handler GET'ler varsayılan dinamik; `use cache` içinde `cookies()` çağrılamaz.

Kurallar (D-016):
1. `cacheComponents` **kapalı**.
2. `'use cache'`, `unstable_cache`, `force-cache`, `force-static`, `revalidate = N` hassas veride **yasak** (lint/grep — PHASE 01).
3. `/dashboard`, `/portal`, `/b`, `/api`: `Cache-Control: private, no-store, max-age=0`.
4. Korumalı layout/page `requireStaff()` / `requireCustomer()` çağırır → dinamik render.
5. Çıkış, bağlantı iptali, rol değişikliği sonrası `router.refresh()` / tam yönlendirme.
6. React `cache()` yalnızca istek kapsamlı memoization için.

## 10. Hata Yönetimi

- `ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code; message; fieldErrors? } }`.
- `ErrorCode`: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATUS_TRANSITION`, `GUARD_FAILED`, `RATE_LIMITED`, `FILE_REJECTED`, `UPLOAD_IN_PROGRESS`, `INTERNAL_ERROR`.
- Türkçe mesajlar `src/lib/messages.ts`'te. Beklenmeyen hatalar PII'siz loglanır; kullanıcıya genel mesaj.
- Hata sayfaları stack trace, token veya iç ID göstermez.

## 11. Sabit Yapılandırma ve Environment

### 11.1 `src/config/constants.ts` (panelden değiştirilemez)
| Sabit | Değer | Kaynak |
|---|---|---|
| `ALLOWED_FILE_MIME` / `ALLOWED_FILE_EXTENSION` | `application/pdf` / `.pdf` | OD-16 |
| `MAX_PDF_SIZE_BYTES` | `10 * 1024 * 1024` = **10 485 760** ("10 MB") | OD-16 |
| `UPLOAD_TOKEN_TTL_SECONDS` | 900 | FILE_STORAGE §2.1 |
| `STALE_VALIDATION_MINUTES` | 10 | FILE_STORAGE §2.1 |
| `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH` | 8 / 128 | OD-22 |
| `STAFF_SESSION_MAX_AGE_SECONDS` | 604800 (7 gün, uzatılmaz) | OD-22 |
| `CUSTOMER_SESSION_MAX_AGE_SECONDS` | 604800 (7 gün, uzatılmaz) | OD-22 |
| `ACCESS_TOKEN_BYTES` | 32 (256 bit) | OD-01 |
| Rate limitler | SECURITY §6 | |
| `PAGE_SIZES` | 10 / 20 / 50 | |

### 11.2 `src/config/company.ts` (OD-14)
`{ name: 'CS Global', tagline: 'Vize Danışmanlık', productName: 'Vize Danışmanlık Yönetim Platformu', phoneE164: null, whatsappE164: null }` — gerçek numaralar Product Owner tarafından sağlanınca E.164 biçiminde doldurulur; `null` iken UI disabled/placeholder gösterir, bağlantı üretmez (BR-171). Unit test uydurma biçimi reddeder.

### 11.3 Environment
`src/server/env.ts` (Zod, `server-only`) **ilk kullanımda** doğrular (D-047): henüz kullanılmayan servis değişkenleri build'i bozmaz; her değişken onu kullanan kodla birlikte şemaya eklenir ve production'da zorunludur (fail-closed). `NODE_ENV=production` iken `APP_ENV` zorunlu; development dışında `APP_URL` `https` origin olmalıdır. Liste: [DEPLOYMENT.md](DEPLOYMENT.md) §3. `APP_URL` tek bağlantı kaynağıdır (OD-20).

## 12. Transaction ve Idempotency

- `pg.Pool` (pooled URL) + `drizzle-orm/node-postgres`; interactive transaction (D-006). Ayrıntı §12.1.
- Transaction içinde ağ çağrısı yok (storage, doğrulama dışarıda).
- Başvuru oluşturma `idempotencyKey`; upload claim satır kilidi; gönderim statü guard'ı; bağlantı yenileme `applications FOR UPDATE` + partial unique index.

## 13. Gözlemlenebilirlik

- Hosting runtime logları + yapılandırılmış JSON loglar; PII ve token **loglanmaz** (redaksiyon listesi; `/b/` path'i maskelenir).
- Harici APM/analytics/hata izleme servisi yok; müşteri tarafında üçüncü taraf script yasak.

### 12.1 Veritabanı bağlantı katmanı (PHASE 02 — D-055)
- `getDb()` (`src/server/db/client.ts`): ilk çağrıda `getDatabaseEnv()` ile `DATABASE_URL` doğrulanır, **süreç başına tek** `pg.Pool` kurulur; modül import'u bağlantı açmaz. Development'ta hot reload'da `globalThis` üzerinden yeniden kullanılır. İstek veya sorgu başına Pool/bağlantı açılmaz.
- Doğrudan Drizzle sorgu ve `db.transaction()` API'si kullanılır; generic repository, Unit of Work veya DI katmanı yoktur.
- **Pool ayarları ve gerekçesi:** `max: 5` — Neon pooler (PgBouncer, transaction modu) istemci bağlantılarını 10 000'e kadar kabul eder ve sunucu bağlantılarını `0.9 × max_connections` (0.25 CU'da ≈100) havuzunda çoğullar; sunucusuz örnek başına küçük havuz yeterlidir. `idleTimeoutMillis: 10s` — boştaki istemciler kapanır. `connectionTimeoutMillis: 10s` — Neon'un scale-to-zero sonrası uyanması "birkaç yüz ms"dir (Free plan'da 5 dk hareketsizlikte uyur); pay bırakılır. Bu değerler başlangıç değerleridir; yük testleri PHASE 12'de, hosting'e özgü havuz yaşam döngüsü (ör. Vercel `attachDatabasePool`) PHASE 13'te değerlendirilir.
- **Zaman aşımları rol düzeyindedir** (`statement_timeout 15s`, `lock_timeout 5s`, `idle_in_transaction_session_timeout 15s` — `pnpm db:init`): pooler transaction modunda oturum `SET`'i korunmaz ve başka istemcilere taşabilir; transaction içi gereksinimde `SET LOCAL` kullanılır.
- Pooler kısıtları: oturum `SET/RESET`, `LISTEN/NOTIFY`, SQL `PREPARE`, oturum düzeyi advisory lock kullanılmaz.
- Hata logu yalnızca PostgreSQL hata kodunu içerir; bağlantı adresi, kullanıcı adı, şifre, sorgu parametresi veya kişisel veri loglanmaz.
- Statik başlangıç sayfası ve `next build` veritabanı gerektirmez.

### 12.2 Personel kimlik doğrulaması (PHASE 03 — D-060…D-064)
- `src/server/auth/auth.ts`: `createAuth()` / `getAuth()` (lazy) — Better Auth, yalnızca sunucu; HTTP route'u yok.
- `src/server/auth/staff.ts`: `getCurrentStaff()` (istek başına `cache`; cookie yoksa DB'ye gitmez) ve `requireStaff()` — tek ortak kontrol (OD-24).
- `src/server/auth/rate-limit.ts`: giriş sayaçları; `src/server/auth/credentials-policy.ts`: kullanıcı adı/şifre politikası (CLI ile ortak, saf modül).
- `src/features/auth/{actions.ts, schemas.ts, components/login-form.tsx}`: `signInAction` / `signOutAction` (Server Action), ortak giriş formu.
- `src/app/(auth)/login`, `src/app/(dashboard)/dashboard` (korumalı placeholder), `src/app/page.tsx` (yönlendirme), `src/proxy.ts` (nonce'lu CSP).
- `scripts/auth/{accounts,bootstrap,reset-password,prompt}.ts`: yerel hesap CLI'ı.
- Ortam: `getAuthEnv()` → `BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY_SECRET`, `APP_URL` (D-066).

## PHASE 04 Notları (uygulandı)
- **Panel düzeni:** `layout.tsx` oturumu çözer ve `DashboardShell`'i render eder; her sayfa ayrıca `requireStaff()` çağırır. Menü `src/config/navigation.ts` (iki hesap için aynı); aktif durum istemcide `usePathname` ile (`NavLinks`). Mobil drawer Radix Dialog (`radix-ui` paketi); hesap menüsü Radix DropdownMenu.
- **Genel Bakış verisi:** `src/features/dashboard/queries.ts` — `getDashboardOverview(getDb())` salt okunur REPEATABLE READ transaction, yalnızca DTO döner; hata `{ ok: false }` (boş durumdan ayrı). Sayaç tanımları `src/features/dashboard/domain.ts` (D-070).
- **Proxy:** önce köken kontrolü (durum değiştiren, `/api/*` dışı istekler → 403), sonra nonce'lu CSP. Proxy kimlik doğrulama yapmaz.
- **CSP + Radix:** kaydırma kilidinin `<style>` etiketi için nonce `CspNonce` ile `get-nonce`'a verilir (D-071).
