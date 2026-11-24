# CLAUDE.md — CS Global Visa Management Platform

Bu dosya tüm geliştirme fazlarında temel talimattır. Ayrıntılar `docs/` altındadır; burada yalnızca özet ve kurallar bulunur.

## Proje
CS Global (vize danışmanlığı) için evrak toplama, inceleme ve süreç takibi platformu. İki arayüz, tek Next.js uygulaması:
- **Şirket paneli** (`/dashboard`) — ADMIN, EMPLOYEE; kullanıcı adı + şifre.
- **Müşteri paneli** (`/portal`, giriş `/b/...`) — hesapsız; başvuruya özel güvenli bağlantı + doğrulama. **Mobile-first.**

Resmî vize sistemi değildir; "Süreç Tamamlandı" vize onayı anlamına gelmez. → `docs/PROJECT_OVERVIEW.md`

## Mevcut fazı tespit etme
1. `docs/PROJECT_STATE.md` → "Current Phase" ve "Next Phase".
2. `docs/DEVELOPMENT_ROADMAP.md` → o fazın Scope / Acceptance / DoD maddeleri.
3. Yalnızca o fazın kapsamında çalış. **Kullanıcı açıkça onaylamadan sonraki faza geçme.**

## Her fazdan önce
- `CLAUDE.md`, `docs/PROJECT_STATE.md`, `docs/DECISION_LOG.md` ve fazla ilgili dokümanları oku.
- Fazın bağımlı olduğu açık kararlar (OD-xx) yanıtlanmamışsa sor; varsayımla ilerleme.
- Kullanılacak paket sürümlerini npm registry / resmî dokümandan yeniden doğrula; tahmin etme.

## Stack (doğrulanmış — `docs/TECH_STACK.md`)
Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · **TypeScript 6.0 strict** (TS 7 değil: typescript-eslint uyumsuz) · Node.js 24 LTS · pnpm (sürüm `packageManager` ile sabit) · Tailwind CSS 4 · shadcn/ui · Lucide · Geist · React Hook Form + Zod 4 · Neon Postgres + Drizzle ORM 0.45 (`node-postgres` sürücüsü) · Better Auth 1.7 (username + admin plugin) · Vercel Private Blob · Vitest · Playwright · ESLint + Prettier.
Temel stack kullanıcı onayı olmadan **değiştirilmez**. Yeni bağımlılık eklemeden önce gerekçe sun.

## Mimari ilkeler (`docs/ARCHITECTURE.md`)
- Modüler monolit; feature klasörleri (`src/features/*`); server-only altyapı `src/server/*`; saf yardımcılar `src/lib/*`.
- RSC varsayılan; `"use client"` yalnızca etkileşim için. Client bileşenlerine yalnızca DTO geçir.
- Mutasyon = Server Action; binary / harici callback / auth = Route Handler.
- Akış: **Zod doğrula → aktörü sunucuda çöz → RBAC → kaynak kapsamı → domain guard → transaction → audit → DTO**.
- İş kuralları ve state machine'ler saf domain modüllerinde; UI ve action'larda iş kuralı yok.
- Statü geçişleri yalnızca sunucudaki merkezi state machine ile (`docs/STATE_TRANSITIONS.md`).
- Transaction içinde ağ çağrısı yok; kilit sırası applications → requirements → files.
- `cacheComponents` kapalı; hassas veride `use cache` / `force-static` / `revalidate` **yasak**; korumalı yanıtlar `no-store`.

## Güvenlik kuralları (`docs/SECURITY.md`, `docs/THREAT_MODEL.md`)
- Her hassas okuma/yazma kendi giriş noktasında yeniden yetkilendirilir; `proxy.ts` güvenlik sınırı değildir.
- Müşteri kapsamı **yalnızca** müşteri oturumundan gelir; istemciden gelen `applicationId` kabul edilmez. Kapsam dışı → 404.
- Şirket içi notlar müşteri yolunda hiçbir şekilde sorgulanmaz/serileştirilmez (`features/portal` import kısıtı).
- Token, şifre, OTP, session, PDF içeriği, gereksiz PII **loglanmaz / audit'e yazılmaz**.
- Secret'lar yalnızca `src/server/env.ts` üzerinden; `NEXT_PUBLIC_` yalnızca `NEXT_PUBLIC_APP_URL`. Her server modülü `import 'server-only'`.
- Better Auth / Next.js'in sağladığı mekanizmaları (hash, session, CSRF, cookie) yeniden yazma.
- Kriptografik rastgelelik: yalnızca `node:crypto`. Token 256 bit.
- Dosyalar: yalnızca private Blob, yalnızca `/api/files/[id]` üzerinden, yalnızca `scan_status = CLEAN` (`docs/FILE_STORAGE.md`).
- `dangerouslySetInnerHTML`, ham SQL string birleştirme, `.env*` commit **yasak**.

