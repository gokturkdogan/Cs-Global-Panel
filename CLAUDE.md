# CLAUDE.md — CS Global Visa Management Platform

Bu dosya tüm geliştirme fazlarında temel talimattır. Ayrıntılar `docs/` altındadır; burada yalnızca özet ve kurallar bulunur.

## Proje
CS Global (vize danışmanlığı) için evrak toplama, inceleme ve süreç takibi platformu. Tek Next.js uygulaması, iki arayüz:
- **Şirket paneli** (`/dashboard`) — **yalnızca iki sabit hesap** (bir ADMIN, bir EMPLOYEE), **birebir eşit yetki** (OD-24); kullanıcı adı + şifre; hesaplar ve şifre sıfırlama yalnızca yerel CLI.
- **Müşteri paneli** (`/portal`, giriş `/b/<token>`) — hesapsız; **yalnızca bağlantı** ile doğrudan erişim (bearer, süresiz). **Mobile-first.**

Ürün yaklaşımı: basit, düşük maliyetli (**aylık 0 hedefi**; tek istisna Backblaze B2 için yıllık ~10 USD bütçe — OD-26), harici servis yok, mevcut WhatsApp operasyonunu kolaylaştırır. Resmî vize sistemi değildir. → `docs/PROJECT_OVERVIEW.md`

## Mevcut fazı tespit etme
1. `docs/PROJECT_STATE.md` → "Current Phase", "Technical Decisions", "Next Phase".
2. `docs/DEVELOPMENT_ROADMAP.md` → fazın Scope / Acceptance / DoD.
3. Yalnızca o fazın kapsamında çalış. **Kullanıcı açıkça istemeden sonraki faza geçme.**

## Her fazdan önce
- `CLAUDE.md`, `docs/PROJECT_STATE.md`, `docs/DECISION_LOG.md` ve fazla ilgili dokümanları oku.
- Ürün kararları OD-01…OD-25 **kesindir** (Product Owner, 2026-11-24) — tekrar sorma, değiştirme, kapsamını kendiliğinden genişletme. Yalnızca gerçekten çözülmemiş teknik kararları (TD-xx) sor.
- Paket sürümlerini npm registry / resmî dokümandan yeniden doğrula; tahmin etme. Kurulu sürümler: `docs/TECH_STACK.md` §0. Next.js API'leri için kurulu sürümün dokümanı `node_modules/next/dist/docs/` altındadır.
- Yeni bağımlılık exact sürümle eklenir; `shadcn add` sonrası `package.json` farkı incelenir (D-043).

## Stack (`docs/TECH_STACK.md`)
Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript **6.0.3** strict (D-002; TS 7 typescript-eslint ile uyumsuz) · **Node.js 24 LTS** · pnpm **10.34.9** (`packageManager`, D-004) · ESLint 10 + `eslint-config-next` (D-042) · Tailwind CSS 4 · shadcn/ui · Lucide · Geist · React Hook Form + Zod 4 · Neon Postgres + Drizzle ORM 0.45 (`node-postgres`) · Better Auth 1.7 (username + admin) · Backblaze B2 private bucket (OD-25; `src/server/storage/*` arayüzü arkasında, `@aws-sdk/client-s3`) · pdfjs-dist (yapısal PDF doğrulaması, izole worker) · Vitest · Playwright · ESLint + Prettier.
Temel stack kullanıcı onayı olmadan değiştirilmez. Yeni bağımlılık için gerekçe sun. **Ücretli servis, ücretli plan, kredi kartı gerektiren hizmet, otomatik ücretlendirme yok** (kullanıcı onayı olmadan).

