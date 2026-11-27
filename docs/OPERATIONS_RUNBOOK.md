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

## 2. Yedekleme ve geri yükleme

### 2.1 Kapsam

| Bileşen | Kaynak | Yedek yöntemi | Not |
|---|---|---|---|
| Şema, tüm tablolar (başvuru, evrak, dosya metadata'sı, token hash + şifreli kopya, yorum, iç not, inceleme, statü geçmişi, audit, yazım girişimleri, silme işlemleri, kota durumu) | Neon `neondb` | `pg_dump -Fc` (owner URL) | Rol/şifre dump'a girmez; `db:init` ile yeniden kurulur |
| Fiziksel PDF versiyonları | B2 `cs-global-documents` | Ayrı hesap/bucket'a kopya (karar bekliyor) | B2 versiyon geçmişi **bağımsız yedek değildir** (aynı anahtar/hesap ele geçirilirse etkilenir) |
| Ortam değişkenleri / anahtarlar | Hosting env + yetkili kişinin parola yöneticisi | Şifreli, çevrimdışı kopya | `ACCESS_TOKEN_*` kaybı = mevcut bağlantılar kullanılamaz (§3.4) |
| Operasyon belgeleri | Repo `docs/` | Git | — |

**Neon Free (resmî plan sayfası, 2026-11-27):** "Instant restore — up to 6 hours" ve "History window — 6 hours, up to 1 GB of changes"; Free'de "1 manual snapshot", "scheduled backups are not available on the Free plan"; dışa aktarma `pg_dump` ile (compute askıdaysa `pg_dump` dahil bağlantılar SQLSTATE 53000 ile başarısız olur). → **6 saatten eski veri kaybı için tek koruma, düzenli `pg_dump`'tır.** Sıklık ve saklama süresi Product Owner kararıdır (önerilmez, belirlenmez).

### 2.2 Veritabanı yedeği (yetkili kişi, kendi makinesinde/şifreli depoda)

1. `pnpm db:verify` → TLS ve migration sayısı.
2. `pg_dump --format=custom --no-owner --dbname "$DATABASE_URL_UNPOOLED" --file cs-global-YYYYMMDD.dump` (değişken değeri ekrana yazdırılmaz).
3. Dosyayı hemen şifreleyin (ör. parola yöneticisi/age/7z AES); şifresiz kopyayı silin.
4. Kayıt: dosya adı, boyut, SHA-256, migration sayısı, audit satır sayısı ve son audit id (parmak izi).

### 2.3 Geri yükleme (temiz hedefe)

1. Hedef: **yeni** boş Neon projesi/branch veya izole PostgreSQL (mevcut veritabanının üzerine yazılmaz).
2. `DATABASE_URL*` hedefi gösterecek şekilde `pnpm db:init` (yalnızca runtime rolü + zaman aşımları).
3. `pg_restore --no-owner --exit-on-error --dbname "$HEDEF_OWNER_URL" cs-global-YYYYMMDD.dump`.
4. `pnpm db:verify` → 21 tablo, 11 migration, runtime yetkileri.
5. Parmak izi karşılaştırması (yedek kaydıyla).
6. **Müşteri erişimini açmadan önce §2.4 ve §2.5 tamamlanır.**

### 2.4 Silinmiş/iptal edilmiş verinin geri dönüşünün önlenmesi (SEC-03, PB-12)

Yedek, yedekten **sonra** yapılan iptal/silme işlemlerini içermez (tatbikatta kanıtlandı). Bu nedenle:

1. Geri yükleme noktasından sonraki dönem için kalıcı silme ve bağlantı iptali kayıtları belirlenir. Kaynaklar: mümkünse olay anındaki audit dışa aktarımı (`APPLICATION_DELETION_REQUESTED`, `APPLICATION_DELETED`, `ACCESS_LINK_REVOKED`, `ACCESS_LINK_ROTATED`), personel olay kaydı.
2. **Varsayılan güvenli adım:** müşteri erişimi açılmadan önce tüm aktif bağlantılar iptal edilir. Owner ile, tek transaction, `revoke_reason = 'REVOKED'`, `revoked_by_user_id` = işlemi yapan personel. Müşterilere personel yeni bağlantı gönderir ("Bağlantıyı Yenile"). Bu, geri dönen tüm iptal edilmiş token'ları etkisiz kılar.
3. Yedekten sonra kalıcı silinmiş başvurular, uygulamanın normal kalıcı silme akışıyla **yeniden** silinir (gerekçe: "geri yükleme sonrası yeniden uygulama", olay kimliği). Bu akış B2'de nesne bulamazsa yokluk kanıtıyla tamamlanır.
4. Doğrulama tamamlanana kadar uygulama yalnızca personele açılır.
5. Otomatik koruma yoktur (ör. veritabanı dışında tutulan silme defteri) → PB-12 kararı.

### 2.5 Nesne deposu kurtarma ve VersionId eşlemesi

- Başka bir bucket'a/sağlayıcıya kopyalanan nesnelerin `VersionId`'leri **değişir** (tatbikat: 3/3 değişti, veritabanındaki kimlikler yeni depoda 0/3 çözüldü). Aynı anahtar korunur.
- Eşleme: her dosya kaydı için yeni depodaki ilgili anahtarın versiyonları listelenir. Gövdenin SHA-256'sı `application_document_files.sha256` ile karşılaştırılır. Tek eşleşen versiyon `storage_version_id` olarak güncellenir (owner, tek transaction, değişiklik listesi kaydedilir).
- Eşleşme yoksa veya birden fazla eşleşme varsa kayıt değiştirilmez; dosya "bütünlük hatası" (502) verir ve olay açılır.
- Veritabanı ve nesne yedekleri farklı zamanlardaysa: veritabanında olup nesnesi olmayan kayıt → bütünlük hatası (müşteriye 503/502; veri kaybı olarak raporlanır); nesnesi olup kaydı olmayan nesne → `storage:reconcile` raporunda "kayıt dışı" (silinmez, kotada sayılır).

### 2.6 Sentetik tatbikat (`pnpm test:restore-drill`, 2026-11-27)

Geçici iki Docker PostgreSQL + yerel depolama, sentetik veri (20 başvuru, 3 gerçek nesne):
- Şema envanteri birebir: 21 tablo, 309 kısıt, 73 indeks, 15 trigger, runtime yetki hash'i aynı, 11 migration; 21 tablo veri parmak izinde fark yok.
- Süreler (küçük veri, yerel): `pg_dump` 102 ms, `pg_restore` 155 ms, hedef hazırlığı toplam ~1,1 sn. Gerçek RTO; veri boyutu, ağ ve Neon proje oluşturma süresine bağlıdır (**ölçülmedi**).
- Hedefte runtime: audit UPDATE/DELETE reddedildi (42501), kanıtsız başvuru silme reddedildi (55000), okuma/yazma çalışıyor.
- Resurrection: yedekten sonra iptal edilen token geri yüklemede yeniden etkin (→ §2.4).
- Nesne kopyası: SHA-256 3/3 eşleşti; VersionId 3/3 değişti (→ §2.5).

RPO: Neon Free'de son 6 saat anlık geri yükleme; daha eskisi için son `pg_dump` zamanı. RTO: ölçülmedi (prosedür ~30–60 dk tahmini; tahmin, ölçüm değil).

## 3. Anahtar ve kimlik bilgisi yenileme

Genel ön koşullar: yetkili kişi; güncel şifreli yedek (§2.2); bakım penceresi duyurusu (iki personel); eski değer, doğrulama bitene kadar parola yöneticisinde saklanır; sonra güvenli silinir.

### 3.1 Backblaze uygulama anahtarı (SEC-01 düzeltmesi dahil)

1. B2 panelinde **yeni** anahtar oluşturulur:
   - Bucket: yalnızca `cs-global-documents`; önek yok.
   - Yetkiler yalnızca `listBuckets`, `listFiles`, `readFiles`, `writeFiles`, `deleteFiles`.
   - Oluşturulmayacak yetkiler: `writeBuckets`, `writeBucket*`, `shareFiles`, `*Keys`.
2. Yerelde `pnpm env:b2` (gizli girdi; mevcut anahtarı değiştir onayı), production'da hosting env güncellenir.
3. `pnpm storage:inspect` → `excessRisky: []`, `missingRequired: []`, `headBucket: OK`.
4. Uygulamada personel bir PDF görüntüler (okuma) ve test başvurusuna sentetik yükleme yapar (yazma; yalnızca geliştirme ortamında).
5. Eski anahtar panelde silinir. Etki: oturum/bağlantılar etkilenmez. Geri alma: eski anahtar silinmeden önce env eski değere döndürülür.
6. Ele geçirilme şüphesinde: önce eski anahtar silinir (yazma/okuma durur → dosya işlemleri 503), sonra yeni anahtar; §4.4.

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
