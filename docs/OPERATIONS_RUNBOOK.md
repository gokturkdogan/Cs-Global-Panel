# Operasyon Runbook'u (PHASE 12)

> Kapsam: yedekleme/geri yükleme, anahtar yenileme, olay müdahalesi, sonucu belirsiz storage yazımlarının kurtarılması.
> Hedef okuyucu: sistemi işleten yetkili kişi (iki personel hesabından biri değil — sunucu/hesap yöneticisi).
> Bu belgedeki hiçbir prosedür PHASE 12'de **gerçek ortamda uygulanmadı**; yalnızca sentetik tatbikat (§2.6) çalıştırıldı.
> Secret değerleri hiçbir yere (sohbet, ticket, e-posta, log) yazılmaz. Audit kayıtları hiçbir olayda silinmez.

## 1. Genel ilkeler

- Her işlem öncesi: durum kaydı (zaman, kim, neden), salt okunur kontrol (`pnpm db:verify`, `pnpm storage:inspect`).
- Gerçek müşteri verisi kişisel bilgisayara, public repo'ya veya onaysız harici servise kopyalanmaz.
- Şüphede dur: kanıt yoksa silme, kalıcı değişiklik veya "zorla tamamlama" yapılmaz (fail-closed).
- Olaylar `INCIDENT-YYYYMMDD-N` kimliğiyle yerel olay kaydına yazılır (kişisel veri içermez; başvuru numarası yeterli).

## 2. Veri kaybı ve sağlayıcı düzeyi geri yükleme (OD-27 — uygulamaya özel yedek YOK)

**Kapsam kararı (OD-27, 2026-11-27):** uygulama özel yedekleme, geri yükleme veya felaket kurtarma altyapısı sunmaz. Neon PostgreSQL ve Backblaze B2 birincil veri kaynaklarıdır. PHASE 12/12.1'de eklenen geri yükleme tatbikatı (`test:restore-drill`), geri yükleme sonrası kilitleme/rapor (`ops:post-restore`) ve VersionId eşleme planı kaldırıldı (tarihçe: CHANGELOG, SECURITY_AUDIT §9).

