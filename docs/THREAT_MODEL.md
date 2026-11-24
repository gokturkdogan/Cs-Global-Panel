# Tehdit Modeli

> Revizyon: 2026-11-24 (OD-01…OD-23 sonrası). Tehdit kimlikleri statü geçişleriyle (T1–T12) çakışmaması için `T01…` → **`TM-01…`** olarak yeniden adlandırıldı. Yöntem: varlık + güven sınırı analizi, STRIDE, OWASP Top 10 eşlemesi.
> Olasılık / Etki: Düşük · Orta · Yüksek · Kritik. **Kalan risk**, önlemler uygulandıktan sonraki değerlendirmedir.
> Kullanıcının kabul ettiği ürün kararları riskleri ortadan kaldırmaz; aşağıdaki "Production blocker" sütunu gerçek müşteri verisi kullanımından önce ne gerektiğini gösterir.
> Önlem ayrıntıları: [SECURITY.md](SECURITY.md), [FILE_STORAGE.md](FILE_STORAGE.md), [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

## 1. Varlıklar

| Varlık | Hassasiyet |
|---|---|
| Müşteri belgeleri (pasaport, kimlik, banka, iş sözleşmesi, ikametgâh) | **Kritik** |
| Müşteri iletişim bilgileri | Yüksek |
| Müşteri bağlantıları (bearer, süresiz) | **Kritik** (belgelere erişim anahtarı) |
| Şirket içi notlar | Yüksek |
| Personel kimlik bilgileri / oturumları | Yüksek (ADMIN: kritik) |
| Secret'lar (DB URL, storage token, HMAC/şifreleme anahtarları, auth secret) | **Kritik** |
| Audit log bütünlüğü | Orta |

## 2. Güven Sınırları

İnternet ↔ hosting (proxy, sayfalar, actions, route handlers) · Tarayıcı ↔ private storage (client upload) · Storage → uygulama callback'i · Uygulama ↔ Postgres · Zamanlanmış iş → uygulama · WhatsApp (bağlantının taşındığı kanal, kontrolümüz dışında) · Operatör ↔ hosting/DB/GitHub konsolları.

## 3. Tehdit Tablosu

| ID | Tehdit | Olasılık | Etki | Önlem | Kalan risk | Doğrulama | Production blocker |
|---|---|---|---|---|---|---|---|
| **TM-01** | **IDOR** — müşteri `fileId`/ID değiştirerek başka başvuruya erişir | Orta | Kritik | Kapsam yalnızca oturumdan; dosyada `application_id` eşleşmesi; 404 | Düşük | Integration + E2E çapraz erişim (S01, S02) | Hayır (testler PB-07 kapsamında) |
| **TM-02** | **Broken access control** — EMPLOYEE admin action'ını doğrudan POST eder | Orta | Yüksek | Her action'da RBAC; UI gizleme güvenlik değil | Düşük | Yetki matrisi negatif testleri | PB-07 |
| **TM-03** | **Mass assignment / privilege escalation** (`role` gönderme) | Orta | Yüksek | `.strict()` şemalar; rol yalnızca `user:set_role` | Düşük | Unit + integration | PB-07 |
| **TM-04** | **SQL injection** | Düşük | Kritik | Drizzle parametreli sorgular | Düşük | Arama fuzz testleri | Hayır |
| **TM-05** | **XSS** (müşteri adı, dosya adı, yorum) | Orta | Yüksek | React escape, `dangerouslySetInnerHTML` yasak, nonce CSP, HttpOnly | Düşük | S19 | Hayır |
| **TM-06** | **CSRF** | Düşük | Orta | Next.js Origin kontrolü, Better Auth origin kontrolü, SameSite=Lax, `/api/uploads` Origin kontrolü | Düşük | S17 | Hayır |
| **TM-07** | **Personel oturumu çalınması** | Düşük | Yüksek | HttpOnly, Secure, HSTS, XSS önlemleri, oturum iptali | Orta — **7 günlük oturum** çalınırsa 7 gün geçerli (hareketsizlik zaman aşımı yok, OD-22) | Cookie flag testleri | Hayır (kabul edilmiş parametre; risk kaydı) |
| **TM-08** | **Oturum sabitleme** | Düşük | Orta | Oturum yalnızca başarılı giriş/bağlantı doğrulaması sonrası üretilir; `__Host-` öneki | Düşük | Integration | Hayır |
| **TM-09** | **Personel şifre brute-force / zayıf şifre** — min **8** karakter (OD-22) | Orta | Yüksek | scrypt; IP + kullanıcı adı bazlı DB rate limit; şifreleri ADMIN belirler (ADMIN uzun rastgele şifre seçebilir — operasyonel öneri); genel hata mesajı | Orta — 8 karakterlik insan seçimi şifreler sözlük saldırısına açıktır; dağıtık saldırı IP limitini aşabilir | Rate limit integration testleri | Hayır (kabul edilmiş; ADMIN'e uzun şifre önerisi) |
| **TM-10** | **Kullanıcı adı bazlı kilitleme ile DoS** (saldırgan personeli kilitler) | Düşük | Orta | 15 dk kısa blok; IP limiti | Düşük-Orta | Integration | Hayır |
| **TM-11** | **Token brute-force** (`/b/*` tarama) | Çok düşük | Kritik | 256 bit entropi; IP rate limit | Çok düşük | Rate limit testi; entropi unit testi | Hayır |
| **TM-12** | **Account enumeration** | Düşük | Orta | Tek tip mesaj; `is-username-available` kapalı; sign-up yok | Düşük | Var/yok kullanıcı yanıt eşitliği testi | Hayır |
| **TM-13** | **Bearer bağlantının sızması** (iletilen mesaj, WhatsApp yedeği/iCloud/Google Drive, paylaşılan/kayıp telefon, ekran görüntüsü) — **OTP yok + süresiz bağlantı** (OD-01, OD-04) | **Yüksek** (yıllar içinde birikimli) | **Kritik** — pasaport/kimlik/banka belgeleri görüntülenip indirilebilir, sahte belge yüklenebilir | Personel iptal/yenileme (anında etkili); "paylaşmayınız" uyarısı; belge görüntüleme/indirme audit'i; `no-referrer`; üçüncü taraf yok | **Yüksek** — bağlantı ele geçirildiğinde ek bariyer yoktur; tamamlanan/iptal edilen başvuruların bağlantıları da süresiz açıktır | Manuel senaryo; iptal/yenileme testleri (S03, S04) | **Evet — PB-04: yazılı risk kabulü + KVKK değerlendirmesi** |
| **TM-14** | **Yanlış kişiye bağlantı gönderimi** (çalışan hatası, yanlış numara) | Orta | Kritik | Paylaşım onay penceresinde müşteri adı + telefon gösterimi (BR-162); hızlı iptal/yenileme | Orta | E2E (onay penceresi içeriği) | PB-04 kapsamında |
| **TM-15** | **Path tabanlı token'ın altyapı loglarında görünmesi** (OD-02) | Orta | Yüksek | Uygulama loglarında redaksiyon; platform log erişimini kısıtlama; log drain yok | **Orta — kontrolümüz dışında; tamamen önlendiği garanti edilemez** | Uygulama log çıktısı incelemesi; sağlayıcı log politikasının PHASE 13'te incelenmesi | PB-04 kapsamında |
| **TM-16** | **Zararlı PDF** — antivirüs taraması yok (OD-07); personel cihazında görüntüleyici exploit'i | Orta | **Kritik** | Yapısal doğrulama + aktif içerik/gömülü dosya/şifreleme reddi + kaynak sınırları; private storage; sandbox header'ları; tarayıcıda görüntüleme; personel cihazında güncel OS/tarayıcı + yerleşik AV (operasyonel) | **Orta-Yüksek** — bilinen zararlı yazılım imzaları ve parser'ın görmediği exploit'ler tespit edilmez | FILE_STORAGE §6.4 test seti | **Evet — PB-05: yazılı risk kabulü + personel cihaz politikası** |
| **TM-17** | **Yetkisiz storage erişimi** | Düşük | Kritik | Private store; public URL yok; signed URL yok; storage token yalnızca sunucuda | Düşük | Private URL'e doğrudan istek → reddedilir | Hayır |
| **TM-18** | **Client upload token / callback kötüye kullanımı** | Düşük | Orta | Pathname sunucuda; tip + boyut + kısa süre; DB kayıt eşleşmesi; storage'dan gerçek boyut | Düşük | Sahte callback testi | Hayır |
| **TM-19** | **İç notların müşteri payload'ına sızması** (HTML/RSC) | Orta | Yüksek | Ayrı müşteri DTO'ları; `features/portal` import kısıtı; açık kolon seçimi | Düşük | S16 (işaretçi string araması) | PB-07 |
| **TM-20** | **Cache üzerinden veri sızıntısı** | Düşük | Yüksek | `cacheComponents` kapalı; `use cache` yasak; `no-store`; tüm korumalı sayfalar dinamik | Düşük | S15 | PB-07 |
| **TM-21** | **Race condition** — eski versiyon onayının yeni dosyayı onaylaması (OD-17), çift gönderim, eşzamanlı bağlantı yenileme (OD-18) | Orta | Yüksek | Satır kilitleri + version; review `fileId` eşleşmesi (BR-57); partial unique index'ler (tek aktif dosya, tek aktif token, tek devam eden yükleme) | Düşük | Paralel istek integration testleri | PB-07 |
| **TM-22** | **Pasif hesabın aktif oturumu** | Düşük | Yüksek | `banUser` oturumları iptal eder; her istekte `banned`; cookie cache kapalı | Düşük | S06 | Hayır |
| **TM-23** | **Kapalı olması gereken Better Auth uç noktalarının doğrudan çağrılması** (`change-password`, `update-user`, `admin/*`) (OD-11) | Orta | Yüksek | `disabledPaths` + `hooks.before`; testler | Orta — `auth.api` etkileşimi doğrulanmadı (TD-03) | Her kapalı uç noktaya doğrudan HTTP isteği testi | **Evet — PB-10** |
| **TM-24** | **Tüm çalışanların tüm başvurulara erişimi** — insider toplu görüntüleme/indirme (OD-03) | Düşük-Orta | Yüksek | Belge görüntüleme/indirme audit'i; dosya rate limit; ADMIN'in audit log incelemesi; personel gizlilik taahhüdü (operasyonel) | Orta — kapsam kısıtı yok | Audit kayıt testleri | Hayır (kabul edilmiş; operasyonel kontrol önerilir) |
| **TM-25** | **IP/cihaz verisi saklanmaması** (OD-09) → olay incelemesinde kaynak tespiti yapılamaması | — | Orta | Audit'te aktör/işlem/zaman; hosting sağlayıcısının kendi logları (bizim politikamızdan bağımsız) | Orta — adli inceleme kabiliyeti sınırlı | — | Hayır (kabul edilmiş) |
| **TM-26** | **Better Auth'un IP/UA'yı sessizce kaydetmesi** (OD-09 ihlali) | Orta | Orta (KVKK) | `disableIpTracking`; session hook; DB CHECK ile yazma girişiminin başarısız olması | Düşük | Giriş sonrası `sessions` satırı kontrolü | PB-10 |
| **TM-27** | **Manuel silmenin kısmi kalması** (storage'da sahipsiz kişisel veri) (OD-06) | Düşük | Yüksek | İki aşamalı silme; DB satırı storage boşalmadan silinmez; yeniden deneme; prefix mutabakatı | Düşük | Hata enjeksiyonlu integration testi | Hayır |
| **TM-28** | **Yanlış başvurunun silinmesi** (geri dönüşsüz) | Düşük | Yüksek | Yalnızca ADMIN; başvuru numarası yazılarak onay | Orta — yedekten geri dönüş sağlayıcı planına bağlı | E2E onay akışı | Hayır |
| **TM-29** | **Verilerin süresiz birikmesi** (otomatik saklama yok, OD-06) | Yüksek | Orta (KVKK) | Şirketin manuel imha süreci; ADMIN silme aracı | **Yüksek (hukuki)** — manuel silme süresiz saklama için dayanak değildir | — | **Evet — PB-03 (hukuki değerlendirme)** |
| **TM-30** | **Ücretsiz altyapı riskleri** (OD-12): ticari kullanım ihlali, kota aşımıyla erişim kesintisi, SLA/yedek eksikliği, beklenmeyen ücret | Yüksek | Yüksek | Production ücretsiz planlar ticari kullanım koşulları doğrulanmadan açılmaz; harcama limiti/kredi kartı istemeyen planlar tercih; kapasite izleme | Yüksek | PHASE 13 öncesi sağlayıcı değerlendirmesi | **Evet — PB-01, PB-02, PB-08** |
| **TM-31** | **Denial of service** (upload/bağlantı spam, ağır arama) | Orta | Orta | Rate limit; sabit boyut; sayfa ≤ 50; arama min 2 kr.; ücretsiz kotaların tükenmesi riski | Orta (kota) | Limit testleri | PB-02 ile ilişkili |
| **TM-32** | **Bağımlılık açıkları** | Orta | Değişken | Exact sürüm, lockfile, `pnpm audit` | Düşük | CI audit | PB-09 |
| **TM-33** | **Secret sızıntısı** (`.env` commit, client bundle) | Orta | Kritik | `.gitignore` (D-031), `server-only`, `NEXT_PUBLIC_` yok, bundle kontrolü, secret scanning | Düşük | Bundle grep; push protection | Hayır |
| **TM-34** | **Preview/demo ortamında gerçek veri** | Orta | Yüksek | Ayrı DB/storage/secret; yalnızca sahte seed | Düşük | Ortam yapılandırma kontrol listesi | PB-06 |
| **TM-35** | **Audit log manipülasyonu** | Düşük | Orta | DB yetkisi + trigger | Düşük | UPDATE/DELETE denemesi testi | Hayır |
| **TM-36** | **Host header ile sahte bağlantı üretimi** (OD-20) | Düşük | Orta | URL'ler yalnızca `APP_URL`'den | Düşük | Sahte Host header testi | Hayır |
| **TM-37** | **Domain değişikliğinde eski bağlantıların kırılması** (OD-20) | Orta | Orta | Eski alan adı korunuyorsa yönlendirme; korunamıyorsa toplu bağlantı yenileme + yeniden paylaşım (DEPLOYMENT §8) | Orta | — | Hayır |
| **TM-38** | **Phishing / sahte bağlantı** | Orta | Orta | Tek resmî alan adı; müşteriye operasyonel bilgilendirme | Orta | — | Hayır |
| **TM-39** | **Konsol hesaplarının ele geçirilmesi** | Düşük | Kritik | MFA zorunlu; en az yetki | Düşük | PHASE 13 kontrol listesi | PB-06 kapsamında |
| **TM-40** | **Aynı tarayıcıda birden fazla müşteri bağlantısı** — tek portal cookie'sinin (`__Host-cs_portal`) yeni bağlantıyla üzerine yazılması; açık sekmede başka başvurunun görüntülenmesi veya kullanıcının yanlış başvuruya yükleme yapması | Orta | Orta | Kapsam yalnızca cookie'den; evrak/dosya kimlikleri başvuruya özgü olduğundan kapsam dışı mutasyon 404; istemcinin gördüğü başvuru ile cookie'deki başvurunun uyuşmadığı durumda işlemin reddedilmesi ve sayfanın yenilenmesi (yaklaşım PHASE 07'de kesinleşir; istemci değeri kapsam kaynağı olamaz) | Düşük (önlem uygulandıktan sonra) | PHASE 07 E2E: aynı tarayıcıda iki bağlantı, iki sekme | Hayır (PB-07 kapsamında) |
| **TM-41** | **Yüksek yetkili veritabanı rolünün kötüye kullanımı** — tablo sahibi/migration rolünün kimlik bilgisiyle audit trigger'ının kapatılması, kayıtların değiştirilmesi veya silinmesi | Düşük | Kritik | Runtime uygulaması sahip rolle çalışmaz (`cs_app_runtime` zorunlu — D-054/D-055); sahip rol yalnızca migration/yönetim için, yalnızca yetkili kişide; Neon hesabında MFA; production'da ayrı proje ve kimlik bilgisi (PB-06) | Orta (audit koruması sahip role karşı mutlak değil) | PHASE 02 integration: runtime rolünün yetki matrisi; PHASE 13 kontrol listesi | PB-06 kapsamında |
| **TM-42** | **Geliştirici makinesindeki veritabanı kimlik bilgilerinin sızması** (`.env.local`) | Düşük | Yüksek (development'ta yalnızca sahte veri) | `.env.local` git'te ignore (CI kontrolü); development ve production ayrı Neon projesi; dev/test'te gerçek veri yasak; şifre rotasyonu (`pnpm db:init` ile runtime şifresi eşitlenir) | Düşük | `git check-ignore` (CI); DEPLOYMENT §5 | Hayır |
| **TM-43** | **Tek veritabanında test/seed verisinin gerçek veriye karışması** (D-059) — integration testleri, seed veya hatalı test temizliğinin gerçek müşteri verisi bulunan veritabanında çalışması | Orta (gerçek veri girdikten sonra) | Yüksek | Testler yalnızca kendi rastgele kimlikleriyle oluşturduğu kayıtları siler; seed mevcut kayıtlara dokunmaz; `db:init` yabancı tablo varsa durur; gerçek veri öncesi ayrı production veritabanı (PB-06) | Orta | PHASE 13 öncesi karar | **Evet** (gerçek veri girmeden önce PB-06 kapsamında çözülmeli) |

## 4. Birleşik Risk Değerlendirmesi

| Kombinasyon | Değerlendirme |
|---|---|
| **OTP yok + süresiz bağlantı + path tabanlı token + müşterinin belge indirebilmesi** | Bu sistemdeki **en yüksek risk**tir. Bağlantı tek başına, süresiz olarak, en hassas belgelere okuma/indirme erişimi sağlar ve WhatsApp sohbetleri, yedekleri ve platform logları gibi kontrolümüz dışındaki yerlerde bulunur. Kalan risk: **Yüksek**. |
| 8 karakter şifre + 7 günlük oturum + tüm çalışanların tüm başvurulara erişimi | Tek bir personel hesabının ele geçirilmesi tüm müşteri belgelerine 7 güne kadar erişim sağlar. Kalan risk: **Orta-Yüksek**. |
| Antivirüs yok + personelin tüm belgeleri açması | Tek bir zararlı PDF personel cihazını hedef alabilir. Kalan risk: **Orta-Yüksek**. |
| IP/cihaz verisi yok + bearer link | Bağlantının kötüye kullanıldığını tespit etmek pratikte mümkün olmayabilir (yalnızca görüntüleme/indirme zamanları audit'te). |
| Ücretsiz altyapı + otomatik silme yok | Kota dolması ve hukuki saklama yükümlülüğü riskleri birlikte büyür. |

### Düşük maliyetli ek önlem seçenekleri (uygulanmadı — kullanıcı kararı gerektirir)
Bu seçenekler kabul edilmiş kararlarla çelişebileceği için **kapsama eklenmemiştir**; production risk kabulü sırasında değerlendirilmek üzere listelenmiştir:
1. **Müşteri panelinde, yüklenmiş belgelerin indirilmesini/görüntülenmesini kapatmak** (müşteri yalnızca yükler ve durumunu görür). Bağlantı sızdığında belgelerin dışarı alınmasını engeller; maliyeti sıfırdır. *(Brief'teki "Dosya görüntüleme ve indirme" müşteri özelliğiyle çelişir.)*
2. **Başvuru tamamlandığında/iptal edildiğinde personelin bağlantıyı manuel iptal etmesini öneren onay penceresi metni** (otomatik iptal değil; OD-04 ile uyumlu, ancak yeni UI davranışıdır).
3. **ADMIN için "güçlü şifre üret" yardımcısı** (8 karakter minimumu değişmeden, varsayılan olarak 16+ karakterlik rastgele şifre önerir).
4. **Müşteri panelinde telefon/e-postanın maskelenmesi** (bağlantı sızıntısında PII ifşasını azaltır; brief'teki tam gösterim gereksinimiyle çelişir).

## 5. Gözden Geçirme

Tehdit modeli her faz sonunda ilgili özellik için güncellenir; PHASE 12'de tam gözden geçirme ve manuel sızma testi yapılır. Production öncesi PB-04 ve PB-05 için Product Owner'ın **yazılı risk kabulü** alınır.
