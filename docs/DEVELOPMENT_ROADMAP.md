# Geliştirme Roadmap'i

> Her faz sonunda PROJECT_STATE, CHANGELOG, (gerekirse) DECISION_LOG güncellenir; faz raporu sunulur; **kullanıcı açıkça onaylamadan sonraki faza geçilmez**.
> **Ortak Definition of Done (tüm fazlar):** `typecheck` + `lint` + `format:check` + ilgili testler yeşil · `pnpm audit` yüksek/kritik yok · dokümanlar güncel · yeni secret yok · gerçek veri yok · ücretli servis yok · test edilmeyen iş "tamamlandı" raporlanmaz.
> Revizyon 2026-11-24 (PHASE 03): iki sabit hesap ve eşit yetki (OD-24) — RBAC, rol yönetimi ve personel yönetimi görevleri kaldırıldı.
> Revizyon 2026-11-24: OTP, e-posta, müşteri eşleştirme, çalışan atama, arşiv, ayarlar, otomatik saklama/süre sonu, harici AV, dinamik limitler kaldırıldı; ADMIN yeniden açma/geri alma, manuel silme, tek aktif PDF, sabit yapılandırma eklendi.

---

## PHASE 00 — Project Foundation & Architecture (tamamlandı — Product Owner onayı 2026-11-24)
- **Scope:** Yalnızca doküman.
- **Deliverables:** `CLAUDE.md`, `README.md`, `docs/*` (20 doküman), 23 ürün kararının işlenmesi.
- **Dependencies:** —
- **Security checks:** Threat model, birleşik risk analizi, production blocker listesi.
- **Test requirements:** Test stratejisi ve kabul kriterleri.
- **Acceptance:** Dokümanlar kararlarla uyumlu, çelişkisiz, referanslar geçerli.
- **DoD:** Kullanıcı revizyonu onaylar; D-002 ve D-004 kararlarını verir.