**Kalan risk (kullanıcı kabulü gerekir — PB-08, PB-12):**
- Veritabanında veya depolamada geri dönüşü olmayan veri kaybında uygulamaya özel kurtarma garantisi **yoktur**.
- Sağlayıcıların yerleşik özellikleri (ör. Neon'un sınırlı geri yükleme penceresi; B2 bucket versiyon geçmişi) sağlayıcı politikasına tabidir, uygulama tarafından yönetilmez ve bağımsız/garantili yedek değildir. B2 versiyon geçmişi aynı bucket'tadır; uygulamanın versiyona özgü silmesi geri getirilemez.
- Sağlayıcı düzeyinde eski bir noktaya dönülürse, o noktadan sonra yapılan bağlantı iptali/yenilemesi, oturum kapatma ve kalıcı başvuru silmeleri geri gelebilir (PHASE 12 bulgusu SEC-03); sağlayıcının farklı bir bucket'a kopyası VersionId'leri değiştirir.

**Olağanüstü sağlayıcı düzeyi geri yükleme gerekirse (manuel, yeni otomasyon yok):**
1. Karar kullanıcı ve yetkili operatör tarafından ayrıca verilir; sağlayıcı panelindeki işlem onların sorumluluğundadır.
2. Geri yüklenen ortam doğrudan müşterilere ve normal personel kullanımına AÇILMAZ (uygulama trafiğe kapalı tutulur).
3. Değerlendirilecekler: geri dönen eski bağlantılar ve oturumlar (gerekirse tüm bağlantılar personel tarafından yenilenir, `BETTER_AUTH_SECRET` / `CUSTOMER_SESSION_SECRET` yenilenir — §3.4–3.5), geri yükleme noktasından sonra kalıcı silinmiş başvurular (geri gelmiş olabilir — hukuki silme yükümlülüğü, DATA_PRIVACY), dosya kayıtlarının işaret ettiği versiyonların depoda bulunup bulunmadığı (`pnpm storage:reconcile` dry-run raporu: kayıtlı-ama-bulunmayan / kayıt-dışı versiyonlar).
4. Veri bütünlüğü doğrulanmadan normal erişim başlatılmaz; belirsiz durumlar Product Owner'a sunulur. Tahminle kayıt veya nesne SİLİNMEZ.
5. Yedek veya sağlayıcı kopyaları kişisel veri taşıyabilir; saklama/imha kararı kullanıcıdadır (PB-03).

## 3. Anahtar ve kimlik bilgisi yenileme

Genel ön koşullar: yetkili kişi; güncel şifreli yedek (§2.2); bakım penceresi duyurusu (iki personel); eski değer, doğrulama bitene kadar parola yöneticisinde saklanır; sonra güvenli silinir.

### 3.1 Backblaze uygulama anahtarı (SEC-01 düzeltmesi dahil — PHASE 12.1 güncel)

Asgari runtime yetkileri (Backblaze "S3-Compatible App Key Capabilities"): `listFiles` (ListObjectVersions), `readFiles` (GetObject/HeadObject), `writeFiles` (PutObject), `deleteFiles` (versiyona özgü DeleteObject). `listBuckets` uygulama için gerekmez (ListBuckets/HeadBucket çağrılmaz); yalnızca `storage:inspect` HeadBucket kontrolü için isteğe bağlıdır. Bucket'a kısıtlı anahtarda `listAllBucketNames` gerekmez. Panel yalnızca "Read and Write / Read Only / Write Only" sunar — "Read and Write" mevcut 7 riskli + 6 gereksiz okuma yetkisini verir. **Özel yetki kümesi yalnızca `b2_create_key` API ile** oluşturulur (`writeKeys` yetkili bir anahtar, ör. ana anahtar, gerekir).

Kullanıcı adımları (asistan anahtar oluşturmaz/iptal etmez; anahtar sohbete, rapora veya depoya yazılmaz):
1. Kendi terminalinizde ana anahtarla `b2_authorize_account` (v3/v4) → `apiUrl`, `authorizationToken`, `accountId`.
2. `b2_create_key`: `capabilities: ["listFiles","readFiles","writeFiles","deleteFiles"]` (isteğe bağlı `"listBuckets"`), `bucketIds: ["<mevcut private bucket kimliği>"]`, `keyName: "cs-global-runtime-<tarih>"`; önek ve süre boş (uygulama `applications/` altında yazar; süreli anahtar kesinti riski). Yanıttaki `applicationKey` yalnızca bir kez görünür.
3. `pnpm env:b2` ile yeni keyID ve gizli anahtarı girin (yankısız). Eski anahtar henüz İPTAL EDİLMEZ.
4. `pnpm storage:inspect` → `missingRequired: []`, `excessRisky: []`, `unexpected: []` (yalnızca `listBuckets` isteğe bağlı) olmalı.
5. Onaylanırsa Checkpoint B (VERIFICATION_PLANS §1.3) yeni anahtarla çalıştırılır; yoksa en azından uygulama yeniden başlatılıp mevcut (0 nesneli) bucket'ta salt okunur denetim tekrarlanır.
6. Doğrulama geçince eski anahtar Backblaze panelinden silinir (geçiş süresi kısa tutulur); `storage:inspect` tekrar.
7. Hata/kurtarma: yeni anahtar çalışmazsa `.env.local` önceki değerlere döndürülür (eski anahtar silinmediği için), olay kaydedilir; eski anahtar silindikten sonra sorun çıkarsa yeni bir asgari anahtar aynı adımlarla oluşturulur.

### 3.2 Veritabanı runtime şifresi
1. Yeni şifre üretilir; `DATABASE_URL` env'de güncellenir.
2. `pnpm db:init` (owner) runtime şifresini env'deki değere eşitler (yazdırmaz).
3. Uygulama yeniden başlatılır.

- Etki: arada kısa kesinti; oturumlar ve bağlantılar korunur.
- Doğrulama: `pnpm db:verify`.

### 3.3 Veritabanı owner kimlik bilgisi
1. Neon konsolunda owner şifresi sıfırlanır.
2. Yalnızca `DATABASE_URL_UNPOOLED` güncellenir (uygulama runtime'ı kullanır, etkilenmez).
3. Doğrulama: `pnpm db:verify`.

### 3.4 Müşteri bağlantı anahtarları
- **`ACCESS_TOKEN_HMAC_KEY`:**
  - Değişirse tüm mevcut bağlantıların arama hash'i geçersiz olur → **tüm müşteri bağlantıları çalışmaz.**
  - Şifreli kopyalar çözülüp yeni HMAC ile yeniden hash'lenebilir (teknik olarak mümkün). Bunun için bir araç **yoktur**.
  - Mevcut güvenli prosedür: yeni anahtar → personel her açık başvuruda "Bağlantıyı Yenile" → müşteriye yeni bağlantı. Ele geçirilmede zorunludur.
- **`ACCESS_TOKEN_ENCRYPTION_KEYS` / `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`:** çoklu anahtar desteklenir.
  1. Haritaya yeni kimlik (`k2`) eklenir ve aktif yapılır; eski anahtar haritada kalır. Yeni bağlantılar yeni anahtarla şifrelenir; eski şifreli kopyalar eski anahtarla çözülür.
  2. Eski anahtar yalnızca eski kopyalar kalmayınca (tüm bağlantılar yenilendikten sonra) kaldırılır.
  3. Erken kaldırılırsa "Bağlantıyı Göster" eski bağlantılarda çalışmaz; bağlantının kendisi çalışmaya devam eder (arama HMAC ile). Yeniden şifreleme aracı yoktur.
- **`CUSTOMER_SESSION_SECRET`:** tüm müşteri oturumları geçersizleşir. Müşteri aynı bağlantıyı yeniden açar; bağlantılar geçerli kalır.

### 3.5 Personel oturum anahtarları
- **`BETTER_AUTH_SECRET`:** tüm personel oturumları geçersizleşir; iki personel yeniden girer. Şifreler etkilenmez (hash anahtardan bağımsız).
- **`RATE_LIMIT_KEY_SECRET`:** giriş sayaçları sıfırlanır (zararsız).

Her yenilemeden sonra: `pnpm check:bundle` gerekmez (değerler istemciye girmez), uygulama günlüklerinde yalnızca kod/ad olduğu kontrol edilir.

## 4. Olay müdahalesi

Her olayda sırasıyla: **Sınırlama → Kanıtın korunması → İnceleme → Kurtarma → Kapanış/eskalasyon.** Audit asla silinmez; yeni kayıtlar olayı belgeler.

| Senaryo | Sınırlama | Kanıt | İnceleme | Kurtarma | Eskalasyon |
|---|---|---|---|---|---|
| 4.1 Çalınan müşteri bağlantısı | Personel "Bağlantıyı İptal Et/Yenile" (anında; eski oturumlar reddedilir) | Başvurunun İşlem Geçmişi (görüntüleme/indirme kayıtları) dışa yazılır | Zaman aralığında hangi dosyalar görüntülendi/indirildi | Müşteriye yeni bağlantı (güvenli kanal) | İndirilmiş PDF'ler geri alınamaz → KVKK ihlal değerlendirmesi (PB-03) |
| 4.2 Personel oturumu/cihaz ele geçirilmesi | İlgili hesabın şifresi `pnpm auth:reset-password` (tüm oturumlarını sonlandırır); gerekirse §3.5 | Audit (USER_LOGIN, işlemler) | Hesabın son işlemleri | Cihaz temizliği; diğer hesap etkilenmez | KVKK değerlendirmesi |
| 4.3 Veritabanı kimlik bilgisi sızıntısı | §3.2/§3.3 hemen; Neon IP allowlist (plan izin veriyorsa) | Neon erişim kayıtları (varsa) | Hangi rol; runtime ise audit değişmemiş (append-only) | Gerekirse §2.3 | Neon destek; KVKK |
| 4.4 B2 anahtarı sızıntısı | Eski anahtar panelde silinir (önce), §3.1 | `pnpm storage:inspect` (bucket public mi, lifecycle/replikasyon değişmiş mi), B2 olay günlükleri (varsa) | Yeni/silinmiş versiyonlar: `pnpm storage:reconcile` (salt okunur rapor) | Değiştirilmiş ayarlar panelden geri alınır | Backblaze destek; KVKK |
| 4.5 Beklenmeyen storage nesnesi | Silinmez | `storage:reconcile` raporu | Sahiplik: anahtar biçimi, başvuru/dosya kaydı | Sahibi kanıtlanırsa normal temizlik; değilse kotada kalır | — |
| 4.6 Takılı kalıcı silme | Silme kuyruğunda kalır; müşteri erişimi zaten kapalı | İlerleme kartı, audit | Neden: belirsiz yazım (§5), sağlayıcı hatası, cap | "Silme İşlemini Sürdür"; belirsiz yazımda §5 | — |
| 4.7 Şüpheli kişisel veri sızıntısı | Etkilenen bağlantılar iptal; gerekirse uygulama bakım moduna (hosting) | Log/audit kopyası (kişisel veri içermez) | Kapsam ve kişi sayısı | Kök neden düzeltmesi + regresyon testi | KVKK md. 12/5: "en kısa sürede" ilgiliye ve Kurula bildirim (72 saat Kurul kararı doğrulanmadı — hukuk) |
| 4.8 Sağlayıcı kesintisi | Uygulama fail-closed (503); yazım girişimleri korunur | Sağlayıcı durum sayfası | Belirsiz yazımlar | Kesinti sonrası `storage:reconcile`; belirsizler §5 | — |
| 4.9 Beklenmeyen fatura | Panelde cap'ler sıkılaştırılır (kullanıcı) | Fatura/kullanım ekranı | Egress/depolama artışı nedeni; audit'te görüntüleme/indirme yoğunluğu | Rate limit veya cap ayarı (karar) | Backblaze destek |
| 4.10 Geri yükleme gereksinimi | Müşteri erişimi kapalı | Olay zamanı | Geri yükleme noktası | §2.3–§2.5 | — |

## 5. Sonucu belirsiz storage yazımı kurtarma (D-123, D-127 koşulu)

**Tespit:**
- Silme ilerlemesinde "sonucu kanıtlanmamış yükleme" görünür.
- `storage_write_attempts.state` `UNKNOWN` olur veya uzun süre `IN_PROGRESS`/`ADMITTED` kalır.
- Başka bir işaret: `storage:reconcile` raporu.

**Korunan metadata (değiştirilmez):**
- girişim satırı (başvuru, dosya, nesne anahtarı, durum, sonuç kodu, zamanlar);
- dosya kaydı;
- kota kullanımı;
- silme işlemi kaydı;
- audit.

**Sağlayıcı desteğine güvenle verilebilecekler:**
- bucket adı ve bölge;
- nesne anahtarı (UUID'lerden oluşur, kişisel veri içermez);
- yaklaşık zaman aralığı (UTC);
- istek türü (PutObject);
- uygulama tarafındaki sonuç kodu.

Verilmeyecekler: müşteri adı/iletişim, dosya içeriği, token, uygulama anahtarı.

**Kesin çözüm için yeterli kanıt:**
- Anahtar altındaki **tam** versiyon listesinde (sayfalama bitti, `IsTruncated=false`) girişime atanabilecek tek versiyonun gözlenmesi. Atanırsa CONFIRMED olur ve UNIQUE (object_key, version_id) gereği başka girişime atanamaz.
- Sağlayıcının resmî ve yazılı olarak "bu istek işlenmedi" doğrulaması (destek kaydı). Bu durumda FAILED olur.

**Yetersiz kanıt:**
- süre geçmesi;
- kira (lease) süresinin dolması;
- tek bir boş LIST sonucu (tutarlılık garantisi belgelenmemiş);
- HTTP zaman aşımı;
- istemci tarafı hata mesajı.

**Versiyon gözlemi:**
1. `pnpm storage:reconcile` (salt okunur) çalıştırılır.
2. Ardından uygulamanın silme adımındaki gözlem yoluyla anahtarın versiyonları en az iki kez, zaman aralığıyla listelenir.
3. Her gözlem olay kaydına yazılır.

**Diğer başvuruların korunması:**
- Yalnızca girişimin kendi nesne anahtarı incelenir.
- Önek silme, toplu silme ve joker işlem yasaktır.

**Kota:** belirsiz girişim çözülene kadar kullanımda sayılmaya devam eder.

**Durma koşulları:** kanıt alınamıyorsa başvuru silme kuyruğunda kilitli kalır. Bu kabul edilen güvenli durumdur. Şunlar **yapılmaz**:
- zorla silme;
- elle `CONFIRMED`/`FAILED` yazma;
- trigger devre dışı bırakma;
- DB işaretini değiştirme.

Bu runbook sağlayıcının garanti vermediği senaryolarda çözüm **garantisi vermez**. D-127 koşulu açık kalır: prosedür tanımlıdır ancak gerçek sağlayıcıda denenmemiştir.

## 6. Bakım komutları (PHASE 12.1)

- `pnpm ops:rate-limit-cleanup` — süresi DOLMUŞ `rate_limit_buckets` satırlarını sayar (dry-run); `--apply` 1000'lik partilerle (en fazla 50) siler. Etkin pencerelere dokunmaz; eşzamanlı artışta sınır aşılmaz (SEC-05 testi). Elle/planlı bakımda; ücretli cron/worker yok. Gerçek ortamda ayrı onayla.
- Hesap işlemleri (`pnpm auth:bootstrap`, `pnpm auth:reset-password`) PHASE 12.1'den itibaren **sahip (owner) bağlantısıyla** çalışır (D-144): çalışma zamanı rolü personel hesabı/credential yazamaz. Neon'da migration 0011 uygulanmadan önce de bu komutlar sahip bağlantısıyla çalışır (davranış aynı).