## Mimari ilkeler (`docs/ARCHITECTURE.md`)
- Modüler monolit; `src/features/*`, server-only altyapı `src/server/*`, saf yardımcılar `src/lib/*`, sabitler `src/config/*`.
- RSC varsayılan; `"use client"` yalnızca etkileşim için; client'a yalnızca DTO.
- Mutasyon = Server Action; binary / storage callback / auth / `/b/<token>` / cron = Route Handler.
- Akış: **Zod → oturumu sunucuda çöz (`requireStaff()` / müşteri oturumu) → kaynak kontrolü → domain guard (kilit altında) → transaction → audit → DTO**.
- Statü geçişleri yalnızca merkezi state machine ile (`docs/STATE_TRANSITIONS.md`); personel de yalnızca matristeki geçişleri yapar.
- Transaction içinde ağ çağrısı yok; kilit sırası (services → service_document_requirements →) applications → requirements → files → storage_quota_state; güncellemeler `expectedVersion` ile (D-074).
- Veritabanı: uygulama yalnızca `getDb()` (`cs_app_runtime`, en az yetki) ile; şema değişikliği = `pnpm db:generate` + SQL incelemesi + yeni migration (uygulanmış migration değiştirilmez, `push` yok); yeni tablo GRANT'ı aynı migration'da; statü değerleri `src/config/statuses.ts`; ayrıntı `docs/DATABASE_SCHEMA.md` §9.
- `cacheComponents` kapalı; hassas veride `use cache` / `force-static` / `revalidate` yasak; korumalı yanıtlar `no-store`.
- Ön-getirme: `Link` yalnızca ana gezinme/breadcrumb'da ön-getirir; liste/tablo/sayfalama/aksiyon bağlantıları `prefetch={false}`; `/b/…` ve dosya uç noktaları asla `Link` değildir (D-137, statik test). Performans iddiası ölçümle (`pnpm perf:isolated`, `pnpm perf:db:isolated`); indeks yalnızca EXPLAIN ölçümüyle gerekçelenirse.
- Sabit yapılandırma: dosya limitleri (PDF, `MAX_PDF_SIZE_BYTES = 10 485 760`, evrak başına 1 aktif PDF), şifre min 8, oturumlar 7 gün sabit, rate limitler, şirket iletişim bilgileri. Ayarlar sayfası/tablosu yok.
- Gelecek ihtimaller için kod, tablo, endpoint, servis, konfigürasyon oluşturma.