## PHASE 01 — Project Initialization (tamamlandı — Product Owner onayı 2026-11-24)
- **Scope:** `.gitignore` değişimi (D-031, ilk adım), Next.js 16 + TypeScript (D-002) strict + Tailwind 4 + shadcn/ui, ESLint (flat config, `eslint-config-next`, `no-restricted-imports` sınırları, `dangerouslySetInnerHTML` yasağı, cache API yasağı) + Prettier, klasör yapısı, `server-only`, `src/server/env.ts`, `.env.example`, `src/config/constants.ts` ve `src/config/company.ts` iskeleti, design token'ları, temel bileşenler (Button, Input, Card, Badge, `Logo`), Vitest + Playwright kurulumu, güvenlik header iskeleti, `robots.ts`, CI taslağı, `engines.node = 24.x` + `packageManager` sabitleme.
- **Deliverables:** Repo iskeleti, lockfile, CI workflow, `pnpm` script'leri.
- **Dependencies:** PHASE 00 onayı; D-002, D-004.
- **Security checks:** `.gitignore` kapsamı (env, build, test çıktıları); bundle secret kontrol script'i; exact sürümler; pnpm kurulum script kısıtları.
- **Test requirements:** Örnek unit; Playwright smoke (header'lar); 320 px'te yatay taşma yok; `MAX_PDF_SIZE_BYTES` sabit testi.
- **Acceptance:** `pnpm build` başarılı; kalite kapıları yeşil; header'lar mevcut; `.env.local` git tarafından ignore ediliyor (test).
- **DoD:** Ortak DoD + TECH_STACK kurulu sürümlerle güncel.

## PHASE 02 — Database Foundation (tamamlandı — Product Owner onayı 2026-11-24; tek veritabanı D-059)
- **Scope:** Neon Free non-prod projesi (kullanıcı onayıyla, ücretsiz), Drizzle + `pg` pool, 13 domain tablosu + CHECK/partial unique index/trigger/GRANT migration'ları, `pg_trgm`, sahte seed (demo hizmetler, şablonlar, sahte başvurular), normalizasyon yardımcıları (telefon, e-posta, arama).
- **Deliverables:** `src/server/db/schema/*`, migration SQL'leri, `db:generate`, `db:migrate`, `db:seed`, integration test altyapısı.
- **Dependencies:** PHASE 01; D-005, D-006, D-007, D-008, D-039.
- **Security checks:** TLS (`verify-full`), uygulama rolü en az yetki, audit değiştirilemezliği, seed'de gerçek veri yok, IP/UA kolonu olmadığının doğrulanması.
- **Test requirements:** Kısıtlar (tek aktif dosya, tek devam eden yükleme, tek aktif token, CHECK'ler), sayaç eşzamanlılığı, audit UPDATE/DELETE reddi, CASCADE silme davranışı, normalizasyon unit testleri.
- **Acceptance:** Boş DB'ye migration'lar baştan uygulanır; seed çalışır; integration yeşil.
- **DoD:** Ortak DoD + DATABASE_SCHEMA gerçek şemayla senkron.

## PHASE 03 — Authentication & Equal Staff Access (tamamlandı — gerçek hesaplar oluşturuldu; D-065 koşullu)
- **Scope:** İki sabit şirket hesabı (OD-24): Better Auth (yalnızca username plugin + `nextCookies`; admin plugin yok), Drizzle adapter; Better Auth HTTP route'u **bağlanmaz** — giriş/çıkış Server Action'ları içinde sunucu tarafı `auth.api` ile (kayıt, şifre sıfırlama, e-posta, kullanıcı yönetimi uç noktaları HTTP'den erişilemez); hesap başına tek kayıt veritabanı kısıtı (en fazla 2 hesap); `pnpm auth:bootstrap` (iki hesap, gizli şifre girişi) ve `pnpm auth:reset-password` (yalnızca ilgili hesabın oturumlarını iptal eder); ortak `getCurrentStaff()`/`requireStaff()`; 7 gün sabit oturum (`disableSessionRefresh`, cookie cache kapalı); IP/UA saklamama (`disableIpTracking` + session hook + DB CHECK); Postgres tabanlı giriş rate limiting (kullanıcı adı + genel); nonce'lu CSP (`proxy.ts`); tek ortak giriş ekranı; korumalı `/dashboard` placeholder; auth audit event'leri.
- **Deliverables:** Çalışan giriş/çıkış, iki hesap bootstrap'ı, şifre kurtarma CLI'ı, ortak personel erişim kontrolü.
- **Dependencies:** PHASE 02; TD-04 (IP header — hosting'de, PHASE 13).
- **Security checks:** Kapalı uç noktalara doğrudan istek (404); üçüncü hesap ve eşzamanlı bootstrap; IP/UA'nın yazılmadığı; oturumun uzamadığı; genel hata mesajı/enumeration; cookie flag'leri; CSRF (Server Action origin kontrolü); open redirect; rate limiting'in fail-closed ve çoklu instance'ta güvenilir olması; nonce'lu CSP; runtime rol yetkilerinin genişlememesi.
- **Test requirements:** Unit: şifre/kullanıcı adı politikası, rate limit anahtarı, env. Integration (gerçek Postgres): hesap modeli, bootstrap eşzamanlılığı, giriş/çıkış, oturum süresi/uzamama, şifre sıfırlamanın oturum iptali, IP/UA, rate limit, audit. E2E: ortak giriş ekranı, giriş/çıkış, korumalı sayfa, kapalı uç noktalar, CSRF, CSP, responsive.
- **Acceptance:** Bir ADMIN ve bir EMPLOYEE hesabı oluşturulabilir, üçüncüsü oluşturulamaz; iki hesap aynı kontrolden geçer; public kayıt/self-servis şifre işlemi mümkün değil; `sessions` satırlarında IP/UA NULL.
- **DoD:** Ortak DoD.

## PHASE 04 — Dashboard Foundation (tamamlandı — onaylandı)
- **Scope:** Her iki hesap için **aynı** dashboard layout (sidebar, header, breadcrumb, mobil drawer), aynı navigasyon ve menüler — rol bazlı UI farkı yok (OD-24); Ayarlar/Hesap/Çalışanlar sayfası yok; ortak bileşenler (DataTable, Pagination, EmptyState, ConfirmDialog, StatusBadge, Skeleton), hata/404 sayfaları.
- **Deliverables:** Gezinilebilir panel iskeleti.
- **Dependencies:** PHASE 03.
- **Security checks:** Her layout/page `requireStaff`; `Cache-Control: no-store`; CSP nonce.
- **Ek kapsam (Product Owner, PHASE 03 sonu):** P4-01 kalıcı kimliği doğrulanmış test stratejisi (gerçek hesaplara dokunmadan, bypass/test endpoint'i olmadan); P4-02 CSRF reddinin kontrollü hata biçimi; P4-03 global login rate limit DoS riski değerlendirmesi; P4-04 HTTPS'te `Secure` cookie doğrulamasının deployment öncesi planı (PROJECT_STATE).
- **Test requirements:** E2E: iki hesap aynı menüyü görür, responsive drawer, klavye navigasyonu, axe; P4-01 ile hesap testlerinin bootstrap sonrası da çalışması.
- **Acceptance:** 1024/1440'ta sidebar, <1024'te drawer; tüm sayfalar dinamik ve no-store.
- **Sonuç (2026-11-24):** Düzen, Genel Bakış (gerçek veri), bilgilendirme sayfaları, 404, P4-01/P4-02 çözüldü, P4-03 azaltıldı, P4-04 yapılandırma düzeyinde. DataTable, Pagination ve ConfirmDialog ilk kullanıldıkları fazlara (PHASE 05/06) bırakıldı (kullanılmayan bileşen üretilmez). axe taraması PHASE 12.
- **DoD:** Ortak DoD.

## PHASE 05 — Service & Document Template Management (tamamlandı — onaylandı)
- **Scope:** Hizmet CRUD (silme yok), aktif/pasif, sıralama; evrak şablonu CRUD (başlık, açıklama, talimat, zorunlu/isteğe bağlı, sıra, aktif/pasif). Dosya boyutu/sayısı/tipi alanı **yok**. Her iki hesap yönetebilir (OD-24).
- **Deliverables:** `/dashboard/services*`.
- **Dependencies:** PHASE 04.
- **Security checks:** `requireStaff` her action'da; `.strict()` şemalar; `created_by_user_id` oturumdan (D-053).
- **Test requirements:** Unit: şemalar. Integration: CRUD, oturumsuz erişim reddi, pasif hizmetin aktif listede olmaması. E2E: her iki hesap hizmet + şablon yönetir.
- **Acceptance:** Pasif hizmet başvuru formunda listelenmez.
- **DoD:** Ortak DoD.
- **Sonuç (2026-11-24):** Hizmet CRUD (silme yok), aktif/pasif, evrak şablonu CRUD + sıralama, Türkçe arama/filtre, optimistic lock (migration 0004), audit, snapshot sözleşmesi (D-074). Hizmet sıralaması uygulanmadı (ada göre — D-072). Mutasyon E2E'si izole Docker veritabanında (D-077).

## PHASE 06 — Customer & Application Management (tamamlandı — onaylandı 2026-11-25)
- **Scope:** Başvuru formu (müşteri bilgileri her başvuruda yeniden girilir; eşleştirme yok), atomik oluşturma (numara, snapshot, token), sonuç ekranı (Kopyala, **kişiselleştirilmiş WhatsApp paylaşımı** + onay penceresi, Detaya git), tek başvuru listesi (arama, statü/hizmet/tarih filtresi, sayfalama), detay (müşteri bilgisi düzenleme, statü geçmişi, iç notlar, bağlantı göster/kopyala/paylaş/yenile/iptal/yeni oluştur), manuel silme (her iki hesap) (iki aşamalı; storage silme PHASE 08 storage modülü hazır olduğunda tamamlanır — bu fazda dosyasız başvurular için).
- **Deliverables:** `/dashboard/applications*`.
- **Dependencies:** PHASE 05; D-011, D-033, D-036.
- **Security checks:** Token üretimi/HMAC/AES-GCM; bağlantı gösteriminin audit'i; tek aktif token; `APP_URL` ile URL üretimi; idempotency; silme sonrası erişilemezlik.
- **Test requirements:** Unit: token, numara, WhatsApp URL. Integration: transaction geri alma, eşzamanlı numara, snapshot, bağımsız başvurular, eşzamanlı yenileme, silme. E2E: oluşturma akışı, E4, E5 (dosyasız), S22.
- **Acceptance:** Brief §6 adımları tek transaction'da; sonuç ekranındaki tüm öğeler.
- **DoD:** Ortak DoD.
- **Sonuç (2026-11-24):** Oluşturma (atomik, idempotent, önizleme parmak izi), liste (URL dışı arama, filtre, sayfalama), detay, müşteri düzenleme, bağlantı göster/kopyala/yenile/iptal/yeniden oluştur, WhatsApp hazırlığı, dashboard bağlantıları; D-078…D-086. **Bu fazda yapılmayan (PHASE 06 talimatı dışında):** iç notlar, başvuru silme, tarih aralığı filtresi — sonraki ilgili fazlara.

## PHASE 07 — Customer Portal (tamamlandı — onaylandı 2026-11-25; D-087/D-093 koşullu)
- **Scope:** `GET /b/[token]` (rate limit, doğrulama, imzalı portal cookie'si, 303), `/portal` (bilgiler, süreç göstergesi, tamamlanma göstergesi, evrak kartları — yükleme hariç, yorumlar, düzeltme açıklamaları, sabit iletişim kartı/placeholder, salt okunur modlar), `/link-invalid`.
- **Deliverables:** Bağlantıyla doğrudan erişim ve mobile-first panel.
- **Dependencies:** PHASE 06; D-032.
- **Security checks:** Aynı tarayıcıda iki farklı başvuru bağlantısı (TM-40): cookie üzerine yazıldığında bir sekmede başka başvuru görüntülenmemeli ve yanlış başvuruya evrak yüklenememeli; müşteri oturumu her istekte doğru başvuru + aktif token ile ilişkilendirilir; GET'in veri değiştirmemesi; `no-referrer`, `no-store`, `noindex`; üçüncü taraf script yok; müşteri DTO whitelist; iç not sızıntısı; iptal/yenilemenin anında etkisi; token'ın log/hata mesajında olmaması.
- **Test requirements:** Unit: cookie imzası, ilerleme hesapları. Integration: bağlantı GET'in yan etkisizliği; iptal sonrası cookie reddi. E2E (mobil projeler): S01–S04, S16, S20, S21; aynı tarayıcıda iki bağlantı/iki sekme (TM-40); 9 genişlik.
- **Acceptance:** Geçerli bağlantı ek adımsız panele götürür; adres çubuğunda token kalmaz; geçersiz bağlantıda hiçbir kişisel veri dönmez.
- **DoD:** Ortak DoD + gerçek cihaz (iOS Safari, Android Chrome, WhatsApp in-app — cookie davranışı dahil) manuel test sonuçları raporlandı.
- **Sonuç (2026-11-25):** `/b/[token]` (biçim kontrolü, HMAC arama, imzalı oturum, 303 token'sız `/portal/<bağlam>`), 7 gün sabit oturum, her istekte iptal/yenileme/silme kontrolü, çoklu sekme bağlam izolasyonu, `/link-invalid`, `/link-unavailable`, mobile-first salt okunur panel (hoş geldiniz, süreç, evrak ilerlemesi, evrak kartları + düzeltme açıklaması, yükleme/gönderim yer tutucuları, iletişim kartı), başlıklar ve log redaksiyonu; D-087…D-095. **Yapılmayan / ertelenen:** IP rate limit (TD-04 → PHASE 13, D-093); müşteri yorumları (PHASE 09 — yorum modeli henüz yok); gerçek cihaz/WhatsApp in-app manuel testi (**yapılmadı** — cihaz erişimi yok; PHASE 12/13 öncesi gerekli). Testler izole Docker ortamında (Chrome, WebKit, mobil emülasyon).

## PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage (tamamlandı — onaylandı 2026-11-25; canlı B2 smoke PASS)
- **Kapsam değişikliği (OD-25, 2026-11-25):** Vercel Blob + doğrudan client upload + `/api/uploads` token/callback + günlük cron tasarımı yerine **Backblaze B2 private bucket** + sunucu üzerinden yükleme + elle çalıştırılan bakım komutları. Önceki kapsam metni: "Dev/demo private Blob store'ları, `storage.ts`/`upload-client.ts`, `/api/uploads` (token + callback), client confirm, …, günlük teknik temizlik (cron), başvuru silmenin storage aşaması" — Superseded.
- **Scope (uygulanan):** storage soyutlaması (B2 + yerel private), güvenli env yapılandırması (`pnpm env:b2`), canlı duman testi (`pnpm storage:verify`), yükleme route'ları (personel müşteri adına + müşteri), PDF yapısal doğrulama (pdf.js + nesne düzeyi tarama, izole worker — TD-06), SHA-256, tek aktif PDF + versiyonlama, atomik yaşam döngüsü + hata kurtarma, depolama kotası, görüntüleme/indirme route'ları (TD-12 kısmen), müşteri ve personel UI, dosya geçmişi, dashboard kapasite kartı, mutabakat/temizlik komutları, migration 0005.
- **Kapsam dışı (bu fazda):** kaldırma (BR-44 "kaldır" — PHASE 09), başvuru silmenin storage aşaması (PHASE 10), zamanlanmış temizlik (PHASE 10/13), incelemeye gönderme/inceleme (PHASE 09).
- **Dependencies:** PHASE 07; OD-25; D-096…D-107.
- **Security checks:** FILE_STORAGE §6.4; her görüntüleme/indirme isteğinde sunucu tarafı yetkilendirme; "virüssüz" etiketi yok; TM-40 dosya kısmı; TM-50…TM-53.
- **Acceptance:** FILE_STORAGE §6.4 1–13 testle geçer; 14 (yanlış pozitif ölçümü) PHASE 12; 15 (başvuru silme) PHASE 10.
- **DoD:** Ortak DoD + SDK/sağlayıcı davranışı TECH_STACK §3.8'de doğrulandı + canlı `storage:verify` (kullanıcının anahtarı girmesine bağlı).
- **Sonuç (2026-11-25):** Uygulandı; unit, izole integration ve izole E2E (Chrome, WebKit, mobil emülasyon) yeşil; migration 0005 önce izole ortamda sonra `neondb`'de; ortak veritabanı verisi değişmedi. **Yapılmayan:** canlı B2 doğrulaması (anahtar henüz `.env.local`'da yok — kullanıcı `pnpm env:b2` + `pnpm storage:verify` çalıştıracak); gerçek cihaz testleri; gerçek belge setiyle yanlış pozitif ölçümü.

## PHASE 09 — Document Review & Application Workflow (tamamlandı — Product Owner onayı 2026-11-25, 09.1 dahil)
- **Scope:** Gönderim (müşteri + müşteri adına), evrak inceleme (onay/düzeltme + gerekçe, `fileId` bağlı), karar değişikliği, müşteri yorumları, T2–T7, **T8–T12** (her iki hesap; gerekçeli, evrak seçimli), izin verilen aksiyonlar, müşteri panelinde düzeltme gösterimi, yeniden gönderim, statü geçmişi. **PHASE 08'den devredilen:** dosya kaldırma (BR-44, D2/D8).
- **Deliverables:** Tam iş akışı.
- **Dependencies:** PHASE 08; D-027, D-041.
- **Security checks:** Sunucu tarafı state machine; kilit + version; BR-57; aktör kaydı.
- **Test requirements:** Unit: geçiş matrisleri %100. Integration: eşzamanlılık, T8–T12 geçişleri (iki hesapla). E2E: §5.1 ana senaryo (tamamı), E1–E3, S13, S14, S23.
- **Acceptance:** Ana senaryonun 19 adımı desktop + mobilde yeşil.
- **DoD:** Ortak DoD.
- **Sonuç (2026-11-25):** Uygulandı (D-108…D-112; yeni migration/bağımlılık yok). Unit (matrisin tamamı), izole integration (ana akış + eşzamanlılık + T8–T12, iki hesap) ve izole E2E (Chrome, WebKit, mobil emülasyon) yeşil. **Not:** ana senaryo E2E'de üç senaryoya bölünerek (müşteri gönderim → karar/düzeltme; müşteri adına gönderim → onay → işlem → tamamla → yeniden aç → iptal; düzeltme + gerçek yükleme + yeniden gönderim) kapsandı; tek parça "19 adım" testi yazılmadı. Gerçek cihaz testi yapılmadı.
- **PHASE 09.1 kapanışı (2026-11-25):** yorum idempotency (D-113, migration 0006); 19 adımlı ana senaryo tek parça E2E (Chrome + WebKit, gerçek arayüz, şifreyle giriş/çıkış); eksik eşzamanlılık senaryoları kontrollü araya girmeyle (D-114); TM-40 yeniden gönderim/kaldırma/tekrar/oturum/bağlantı kapsamı; storage regresyon testleri.

## PHASE 10 — Administration & Operations
- **Scope:** Dashboard istatistikleri, audit log ekranı (filtre, sayfalama), başvuru detayında işlem geçmişi, manuel başvuru/müşteri verisi silme akışının tamamlanması ve ilgili storage temizliği, operasyonel bakım gereksinimleri. Her iki hesap eşit erişir (OD-24). **Kaldırılanlar:** çalışan CRUD, kullanıcı yönetim ekranı, rol/izin yönetimi, hesap aktif/pasif ekranı, personel hesabı oluşturma ekranı.
- **Deliverables:** `/dashboard/audit-logs`, dashboard sayaçları, silme operasyonu.
- **Dependencies:** PHASE 09.
- **Security checks:** `requireStaff`; audit salt okunur (hiçbir hesap değiştiremez); silmede onay + audit; secret/şifre/PII'nin hiçbir yanıtta/logda olmaması.
- **Test requirements:** Integration: istatistik doğruluğu, audit filtreleri, silmenin iki aşaması. E2E: iki hesapla audit görüntüleme, E5.
- **Acceptance:** Audit ve silme her iki hesapla çalışır; audit kayıtları değiştirilemez.
- **DoD:** Ortak DoD.
- **Sonuç (2026-11-25, kullanıcı onayı bekliyor):** Şirket içi notlar (idempotent, append-only, müşteriye sızmaz — D-115), `/dashboard/audit-logs` (filtre, keyset sayfalama, allowlist sunum — D-119), başvuruya özel işlem geçmişi bağlantısı, kalıcı başvuru silme (kalıcı durumlu sınırlı adımlar, bekleme kapısı, envanter + listeleme doğrulaması, kira, sürdürme, silme kuyruğu — D-116; DB koruma trigger'ı — D-117; onay — D-118), teknik temizlik kapsam ayrımı (D-120). Migration 0007; yeni bağımlılık yok. Dashboard sayaçları PHASE 04'te mevcuttu (silme sürecindeki başvurular hariç — değişmedi). **Yapılmayan (ürün kuralı gereği):** tekil dosya/eski versiyon kalıcı silme (BR-47), toplu silme, audit dışa aktarma, silme CLI'ı, zamanlanmış bakım.
- **PHASE 10.1 kapanışı (2026-11-26):** gecikmiş storage yazımı riski giderildi — kalıcı yazım girişimi takibi, yazım çiti, tek girişimli PUT, kesin/belirsiz sonuç, zamandan bağımsız sonlandırma, DB koruması v2, eski kayıt politikası, kanıt tabanlı temizlik, eski not sayfalaması (D-121…D-128; migration 0008); gecikmeli yazım testleri A–K ve eşzamanlılık matrisi.
- **PHASE 10.2 kapanışı (2026-11-26):** test izolasyonu korumaları (D-129), mutabakat muhasebe nesli (D-130, migration 0009; R1–R7), WebKit konsol hatası kök nedeni ve dar test istisnası (D-131), `NOT_SENT` sıkılaştırması (D-132).

## PHASE 11 — UI/UX & Performance Optimization
- **Scope:** WCAG 2.2 AA denetimi, 9 genişlikte görsel regresyon, Lighthouse, sorgu planları (10k seed), bundle analizi, loading/empty/error durumları, metin/ton.
- **Dependencies:** PHASE 10.
- **Security checks:** Optimizasyonların cache kurallarını (D-016) ihlal etmemesi.
- **Test requirements:** axe, Lighthouse, ekran okuyucu, görsel regresyon.
- **Acceptance:** axe kritik/ciddi yok; portal Lighthouse mobil Perf ≥ 90, A11y ≥ 95; sorgular index kullanır.
- **DoD:** Ortak DoD.
- **Durum (2026-11-27):** PHASE 11 + 11.1 geliştirmesi tamamlandı — kullanıcı onayı bekleniyor. 11.1: OD-26 (B2 yıllık ~10 USD, 100/90 GB hedef — D-140), görüntüleyici sayfaya git/klavye, evrak statü özeti, PDF dizi benchmark'ları. PHASE 12'de açık: gerçek B2 Range/fatura/cap/listeleme tutarlılığı/silme akışı doğrulaması, hesap hazırlığı sonrası 100 GB etkinleştirme doğrulaması. Uygulanan: ölçüm altyapısı (D-134), güvenli HTTP Range (D-135), tembel pdf.js görüntüleyici (D-136), ön-getirme politikası (D-137), audit bileşik indeksi (D-138, migration 0010), UI polish (yükleme aşamaları, mobil filtre katlama, taşma/kesilme düzeltmeleri). **Ölçülmedi:** axe ve Lighthouse (yeni bağımlılık/araç indirmesi gerektirir — PHASE 12'ye önerildi); gerçek B2 ve gerçek cihaz ölçümleri (PHASE 12).

## PHASE 12 — Quality Assurance & Security Audit
- **Scope:** Tam regresyon, personel/müşteri erişim izolasyonu %100 (oturumsuz ve kapsam dışı erişim reddi), iki hesap modeli, S01–S24, tehdit modeli gözden geçirme, manuel sızma testi (ASVS L2 seçkisi), bağımlılık denetimi, log/payload sızıntı incelemesi, production blocker durumu.
- **Dependencies:** PHASE 11.
- **Security checks:** SECURITY §11 PB-04, PB-05, PB-07, PB-09, PB-10.
- **Test requirements:** Tüm suite.
- **Acceptance:** Açık yüksek/kritik bulgu yok; PB-04/PB-05 için Product Owner yazılı risk kabulü (veya alternatif önlem kararı).
- **DoD:** Ortak DoD.


## PHASE 12.1 — Targeted Security Remediation & Final Verification
- **Durum (2026-11-27):** mühendislik çalışması tamamlandı — kullanıcı onayı bekleniyor. D-141 ara sayfa, SEC-05/06, REVIEW-01…06 (SEC-14…18), migration 0011 (izole), geri yükleme araçları OD-27 ile kaldırıldı. **Açık:** Neon'a 0011 (onay), yeni en az yetkili B2 anahtarı + Checkpoint B (onay), gerçek cihaz/WhatsApp, hosting, KVKK, uzak CI. Production NO-GO.
## PHASE 13 — Production Deployment
- **Scope:** Ticari kullanıma uygun ücretsiz (veya kullanıcının açıkça onayladığı) hosting/DB/storage değerlendirmesi ve seçimi (DEPLOYMENT §6.3), production ortamı, env/secrets, sağlayıcı alt alan adı (`APP_URL`), GitHub branch koruma + secret scanning, migration, iki hesap bootstrap'ı (`pnpm auth:bootstrap`, production'da ayrı ve güçlü şifrelerle), günlük temizlik zamanlaması, izleme, olay müdahale planı, smoke test.
- **Dependencies:** PHASE 12/12.1; PB-01, PB-02, PB-03, PB-06, PB-11 kapalı; PB-08 ve PB-12 kalan risklerinin yazılı kabulü (OD-27 — özel yedek/geri yükleme kapsam dışı).
- **Security checks:** MFA, en az yetki, izolasyon, rotasyon prosedürü, sağlayıcı log politikası incelemesi (TM-15).
- **Test requirements:** Production smoke test (sahte başvuru, sonra silinir). (Geri yükleme provası OD-27 ile kaldırıldı.)
- **Acceptance:** Tüm production blocker'ları kapalı; smoke test yeşil.
- **DoD:** Ortak DoD + PROJECT_STATE "Production".
