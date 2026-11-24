# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24** (PHASE 01 sonu)

## Current Phase
**PHASE 01 — Project Initialization**
Phase Status: **COMPLETED — kullanıcı onayı bekleniyor** (kabul kriterleri ve test sonuçları aşağıda; PHASE 02'ye onaysız geçilmez)

## Completed Phases
- PHASE 00 — Project Foundation & Architecture (+ revizyon) — Product Owner onayı 2026-11-24. Onay production güvenliği veya KVKK uyumluluğu onayı değildir.
- PHASE 01 — Project Initialization — teknik olarak tamamlandı (2026-11-24); kullanıcı onayı bekleniyor.

## Project Status
Çalışan Next.js 16 altyapısı (yalnızca altyapı önizleme sayfası). Veritabanı, kimlik doğrulama, şirket paneli, müşteri paneli, storage, deployment **yok**. Gerçek müşteri kullanımına hazır değildir. Commit/push yapılmadı.

## Implemented Features
Ürün özelliği yok. PHASE 01 altyapısı:
- Next.js 16.4.6 App Router + `src/`, TypeScript 6.0.3 strict (+ `noUncheckedIndexedAccess`), Tailwind CSS 4.3.5, shadcn/ui (Radix; Button, Card, Badge, Alert, Separator, Input, Label), Lucide, yerel Geist fontu.
- CS Global tasarım token'ları (yalnızca açık tema, WCAG AA kontrastları hesaplandı), geçici metin logo (`Logo`), merkezi `company.ts` (telefon/WhatsApp `null`) ve `constants.ts`.
- Root layout (`lang="tr"`, metadata, noindex, `robots.ts`), altyapı önizleme sayfası.
- `src/server/env.ts` (Zod, lazy, fail-closed), `.env.example`.
- Temel güvenlik header'ları (D-048), ESLint proje kuralları (server import sınırı, `dangerouslySetInnerHTML`, cache API, `any` yasağı), Prettier.
- Vitest (26 unit test), Playwright (4 proje, E2E), client bundle secret kontrolü, GitHub Actions CI taslağı.

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 02–13.

## Product Decisions
OD-01…OD-23: **23/23 ACCEPTED** (Product Owner, 2026-11-24) — [DECISION_LOG.md](DECISION_LOG.md) Bölüm A. Açık ürün kararı **yoktur**.
> Ürün kararlarının tamamlanması production güvenliğinin veya hukuki uygunluğun onaylandığı anlamına gelmez (bkz. Production Blockers).

## Technical Decisions

PHASE 01'de alınan teknik kararlar D-042…D-051 **Proposed** durumdadır ([DECISION_LOG.md](DECISION_LOG.md)); kullanıcı onayıyla Accepted olur.

| ID | Konu | Öneri | Gerekli faz |
|---|---|---|---|
| ~~TD-01~~ | D-002 — TypeScript sürümü | **Çözüldü:** 6.0.3 — Accepted, kuruldu | PHASE 01 |
| ~~TD-02~~ | D-004 — pnpm sürümü | **Çözüldü:** 10.34.9 — Accepted, `packageManager` ile sabit | PHASE 01 |
| TD-03 | Better Auth `disabledPaths` / `hooks.before`'un `auth.api` sunucu çağrılarına etkisi; admin uç noktalarını HTTP'den kapatma yöntemi; admin ile kullanıcı adı güncelleme yöntemi | Test ile doğrulanacak; başarısızsa alternatif: kapalı uç noktalar için `hooks.before` + request varlığı kontrolü | PHASE 03 |
| TD-04 | Better Auth user-agent'ın yazılmaması (session hook) ve hosting'de güvenilir istemci IP header'ı | Hook + DB CHECK; IP header PHASE 03'te doğrulanır | PHASE 03 |
| TD-05 | Personel e-posta alanı (Better Auth zorunlu; e-posta gönderimi yok) | İsteğe bağlı gerçek e-posta; boş bırakılırsa yönlendirilemeyen `<username>@staff.invalid` (RFC 2606 `.invalid`) — veri minimizasyonu | PHASE 03 |
| TD-06 | PDF parser kütüphanesi | Bakımı süren, kaynak sınırlamaya izin veren, uygun lisanslı kütüphane; gerekçeli seçim | PHASE 08 |
| TD-07 | Production hosting / DB / storage sağlayıcısı | DEPLOYMENT §6.3 kriterleriyle değerlendirme | PHASE 13 (PB-01) |
| TD-08 | `pg` pool ayarları ve Neon PgBouncer kısıtları | PHASE 02'de doğrulama | PHASE 02 |
| TD-09 | Neon `pg_trgm` desteği | Yoksa prefix arama yedeği | PHASE 02 |
| TD-10 | Teknik temizlik zamanlaması (Vercel Hobby cron günde 1; Cron Jobs → Schedules geçişi; başka hosting'de karşılığı) | Günlük cron + istek anında fırsatçı temizlik | PHASE 08 / 13 |
| TD-11 | Vercel Blob client upload API ayrıntıları (`maximumSizeInBytes`, `validUntil`, ilerleme callback'i, CSP upload host'u) | SDK referansıyla doğrulama | PHASE 08 |
| TD-12 | Tarayıcı bazında güvenli inline PDF görüntüleme vs indirme | Gerçek cihaz testleriyle karar | PHASE 08 |

## Pending Implementation Inputs (Product Owner'dan beklenen)
1. Gerçek şirket telefon numarası ve WhatsApp iletişim bağlantısı (OD-14) — sağlanana kadar placeholder.
2. Gerçek hizmet kataloğu ve hizmet bazlı evrak listeleri (demo veriler resmî gereksinim değildir).
3. Gerçek şirket logosu (OD-15) — sağlanana kadar metin logo.
4. KVKK aydınlatma metni (hukuki süreç sonrası).
5. Production hosting kararı için değerlendirme sonuçlarına onay (TD-07).

## Known Issues
1. **ESLint 10 peer uyarıları (D-042):** `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` (eslint-config-next 16.4.6 bağımlılıkları) peer aralıkları ESLint ^9'da bitiyor. Next.js dokümanı ESLint 10 desteğini ve bu uyarıyı belgeliyor; kurallar ESLint 10 altında çalışıyor. Uyarılar bastırılmadı. ESLint 9 deprecated/EOL olduğu için alternatif değil.
2. **Node.js yaması:** yerel 24.22.1; 24.22.3 (2026-11-10) bir **güvenlik** sürümü. Sistem Node'u kullanıcı onayı olmadan güncellenmedi — güncelleme önerilir (`nvm install 24`).
3. Başlangıç sayfası (`/`) statik prerender ediliyor (hassas veri yok); PHASE 03'te yönlendirmeye dönüşecek.
4. Repo herkese açık (GitHub): dokümanlar (tehdit modeli dahil) herkese görünür. Güvenlik gizliliğe dayanmaz; secret yok. Bilgi amaçlı.
5. Gerçek cihaz testi yapılmadı (yalnızca Playwright emülasyonu) — müşteri paneli fazlarında (PHASE 07/08/11) zorunlu.

## Technical Debt
- Nonce'lu CSP, rota bazlı `no-referrer`/`no-store` header'ları henüz yok (D-048; PHASE 03/07/08).
- `tw-animate-css` kaldırıldı; animasyonlu shadcn bileşenleri (Dialog, Sheet) eklenirken yeniden değerlendirilmeli (D-043).

## Production Blockers
Ayrıntı: [SECURITY.md](SECURITY.md) §11.

| ID | Blocker | Geliştirmeyi engeller mi? |
|---|---|---|
| PB-01 | Ticari kullanıma uygun ücretsiz (veya onaylı) hosting/DB/storage yok — Vercel Hobby ticari kullanıma izin vermiyor | Hayır |
| PB-02 | Vercel Blob Hobby 1 GB kapasite (~50 başvuru) | Hayır |
| PB-03 | KVKK hukuki değerlendirmesi (aydınlatma, yurt dışı aktarım, saklama/imha politikası, VERBİS, ihlal prosedürü) | Hayır |
| PB-04 | Bearer link + OTP yok + süresiz bağlantı riski için yazılı risk kabulü | Hayır |
| PB-05 | Antivirüs olmadan PDF kabulü için yazılı risk kabulü + personel cihaz politikası | Hayır |
| PB-06 | Production ortam izolasyonu | Hayır |
| PB-07 | Yetkilendirme ve güvenlik testlerinin geçmesi | Hayır |
| PB-08 | Seçilen ücretsiz planda yedek/geri yükleme yeteneği | Hayır |
| PB-09 | Bağımlılık taraması temiz | Hayır |
| PB-10 | Better Auth kapalı uç noktaları ve IP/UA saklamamanın testle doğrulanması | Hayır |
| PB-11 | Gerçek iletişim bilgileri ve hizmet/evrak kataloğu | Hayır |

**Geliştirmeyi (PHASE 02) başlatmayı engelleyen:** yalnızca PHASE 01 kullanıcı onayı. PB-01…PB-11 açık; hiçbiri çözülmüş sayılmaz. PHASE 00/01 onayları production güvenliği veya KVKK uyumluluğu onayı değildir.

## Latest Verification Results (2026-11-24, PHASE 01)
Node v24.22.1 · pnpm 10.34.9 · macOS 27.2.1 arm64. Temiz kurulumla (node_modules ve .next silinerek) sırayla:

| Komut | Exit | Sonuç |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | 451 paket, lockfile güncel |
| `pnpm lint` | 0 | 0 hata, 0 uyarı (`--max-warnings=0`) |
| `pnpm typecheck` | 0 | `next typegen` + `tsc --noEmit` |
| `pnpm format:check` | 0 | Tüm dosyalar Prettier uyumlu |
| `pnpm test` | 0 | 3 dosya, 26 test geçti |
| `pnpm build` | 0 | `/`, `/_not-found`, `/robots.txt` statik |
| `pnpm check:bundle` | 0 | 11 client dosyası, yasaklı ifade yok (negatif testle doğrulandı) |
| `pnpm test:e2e` | 0 | 30 geçti, 18 bilinçli atlandı (genişlik testleri yalnızca Desktop Chrome'da) |
| `pnpm audit` / `pnpm audit --prod` | 0 | Bilinen açık yok |

- Development smoke: `pnpm dev` → `GET /` 200, güvenlik header'ları mevcut. Production smoke: `pnpm start` → `GET /` 200, `lang="tr"`, başlık, header'lar, `/robots.txt` 200, bilinmeyen yol 404. Başlatılan sunucular kapatıldı.
- ESLint proje kuralları geçici ihlal dosyasıyla doğrulandı (10/10 kural tetiklendi; dosya silindi).
- `.gitignore`: `git check-ignore` ile env, build, test çıktıları, secret dosyaları doğrulandı; `.env.example` takip edilebilir.
- Gerçek cihaz testi: **yapılmadı**.

## Next Phase
**PHASE 02 — Database Foundation** — kullanıcı açıkça onaylamadan başlanmaz.