## Güvenlik kuralları (`docs/SECURITY.md`, `docs/THREAT_MODEL.md`)
- Her hassas okuma/yazma kendi giriş noktasında yeniden yetkilendirilir; `proxy.ts` kimlik doğrulama sınırı değildir (yalnızca köken kontrolü → 403 ve CSP — D-069).
- Personel erişimi: her korumalı sayfa/action/route kendi içinde `requireStaff()` çağırır; Better Auth yalnızca sunucu tarafı `auth.api` (HTTP route'u yok — D-060); hesaplar ve şifreler yalnızca `pnpm auth:bootstrap` / `pnpm auth:reset-password` (sahip rolüyle — runtime rolünün users/accounts yazma yetkisi yok, D-144).
- Müşteri girişi (D-141): `GET /b/<token>` yalnızca veritabanısız genel ara sayfa — oturum yalnızca açık `POST /b/enter` ile; GET/HEAD ile oturum açan yol ekleme.
- Müşteri bağlantısı bir **bearer credential**'dır: token 256 bit CSPRNG; DB'de yalnızca HMAC hash + AES-256-GCM kopya (AAD başvuru+token kimliği); anahtarlar env'de (`ACCESS_TOKEN_*`, `getAccessTokenEnv()`); kriptografi yalnızca `src/server/access-tokens/`. Bağlantı yalnızca açık personel aksiyonuyla çözülür (audit'li); listeye/URL'ye/tarayıcı depolamasına konmaz. Kişisel veri içerebilen arama metni URL'ye yazılmaz. Token log, audit, hata mesajı, analytics'e asla yazılmaz. Bağlantı URL'si yalnızca `APP_URL`'den üretilir.
- Müşteri kapsamı yalnızca portal oturumundan; istemciden gelen `applicationId` kabul edilmez; her müşteri sayfası/action'ı `requireCustomerAccess(contextId)` ile başlar (imza, 7 gün sabit süre, URL bağlamı = cookie bağlamı, bağlantı iptal edilmemiş, başvuru silinmiyor — D-088…D-090, D-095). Müşteri kodu `src/features/customer-portal`; personel auth/iç not/audit/token modüllerini içe aktaramaz (ESLint). Kapsam dışı → 404.
- İç notlar müşteri yolunda hiçbir şekilde sorgulanmaz/serileştirilmez.
- IP, hash'lenmiş IP, user-agent, cihaz bilgisi uygulama DB'sinde saklanmaz (yalnızca kısa ömürlü HMAC'li rate limit anahtarları).
- Better Auth mekanizmalarını yeniden yazma; kapalı uç noktalar (`sign-up`, `change-password`, `update-user`, reset, `admin/*` HTTP) testle doğrulanır.
- Dosyalar: private B2 bucket (CORS kapalı, public URL yok), yalnızca `/api/files/[id]` (personel) ve `/api/portal/[context]/files/[id]` (müşteri, yalnızca ACTIVE), yalnızca doğrulanmış dosyalar. Yükleme yalnızca sunucu üzerinden (ham PDF → doğrulama → rezervasyon → B2 → aktivasyon; proxy bu yolları kapsamaz — D-100, D-103); storage çağrısı transaction içinde yok; silme yalnızca versiyona özgü; kayıtlı geçerli versiyonlar otomatik silinmez. Kota hedefi 100 GB / uyarı 90 GB (OD-26, D-140; kod tavanı `src/config/constants.ts`, aktif değer env'de — sağlayıcı hesabı hazır olana kadar 9 / 8 GB); kullanım hesabı aktif + önceki versiyon + devam eden + belirsiz + kayıt dışı (D-101). Otomatik testler gerçek B2 kullanmaz; canlı test yalnızca `pnpm storage:verify` (mutasyon — ayrı onay); salt okunur denetim `pnpm storage:inspect`. Uygulamaya özel yedek/geri yükleme altyapısı YOK (OD-27) — ekleme; sağlayıcı düzeyi geri yükleme manuel (OPERATIONS_RUNBOOK §2). Operasyon prosedürleri `docs/OPERATIONS_RUNBOOK.md`, denetim `docs/SECURITY_AUDIT.md`. B2 anahtarı yalnızca `pnpm env:b2` ile (sohbette istenmez). Yapısal doğrulama antivirüs değildir — "virüssüz/güvenli" etiketi kullanma. Dosya route'ları GET + HEAD; tek aralıklı Range (206/416, If-Range) sağlayıcıya `Range`+`VersionId` olarak iletilir — tam indirip uygulamada kesmek, istemciden anahtar/versiyon almak yasak (D-135). Görüntüleyici tembel pdf.js + yerel worker; CSP yalnızca `worker-src 'self'` (eval/wasm/joker yok); PDF kalıcı tarayıcı depolamasına yazılmaz (D-136).
- Silme personel tarafından (iki hesap eşit), onaylı, iki aşamalı ve gerçek (storage + DB); soft delete'i gerçek silme sayma.
- `dangerouslySetInnerHTML`, ham SQL birleştirme, `.env*` commit yasak.

## Kodlama standartları
- Kod/dosya/değişken/DB alanları **İngilizce**; UI ve dokümantasyon **Türkçe**; kullanıcıyla Türkçe iletişim.
- Türkçe mesajlar `src/lib/messages.ts`'te.
- Clean Code, SOLID, DRY, KISS; gereksiz soyutlama ve talep edilmeyen özellik yok.
- TS strict; `any` yok; Zod `.strict()`.
- Tarih: `timestamptz` UTC; gösterim `Europe/Istanbul`.
- İş kuralı referansı için yorumlarda `BR-xx`.

## Zorunlu testler (`docs/TESTING_STRATEGY.md`)
- Domain kuralı → unit; yeni mutasyon → yetki matrisi testi; DB'ye dokunan servis → integration; kullanıcı akışı → E2E (müşteri paneli için mobil projeler).
- Kalite kapıları: `pnpm lint`, `typecheck`, `format:check`, `test` (unit), `db:check`, `test:integration`, `build`, `check:bundle`, `test:e2e`, `audit`. Kısayol: `pnpm check`.
- Testler gerçek şirket hesaplarını oluşturmaz, silmez, şifrelerini/credential kayıtlarını ve mevcut oturumlarını değiştirmez (D-065, D-067). Gerçek hesaplar varken kimliği doğrulanmış testler `tests/support/staff-session.ts` ile test başına kısa ömürlü oturum kullanır ve siler; geçici `test-` hesaplı yaşam döngüsü testleri yalnızca hesap yokken çalışır. Uygulamaya test bypass'ı, test endpoint'i veya özel header eklenmez; Playwright trace kapalı kalır. Commit eden mutasyon testleri (eşzamanlılık, tarayıcıdan oluşturma/düzenleme) ve gerçek hesap adına audit yazan testler yalnızca izole geçici veritabanında (`pnpm test:integration:isolated`, `pnpm test:e2e:isolated` — Docker, D-077); ortak veritabanında (`pnpm test:integration`, `pnpm test:e2e`) yalnızca salt okunur veya geri alınan testler çalışır; ortak veritabanına kalıcı test yazımı yapılmaz (D-086).
- Test edilmemiş işi tamamlanmış gibi raporlama.

## Dokümantasyon kuralları
- Davranış değiştiren her değişiklikte ilgili dokümanı güncelle; çelişki bırakma (öncelik: BUSINESS_RULES → STATE_TRANSITIONS → AUTHORIZATION_MATRIX → SECURITY → diğerleri).
- Teknik kararlar `docs/DECISION_LOG.md`'ye (kullanıcı onaylamadıysa **Proposed**); geçmiş kararları silme, **Superseded** işaretle.
- Her faz sonunda `docs/PROJECT_STATE.md` + `docs/CHANGELOG.md`.

## Yasaklanan yaklaşımlar
Mikroservis/ayrı backend · Bellek içi rate limit veya yerel dosya sistemi (production) · Public storage / kalıcı public dosya URL'i · DB'de binary · Düz metin token · Başvuru numarasını erişim anahtarı yapmak · URL'de kişisel veri · Frontend'de statü belirleme · OTP, e-posta/SMS entegrasyonu · Müşteri profili/eşleştirme/birleştirme · Çalışan atama · Arşivleme · Ayarlar sayfası/tablosu · Otomatik veri saklama/silme veya bağlantı süre sonu · Dinamik dosya limitleri · Harici antivirüs · Self-servis şifre işlemleri · IP/UA saklama · Gerçek müşteri verisinin dev/test/preview/demo'da kullanılması · Müşteri panelinde üçüncü taraf script · Deprecated/deneysel paketler (TS 7, ESLint 9, Drizzle 1.0 RC, Next.js taint API) · `cacheComponents` / `'use cache'` (lint ile engelli) · RBAC / izin matrisi / rol bazlı menü / `requireAdmin` · Uygulama içi hesap yönetimi (oluşturma, silme, pasifleştirme, rol/şifre değiştirme) · Üçüncü şirket hesabı · Better Auth HTTP route'u (`/api/auth/*`) · Kullanıcı onayı olmadan commit/push, hesap açma, ücretli servis, deployment.

## Sonraki faza geçmeden önce
1. Fazın Acceptance + DoD maddeleri tek tek doğrulandı.
2. Kalite kapıları ve testler yeşil; çıktılar raporda.
3. `pnpm audit` yüksek/kritik yok.
4. Yeni secret / gerçek veri / `.env` repoda yok.
5. PROJECT_STATE, CHANGELOG, DECISION_LOG güncel; dokümanlar tutarlı.
6. Faz raporu: yapılanlar, test sonuçları, teknik kararlar, açık konular, doğrulanamayanlar.
7. **Dur ve kullanıcı onayı bekle.**