## Kodlama standartları
- Kod, dosya, değişken, DB alanları **İngilizce**; UI metinleri ve dokümantasyon **Türkçe**.
- Türkçe kullanıcı mesajları tek yerde (`src/lib/messages.ts`).
- Clean Code, SOLID, DRY, KISS. Gereksiz soyutlama, talep edilmeyen özellik, kullanılmayacak tablo/kod yok.
- TS strict; `any` yok (zorunluysa gerekçeli yorum). Zod şemaları `.strict()`.
- Tarih: DB'de `timestamptz` UTC; gösterim `Europe/Istanbul`.
- Statü etiketleri/renkleri tek kaynaktan (domain label modülleri).
- İş kuralı referansı gereken yerde `BR-xx` kimliğini yorumda kullan.

## Zorunlu testler (`docs/TESTING_STRATEGY.md`)
- Yeni domain kuralı → unit test. Yeni mutasyon → yetki matrisi testine satır. DB'ye dokunan servis → integration test. Kullanıcı akışı → E2E (müşteri paneli için mobil projeler dahil).
- Kalite kapıları: `typecheck`, `lint`, `format:check`, `test:unit`, (varsa) `test:integration`, `build`, `audit`.
- Test edilmemiş işi tamamlanmış gibi raporlama.

## Dokümantasyon kuralları
- Davranış değiştiren her değişiklikte ilgili dokümanı güncelle; dokümanlar çelişmemeli (öncelik: BUSINESS_RULES → STATE_TRANSITIONS → AUTHORIZATION_MATRIX → SECURITY → diğerleri).
- Önemli teknik/ürün kararı → `docs/DECISION_LOG.md` (kullanıcı onaylamadıysa **Proposed**).
- Her faz sonunda: `docs/PROJECT_STATE.md` + `docs/CHANGELOG.md` güncelle.
- Tekrar yerine ilgili ana dokümana referans ver.

## Yasaklanan yaklaşımlar
Mikroservis / ayrı backend sunucusu · Bellek içi rate limit veya yerel dosya sistemi (production) · Public Blob / kalıcı public dosya URL'i · Dosyaların DB'de binary saklanması · Token'ın düz metin saklanması · Başvuru numarasının erişim anahtarı olarak kullanılması · URL'de kişisel veri · Frontend'de statü belirleme · Otomatik müşteri birleştirme · Gerçek müşteri verisinin dev/test/preview'da kullanılması · Preview'ın production DB/Blob'a bağlanması · Müşteri panelinde üçüncü taraf script/analytics · Deprecated/deneysel paketler (ör. TS 7, Drizzle 1.0 RC, Next.js taint API) · Kullanıcı onayı olmadan commit/push, hesap açma, ücretli servis, deployment.

## Sonraki faza geçmeden önce kontrol listesi
1. Fazın Acceptance + DoD maddeleri (`docs/DEVELOPMENT_ROADMAP.md`) tek tek doğrulandı.
2. Kalite kapıları ve testler yeşil; çıktılar raporda.
3. `pnpm audit` yüksek/kritik yok.
4. Yeni secret / gerçek veri / `.env` repoda yok.
5. PROJECT_STATE, CHANGELOG, DECISION_LOG güncel; dokümanlar tutarlı.
6. Faz raporu: yapılanlar, test sonuçları, teknik kararlar, açık konular, doğrulanamayanlar.
7. **Dur ve kullanıcı onayı bekle.**

## İletişim
Kullanıcıyla Türkçe iletişim kur.
