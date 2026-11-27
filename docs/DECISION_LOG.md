# Karar Kaydı (Decision Log)

> Durumlar: **Proposed** · **Accepted** · **Rejected** · **Superseded**.
> Bölüm A: Product Owner tarafından onaylanan ürün kararları (OD-01…OD-26). Bölüm B: teknik kararlar (D-001…D-114). Bölüm C: faz onayları.
> Bir ürün kararının **ACCEPTED** olması, ilgili riskin güvenlik denetiminden geçtiği veya hukuki uygunluğun doğrulandığı anlamına gelmez — bkz. [THREAT_MODEL.md](THREAT_MODEL.md), [DATA_PRIVACY.md](DATA_PRIVACY.md), [SECURITY.md](SECURITY.md) §11.
> Geçmiş kararlar silinmez; yerine geçilenler **Superseded** olarak işaretlenir.

---

## A. Ürün Kararları (OD-01…OD-26)

Tümü için: **Status: ACCEPTED · Approved By: Product Owner · Approval Date: 2026-11-24**

### OD-01 — Müşteri erişim modeli: yalnızca bağlantı (A)
- **Önceki öneri:** B — bağlantı + e-posta OTP + süreli oturum (D-012).
- **Nihai karar:** A — yalnızca benzersiz bağlantı; hesap, şifre, e-posta/SMS OTP, ek doğrulama yok. Bağlantı ek bilgi istemeden müşteri oturumu oluşturur. Token CSPRNG ≥ 256 bit.
- **Ürün tercihi:** Müşteri sürtünmesini sıfırlamak; e-posta servisi ve maliyetinden kaçınmak.
- **Mimari etki:** OTP akışı, `/portal/verify`, pre-auth cookie, e-posta modülü kaldırıldı; `/b/[token]` doğrudan oturum oluşturup `/portal`'a yönlendirir.
- **Veri modeli etkisi:** `customer_otp_challenges` kaldırıldı.
- **Güvenlik etkisi:** Bağlantı **bearer credential**; ele geçiren herkes erişir. Kalan risk Yüksek (TM-13); PB-04.
- **Maliyet etkisi:** E-posta sağlayıcı maliyeti yok.
- **Etkilenen dokümanlar:** BUSINESS_RULES §10, SECURITY §3–4, THREAT_MODEL, ARCHITECTURE §4, API_CONTRACTS §3, DATABASE_SCHEMA, TESTING_STRATEGY, PRD.
- **Faz:** PHASE 06–07.

### OD-02 — Path tabanlı bağlantı biçimi
- **Önceki öneri:** Fragment tabanlı (`/b#token`) (D-013).
- **Nihai karar:** `https://<host>/b/<token>`; sunucu tarafı doğrulama, oturum, token'sız URL'e yönlendirme, token'ın log/audit/hata mesajlarında olmaması, `no-referrer`, `no-store`, `noindex`, üçüncü taraf analytics yok, crawler'ların durum değiştirmemesi.
- **Ürün tercihi:** Basitlik; brief'teki örnekle uyum.
- **Mimari etki:** `GET /b/[token]` Route Handler; fragment exchange action'ı kaldırıldı.
- **Veri modeli etkisi:** `last_used_at` kaldırıldı (GET yan etkisiz).
- **Güvenlik etkisi:** Token hosting altyapı loglarında görünebilir; **engellendiği garanti edilemez** (TM-15).
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** SECURITY §3.4, §4; THREAT_MODEL TM-15; API_CONTRACTS §4.4.
- **Faz:** PHASE 07.

### OD-03 — Tüm çalışanlar tüm başvuruları görür
- **Durum güncellemesi (2026-11-24):** **PARTIALLY SUPERSEDED by OD-24** — "ADMIN/EMPLOYEE fonksiyonel farkları korunur" ifadesi geçersiz; iki hesap eşit yetkilidir. Atama/kapsam olmaması aynen geçerli.
- **Önceki öneri:** Ayarlanabilir kapsam (`ALL` / `ASSIGNED_ONLY`) + atama (D-014).
- **Nihai karar:** Atama, assigned-only, kapsam ayarı yok. ADMIN/EMPLOYEE fonksiyonel farkları korunur.
- **Ürün tercihi:** Küçük ekip; sade operasyon.
- **Mimari etki:** `applicationScopeFilter`, atama action'ı ve UI kaldırıldı.
- **Veri modeli etkisi:** `applications.assigned_user_id`, `employee_application_scope` kaldırıldı.
- **Güvenlik etkisi:** Insider riski (TM-24); audit ile izlenir.
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** AUTHORIZATION_MATRIX, BUSINESS_RULES, API_CONTRACTS, DATABASE_SCHEMA, THREAT_MODEL.
- **Faz:** PHASE 06, 10.

### OD-04 — Bağlantılar süresiz
- **Önceki öneri:** 180 gün + terminal statüden 30 gün sonra otomatik geçersizlik (BR-102/103 eski).
- **Nihai karar:** Zaman/statü bazlı otomatik iptal yok; panel ayarı yok. Geçersizlik yalnızca iptal, yenileme veya başvuru silme ile. Oturum süresi bağlantı geçerliliğinden bağımsız.
- **Ürün tercihi:** Müşterinin her zaman erişebilmesi; operasyonel basitlik.
- **Mimari etki:** Süre sonu kontrolleri ve cron görevleri kaldırıldı.
- **Veri modeli etkisi:** `application_access_tokens.expires_at` kaldırıldı.
- **Güvenlik etkisi:** OTP yokluğuyla birleşince kalan risk Yüksek (THREAT_MODEL §4).
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** BUSINESS_RULES BR-101, SECURITY §3.3, THREAT_MODEL, DATABASE_SCHEMA §4.11.
- **Faz:** PHASE 06–07.

### OD-05 — İptal ve yeniden açma
- **Durum güncellemesi (2026-11-24):** **PARTIALLY SUPERSEDED by OD-24** — "yalnızca ADMIN yeniden açar/geri alır" geçersiz; her iki hesap T8–T12'yi gerekçeyle yapar. Gerekçe zorunluluğu, merkezi domain logic ve matris dışı geçiş yasağı aynen geçerli.
- **Önceki öneri:** İptal ADMIN+EMPLOYEE; yeniden açma MVP'de yok.
- **Nihai karar:** ADMIN ve EMPLOYEE gerekçeyle iptal eder. Yalnızca ADMIN gerekçeyle iptali/tamamlanmışı yeniden açar ve izin verilen önceki aşamalara döndürür; merkezi domain logic doğrular; evraklar/versiyonlar/onaylar/geçmiş korunur; gerektiğinde seçilen evrakların onayı geçersiz kılınır; COMPLETED/CANCELLED paneli salt okunur.
- **Ürün tercihi:** Hatalı kapatma/iptallerin düzeltilebilmesi.
- **Mimari etki:** T8–T12 geçişleri (D-041).
- **Veri modeli etkisi:** `application_status_history.transition_code` + gerekçe CHECK.
- **Güvenlik etkisi:** ADMIN geçişleri yine matrisle sınırlı; audit'li.
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** STATE_TRANSITIONS, AUTHORIZATION_MATRIX, API_CONTRACTS, BUSINESS_RULES BR-62.
- **Faz:** PHASE 09.

### OD-06 — Otomatik saklama/silme yok; ADMIN manuel silme
- **Durum güncellemesi (2026-11-24):** **PARTIALLY SUPERSEDED by OD-24** — "yalnızca ADMIN siler" geçersiz; her iki hesap manuel siler. Otomatik silme olmaması, onay penceresi, iki aşamalı gerçek silme ve hukuki uyarılar aynen geçerli.
- **Önceki öneri:** Ayarlanabilir saklama süreleri, otomatik imha işleri.
- **Nihai karar:** Otomatik başvuru/müşteri/versiyon silme ve saklama ayarı yok. Yalnızca ADMIN; onay penceresi, geri dönüşsüz uyarısı; bağlantı + oturumlar + tüm dosya versiyonları + DB kayıtları gerçekten silinir; minimum audit; kısmi hatalarda retry/reconciliation. Teknik temizlik ayrı tutulur. KVKK yükümlülüklerini şirket takip eder.
- **Ürün tercihi:** Basitlik; silme kontrolünün şirkette olması.
- **Mimari etki:** İki aşamalı silme (D-036); retention cron görevleri kaldırıldı.
- **Veri modeli etkisi:** `system_settings` saklama alanları, `terminal_at`, `anonymized_at` kaldırıldı; `deletion_requested_*` eklendi.
- **Güvenlik/hukuk etkisi:** Manuel silme süresiz saklamaya hukuki dayanak değildir (TM-29, PB-03).
- **Maliyet etkisi:** Birikimli storage kullanımı (PB-02).
- **Etkilenen dokümanlar:** BUSINESS_RULES §15, FILE_STORAGE §5, DATA_PRIVACY §4–5, DATABASE_SCHEMA, API_CONTRACTS.
- **Faz:** PHASE 06, 08.

### OD-07 — Harici antivirüs yok; yapısal PDF doğrulaması
- **Önceki öneri:** Yapısal doğrulama + ClamAV veya ticari AV (D-018).
- **Nihai karar:** ClamAV/ticari API/üçüncü tarafa gönderim yok. Uzantı, MIME, imza, güvenli parser ile yapı, boyut, sayı, dosya adı, storage anahtarı, ilişki kontrolleri; JavaScript/gömülü dosya/Launch/aktif içerik/şifreli/kaynak tüketimi kuralları. Doğrulama bitmeden erişim yok. "Virüssüz" etiketi yok. Gerekirse indirme yaklaşımı.
- **Ürün tercihi:** Sıfır maliyet; belgeleri üçüncü tarafa göndermemek.
- **Mimari etki:** Tarama servisi/env kaldırıldı; senkron doğrulama (D-035).
- **Veri modeli etkisi:** `scan_status`/`scan_attempts` → tek `status` + `rejection_reason`.
- **Güvenlik etkisi:** Yapısal doğrulama AV değildir; kalan risk Orta-Yüksek (TM-16, PB-05).
- **Maliyet etkisi:** 0.
- **Etkilenen dokümanlar:** FILE_STORAGE §6, THREAT_MODEL TM-16, SECURITY §11.
- **Faz:** PHASE 08.

### OD-08 — E-posta entegrasyonu yok
- **Önceki öneri:** OTP için transactional e-posta sağlayıcı (D-030).
- **Nihai karar:** Resend/SMTP/SendGrid, OTP, bilgilendirme e-postası, şifre sıfırlama e-postası yok. Müşteri e-postası zorunlu kayıt alanı olarak kalır. İletişim WhatsApp üzerinden. Better Auth'un zorunlu şeması korunur.
- **Ürün tercihi:** Mevcut WhatsApp düzeni; maliyet.
- **Mimari etki:** `server/email`, e-posta env'leri, şablonlar kaldırıldı.
- **Veri modeli etkisi:** Yok (Better Auth `verifications` korunur).
- **Güvenlik etkisi:** Personel şifre kurtarma yalnızca ADMIN/CLI.
- **Maliyet etkisi:** 0.
- **Etkilenen dokümanlar:** ARCHITECTURE, DEPLOYMENT §3, TECH_STACK §5, SECURITY §2.
- **Faz:** —

### OD-09 — IP ve cihaz verisi saklanmaz
- **Önceki öneri:** HMAC'li IP audit'te; UA saklanmaz (eski OD-09 önerisi).
- **Nihai karar:** Uygulama DB'sinde IP, hash/HMAC IP, UA, tarayıcı/cihaz/OS yok. Rate limiting zorunlu; kısa ömürlü minimum teknik anahtarlar kullanılabilir. Kütüphanelerin otomatik kaydı engellenir.
- **Ürün tercihi:** Veri minimizasyonu.
- **Mimari etki:** Better Auth `disableIpTracking` + session hook + DB CHECK (D-038); giriş sınırlaması uygulama limitleyicisiyle.
- **Veri modeli etkisi:** `audit_logs.ip_hash`, `request_id` kaldırıldı; `sessions` CHECK; `rate_limit_buckets` HMAC'li süreli anahtarlar.
- **Güvenlik etkisi:** Adli inceleme kabiliyeti azalır (TM-25).
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** SECURITY §2, §6, §8; DATABASE_SCHEMA; DATA_PRIVACY §2.
- **Faz:** PHASE 03.

### OD-10 — Bağımsız başvuru veri modeli
- **Önceki öneri:** `customers` tablosu + aday gösterimi, otomatik birleştirme yok (D-009).
- **Nihai karar:** Merkezi müşteri profili, seçme, eşleştirme, mükerrer tespiti, birleştirme, senkronizasyon yok; bilgiler her başvuruda yeniden girilir; telefon/e-posta unique değil; `customers` tablosu kaldırılır.
- **Ürün tercihi:** Basitlik; başvuruların bağımsızlığı.
- **Mimari etki:** `features/customers`, eşleştirme action'ı kaldırıldı.
- **Veri modeli etkisi:** `customers` kaldırıldı; müşteri alanları `applications`'a taşındı (D-033).
- **Güvenlik etkisi:** Yanlış kişiye bağlama riski ortadan kalktı; ilgili kişi taleplerinde çoklu başvuru araması gerekir.
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** BUSINESS_RULES §1, DATABASE_SCHEMA, API_CONTRACTS, DATA_PRIVACY, TESTING_STRATEGY.
- **Faz:** PHASE 02, 06.

### OD-11 — Personel şifreleri tamamen ADMIN tarafından yönetilir
- **Durum güncellemesi (2026-11-24):** **PARTIALLY SUPERSEDED by OD-24** — ADMIN'in uygulama içinde hesap/şifre/aktif-pasif yönetmesi geçersiz. Yeni model: iki sabit hesap yalnızca yerel CLI ile oluşturulur (`pnpm auth:bootstrap`), şifre yalnızca yerel CLI ile sıfırlanır (`pnpm auth:reset-password`); hiçbir hesap uygulama içinde şifre/kullanıcı adı/rol değiştiremez. Self-servis sıfırlama ve zorunlu ilk değişimin olmaması aynen geçerli.
- **Önceki öneri:** ADMIN geçici şifre + ilk girişte zorunlu değişim; kullanıcı kendi şifresini değiştirebilir (D-020).
- **Nihai karar:** ADMIN hesap, kullanıcı adı, şifre, yeni şifre, aktif/pasif yönetir. EMPLOYEE kendi şifresini/kullanıcı adını değiştiremez; sıfırlama talebi/self-servis yok; ilk girişte zorunlu değişim yok; giriş ekranında "Şifremi unuttum/Kayıt ol" yok. Mevcut şifre görüntülenemez. Şifre değişimi ve pasifleştirmede oturumlar iptal. Yetkisiz change/reset uç noktaları engellenir. Bootstrap + recovery korunur.
- **Ürün tercihi:** Merkezi kontrol; e-posta yok.
- **Mimari etki:** `/dashboard/account` ve self-servis action'lar kaldırıldı; Better Auth uç noktaları kapatılır; `admin:recover` script'i.
- **Veri modeli etkisi:** `must_change_password` kaldırıldı.
- **Güvenlik etkisi:** Kapalı uç noktaların doğrulanması gerekli (TM-23, PB-10).
- **Maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** SECURITY §2, AUTHORIZATION_MATRIX §3, API_CONTRACTS §2.4, BUSINESS_RULES §13.
- **Faz:** PHASE 03, 10.

### OD-12 — Altyapı bütçesi: aylık 0
- **Önceki öneri:** Production için Vercel Pro + Neon Launch (~$30/ay) (D-024).
- **Güncelleme (2026-11-27, OD-26):** Backblaze B2 için yıllık ~10 USD bütçe kabul edildi; bu hüküm yalnızca B2 depolama/trafik maliyetleri için güncellendi. Diğer altyapılarda hedef 0 sürer.
- **Nihai karar:** Hedef 0. Dev/demo ücretsiz planlar. Ticari kullanım doğrulanmadan production önerilmez. Alternatif ücretsiz sağlayıcılar PHASE 13 öncesi değerlendirilir. Vercel stack'te kalır. Basit storage sınırı. Onaysız ücretli işlem/kredi kartı/otomatik ücretlendirme/stack değişikliği yok. Uygun ücretsiz altyapı yoksa production blocker.
- **Ürün tercihi:** Maliyet.
- **Mimari etki:** Storage modülü sınırı (D-040); harici servis yok.
- **Veri modeli etkisi:** Yok.
- **Güvenlik etkisi:** Ücretsiz planlarda SLA/yedek/kapasite riskleri (TM-30).
- **Maliyet etkisi:** Dev/demo 0; production blocker PB-01/PB-02.
- **Etkilenen dokümanlar:** DEPLOYMENT, TECH_STACK §4, SECURITY §11, THREAT_MODEL.
- **Faz:** PHASE 13 (değerlendirme), tüm fazlar (maliyet kısıtı).

### OD-13 — Node.js 24 LTS
- **Önceki öneri:** Node 24 (D-003, Proposed).
- **Nihai karar:** Node 24 LTS; 26 kullanılmaz; güncel yamalar; sürüm config'de açık; pnpm/lockfile tekrar üretilebilirliği.
- **Mimari etki:** `engines.node = "24.x"`.
- **Veri modeli / güvenlik / maliyet etkisi:** Yok / güncel yamalar / yok.
- **Etkilenen dokümanlar:** TECH_STACK §1, DEPLOYMENT §4.
- **Faz:** PHASE 01.

### OD-14 — Sabit şirket iletişim bilgileri
- **Önceki öneri:** `system_settings` üzerinden panelden düzenlenebilir iletişim alanı.
- **Nihai karar:** Tüm müşteriler aynı telefon ve WhatsApp bağlantısını görür; merkezi uygulama yapılandırması; panel düzenlemesi/danışman ataması/dinamik tablo yok; değerler sağlanana kadar placeholder/disabled.
- **Mimari etki:** `src/config/company.ts` (D-037).
- **Veri modeli etkisi:** `system_settings` iletişim alanları kaldırıldı.
- **Güvenlik / maliyet etkisi:** Yok.
- **Etkilenen dokümanlar:** BUSINESS_RULES §17, DESIGN_SYSTEM §7, ARCHITECTURE §11.
- **Faz:** PHASE 07.

### OD-15 — Geçici metin logo
- **Önceki öneri:** Geçici metin logo (aynı).
- **Nihai karar:** Metin logo; mavi-beyaz; logo yönetimi/yükleme yok; gerçek logo gibi sunulmaz; tek paylaşılan bileşen.
- **Mimari etki:** `components/shared/logo.tsx`.
- **Etkilenen dokümanlar:** DESIGN_SYSTEM §5.1, BUSINESS_RULES BR-172.
- **Faz:** PHASE 01, 11.

### OD-16 — Sabit PDF limitleri
- **Önceki öneri:** Şablon başına ayarlanabilir boyut (varsayılan 10 MB) ve dosya sayısı (1–10).
- **Nihai karar:** Yalnızca PDF; evrak başına bir aktif PDF; dosya başına 10 MB; panelden değiştirilemez; hizmet/evrak türüne göre fark yok; versiyonlama korunur; merkezi byte sabiti; dinamik şema alanları kaldırılır.
- **Mimari etki:** `MAX_PDF_SIZE_BYTES = 10 485 760` (D-037); tek aktif dosya modeli (D-034).
- **Veri modeli etkisi:** `max_file_size_bytes`, `max_file_count`, `allowed_mime_type` kaldırıldı; tek aktif dosya partial unique index.
- **Güvenlik etkisi:** Basit ve tutarlı limitler.
- **Etkilenen dokümanlar:** BUSINESS_RULES §5, FILE_STORAGE, DATABASE_SCHEMA, API_CONTRACTS §2.3.
- **Faz:** PHASE 05, 08.

### OD-17 — Personel `UNDER_REVIEW` sırasında yükleyebilir
- **Durum güncellemesi (2026-11-24):** OD-24 ile çelişmez; "ADMIN/EMPLOYEE" = iki eşit personel hesabı. Değişiklik yok.
- **Önceki öneri:** Personel de müşteriyle aynı kurala tabi (yükleme yok).
- **Nihai karar:** CUSTOMER `UNDER_REVIEW`'da yükleyemez/değiştiremez/silemez. ADMIN/EMPLOYEE müşteri adına yükleyip değiştirebilir; yeni versiyon doğrulanır, onay aktarılmaz, yeniden incelemeye girer, geçmiş korunur, audit'lenir; eski versiyon onayı yeni dosyayı onaylamaz.
- **Mimari etki:** D9 evrak geçişi; review `fileId` eşleşmesi (BR-57).
- **Veri modeli etkisi:** `document_reviews.file_id`.
- **Güvenlik etkisi:** Race condition'lar kilit + version + `fileId` kontrolüyle kapatılır (TM-21).
- **Etkilenen dokümanlar:** BUSINESS_RULES BR-44/48/57, STATE_TRANSITIONS, FILE_STORAGE §2.1.
- **Faz:** PHASE 08–09.

### OD-18 — Tek aktif bağlantı
- **Önceki öneri:** Tek aktif bağlantı (aynı).
- **Nihai karar:** Yeni bağlantı eskisini ve oturumlarını geçersiz kılar; başvuru/evrak/geçmiş/statü korunur; çoklu cihaz kullanımı serbest; eşzamanlı yenilemede DB constraint + transaction.
- **Veri modeli etkisi:** `UNIQUE (application_id) WHERE revoked_at IS NULL`.
- **Etkilenen dokümanlar:** BUSINESS_RULES BR-100, DATABASE_SCHEMA §4.11.
- **Faz:** PHASE 06.

### OD-19 — Bağlantı yetkileri ADMIN = EMPLOYEE
- **Durum güncellemesi (2026-11-24):** OD-24 ile tutarlı (zaten eşit). Değişiklik yok.
- **Önceki öneri:** EMPLOYEE yalnızca görüntüle/kopyala; yenileme onaya bağlı.
- **Nihai karar:** Her iki rol görüntüler, kopyalar, WhatsApp ile paylaşır, iptal eder, yeniler, yeni oluşturur; onay pencereleri; audit (token'sız); tekrar görüntüleme zorunlu; hash + authenticated encryption; anahtarlar DB dışında sunucuda; iptal/yenileme oturumları anında geçersiz kılar.
- **Mimari etki:** D-011 ürün gereksinimi olarak onaylandı.
- **Etkilenen dokümanlar:** AUTHORIZATION_MATRIX §2.2, SECURITY §3.2.
- **Faz:** PHASE 06.

### OD-20 — Ücretsiz sağlayıcı alt alan adı
- **Önceki öneri:** Şirket alan adı (`panel.<domain>`).
- **Nihai karar:** Sağlayıcının ücretsiz adresi; alan adı/DNS satın alınmaz; `APP_URL` env; ortam başına doğru URL; `Host` header'ından URL üretilmez; alan adı değişikliğinin etkileri dokümante edilir.
- **Mimari etki:** `APP_URL` tek kaynak; `NEXT_PUBLIC_APP_URL` kaldırıldı.
- **Güvenlik etkisi:** Host header injection önlenir (TM-36); alan adı değişikliği riski (TM-37).
- **Etkilenen dokümanlar:** DEPLOYMENT §3, §8; SECURITY §7.
- **Faz:** PHASE 06, 13.

### OD-21 — Kişiselleştirilmiş WhatsApp mesajı
- **Önceki öneri:** Ad içermeyen kısa metin.
- **Nihai karar:** BR-161 sabit şablonu (ad, soyad, hizmet, bağlantı); WhatsApp Business API/otomatik gönderim/şablon yönetimi yok; çalışan manuel gönderir; telefon ve mesaj normalize + URL encode; hedef kişi ve telefon açıkça gösterilir.
- **Mimari etki:** `src/lib/whatsapp.ts`; onay penceresi.
- **Güvenlik/KVKK etkisi:** Ad/hizmet bilgisi Meta üzerinden geçer (DATA_PRIVACY §3); yanlış kişiye gönderim riski (TM-14).
- **Etkilenen dokümanlar:** BUSINESS_RULES §16, API_CONTRACTS §2.1, DESIGN_SYSTEM §5.
- **Faz:** PHASE 06.

### OD-22 — Sabit şifre ve oturum parametreleri
- **Önceki öneri:** Şifre min 12; personel oturumu 12 saat; müşteri oturumu 12 saat / 60 dk boşta; OTP 10 dk / 5 deneme.
- **Nihai karar:** Şifre min 8; personel ve müşteri oturumu maks 7 gün; hareketsizlik zaman aşımı yok; OTP yok; başarısız girişler sınırlanır; sliding session engellenir; güvenli cookie gereksinimleri; şifre değişimi/pasifleştirme ve bağlantı iptali/yenilemesinde oturumlar sonlanır; süre dolunca aynı bağlantıyla yeniden erişim; panelden değiştirilemez.
- **Mimari etki:** `disableSessionRefresh`; portal cookie `exp` sabit (D-032); sabitler (D-037).
- **Güvenlik etkisi:** Zayıf şifre ve uzun oturum riskleri (TM-07, TM-09).
- **Etkilenen dokümanlar:** SECURITY §2–3, BUSINESS_RULES §13, ARCHITECTURE §11.
- **Faz:** PHASE 03, 07.

### OD-23 — Arşivleme yok
- **Durum güncellemesi (2026-11-24):** **PARTIALLY SUPERSEDED by OD-24** — "yalnızca ADMIN manuel silme" geçersiz; her iki hesap manuel siler. Arşiv olmaması aynen geçerli.
- **Önceki öneri:** ADMIN, yalnızca terminal statülerde arşivleme (BR-140 eski).
- **Nihai karar:** Arşiv, arşiv sayfası, geri çıkarma, otomatik arşiv, ayarlar, ARCHIVED statüsü, `archived_*` alanları yok; tek liste + statü filtreleri; yalnızca ADMIN manuel silme.
- **Mimari etki:** Arşiv route/action/filtreleri kaldırıldı.
- **Veri modeli etkisi:** `archived_at`, `archived_by_user_id` ve ilgili CHECK/index kaldırıldı.
- **Etkilenen dokümanlar:** BUSINESS_RULES §14, BR-82, DATABASE_SCHEMA, API_CONTRACTS, DESIGN_SYSTEM §6, TESTING_STRATEGY.
- **Faz:** PHASE 06.

---

### OD-24 — Fixed Two-Account Model & Equal Staff Permissions
- **Status:** **ACCEPTED** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Önceki model:** Sınırsız personel hesabı; ADMIN ve EMPLOYEE arasında RBAC (izin matrisi); ADMIN-only hizmet/şablon, çalışan yönetimi, audit, silme ve T8–T12; uygulama içi hesap yönetimi (oluşturma, şifre atama, pasifleştirme, rol).
- **Nihai karar:** Yalnızca **iki** şirket hesabı: bir ADMIN, bir EMPLOYEE. Ayrı kullanıcı adı, şifre ve oturumlar; bağımsız giriş/çıkış. **Birebir aynı uygulama yetkileri** — uygulamanın tüm işlevleri (dashboard, başvurular, hizmet/şablon, evrak inceleme, statü geçişleri T1–T12, bağlantı yönetimi, iç notlar, işlem geçmişi, audit log, manuel kalıcı silme). Hesap türü yalnızca tanımlama, işlem geçmişinde ayırt etme ve ileride yetki eklenebilmesi içindir. Üçüncü hesap oluşturulamaz.
- **Kapsam dışı:** RBAC, izin bazlı yetkilendirme, izin matrisi, dinamik/kullanıcıya özel yetkiler, rol bazlı menü, ADMIN-only sayfa/API, çalışan atama, personel yönetim modülü, hesap oluşturma/silme/pasifleştirme ekranı, rol/yetki düzenleme ekranı.
- **Korunanlar:** İş kuralları ve statü geçiş matrisi (tam yetki keyfî geçiş değildir); hassas işlemlerin onay, gerekçe, transaction ve audit gereksinimleri; append-only audit (hiçbir hesap değiştiremez); en az yetkili `cs_app_runtime`; müşteri/şirket izolasyonu.
- **Mimari etki:** Tek ortak `requireStaff()` kontrolü; `permissions.ts`/`can()` yok; `/dashboard/employees` ve `features/employees` yok; hesap oluşturma ve şifre sıfırlama yalnızca yerel CLI (`auth:bootstrap`, `auth:reset-password`).
- **Veri modeli etkisi:** `users.role` başına en fazla bir hesap (veritabanı kısıtı → en fazla 2 hesap); admin plugin alanları (`banned`, `ban_reason`, `ban_expires`, `impersonated_by`) gereksiz (D-061).
- **Güvenlik etkisi:** Her iki hesap da kalıcı silme dahil tüm operasyonel yetkilere sahip → tek hesabın ele geçirilmesinin etkisi büyür (THREAT_MODEL TM-44); hesap pasifleştirme yok → olay müdahalesinde şifre sıfırlama (oturumları iptal eder) kullanılır.
- **Superseded:** OD-03, OD-05, OD-06, OD-11, OD-23 (kısmen — her birinin altında not); D-021 (pasifleştirme = `banUser`), D-041'in rol kısmı ("ADMIN" → personel), BR-133/134 eski içerikleri, AUTHORIZATION_MATRIX rol × izin matrisi.
- **Etkilenen dokümanlar:** tümü (PHASE 03 revizyonu — CHANGELOG).
- **Faz:** PHASE 03 ve sonrası.

### OD-25 — Dosya depolama sağlayıcısı: Backblaze B2 (private bucket, EU Central)
- **Status:** **ACCEPTED** · **Approved By:** Product Owner (kullanıcı kararı) · **Approval Date:** 2026-11-25 (PHASE 08 başlangıcı)
- **Önceki öneriler:** Geliştirme/demo için Vercel Blob private store (FILE_STORAGE §1, D-017, D-040); Cloudflare R2 ve yalnızca yerel dosya sistemi alternatifleri değerlendirilmişti.
- **Nihai karar:** PDF dosyalarının ikili içeriği **Backblaze B2 Cloud Storage**'da, kullanıcının kendi oluşturduğu **private** bucket'ta saklanır: bucket `cs-global-documents`, bölge **EU Central** (`eu-central-003`, uç nokta `https://s3.eu-central-003.backblazeb2.com`), varsayılan şifreleme **SSE-B2**, CORS "hiçbir kaynakla paylaşma", lifecycle "tüm versiyonları sakla", **bucket'a kısıtlı Application Key** (Master Application Key kullanılmaz). Kredi kartı/ödeme bilgisi girilmedi; hesap cap'leri kullanıcı tarafından ayarlandı (günlük depolama $0 / 10 GB, indirme $0 / 1 GB, Class B ve C 2 500/gün, kota e-posta bildirimleri). Metadata PostgreSQL'de kalır.
- **Gerekçe (kullanıcı):** kredi kartı gerekmeden kullanım; 10 GB ücretsiz depolama; private bucket; S3 uyumlu API; Avrupa veri bölgesi; depolamada şifreleme; bucket'a kısıtlı anahtar; Next.js + PostgreSQL mimarisiyle uyum; aylık 0 hedefi (OD-12).
- **Kapsam ve sınırlar:** Bu bucket **geliştirme** kapsamındadır; production için ayrı bucket ve bağımsız anahtar gerekir (yapılandırma koruması — D-098). Uygulama kotası 9 GB (uyarı 8 GB — D-101). Hesap ayarları uygulama tarafından değiştirilmez; yeni bucket/hesap/ücretli hizmet oluşturulmaz; ücretsiz limitler yükseltilmez; bucket public yapılmaz; CORS açılmaz; lifecycle ile otomatik silme eklenmez.
- **Doğrulanmamış (PHASE 08 başında):** gerçek API erişimi, anahtar yetkileri, Object Lock ve replikasyon durumu — `pnpm storage:verify` ile canlı doğrulama (PROJECT_STATE).
- **Hukuki not:** EU Central bölgesi tek başına KVKK uyumu sağlamaz (DATA_PRIVACY §12a); gerçek müşteri verisinden önce ticari kullanım koşulları, veri işleme sözleşmesi, yurt dışına aktarım, saklama ve yedekleme değerlendirilmelidir.
- **Güncelleme (2026-11-27, OD-26):** kota hedefi 100 GB / 90 GB; B2 yıllık ~10 USD bütçe. Ödeme yöntemi ve cap değişiklikleri yalnızca kullanıcı tarafından panelde yapılır; hesap hazırlığı doğrulanmadan aktif sınır 9 GB'ta kalabilir.
- **Superseded:** FILE_STORAGE'daki Vercel Blob seçimi; D-017 (doğrudan client upload) → D-100; D-040 (tek dosyalı storage sınırı, adaptör yok) → D-097; TD-11 (Vercel Blob client upload API) geçersiz. OD-12 (aylık 0) aynen geçerlidir.
- **Etkilenen dokümanlar:** FILE_STORAGE, ARCHITECTURE, TECH_STACK, DEPLOYMENT, SECURITY, THREAT_MODEL, DATA_PRIVACY, API_CONTRACTS, DATABASE_SCHEMA, TESTING_STRATEGY, PROJECT_STATE, README, CLAUDE.md.
- **Faz:** PHASE 08 ve sonrası.

---

### OD-26 — Backblaze B2 bütçesi ve depolama kapasitesi (yıllık ~10 USD, 100 GB)
- **Status:** **ACCEPTED** · **Approved By:** Product Owner (kullanıcı kararı; müşteriyle görüşülüp onay alındı) · **Approval Date:** 2026-11-27 (PHASE 11.1)
- **Karar:** Backblaze B2 için yıllık yaklaşık **10 USD** altyapı bütçesi kabul edildi. B2 için önceki mutlak sıfır maliyet zorunluluğu (OD-12'nin B2 kısmı) bu kararla güncellenir. **Yalnızca B2 depolama ve trafik maliyetlerini kapsar**; Neon, hosting ve diğer altyapılarda ücretsiz kullanım hedefi (OD-12) aynen sürer.
- **Hedef yapılandırma:** uygulama depolama sınırı **100 GB** (`STORAGE_MAX_TOTAL_BYTES=100000000000`), uyarı **90 GB** (`STORAGE_WARNING_BYTES=90000000000`), PDF başına **10 MiB** (`MAX_PDF_SIZE_BYTES=10485760`, değişmedi — OD-16). GB ondalık (10⁹), MiB ikili (2²⁰).
- **Maliyet gerçekliği (Backblaze resmî fiyat sayfası, 2026-11-27 doğrulandı):** kullanım bazlı ücretlendirme (sabit 100 GB paketi değildir); ilk 10 GB ücretsiz; sonrası $6,95/TB/ay (≈ $0,00695/GB/ay, bayt-saat bazlı); aylık ortalama depolamanın 3 katına kadar egress ücretsiz, fazlası $0,01/GB; Class A/B/C işlemleri ücretsiz (pay-as-you-go); minimum ücret/süre yok. 100 GB ortalama depolamada tahmini yıllık depolama maliyeti **7,51 USD** (vergiler hariç) ve koşullu ücretsiz aylık egress **300 GB**. Ücretsiz egress gerçek ortalama depolamaya bağlıdır (ör. 10 GB ortalama → ~30 GB/ay). 10 USD hedeftir; sabit fatura veya sağlayıcı garantisi değildir.
- **Hesap durumu:** Mevcut hesap/bucket/bölge/entegrasyon korunur. Hesapta önceden kullanıcı tarafından ayarlanmış cap'ler (günlük depolama $0 / 10 GB, indirme $0 / 1 GB, Class B ve C 2 500/gün) genel fiyatlandırmadan ayrıdır ve 100 GB hedefini **desteklemez**; ödeme yöntemi ekleme, cap ve uyarı güncellemesi yalnızca kullanıcı tarafından panelde yapılır (FILE_STORAGE §7.2). Hesap hazırlığı doğrulanana kadar aktif uygulama sınırı güvenli değerde (9 GB / 8 GB) kalabilir.
- **Değişmeyenler:** tüm güvenlik gereksinimleri, private bucket, BR-47 (tekil başarılı PDF/eski versiyon kalıcı silme yok), otomatik silme yok (OD-06), koşullu teknik onaylar, PB-01…PB-11.
- **Güncellenen önceki hükümler:** OD-12 (B2 istisnası), OD-25 (kota ve "kart bilgisi girilmedi/ücretsiz limitler yükseltilmez" hükmü artık kullanıcı kararıyla yükseltilebilir — işlem kullanıcıda), D-101 (8/9 GB → 90/100 GB hedef; ödeme yöntemi koşulu güncellendi). Teknik uygulama: D-140.
- **Faz:** PHASE 11.1 ve sonrası.

---

### OD-27 — Uygulamaya özel yedekleme/geri yükleme altyapısı kapsam dışı
- **Status:** **ACCEPTED** · **Approved By:** Product Owner (kullanıcı kararı) · **Approval Date:** 2026-11-27 (PHASE 12.1)
- **Karar:** CS Global (iki personelli, küçük ölçekli platform) uygulamaya özel yedekleme, geri yükleme ve felaket kurtarma altyapısı SUNMAZ: özel veritabanı/nesne yedeği, zamanlanmış yedek, ayrı yedek bucket'ı, geri yükleme otomasyonu, geri yükleme sonrası karantina/kilitleme betikleri, bucket'lar arası VersionId eşlemesi, kurtarma manifestleri, yedek saklama otomasyonu, geri yükleme tatbikatı ürün ve kod kapsamından çıkarıldı.
- **Birincil veri kaynakları:** Neon PostgreSQL ve Backblaze B2 olarak kalır. Sağlayıcıların yerleşik geri yükleme/versiyon özellikleri (ör. Neon geri yükleme penceresi) sağlayıcı politikasına tabidir; uygulama bunları yönetmez, panel ayarları değiştirilmez ve bunlar bağımsız/garantili yedek olarak SUNULMAZ.
- **Kalan risk (açıkça kabul edilecek):** veritabanında veya depolamada geri dönüşü olmayan veri kaybında uygulamaya özel kurtarma garantisi yoktur. Olağanüstü sağlayıcı düzeyi geri yükleme gerekirse kullanıcı ve yetkili operatör ayrıca değerlendirir; geri yüklenen ortam doğrudan müşterilere açılmaz; eski token/oturum, silinmiş başvuru ve depolama referansı riskleri değerlendirilmeden ve veri bütünlüğü doğrulanmadan normal erişim başlatılmaz (manuel — OPERATIONS_RUNBOOK §2).
- **Değişmeyenler:** PDF yükleme/değiştirme/versiyon geçmişi, değişmez VersionId, kalıcı başvuru silme, versiyona özgü fiziksel silme, yazım girişimleri, UNKNOWN işleme, mutabakat, `accounting_epoch`, kota, audit değiştirilemezliği, BR-47, OD-06, OD-26 ve tüm güvenlik düzeltmeleri.
- **Güncellenen önceki hükümler:** D-142 SUPERSEDED, D-148 WITHDRAWN; PB-08 ve PB-12 kapsamı "kalan risk / kullanıcı kabulü"ne çevrildi (kapatılmadı).
- **Faz:** PHASE 12.1 ve sonrası.

---

## B. Teknik Kararlar

### D-001 — Modüler monolit, tek Next.js uygulaması
- **Date:** 2026-11-24 · **Status:** Accepted (brief §4, §17)
- **Decision:** Tek repo, tek Next.js App Router uygulaması; feature modülleri. Ayrı backend/mikroservis yok.
- **Consequences:** Müşteri ve personel kodu aynı uygulamada → import sınırları lint ile.

### D-002 — TypeScript 6.0.3 (7.x değil)
- **Date:** 2026-11-24 · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 01 başlangıcı)
- **Context:** `typescript@latest` = 7.0.2; `typescript-eslint@8.74.0` peer `>=4.8.4 <6.1.0`; `eslint-config-next@16.4.6` → `typescript-eslint ^8.56.0` (revizyonda yeniden doğrulandı).
- **Alternatives:** TS 7.0.2 (lint zinciri desteklemiyor); TS 5.9.3 (daha eski).
- **Decision:** `typescript@6.0.3` exact.
- **Rationale:** typescript-eslint peer aralığındaki en güncel kararlı sürüm; Next.js 16 minimumu (5.1) üstünde.
- **Consequences:** TS 7 derleme hızı ertelenir; typescript-eslint TS 7 desteği yayımlandığında yeniden değerlendirilir.

### D-003 — Node.js 24.x LTS
- **Date:** 2026-11-24 · **Status:** Accepted (OD-13) · **Approved By:** Product Owner · PHASE 01 başlangıcında yeniden teyit edildi
- **Decision:** `engines.node = "24.x"`; güncel yama (24.22.3) tercih edilir.

### D-004 — pnpm 10.34.9 (exact)
- **Date:** 2026-11-24 · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 01 başlangıcı)
- **Context:** Yerel 10.28.2; npm `latest` 12.23.0 (engines `node >=18`); `latest-10` = 10.34.9, `latest-11` = 11.29.0. Vercel'in pnpm 12 desteği doğrulanmadı.
- **Alternatives:** pnpm 11.x; pnpm 12.x.
- **Decision:** `"packageManager": "pnpm@10.34.9"` (exact) + Corepack; tek paket yöneticisi pnpm, tek lockfile `pnpm-lock.yaml`.
- **Consequences:** Yerel/CI/hosting aynı pnpm sürümünü kullanır; lockfile formatı sabit. Daha yeni major'a geçiş ayrı karar gerektirir.

### D-005 — Drizzle ORM 0.45.x
- **Status:** Proposed · `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11` (1.0 RC değil).

### D-006 — `drizzle-orm/node-postgres` + `pg` + pooled URL
- **Status:** Proposed · Interactive transaction gerekli; HTTP sürücüsü yetersiz. Migration direct URL ile. Hosting değişirse sürücü uyumu yeniden değerlendirilir.

### D-007 — UUID v4 PK; public referans başvuru numarası
- **Status:** Proposed

### D-008 — Başvuru numarası: yıllık sayaç tablosu
- **Status:** Proposed

### D-009 — Mükerrer müşteri: aday gösterimi + açık seçim
- **Status:** **Superseded** by OD-10 / D-033.

### D-010 — Evrak gereksinimi snapshot'ı
- **Status:** Accepted (brief §9). Revizyon: snapshot alanları başlık, açıklama, talimat, zorunluluk, sıra (dosya limitleri sabit — OD-16).

### D-011 — Bağlantı token'ı: HMAC hash + AES-256-GCM şifreli kopya
- **Status:** Accepted (OD-19 ile ürün gereksinimi olarak onaylandı). Anahtarlar sunucu env'inde, DB dışında.

### D-012 — Müşteri doğrulama: bağlantı + e-posta OTP
- **Status:** **Superseded** by OD-01.

### D-013 — Fragment tabanlı bağlantı
- **Status:** **Superseded** by OD-02 (path tabanlı).

### D-014 — Ayarlanabilir çalışan görünürlük kapsamı
- **Status:** **Superseded** by OD-03.

### D-015 — Server Actions / Route Handlers ayrımı
- **Status:** Proposed · ARCHITECTURE §6.

### D-016 — `cacheComponents` kapalı, hassas veride cache yok
- **Status:** Proposed

### D-017 — Doğrudan client upload (private storage)
- **Status:** **Superseded** by D-100 (2026-11-25, PHASE 08 — OD-25: sunucu üzerinden yükleme; Vercel Blob client upload kullanılmaz). Önceki durum: Proposed.

### D-018 — Katmanlı dosya güvenliği + AV
- **Status:** **Superseded** by OD-07 / D-035.

### D-019 — Rate limiting Postgres'te
- **Status:** Proposed · Revizyon: Better Auth `rateLimit` tablosu kullanılmaz (`disableIpTracking` yerleşik limiter'ı kapatır); tüm limitler `rate_limit_buckets` (HMAC'li, süreli anahtarlar).

### D-020 — Geçici şifre + zorunlu değişim
- **Status:** **Superseded** by OD-11.

### D-021 — Pasifleştirme = Better Auth `banUser`
- **Status:** **Superseded (OD-24)** — hesap pasifleştirme yok; admin plugin kullanılmaz.

### D-022 — Ortam izolasyonu
- **Status:** Proposed · Revizyon: dev/demo ücretsiz planlarda (Neon Free non-prod projesi, ayrı Blob store'lar); production ayrı hesap/proje — sağlayıcı açık.

### D-023 — Bölgeler: Frankfurt (dev/demo)
- **Status:** Proposed · Production bölgesi sağlayıcı seçimine bağlı.

### D-024 — Production için Vercel Pro + Neon ücretli plan
- **Status:** **Superseded** by OD-12.

### D-025 — Audit log append-only (bakım rolü + saklama silmesi)
- **Status:** **Superseded** by D-039.

### D-026 — `system_settings` tipli tek satır
- **Status:** **Superseded** by D-037 (ayar tablosu yok).

### D-027 — Başvuru statü geçişleri manuel
- **Status:** Proposed

### D-028 — Renk paleti erişilebilirlik ayarlamaları
- **Status:** Proposed

### D-029 — Çoklu dosya + inceleme-dosya bağlantı tablosu
- **Status:** **Superseded** by D-034.

### D-030 — E-posta sağlayıcı seçimi
- **Status:** **Superseded** by OD-08.

### D-031 — `.gitignore`'un Node/Next.js uyumlu hale getirilmesi
- **Date:** 2026-11-24 · **Status:** Accepted (Product Owner onayı) · PHASE 01 ilk adımında uygulandı
- **Kapsam:** `node_modules`, `.next`, `.env`, `.env.local`, `.env.*.local` ve diğer gerçek env dosyaları, build çıktıları, `coverage/`, `playwright-report/`, `test-results/`, yerel secret dosyaları; `.env.example` repoda kalır.

### D-032 — Müşteri oturumu: imzalı cookie, oturum tablosu yok
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** OD-01/OD-22: bağlantıyla 7 günlük oturum; iptal/yenileme anında etkili; tek tek oturum iptali gereksinimi yok.
- **Alternatives:** `customer_sessions` tablosu (her istekte satır sorgusu + yazma).
- **Decision:** HMAC imzalı cookie `{tid, aid, iat, exp}`; her istekte token satırı durumu kontrol edilir.
- **Consequences:** Bir tablo daha az; iptal bağlantı seviyesinde anında; tek bir cihazdaki oturumu ayrı iptal etmek mümkün değil (gereksinim değil); secret rotasyonu tüm oturumları kapatır.

### D-033 — Müşteri bilgileri `applications` tablosunda
- **Date:** 2026-11-24 · **Status:** Accepted (OD-10 — Product Owner `customers` tablosunun gerçek zorunluluk yoksa kaldırılmasını istedi; zorunluluk bulunmadı)
- **Decision:** `customer_first_name`, `customer_last_name`, `customer_phone_e164`, `customer_email`, `search_text` kolonları; unique yok.

### D-034 — Tek aktif dosya modeli; inceleme belirli versiyona bağlı
- **Date:** 2026-11-24 · **Status:** Proposed (OD-16, OD-17 uygulaması)
- **Decision:** Dosyada tek `status` ekseni; `UNIQUE (requirement_id) WHERE status='ACTIVE'` ve `… WHERE status IN ('UPLOAD_PENDING','VALIDATING')`; yeni dosya doğrulandığında aktifleşir, eskisi `SUPERSEDED`; `document_reviews.file_id`; `document_review_files` kaldırıldı.
- **Consequences:** Reddedilen yeni dosya eski aktif dosyayı bozmaz; eski versiyona verilen karar `CONFLICT` ile reddedilir.

### D-035 — Senkron yapısal PDF doğrulaması
- **Date:** 2026-11-24 · **Status:** Proposed (OD-07 uygulaması) · **Partially Superseded** by D-099/D-103 (2026-11-25): doğrulama storage'a yazmadan ÖNCE, istek içinde, izole worker'da yapılır; `VALIDATING` statüsü ve "10 dk takılı doğrulama" kuralı sunucu üzerinden yükleme akışında kullanılmaz. Senkron, kuyruksuz, transaction dışı ve `ACTIVE` ≠ "virüssüz" ilkeleri geçerlidir.
- **Decision:** Doğrulama upload tamamlama isteğinde, transaction dışında, süre/bellek sınırlı; kuyruk/arka plan servisi yok; takılı doğrulamalar 10 dk sonra reddedilir. Statü adı `ACTIVE` ("virüssüz" anlamı yok). Parser seçimi TD-06.

### D-036 — İki aşamalı manuel başvuru silme
- **Date:** 2026-11-24 · **Status:** Proposed (OD-06 uygulaması)
- **Decision:** Aşama 1: `deletion_requested_at` + token iptali (anında erişilemez). Aşama 2: storage nesneleri silinip boşluk doğrulanır → DB satırı CASCADE ile silinir. Kısmi hata: idempotent yeniden deneme (ADMIN veya günlük temizlik).
- **Consequences:** Storage'da sahipsiz kişisel veri kalmaz; silme sürecindeki başvuru listede "silme tamamlanamadı" olarak yalnızca ADMIN'e görünür.

### D-037 — Sabit yapılandırma dosyaları
- **Date:** 2026-11-24 · **Status:** Proposed (OD-14, OD-16, OD-22 uygulaması)
- **Decision:** `src/config/constants.ts` (limitler, oturum/şifre, rate limitler), `src/config/company.ts` (iletişim). Ayarlar tablosu/sayfası yok.

### D-038 — Better Auth'ta IP/UA saklamama
- **Date:** 2026-11-24 · **Status:** Proposed (OD-09 uygulaması)
- **Decision:** `advanced.ipAddress.disableIpTracking: true`; `databaseHooks.session.create.before` → `userAgent: null`; `sessions` CHECK (IP/UA NULL); giriş sınırlaması `hooks.before` + `rate_limit_buckets`.
- **Consequences:** Yerleşik limiter kapanır (bilinçli); hook davranışı PHASE 03'te doğrulanmalı (TD-04); başarısız olursa CHECK nedeniyle girişler hata verir (sessiz ihlal yerine görünür hata).

### D-039 — Audit log append-only, otomatik saklama yok
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** Runtime rolü `INSERT, SELECT`; UPDATE/DELETE trigger ile engellenir; IP/UA yok; FK yok (başvuru silinse de minimum kayıt kalır); otomatik silme işi yok.

### D-040 — Basit storage servis sınırı
- **Date:** 2026-11-24 · **Status:** **Superseded** by D-097 (2026-11-25, PHASE 08): sunucu tarafı `src/server/storage/*` arayüzü + B2 ve yerel private adapter; istemci tarafında storage modülü yoktur (yükleme uygulama route'una yapılır). Önceki durum: Proposed (OD-12 uygulaması).
- **Decision:** Sunucuda `src/server/storage/storage.ts`, client'ta `src/lib/upload-client.ts`; tüm storage çağrıları yalnızca bu iki dosyadan. Çoklu sağlayıcı arayüzü/adaptör katmanı yok.

### D-041 — ADMIN yeniden açma/geri alma geçiş seti
- **Date:** 2026-11-24 · **Status:** Proposed (OD-05 uygulaması) — **rol kısmı Superseded (OD-24)**: geçiş seti aynen geçerli, "ADMIN" yerine iki eşit personel hesabı.
- **Decision:** T8 `CANCELLED → iptal öncesi statü` (hedefi sunucu belirler), T9 `COMPLETED → IN_PROCESS`, T10 `IN_PROCESS → DOCUMENTS_APPROVED`, T11 `DOCUMENTS_APPROVED → UNDER_REVIEW`, T12 `{DOCUMENTS_APPROVED, IN_PROCESS} → REVISION_REQUIRED` (seçilen evrakların onayı geçersiz). Tümü gerekçeli.
- **Alternatives:** ADMIN'in serbest hedef statü seçmesi (keyfî değişikliğe açık — reddedildi); daha az geçiş (operasyonel ihtiyaçları karşılamayabilir).
- **Consequences:** Evrak statüleriyle tutarlılık korunur; yeni geçiş ihtiyacı ayrı karar gerektirir.

### D-042 — ESLint 10.15.0 (ESLint 9 değil)
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Context:** `eslint-config-next@16.4.6` içindeki `eslint-plugin-react@7.37.5`, `eslint-plugin-import@2.32.0`, `eslint-plugin-jsx-a11y@6.10.2` peer aralığı ESLint ^9'da bitiyor. `eslint@9.39.5` npm'de **deprecated** ("This version is no longer supported") ve ESLint destek politikasına göre 2026-08-06'dan beri **EOL**. create-next-app@16.4.6 hâlâ `eslint: ^9` öneriyor. Next.js ESLint dokümanı (son güncelleme 2026-11-18): "eslint-config-next supports ESLint 9 and ESLint 10 … Starting with eslint-config-next@16.4.0 … works with ESLint 10. Some of the plugins … don't list ESLint 10 in their peer dependencies yet, so your package manager may show peer dependency warnings."
- **Alternatives:** ESLint 9.39.5 (deprecated/EOL — CLAUDE.md deprecated paket yasağı); `eslint-config-next`'i bırakıp eklentileri tek tek kurmak (jsx-a11y/react kuralları kaybolur, temel stack'ten sapma).
- **Decision:** `eslint@10.15.0` + `eslint-config-next@16.4.6`. Bilinen 3 peer uyarısı **bastırılmaz** (`--force`, `--legacy-peer-deps`, override, `peerDependencyRules` yok) ve raporlanır. `strictPeerDependencies` açılmaz (Next.js dokümanına göre kurulum başarısız olur).
- **Doğrulama:** Proje kuralları ESLint 10 altında çalıştırıldı; `react/no-danger` dahil 10 kural ihlal dosyasında tetiklendi.
- **Consequences:** Eklentiler ESLint 10'u peer olarak listeleyince uyarılar kendiliğinden kalkar; her faz sonunda yeniden kontrol edilir.

### D-043 — shadcn/ui: Radix tabanı, minimum bağımlılık
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Context:** `shadcn@4.23.0 init -b radix -p nova` → `components.json` (`style: radix-nova`). CLI ayrıca `cn@0.5.2` (shadcn'in yeni, 0.x sınıf birleştirme paketi; CLI `bin`'i içerir), `shadcn` CLI paketini **runtime** bağımlılığı olarak (32 bağımlılık; yalnızca `shadcn/tailwind.css` için) ve `tw-animate-css` ekledi.
- **Decision:** `cn` yerine olgun **clsx 2.1.1 + tailwind-merge 3.7.1** (`src/lib/utils.ts`); `shadcn` runtime bağımlılığı kaldırıldı, kullanılan 3 özel variant (`data-disabled`, `data-horizontal`, `data-vertical`) MIT lisanslı kaynaktan `globals.css`'e alındı; `tw-animate-css` kaldırıldı (animasyonlu bileşen yok — Dialog/Sheet eklenecek fazda yeniden değerlendirilir). Bileşenler: Button, Card, Badge, Alert, Separator, Input, Label; tasarım token'larına ve erişilebilirlik kurallarına uyarlandı. CLI `pnpm dlx shadcn@4.23.0` ile çalıştırılır, bağımlılık değildir.
- **Consequences:** Sonraki `shadcn add` çalıştırmaları `cn`/`shadcn`/`tw-animate-css` ekleyebilir; her eklemede `package.json` farkı incelenir.

### D-044 — Tailwind entegrasyonu `@tailwindcss/postcss`; şablon varsayılanlarının ayıklanması
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Context:** create-next-app@16.4.6 şablonu `@tailwindcss/turbopack` loader'ı, **`cacheComponents: true`**, `partialPrefetching: true`, dark mode bloğu ve `next/font/google` ile geliyor.
- **Decision:** Tailwind resmî Next.js rehberi ve TECH_STACK'teki `@tailwindcss/postcss` kullanıldı. `cacheComponents` ve `partialPrefetching` eklenmedi (D-016). Next/Vercel görselleri ve favicon kopyalanmadı (logo tasarlanmaz — OD-15).
- **Consequences:** Turbopack ve webpack ile aynı yapılandırma çalışır.

### D-045 — Font: yerel `geist` paketi
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** `geist@1.9.2` (`next/font/local`, değişken Geist Sans). Çalışma zamanında harici font isteği yok (E2E ile doğrulandı). Türkçe glifler (ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü â î û) fontun `cmap` tablosunda doğrulandı. Geist Mono kullanılmadığı için yüklenmez.

### D-046 — pnpm kurulum güvenliği
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** `pnpm-workspace.yaml`: kurulum script'leri pnpm 10 varsayılanıyla engelli; `sharp` ve `unrs-resolver` script'leri bilinçli olarak yok sayılır (önceden derlenmiş paketleri var). `minimumReleaseAge: 1440` — 24 saatten yeni yayımlanmış sürümler kurulmaz (tedarik zinciri saldırılarına karşı). pnpm sürümü `packageManager` ile proje düzeyinde sabit (global kurulum değiştirilmedi; pnpm kendi sürüm yönetimiyle 10.34.9'u kullanır). Tek lockfile `pnpm-lock.yaml`.
- **Consequences:** Acil güvenlik yaması 24 saatten yeniyse `minimumReleaseAgeExclude` ile bilinçli istisna gerekir.

### D-047 — Ortam değişkeni doğrulaması: lazy, fail-closed
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** `src/server/env.ts` (`server-only`, Zod): ilk kullanımda doğrulama; PHASE 01'de yalnızca `APP_ENV`, `APP_URL`. `NODE_ENV=production` iken `APP_ENV` zorunlu; development dışında `APP_URL` zorunlu ve `https` origin olmalı; development'ta varsayılan `http://localhost:3000`. Hata mesajları yalnızca değişken adı içerir. Sonraki fazların secret'ları, onları kullanan kodla birlikte şemaya eklenir ve production'da zorunlu olur. Zod `.strict()` env nesnesine uygulanmaz (`process.env` sistem değişkenleri içerir).

### D-048 — Temel güvenlik header'ları; nonce'lu CSP sonraki fazda
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** `next.config.ts` `headers()`: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Robots-Tag`, `poweredByHeader: false` ve script çalıştırmayı etkilemeyen temel CSP (`base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`). Nonce'lu `script-src`/`style-src` CSP'si `src/proxy.ts` ile PHASE 03'te (dinamik render gerektirir), rota bazlı `no-referrer` ve `no-store` ilgili rotalarla (PHASE 03/07/08) eklenir.

### D-049 — Tasarım token'ları (D-028 uygulaması)
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** CSS değişkeni + Tailwind 4 `@theme inline` ile semantik token'lar (`src/app/globals.css`). `--muted-foreground` = `#475569` (palet `#64748B` `#EFF6FF`/`#F1F5F9` zeminlerde AA altında kaldığı için; `#64748B` input kenarlığı `--input` olarak kullanılır). Metin tonları `*-strong`, zeminler `*-soft` (success/warning/destructive). Birincil hover `#1D4ED8` (beyaz metinle 6.70). Yalnızca açık tema: `dark:` variant'ı hiç kullanılmayan `.dark` sınıfına bağlı; `color-scheme: light`. Tüm kombinasyonların kontrastı hesaplandı (DESIGN_SYSTEM §1.3).

### D-050 — Test ve CI düzeni
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Decision:** `pnpm test` = Vitest unit (`vitest run`, watch yok); `test:unit` adı kullanılmaz (dokümanlar güncellendi), `test:integration` PHASE 02'de eklenir. Playwright production build üzerinde (`next build` + `next start`, port 3100); projeler Desktop Chrome, Mobile Chrome (Pixel 7), Mobile Safari (iPhone 15), Desktop WebKit. CI: GitHub Actions (repo herkese açık → standart runner'lar ücretsiz), yalnızca resmî action'lar commit SHA'sıyla sabit, pnpm Corepack ile `packageManager`'dan. Husky/lint-staged yok.

### D-051 — Next.js `agentRules` kapalı
- **Date:** 2026-11-24 (PHASE 01) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 02 başlangıcı)
- **Context:** Next.js 16.4 `next dev` çalıştığında kök dizine `AGENTS.md` yazar.
- **Decision:** `agentRules: false`; ajan talimatlarının tek kaynağı `CLAUDE.md`. Faydalı ipucu (sürüme uygun dokümanlar `node_modules/next/dist/docs/`) CLAUDE.md'ye eklendi.

### D-052 — Veritabanı düzeyinde ilişki bütünlüğü: bileşik FK'lar ve NULL-güvenli CHECK'ler
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Context:** Şemadaki tek kolonlu FK'lar (`document_reviews.file_id` vb.) bir incelemenin başka evrağın/başvurunun dosyasına bağlanmasını engellemiyordu (INV-09/INV-10). Ayrıca `reason`/`customer_message` CHECK'leri NULL değerde "geçti" sayılıyordu (PostgreSQL CHECK'te NULL = geçer).
- **Decision:** `application_document_requirements (id, application_id)`, `application_document_files (id, requirement_id, application_id)`, `application_access_tokens (id, application_id)` üzerinde UNIQUE hedefler; dosya → evrak, inceleme → dosya/evrak, yorum/iç not → evrak, dosya/statü geçmişi → token ilişkileri **bileşik FK** (aynı başvuru zorunlu). Token referansları (`uploaded_by_access_token_id`, `actor_access_token_id`) doküman taslağındaki `SET NULL` yerine bileşik FK + `NO ACTION` (token'lar yalnızca başvuru silinince CASCADE ile silinir; bileşik FK'da `SET NULL` NOT NULL `application_id`'yi de boşaltırdı). CHECK'ler NULL durumunu açıkça ele alır. Ek kısıtlar: storage yolu kimliklerden türetilmiş `.pdf` yolu olmak zorunda (kişisel veri giremez), doğrulanmış dosyada boyut/sha256/aktivasyon zamanı zorunlu, token hash 64 hex, ciphertext `v1:<keyId>:` önekli, kullanıcı adı `^[a-z0-9_.]{3,30}$`, `sessions.impersonated_by` NULL (impersonation kullanılmaz), audit metadata yalnızca izinli üst düzey anahtarlar.
- **Migration etkisi:** Yalnızca ilk migration (henüz hiçbir ortamda veri yok). İş kurallarını değiştirmez; yanlış uygulama kodunu DB'de durdurur.

### D-053 — Hizmet/şablon `created_by_user_id` NULL olabilir (sistem/seed kaydı)
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Context:** Development seed hizmet ve evrak şablonu oluşturmalı, ancak bu fazda personel hesabı oluşturulmaz (PHASE 03) ve sahte şifre hash'li kullanıcı yazılmaz.
- **Alternatives:** Giriş yapamayan "sistem" kullanıcısı (personel listelerini kirletir, Better Auth tablosuna yapay kayıt); seed'i PHASE 03'e ertelemek (bu fazın seed gereksinimini karşılamaz).
- **Decision:** `services.created_by_user_id` ve `service_document_requirements.created_by_user_id` NULL olabilir; NULL = sistem/seed kaydı. Personelin oluşturduğu kayıtlarda değer PHASE 05'te uygulama katmanında zorunludur (test edilecek). Başvuru, token, inceleme vb. tablolarda aktör kolonları NOT NULL kalır.

### D-054 — En az yetkili runtime rolü ve veritabanı güvenlik kontrolleri
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Context:** Neon'da Console/API ile oluşturulan roller `neon_superuser` üyesidir (CREATEDB, CREATEROLE, BYPASSRLS, REPLICATION); SQL ile oluşturulan roller yalnızca temel `public` yetkileri alır (neon.com/docs/manage/roles, 2026-11-24).
- **Decision:** Migration/yönetim: projenin sahip rolü (tabloların sahibi). Runtime: SQL ile oluşturulan `cs_app_runtime` (`pnpm db:init`): LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT; hiçbir role üye değil, hiçbir nesnenin sahibi değil. Tablo bazında yalnızca gereken GRANT'lar (migration 0002): değiştirilemez kayıtlar (inceleme, yorum, iç not, statü geçmişi, audit) yalnızca SELECT+INSERT; hizmet/kullanıcı DELETE yok; TRUNCATE/REFERENCES/TRIGGER hiçbir tabloda yok; `drizzle` şemasına erişim yok; `public`'te CREATE ve veritabanında TEMP PUBLIC'ten geri alındı. Başvuru alt kayıtları CASCADE ile silinir (referans eylemleri tablo sahibinin yetkisiyle çalışır). Rol düzeyinde `statement_timeout=15s`, `lock_timeout=5s`, `idle_in_transaction_session_timeout=15s` (pooler oturum SET'ini korumadığı için rol düzeyinde). Audit: runtime'a UPDATE/DELETE/TRUNCATE yok + sahip dahil herkes için engelleyen trigger. RLS kullanılmaz (yetkilendirme uygulama katmanında — ARCHITECTURE).
- **Sınır:** Tablo sahibi rol trigger'ı kapatabilir/tabloyu değiştirebilir; audit koruması bu role karşı mutlak değildir (THREAT_MODEL TM-41).

### D-055 — Bağlantı yapılandırması ve hedef doğrulama
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı) — **kısmen Superseded (D-059)**: ayrı test veritabanı ve veritabanı ortam işareti kaldırıldı
- **Decision:** `DATABASE_URL` = runtime (Neon pooled uç nokta, `cs_app_runtime`); `DATABASE_URL_UNPOOLED` = migration/yönetim (pooler olmayan uç nokta, sahip rol). Uzak bağlantıda `sslmode=verify-full` zorunlu (Neon önerisi); runtime adresinde rol adı `cs_app_runtime` olmak zorunda; production'da yerel adres reddedilir. Doğrulama lazy (`getDatabaseEnv()` → `getDb()`), hata mesajında adres parçası yok. Ayrı `DATABASE_URL_TEST` yok: integration testleri aynı sunucudaki `cs_global_test` veritabanını kullanır (adres türetilir). Her veritabanı `COMMENT ON DATABASE … IS 'cs.environment=<ortam>'` ile işaretlenir (ilk tasarım `ALTER DATABASE … SET cs.environment` idi; PostgreSQL 15+'ta özel ayarı veritabanı düzeyinde yazmak süper kullanıcı istediği için Neon'da reddedildi — 42501); migrate/seed/studio/test yazmadan önce bu işareti doğrular (APP_ENV'e tek başına güvenilmez). Pool: süreç başına tek Pool (`max 5`, `idleTimeoutMillis 10s`, `connectionTimeoutMillis 10s`), dev hot reload'da `globalThis` ile yeniden kullanım. Sürücü: `pg` + `drizzle-orm/node-postgres` (interaktif transaction ve `FOR UPDATE` gerektiği için HTTP sürücüsü kullanılmaz — D-006).

### D-056 — Migration akışı
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Decision:** `drizzle-kit generate` (şemadan SQL) + elle yazılan SQL migration'ları (`--custom`: extension, trigger, GRANT). Sıra: `0000_extensions` (pg_trgm) → `0001_initial_schema` → `0002_security_and_privileges`. Uygulama `pnpm db:migrate` (drizzle-orm migrator, tek transaction, `drizzle.__drizzle_migrations`) ile; hedef işareti doğrulanmadan çalışmaz. `drizzle-kit push` kullanılmaz; uygulanmış migration dosyası değiştirilmez, düzeltme yeni migration ile yapılır; `db:reset`/`db:drop` komutu yoktur. Migration'lar gerçek veritabanından önce PGlite (PostgreSQL WASM, yalnızca scratch dizininde) üzerinde ön kontrol edildi. Production hedefi PHASE 13'te eklenir.

### D-057 — Veritabanı CLI'ı Node 24 ile doğrudan; `tsx` yok
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Decision:** `scripts/db/*.ts` Node 24.22'nin yerleşik TypeScript tip ayıklamasıyla çalışır (uyarısız doğrulandı); ek script runner kurulmaz. Script'ler `.ts` uzantılı göreli import kullanır (`allowImportingTsExtensions`, `noEmit` ile). `.env.local` Node'un `process.loadEnvFile` ile okunur (mevcut değişkenler ezilmez). Paylaşılan saf modül `src/server/db/settings.ts` `server-only` içermez (CLI'da çalışabilmesi için); Drizzle şema dosyaları da aynı nedenle `server-only` içermez — bunlar secret içermez ve client'tan import ESLint sınırıyla engellidir. `getDb()` içeren `client.ts` `server-only`'dir.

### D-058 — Şema kolon adlandırması ve `updated_at`
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 başlangıcı)
- **Decision:** Kolon adları şemada açıkça snake_case yazılır (Drizzle `casing` seçeneğine bağlı kalınmaz); TS alan adları camelCase. Better Auth tablolarında TS alan adları Better Auth 1.7.27'nin alan adlarıyla birebir aynıdır (adapter `schema[model][field]` ile arar — kaynak koddan doğrulandı). `updated_at` veritabanı trigger'ıyla güncellenir (uygulama kodu unutsa da tutarlı). Statü değerleri `text` + CHECK; değer listeleri tek kaynak `src/config/statuses.ts`'ten üretilir.

### D-059 — Tek veritabanı; ortam ayrımı yok (Product Owner kararı)
- **Date:** 2026-11-24 (PHASE 02) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24
- **Context:** D-055 ayrı `cs_global_dev` ve `cs_global_test` veritabanları ile veritabanı düzeyinde ortam işareti (`cs.environment`) öngörüyordu. Product Owner açıkça tek veritabanı istedi: "diğer tüm veritabanlarını da sil, tek veritabanı ile ilerleyeceğiz, ortamsal fark olmayacak".
- **Decision:** Uygulama, migration, seed ve integration testleri Neon projesindeki **tek veritabanını** (`neondb`) kullanır. Ayrı development/test veritabanı, `--target` seçeneği ve veritabanı ortam işareti yoktur. Bu oturumda oluşturulan `cs_global_dev` ve `cs_global_test` silindi (yalnızca şema ve test fixture'ı içeriyordu); Neon'un sistem veritabanı `postgres` korunur. Korunan güvenlik kontrolleri: en az yetkili runtime rolü, `sslmode=verify-full`, `db:init`'in bu projeye ait olmayan tablo varsa durması, testlerin yalnızca kendi sentetik kayıtlarını silmesi, seed'in mevcut kayıtlara dokunmaması.
- **Riskler (kabul edildi, production öncesi yeniden değerlendirilmeli — PB-06):** (1) Veritabanında gerçek müşteri verisi olduğunda `pnpm test:integration` sentetik kayıtları aynı veritabanına yazar; testlerin audit kayıtları silinemez ve kalır. (2) `pnpm db:seed` demo hizmetleri gerçek kataloğun yanına ekler. (3) Hatalı bir test temizliği gerçek veriyi etkileyebilir (temizlik yalnızca test kimlikleriyle sınırlıdır). (4) CLAUDE.md'deki "gerçek müşteri verisi dev/test/demo'da kullanılmaz" kuralı, ortamlar tek veritabanında birleştiği için ancak gerçek veri girmeden önce ayrı production veritabanına geçilerek korunabilir.
- **Consequences:** PB-06 (production ortam izolasyonu) açık kalır; gerçek müşteri verisi girmeden önce ayrı production veritabanı veya bu kararın yazılı risk kabulü gerekir.

### D-060 — Better Auth: HTTP route'u yok, yalnızca sunucu tarafı `auth.api`
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Context:** Önceki plan `/api/auth/[...all]` route'u + `disabledPaths`/`hooks.before` ile kapalı uç noktalar (TD-03: `auth.api` etkileşimi doğrulanmamıştı).
- **Decision:** Better Auth HTTP route'u **bağlanmaz**. Giriş/çıkış Next.js Server Action'larında `auth.api.signInUsername`/`signOut` (`nextCookies` cookie'yi yazar); oturum `auth.api.getSession`. Yalnızca `username` plugin; admin plugin yok. `emailAndPassword.enabled: false`, `disableSignUp: true`; `databaseHooks.user/account.create.before → false` (Better Auth üzerinden hesap oluşturma imkânsız). Yerleşik rate limiter ve telemetri kapalı.
- **Rationale:** Kullanılmayan uç noktaları tek tek kapatmak yerine hiç açmamak (TD-03 çözüldü). CSRF koruması Server Action origin kontrolünden gelir.
- **Consequences:** İstemci tarafı Better Auth SDK'sı kullanılmaz. Gelecekte HTTP uç noktası gerekirse yeni karar.

### D-061 — İki hesap modelinin veritabanı karşılığı
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Decision:** Migration 0003: `users_one_account_per_role` (UNIQUE `role`) + mevcut `role IN ('admin','employee')` → en fazla iki hesap; `role` varsayılansız; `username` NOT NULL; `email = id || '@staff.invalid'` CHECK (kişisel veri olmayan, değişmez iç kimlik — TD-05 çözüldü); admin plugin kolonları (`users.banned`, `ban_reason`, `ban_expires`, `sessions.impersonated_by`) ve ilgili CHECK kaldırıldı (veri yoktu). Rol/izin tablosu yok.
- **Alternatives:** Uygulama kodunda sayım kontrolü (yarışa açık); trigger ile sayım (gereksiz karmaşıklık).

### D-062 — Hesap oluşturma ve şifre sıfırlama yalnızca yerel CLI
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Decision:** `pnpm auth:bootstrap` (eksik hesapları tek transaction'da oluşturur; mevcutların üzerine yazmaz; ikisi de varsa hiçbir şey yapmaz) ve `pnpm auth:reset-password` (seçilen hesabın şifresini sıfırlar, yalnızca onun oturumlarını siler). Yalnızca etkileşimli TTY; şifreler gizli (raw mode) ve iki kez; argüman/env/pipe ile şifre alınmaz. Better Auth `hashPassword` (scrypt) ve `generateId` kullanılır. En az yetkili `cs_app_runtime` rolüyle çalışır. Audit: `USER_CREATED`, `USER_PASSWORD_SET`, `USER_SESSIONS_REVOKED`. İki hesabın kullanıcı adı ve şifresi farklı olmak zorunda.
- **Sınır:** Komut, `.env.local`'a ve veritabanına erişimi olan güvenilir işletmeciye dayanır.

### D-063 — Giriş rate limiting
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Partially Superseded** (genel limit kısmı → D-068) · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Decision:** Postgres `rate_limit_buckets` atomik sabit pencere sayaçları: kullanıcı adı (HMAC'li anahtar) 10 deneme/15 dk + genel 100 deneme/15 dk. Deneme sayılır (şifre kontrolünden önce) → eşzamanlı denemelerle aşılamaz; başarılı giriş kullanıcı adı sayacını sıfırlar; kalıcı kilit yok; hata → giriş reddi (fail-closed); süresi dolmuş anahtarlar her denemede en fazla 100 adet temizlenir. IP bazlı limit, güvenilir istemci IP header'ı hosting'de doğrulanana kadar uygulanmaz (TD-04).
- **Risk:** Genel limit, saldırgan tarafından iki hesabın girişini 15 dk engellemek için kullanılabilir (kabul — geçici).
- **Superseded kısmı (2026-11-24, PHASE 04 onayı):** "genel 100 deneme/15 dk" (`login:global`) ve buna bağlı risk notu **D-068** ile geçersizdir. Kullanıcı adı başına limit, atomik sayaç, fail-closed ve TD-04 notu aynen geçerlidir.

### D-064 — Nonce'lu CSP ve dinamik render
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Decision:** `src/proxy.ts` her istekte 16 baytlık nonce ve CSP üretir (Next.js 16 CSP rehberi); `'unsafe-inline'` yok, `'unsafe-eval'` yalnızca development; `upgrade-insecure-requests` yalnızca https APP_URL. Root layout `connection()` ile tüm sayfaları dinamik render eder. `next.config.ts`'teki temel CSP kaldırıldı (diğer header'lar orada). Proxy kimlik doğrulama yapmaz.

### D-065 — Tek veritabanında iki hesap sınırıyla test stratejisi
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Partially Superseded** (gerçek hesaplar varken atlama kısmı → D-067) · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Context:** D-059 (tek veritabanı) + OD-24 (en fazla iki hesap): testler gerçek hesaplarla çakışabilir.
- **Decision:** Hesap gerektiren integration/E2E testleri yalnızca veritabanında **hiç hesap yokken**, `test-` önekli geçici hesaplarla (rastgele şifre) çalışır ve sonunda bunları siler; gerçek hesaplar varsa bu testler gerekçesiyle **atlanır** (NOT VERIFIED). Gerçek hesaplar test amacıyla oluşturulmaz, silinmez, şifreleri değiştirilmez, kullanıcı tablosunda güncellenmez. Diğer testler FK hedefi olarak mevcut hesabı salt okunur kullanır. Global teardown yarıda kalmış `test-` kayıtlarını temizler. Testlerin audit kayıtları (sentetik kimlikli) değiştirilemez olduğu için kalır.
- **Consequences:** Gerçek hesaplar oluşturulduktan sonra giriş/oturum testleri yerelde atlanır; sonraki fazlarda kimliği doğrulanmış E2E için yeni yaklaşım gerekir (PROJECT_STATE Known Issues).
- **Onay koşulları (Product Owner, 2026-11-24):** Bu yaklaşım **geçicidir**; hesap testlerinin bootstrap sonrasında sürekli atlanması kalıcı test stratejisi olarak kabul edilmez. PHASE 04 kapsamında, gerçek hesapları riske atmayan, authentication bypass veya test amaçlı public endpoint oluşturmayan, güvenli ve tekrar çalıştırılabilir bir integration/E2E test stratejisi geliştirilmelidir (PHASE 04 açık teknik konu P4-01).
- **Superseded kısmı (2026-11-24, PHASE 04 onayı):** "gerçek hesaplar varsa hesap testleri atlanır" kısmı **D-067** ile geçersizdir. Hesap yokken geçici `test-` hesaplarıyla tam yaşam döngüsü testi, gerçek hesaplara dokunmama ve teardown kuralları aynen geçerlidir.

### D-066 — Kimlik doğrulama ortam değişkenleri
- **Date:** 2026-11-24 (PHASE 03) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 03 sonu)
- **Decision:** `BETTER_AUTH_SECRET` ve `RATE_LIMIT_KEY_SECRET` (≥32 karakter, birbirinden farklı) — `getAuthEnv()` lazy, fail-closed, hata mesajı değer içermez. Better Auth base URL ve güvenilen origin `APP_URL`'dir; ayrı `BETTER_AUTH_URL` kullanılmaz (tek kaynak — OD-20). Secure cookie, APP_URL https iken. Owner veritabanı bağlantısı web uygulamasında kullanılmaz.

### D-067 — Kimliği doğrulanmış testler: tek veritabanı + kısa ömürlü test oturumları (P4-01)
- **Date:** 2026-11-24 (PHASE 04) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 04 sonu)
- **Onay koşulları (Product Owner, 2026-11-24):** (1) Geçici test oturumları yalnızca development ortamında kullanılabilir. (2) Gerçek kullanıcı adı ve şifre ile giriş, bootstrap ve password recovery testlerinin yerini tutmaz. (3) Test işlemlerinin gerçek personel adına yanıltıcı audit kayıtları oluşturması kalıcı çözüm olarak kabul edilmez. (4) Gerçek müşteri verileri sisteme alınmadan önce güvenli test izolasyonu sağlanmalıdır. P4-01 tam kimlik doğrulama test kapsamı açısından **PARTIAL**'dır.
- **PHASE 05 onayı notu (2026-11-24):** P4-01 **yerel otomatik test izolasyonu açısından RESOLVED** (D-077 izole ortamında şifreyle giriş, bootstrap ve şifre sıfırlama dahil). Geçici test oturumu yaklaşımı yalnızca güvenli development (salt okunur) kontrolleriyle sınırlıdır; gerçek hesaplar adına kalıcı test mutasyonu yapılmaz. Neon'a özgü test kapsamı, GitHub CI entegrasyonu ve production veri izolasyonu ayrı açık gereksinimlerdir.
- **Context:** D-065 koşullu onayı; D-059 tek veritabanı; Product Owner'ın PHASE 04 yanıtı: "herhangi bir farklı veritabanına gerek yok direk prod veritabanını kullanabiliriz henüz önemli bilgi paylaşmıyoruz". Gerçek hesapların şifreleri bilinmez ve istenmez.
- **Decision:**
  1. Tüm integration/E2E testleri tek veritabanında (`neondb`) çalışır; ayrı/izole veritabanı yoktur.
  2. **Hesap yokken:** `test-` önekli geçici hesaplarla tam yaşam döngüsü (bootstrap, şifreyle giriş, şifre sıfırlama) — PHASE 03'teki gibi; sonunda silinir.
  3. **Gerçek hesaplar varken:** gerçek hesaplara yalnızca okuma ve **etkisiz** işlemler (no-op bootstrap — eşzamanlı dahil, rollback içinde üçüncü hesap denemesi, politikaya aykırı şifre sıfırlamanın yazmadan reddi, yanlış şifre/var olmayan kullanıcı için aynı 401). Oturum davranışı testin kendi oluşturduğu **kısa ömürlü (30 dk)** oturum satırıyla doğrulanır: runtime rolüyle `sessions`'a `test-session-<rastgele>` kimlikli satır eklenir, Better Auth'un doğruladığı imzalı cookie (`token.HMAC-SHA256(BETTER_AUTH_SECRET)`) test sürecinde üretilir (`tests/support/staff-session.ts`). Uygulama koduna bypass, özel header, test endpoint'i veya test kullanıcısı **eklenmez**: oturum, uygulamanın her istekte veritabanından doğruladığı normal bir oturumdur.
  4. Testler: kullanıcı adı/şifre/credential/rol kayıtlarını değiştirmez (parmak izi testin başında ve sonunda karşılaştırılır — hash değeri belleğe alınmaz, `md5` özeti karşılaştırılır); mevcut gerçek oturumları silmez/değiştirmez (doğrulanır); yalnızca kendi `test-session-*` satırlarını siler; global setup/teardown yarıda kalmış test oturumlarını temizler.
  5. Token/cookie yalnızca bellekte; Playwright **trace kapalı** (trace dosyaları cookie header'larını diske yazar); ekran görüntülerinde kullanıcı adları ve başvuru satırları maskelenir.
  6. Sentetik başvuru verisi: integration'da REPEATABLE READ transaction içinde eklenip **geri alınır**; E2E'de tek projede (Desktop Chrome, sıralı) eklenir ve `finally` ile silinir.
- **Consequences:** Bootstrap sonrası oturum/çıkış/iptal/süre/IP-UA/sliding/CSRF/dashboard testleri sürekli çalışır. **Doğrulanamayan (gerçek hesaplar varken):** doğru şifreyle giriş (Set-Cookie dahil), bootstrap'ın hesap oluşturması, şifre sıfırlamanın etkisi — bunlar yalnızca hesap yokken (PHASE 03'te) doğrulandı.
- **Risks:** (a) Testin `BETTER_AUTH_SECRET`'a erişmesi gerekir (yalnızca yerel `.env.local`; CI'da veritabanı yok → testler atlanır). (b) Test sırasında gerçek hesap adına kısa ömürlü oturum ve çıkış testinde gerçek hesap kimliğiyle `USER_LOGOUT` audit kaydı oluşur (tek projede, değiştirilemez kayıt — kabul edilen gürültü). (c) Sentetik başvurular E2E sırasında birkaç saniye gerçek panelde görünür. (d) Gerçek müşteri verisi girildikten sonra testlerin aynı veritabanında çalışması TM-43/PB-06 kapsamında yeniden değerlendirilmelidir.
- **Alternatives:** İzole/ephemeral veritabanı (embedded-postgres — Product Owner gereksiz buldu); test endpoint'i/bypass header'ı (yasak); gerçek şifreyi CI secret'ı yapmak (yasak).

### D-068 — Giriş rate limiting: genel limit yerine bilinmeyen kullanıcı adı limiti (P4-03)
- **Date:** 2026-11-24 (PHASE 04) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 04 sonu) · D-063'ün genel limit kısmını değiştirir
- **Onay koşulları (Product Owner, 2026-11-24):** Yaklaşım development süreci için kabul edilmiştir. Hesap başına denial-of-service riski ve kullanıcı adı tespit riski **açık** kalır. Hosting sağlayıcısı belirlendiğinde TD-04 yeniden değerlendirilecektir. P4-03: MITIGATED.
- **Context:** `login:global` (100/15 dk) yalnızca 100 istekle iki hesabın girişini 15 dk engelleyebiliyordu (DoS). IP bazlı limit, güvenilir istemci IP header'ı hosting seçilmeden kullanılamaz (TD-04); `X-Forwarded-For`'a güvenilmez.
- **Decision:** (1) Kullanıcı adı başına limit aynen: 10 deneme / 15 dk (HMAC'li anahtar, deneme sayılır, başarılı giriş sıfırlar). (2) Genel limit **kaldırıldı**; yerine yalnızca **var olmayan** kullanıcı adlarıyla yapılan denemelerin ortak sayacı: `login:unknown-usernames` **50 / 15 dk**. Var olan iki hesabın girişleri bu sayaçtan etkilenmez. (3) Ortak limit aşıldığında kullanıcı adı başına satır **oluşturulmaz** (tablo rastgele adlarla büyümez) ve kullanıcıya genel "Kullanıcı adı veya şifre hatalı." mesajı gösterilir; zamanlama farkını azaltmak için şifre yine scrypt ile hash'lenir. (4) Kontrol tek transaction'da, fail-closed. Kalıcı IP/cihaz bilgisi saklanmaz.
- **Consequences:** Saldırgan artık genel sayacı doldurarak iki hesabın girişini engelleyemez; dağıtık sözlük saldırısı hesap başına 10/15 dk ile sınırlı kalır.
- **Kalan riskler (açık):** (a) **Hesap başına kilitleme DoS'u**: kullanıcı adını bilen saldırgan 10 denemeyle o hesabı 15 dk engelleyebilir (iki hesap olduğundan kullanıcı adları tahmin edilebilir) — IP bazlı limit (TD-04, PHASE 13) olmadan tam çözüm yok. (b) Ortak bilinmeyen-ad limiti dolu iken, bir adın 11. denemesinde "çok fazla deneme" mesajı alınması o adın var olduğunu ele verebilir (aday başına 11 istek gerektiren sınırlı kullanıcı adı tespiti). (c) Hash maliyeti CPU tabanlı yük oluşturabilir (PHASE 12 yük testi).
- **Alternatives:** Genel limiti yükseltmek (DoS'u ötelemekten öte çözmez); IP bazlı limit (TD-04); CAPTCHA/harici servis (yasak/ücretli).

### D-069 — Durum değiştiren isteklerde proxy köken kontrolü → kontrollü 403 (P4-02)
- **Date:** 2026-11-24 (PHASE 04) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 04 sonu)
- **Context:** Next.js Server Action Origin/Host kontrolü başka origin'den gelen isteği **500 "Invalid Server Actions request"** ile reddediyordu; Origin header'ı olmayan istekler yalnızca uyarıyla işleniyordu.
- **Decision:** `src/proxy.ts`, `/api/*` dışındaki tüm GET/HEAD/OPTIONS olmayan isteklerde `Origin`'in `APP_URL` origin'i ile **tam eşleşmesini** ve `x-forwarded-host` (yoksa `Host`) değerinin `APP_URL` host'u ile eşleşmesini ister; aksi halde **403**, `text/plain` "İstek reddedildi.", `Cache-Control: no-store`. Origin yok, `"null"`, bozuk, farklı şema/port/alt alan adı, güvenilmeyen Host/X-Forwarded-Host → 403. APP_URL production'da yoksa fail-closed (tüm durum değiştiren istekler reddedilir). Saf fonksiyon `src/server/security/request-origin.ts` (unit testli). Next.js'in kendi kontrolü **kapatılmaz** (ikinci katman). `/api/*` Route Handler'ları kendi kontrollerini yapar (Blob callback'i Origin göndermez — PHASE 08).
- **Consequences:** CSRF reddi 500 yerine 403; Origin'siz POST da reddedilir (tarayıcılar POST'ta Origin gönderir). Reddedilen istekler Server Action'a ulaşmadığı için rate limit sayacı ve audit kaydı oluşturmaz.
- **Risks:** Hosting'in `Host`/`X-Forwarded-Host` davranışı (ör. Vercel) PHASE 13'te doğrulanmalı; yanlış APP_URL tüm formları kırar (fail-closed — güvenli taraf).

### D-070 — Şirket paneli temeli: düzen, Genel Bakış verisi ve bileşenler
- **Date:** 2026-11-24 (PHASE 04) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 04 sonu)
- **Decision:**
  1. **Düzen:** `src/app/(dashboard)/dashboard/layout.tsx` (`requireStaff()` + `DashboardShell`); her sayfa ayrıca kendi `requireStaff()` çağrısını yapar. ≥1024px sabit 248px sidebar; altında header'daki menü butonuyla drawer (Radix Dialog: odak kapanı, Escape, overlay, kaydırma kilidi, odak iadesi; sayfa değişince kapanır). Menü: Genel Bakış, Başvurular, Hizmetler, İşlem Geçmişi — iki hesap için aynı (`src/config/navigation.ts`).
  2. **Hazır olmayan modüller:** `/dashboard/applications`, `/dashboard/services`, `/dashboard/audit-logs` "Henüz kullanıma hazır değil" sayfası (404 veya sahte aksiyon yok). "Yeni Başvuru" pasif + açıklama. Panel içi tanımsız yol: oturum kontrolünden sonra panel düzeninde gerçek HTTP 404 (yükleme iskeleti yalnızca `(overview)` route group'unda olduğu için akış başlamadan `notFound()`).
  3. **Sayaç tanımları (`src/features/dashboard/domain.ts`):** Toplam = tüm başvurular; **Evrak Bekleyen = `AWAITING_DOCUMENTS` + `REVISION_REQUIRED`** (her ikisi de müşteriden evrak bekler); İncelemede = `UNDER_REVIEW`; Tamamlanan = `COMPLETED`. **Silme talebi verilmiş (`deletion_requested_at IS NOT NULL`) başvurular hiçbir sayaca ve listeye girmez** (BR-153). `DOCUMENTS_APPROVED`, `IN_PROCESS`, `CANCELLED` yalnızca Toplam'da.
  4. **Sorgu:** runtime rolü (`getDb()`), tek salt okunur REPEATABLE READ transaction (tutarlı görünüm); yalnızca gerekli kolonlar (numara, ad, soyad, hizmet adı snapshot'ı, statü, tarih) — telefon, e-posta, arama metni, token, iç not **sorgulanmaz**; DTO'da başvuru kimliği yok. Son 5 başvuru: `created_at DESC, application_number DESC`. İnceleme kuyruğu: `UNDER_REVIEW`, `status_changed_at ASC, application_number ASC`, en fazla 5. Hata boş durumdan ayrı sonuç döner; log'a yalnızca hata türü/kodu yazılır.
  5. **Bileşenler:** `src/components/dashboard/*` (DashboardShell, Sidebar, MobileNavigation, DashboardHeader, Breadcrumb, PageHeader, StatCard, EmptyState, ErrorState, LoadingSkeleton, AccountMenu, NotReadyPage, RetryButton, UserAvatar, SignOutButton), `src/features/applications/components/application-status-badge.tsx`, statü sunumu `src/features/applications/domain/status-labels.ts` (`satisfies Record<ApplicationStatus,…>` ile eksiksizlik derleme zamanında). Dialog/DropdownMenu mevcut `radix-ui` paketinden; `shadcn add` ve `tw-animate-css` **kullanılmadı** — drawer/menü geçişleri `globals.css`'te küçük keyframe'ler (reduced-motion'da kapanır). Badge'e `neutral` ve `processing` varyantları eklendi.
- **Consequences:** Rol bazlı UI farkı yok (E2E ile iki hesap karşılaştırılır).

### D-071 — `get-nonce@1.0.1` doğrudan bağımlılık (CSP nonce'u ile kaydırma kilidi)
- **Date:** 2026-11-24 (PHASE 04) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 04 sonu)
- **Context:** Radix Dialog'un kaydırma kilidi (react-remove-scroll → react-style-singleton) çalışma anında `<style>` etiketi ekler; CSP `style-src 'self' 'nonce-…'` (D-064) bunu engelliyordu (konsol hatası, kilit stili uygulanmıyordu).
- **Decision:** react-style-singleton'ın nonce kaynağı olan `get-nonce` (MIT, 1.0.1, deprecated değil, kilit dosyasında zaten aynı sürümle mevcut — yeni kod indirilmez) exact sürümle doğrudan bağımlılık yapıldı; dashboard layout'u istek nonce'unu (`x-nonce`) istemci bileşeni `CspNonce` ile `setNonce`'a verir. `'unsafe-inline'` eklenmedi.
- **Düzeltme (PHASE 05):** Server Action / yenileme sonrası layout yeni isteğin nonce'uyla yeniden render edildiğinde `get-nonce` belgeninkinden farklı bir nonce alıyor ve onay penceresinin kaydırma kilidi CSP'ye takılıyordu. `CspNonce` artık belgedeki script etiketinin gerçek nonce'unu bir kez okur ve değiştirmez (E2E: mutasyon sonrası diyaloglarda CSP hatası yok). Karar içeriği değişmedi.
- **Risks:** Nonce RSC yükünde istemciye gider (zaten HTML'deki script etiketlerinde bulunur; istek başına değişir). Radix/react-remove-scroll sürüm değişikliğinde `get-nonce` tekilliği (aynı modül örneği) yeniden doğrulanmalı (E2E: drawer açılırken konsol/CSP hatası yok).

### D-072 — Hizmet / evrak şablonu yönetimi: rota, action ve liste yaklaşımı
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu)
- **Context:** BR-20…BR-25, API_CONTRACTS §2.3, küçük hizmet kataloğu.
- **Decision:** Rotalar `/dashboard/services` (liste), `/new`, `/[serviceId]` (genel bilgiler + durum + evrak gereksinimleri tek sayfada; evrak ekleme/düzenleme satır içi form). Okuma: Server Component + `src/features/services/queries.ts` (runtime rolü, DTO; oluşturan/güncelleyen kimliği istemciye gitmez). Mutasyon: 7 Server Action (`createService`, `updateService`, `setServiceActive`, `createRequirement`, `updateRequirement`, `setRequirementActive`, `moveRequirement`) — nesne girdi, `requireStaff()` → Zod `.strict()` → servis katmanı → `revalidatePath`. Liste: Türkçe karakter duyarsız ad araması (BR-80 katlaması; SQL `translate(lower(name))`, LIKE kaçışlı), Tümü/Aktif/Pasif filtresi (`searchParams`, GET formu), Türkçe alfabetik sıra (`Intl.Collator('tr-TR')`), en fazla 100 kayıt (+ "aramayı daraltın" notu) — sayfalama yok. Boş katalog ile "sonuç yok" ayrı; veritabanı hatası `ErrorState`.
- **Değişen plan:** API_CONTRACTS'taki `reorderServicesAction` **uygulanmadı** (hizmet sırası ürün tarafından istenmedi; tüm hizmet satırlarını kilitlemeyi gerektirir) — hizmetler ada göre sıralanır; `services.sort_order` yalnızca yeni kayıtta artan değer alır. `reorderDocumentTemplatesAction({orderedIds})` yerine göreli `moveRequirementAction({direction})` (D-075).
- **Alternatives:** Ayrı evrak düzenleme sayfaları (gereksiz rota); REST API (gereksiz); React Hook Form (basit formlar için gereksiz bağımlılık — kontrollü `useState` yeterli).

### D-073 — Form doğrulama ve gönderim güvenliği
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu)
- **Decision:** İstemci ve sunucu aynı Zod şemalarını kullanır (`src/features/services/schemas.ts`); sunucu doğrulaması zorunludur. Tek satırlık ad/başlık: NFC, iç boşluklar tekleşir, kırpılır, 2–150 **kod noktası** (PostgreSQL `char_length` ile aynı), harf/rakamla başlar, izinli karakterler `harf rakam boşluk - – — ( ) . , & / ' ’ + :`. Çok satırlı açıklama/talimat: CRLF→LF, kırpılır, satır sonu/sekme dışında kontrol karakteri yok, ≤2000/≤4000, boşsa `NULL`; **düz metin** saklanır, React metni olarak (`whitespace-pre-line`) inert gösterilir — HTML/rich text yok. Bilinmeyen alan (`createdByUserId`, `actorUserId`, `role`, `maxFileSizeBytes`, `version` …) girdiyi bütünüyle reddeder. Formlar kontrollü (hatada veri kaybolmaz), alan hatası `aria-invalid` + `aria-describedby` + ilk hatalı alana odak; gönderim/taşıma/aktifleştirme/onay butonlarında `useTransition` + ref kilidi (render beklenmeden gelen ikinci tıklama yok sayılır). Kaydedilmemiş değişiklik: görünür gösterge + `beforeunload` uyarısı (uygulama içi Link gezinmesinde uyarı yok — bilinen sınır).

### D-074 — Şablon optimistic lock (migration 0004) ve kilit sözleşmesi
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu)
- **Context:** İki eşit hesap aynı hizmeti eşzamanlı düzenleyebilir; şemada `version` yoktu. API_CONTRACTS §1 `expectedVersion` desenini öngörüyor.
- **Decision:** Migration `0004_template_optimistic_lock`: `services.version` ve `service_document_requirements.version` (`integer NOT NULL DEFAULT 1`, CHECK `>= 1`) — yalnızca ekleme, mevcut satırlar 1 alır, yeni GRANT gerekmez (SQL incelendi; neondb'ye uygulandı: 5 migration). Güncelleme/aktiflik değişikliği `expectedVersion` ister; uyuşmazlık → `CONFLICT` ("Bu kayıt başka bir işlem tarafından güncellendi…" + "Sayfayı yenile"); değişiklik yoksa no-op (version/audit artmaz). Sıralama `version` artırmaz (içerik formuyla çakışmasın). **Kilit sırası:** `services` satırı `FOR NO KEY UPDATE` → ilgili `service_document_requirements` satırları `FOR UPDATE` (belirleyici sıra). Tüm şablon mutasyonları önce hizmet satırını kilitler (eşzamanlı ekleme sıra değerlerini çakıştırmaz). Kilit/serileştirme hataları (`40001`, `40P01`, `55P03`) → `CONFLICT`; diğerleri → genel Türkçe hata, log'da yalnızca kod.
- **PHASE 06 snapshot sözleşmesi:** Başvuru oluşturma transaction'ı başvuru kilitlerinden **önce** `SELECT … FROM services WHERE id = $1 AND is_active FOR SHARE` alır (şablon mutasyonlarının `FOR NO KEY UPDATE`'i ile çakışır → yarım değişiklik görülmez; FK `KEY SHARE` kilitleriyle çakışmaz), sonra aktif şablonları `ORDER BY sort_order, created_at, id` ile okuyup kopyalar (BR-30); hizmet pasif veya aktif şablon yoksa reddeder (BR-21, BR-32). Şablon mutasyonları başvuru tablolarına hiç yazmaz; snapshot'a referans yalnızca `source_requirement_id` (ON DELETE SET NULL). Integration testleri: snapshot bağımsızlığı (8 değişiklik türü) ve FOR SHARE okuyucunun şablon kilidi sürerken beklemesi.

### D-075 — Aktif/pasif yaşam döngüsü ve evrak sıralaması
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu)
- **Decision:** Fiziksel silme yok (BR-22); hizmet ve evrak pasifleştirme **onay penceresiyle** (geçmiş kayıtların silinmeyeceği belirtilir), yeniden aktifleştirme doğrudan. Yeni hizmet formunda "Hizmeti hemen aktifleştir" varsayılan **kapalı** (öneri metniyle) — yeni ürün kuralı değildir; aktif hizmette aktif evrak yoksa yalnızca **uyarı** gösterilir (BR-32 bilgilendirmesi, engelleme yok). Yeni evrak varsayılan zorunlu (DB varsayılanı) ve aktif, sona eklenir (`max(sort_order)+10`). Sıralama: aktif + pasif evraklar **tek sırada**; "Yukarı/Aşağı taşı" komşuyla yer değiştirir ve tüm evrakları 10, 20, 30… olarak yeniden numaralar (sort_order benzersiz olmadığı için ara değer çakışması yok); işlem göreli olduğu için eşzamanlı taşımalar kilit altında sırayla uygulanır; pasif evrak yerini korur, yeniden aktifleşince aynı konumdadır. Sürükle-bırak yok (erişilebilirlik, bağımlılık).

### D-076 — Hizmet / şablon audit olayları
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu)
- **Decision:** Aynı transaction'da (audit yazılamazsa mutasyon da geri alınır — testli): `SERVICE_CREATED` / `SERVICE_UPDATED` / `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` (`resource_type='service'`, `{ changedFields }`); `DOCUMENT_TEMPLATE_CREATED` / `DOCUMENT_TEMPLATE_UPDATED` (`{ serviceId, changedFields }`; sıralama `changedFields: ["sortOrder"]`) ve **yeni** `DOCUMENT_TEMPLATE_ACTIVATED` / `DOCUMENT_TEMPLATE_DEACTIVATED` (`{ serviceId, changedFields: ["isActive"] }`), `resource_type='document_template'`. Aktör yalnızca doğrulanmış oturumdan (`actor_type='USER'`). Ad, başlık, açıklama, talimat metni audit'e yazılmaz; mevcut metadata anahtar beyaz listesi yeterli (migration gerekmedi).

### D-077 — Mutasyon testleri için izole geçici PostgreSQL (Docker)
- **Date:** 2026-11-24 (PHASE 05) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-24 (PHASE 05 sonu) · Docker tabanlı izole PostgreSQL test stratejisi sonraki tüm fazlarda kullanılacaktır
- **Context:** PHASE 05 ilk ürün mutasyonlarını içerir; commit eden testler (eşzamanlılık, tarayıcıdan oluşturma/düzenleme) ortak `neondb`'de gerçek personel adına kalıcı kayıt/audit üretir (yasak). D-067 koşulu: test işlemlerinin gerçek personel adına yanıltıcı audit oluşturması kalıcı çözüm değildir.
- **Decision:** `scripts/test/isolated-db.ts` — Docker'da resmî `postgres:18-alpine` (PostgreSQL 18.7, Neon ile aynı sürüm; `builtin` C.UTF-8 locale — Neon ile aynı), rastgele şifreler, yalnızca 127.0.0.1'e bağlı rastgele port; `db:init` + `db:migrate`; rastgele auth secret'ları; komut sonrası container silinir. Komutlar: `pnpm test:integration:isolated`, `pnpm test:e2e:isolated` (Playwright port 3200, sunucu yeniden kullanılmaz). Testler `ISOLATED_TEST_DB=1` + yerel adres + `cs_isolated_test` adını birlikte doğrulamadan commit eden mutasyon testlerini çalıştırmaz. İzole ortamda hesap yoktur → geçici `test-` hesaplarıyla **şifreyle giriş, bootstrap ve şifre sıfırlama** testleri de çalışır (P4-01'in NOT VERIFIED kalan kısımları burada doğrulanır). Ortak `neondb`'de: mutasyon integration testleri dış transaction + SAVEPOINT ile tamamen geri alınır (kalıcı kayıt/audit yok); E2E salt okunurdur; gerçek hesap adına `USER_LOGOUT` yazan çıkış testi artık yalnızca izole ortamda çalışır.
- **Consequences:** Yerelde Docker gerekir (ücretsiz; imaj ~150 MB). CI'da Docker/izole hedef henüz yok (PHASE 12'de değerlendirilir). Ortak `neondb`'de kalan test yan etkileri: yalnızca sentetik `SYSTEM` audit kayıtları (PHASE 02 testleri) ve kısa ömürlü test oturumları (silinir).
- **Alternatives:** Kalıcı Neon branch/ikinci veritabanı (ücret/hesap işlemi, kullanıcı onayı gerektirir); embedded-postgres npm paketi (daha önce reddedildi).

### D-078 — Atomik başvuru oluşturma ve başvuru numarası
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:** `createApplication` tek transaction: idempotency kontrolü → `services` satırı `FOR SHARE` (aktif değilse ret — BR-21) → aktif şablonlar belirleyici sırada (`sort_order, created_at, id`; yoksa ret — BR-32) → parmak izi doğrulaması (D-079) → yıllık sayaç `INSERT … ON CONFLICT DO UPDATE … RETURNING` (yıl `now() AT TIME ZONE 'Europe/Istanbul'`; MAX+1 yok) → `applications` (müşteri alanları, `search_text`, `service_name_snapshot`, `AWAITING_DOCUMENTS`, `created_by` oturumdan) → `application_document_requirements` snapshot'ı (başlık, açıklama, talimat, zorunluluk, sıra, `source_requirement_id`) → `application_status_history` (`NULL → AWAITING_DOCUMENTS`, `CREATE`) → token (D-080) → audit `APPLICATION_CREATED {serviceId}` + `ACCESS_LINK_CREATED {accessTokenId}`. Herhangi bir adım başarısızsa hiçbir satır kalmaz; sayaç artışı da geri alınır (bu nedenle geri alınan oluşturma numara boşluğu bırakmaz; silinen başvurunun numarası yeniden kullanılmaz — BR-12). Biçim `CS-{YYYY}-{NNNNNN}` (BR-10/13).
- **Doğrulama:** izole integration — numara/statü/snapshot/geçmiş/token/audit; 12 eşzamanlı oluşturmada benzersiz ve ardışık numara; snapshot, statü geçmişi, token ve audit yazımı başarısız olduğunda tam geri alma (sayaç dahil).
- **Kapsam notu:** API_CONTRACTS'taki `internalNote` (şirket içi not) PHASE 06 talimatında yer almadığı için **uygulanmadı** (iç notlar modülüyle birlikte sonraki faz).

### D-079 — Önizleme–oluşturma tutarlılığı: sunucu doğrulamalı şablon parmak izi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Context:** Hizmet `version`'ı yalnızca hizmet alanlarında artar; evrak içerik/aktiflik değişikliği evrak `version`'ını artırır, sıra değişikliği yalnızca `sort_order`'u değiştirir (D-074/D-075). Yalnızca hizmet version'ı kontrolü şablon değişikliklerini yakalamaz.
- **Decision:** `templateFingerprint = SHA-256(JSON[service.id, service.version, [(req.id, req.version, req.sort_order)…]])` (aktif evraklar, snapshot sırasıyla). Önizleme (`getServicePreviewAction`) parmak izini döndürür; oluşturma aynı değeri gönderir; sunucu `FOR SHARE` kilidi altında yeniden hesaplar, uyuşmazlıkta `STALE_PREVIEW` döner (kayıt yok) ve form önizlemeyi yeniler. Parmak izi gizli değildir; yalnızca tutarlılık kontrolüdür. Yeni şema/migration gerekmedi.
- **Doğrulama:** unit (her değişiklik türü parmak izini değiştirir); izole integration (şablon kilidi sürerken oluşturma bekler, commit sonrası `STALE_PREVIEW`; güncel önizlemeyle başarılı); izole E2E (form, şablon değişince oluşturmaz ve listeyi yeniler).

### D-080 — Müşteri bağlantı token'ı biçimi ve kriptografik saklama
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu) · SECURITY §3.2'yi uygular, AAD'yi genişletir
- **Decision:** `src/server/access-tokens/crypto.ts` (server-only, Node `crypto`): token `randomBytes(32)` → base64url 43 karakter, kanonik biçim zorunlu; `token_hash = HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` hex (UNIQUE); şifreli kopya AES-256-GCM, her şifrelemede 12 bayt rastgele IV, 16 bayt tag, biçim `v1:<keyId>:<iv>:<ct>:<tag>` (base64url parçalar). **AAD = `cs-access-token:v1:<applicationId>:<tokenId>`** — SECURITY'deki "AAD = application_id"den daha sıkı: şifreli kopya başka başvuruya veya başka token satırına taşınırsa çözülmez (token kimliği uygulamada `randomUUID()` ile önceden üretilir). Çözme hatası (yanlış anahtar, bozuk metin/tag, bağlam, bilinmeyen anahtar kimliği) ayrım yapmadan `AccessTokenCryptoError` → fail-closed. Bağlantı yalnızca `APP_URL` kökünden (`${origin}/b/${token}`); `Host`/`X-Forwarded-Host` kullanılmaz (BR-107). Düz token DB'de, log'da, audit'te, URL'de, tarayıcı depolamasında yoktur.
- **Doğrulama:** unit (2000 token benzersiz/kanonik, HMAC, GCM turu, IV benzersizliği, IV/ct/tag/sürüm/anahtar/bağlam manipülasyonu reddi, hata mesajında token yok, APP_URL kökü); izole integration (hash = HMAC(token), şifreli biçim, DB'de düz token yok, bozuk şifreli kopya ve yanlış anahtarla fail-closed).

### D-081 — Token anahtarı yönetimi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Onay koşulu (Product Owner, 2026-11-25):** Production kullanımından önce token anahtarlarının güvenli yedekleme, kurtarma ve rotasyon mekanizmaları tamamlanmalıdır. TM-48 açık kalır.
- **Decision:** `getAccessTokenEnv()` (lazy, yalnızca token işlemlerinde): `ACCESS_TOKEN_HMAC_KEY` (base64, 32 bayt), `ACCESS_TOKEN_ENCRYPTION_KEYS` (JSON `{"k1":"<base64 32 bayt>"}`, kimlik `^[A-Za-z0-9_-]{1,32}$`), `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` (haritada olmalı). Tüm anahtarlar birbirinden ve `BETTER_AUTH_SECRET`/`RATE_LIMIT_KEY_SECRET`'tan farklı olmalı. Eksik/hatalı → yalnızca token gerektiren işlemler genel Türkçe hata ile reddedilir (başvuru oluşturulmaz); giriş ve hizmet yönetimi etkilenmez; log'a yalnızca değişken adı. Yerel: `pnpm env:token-keys` yalnızca EKSİK anahtarları `.env.local`'a ekler (üzerine yazmaz, değer göstermez — PHASE 06'da çalıştırıldı, dosya izni 600). İzole testler kendi rastgele anahtarlarını kullanır. Production anahtarları hosting env'inde, yetkili kişi tarafından üretilir ve yedeklenir; HMAC anahtarı değişirse tüm bağlantılar geçersiz olur, şifreleme anahtarı değişirse eski kopyalar çözülemez (rotasyon: yeni kimlik ekle → aktif yap → yeniden şifreleme betiği → eskiyi kaldır; betik henüz yok — PHASE 13 öncesi).

### D-082 — Başvuru oluşturmada idempotency
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:** Form oturumu başına istemcide `crypto.randomUUID()` anahtarı (ilk gönderimde üretilir; hata/ağ kesintisinde korunur; başarıdan sonra "Yeni başvuru" ile sıfırlanır) → mevcut `applications.idempotency_key` UNIQUE kolonu. Transaction başında aynı anahtarlı başvuru varsa yeni kayıt açılmaz, mevcut başvuru (ve aktif bağlantısı) `replayed: true` ile döner; eşzamanlı aynı gönderimde ikinci transaction UNIQUE'e takılır ve mevcut sonuç döndürülür. Ayrıca gönderim butonu ref kilidiyle çift tıklamayı engeller. Bilinçli ikinci başvuru (yeni form) engellenmez; müşteri eşleştirmesi yoktur (OD-10).
- **Doğrulama:** izole integration (sıralı ve eşzamanlı tekrar → tek başvuru; bilinçli ikinci başvuru serbest); izole E2E (çift tıklama → tek kayıt).

### D-083 — Müşteri bilgisi düzenleme ve iletişim değişikliği politikası
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:** `updateCustomerInfoAction({ applicationId, expectedVersion, firstName, lastName, phone, email })` — `applications FOR UPDATE`, version kontrolü (`CONFLICT`), değişiklik yoksa no-op, `search_text` yeniden üretilir, audit `APPLICATION_UPDATED {changedFields}` (eski/yeni değer yok). Yalnızca bu başvuru değişir (BR-03). Tüm statülerde düzenlenebilir (BR'de kısıt yok); silme talepli başvuru `NOT_FOUND`. Telefon/e-posta değişince bağlantı **kendiliğinden yenilenmez** (ürün kararı yok); arayüz "mevcut bağlantı önceki alıcıda kalmış olabilir" uyarısı ve bağlantı yönetimine geçiş gösterir.

### D-084 — Bağlantı yönetimi: istek üzerine açığa çıkarma, iptal/yenileme eşzamanlılığı, WhatsApp hazırlığı ve PHASE 07 oturum sözleşmesi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:**
  1. **İstek üzerine açığa çıkarma:** liste/detay DTO'ları yalnızca aktif token kimliğini (gizli değil) taşır; düz bağlantı yalnızca `revealAccessLinkAction` (Göster/Kopyala) ile sunucuda çözülür ve yanıtta döner, audit `ACCESS_LINK_VIEWED {accessTokenId}`. Toplu çözme, ön yükleme, URL/sorgu dizesi, `localStorage/sessionStorage` yok; varsayılan gizli gösterim. Kopyalama `navigator.clipboard` sonucunu doğrular; başarısızsa seçilebilir alan (elle kopyalama).
  2. **İptal/yenileme:** `applications FOR UPDATE` → aktif token `FOR UPDATE`; istemci gördüğü **aktif token kimliğini** (`expectedActiveTokenId`, yoksa `null`) gönderir; uyuşmazsa `CONFLICT` — eski onay/sekme daha yeni bağlantıyı fark etmeden iptal edemez (API_CONTRACTS'taki `expectedVersion` yerine; başvuru version'ı müşteri formuyla çakışmasın diye). Yenileme: eski token `ROTATED` + yeni token aynı transaction'da (yeni token yazılamazsa eski bağlantı korunur); iptal edilmişin yerine yeni bağlantı aynı action (`expectedActiveTokenId: null`, audit `ACCESS_LINK_CREATED`). Partial unique index son savunma. Silme talepli başvuruda tüm bağlantı işlemleri `NOT_FOUND`. Statü/zamana bağlı otomatik iptal yok (OD-04).
  3. **WhatsApp:** `prepareWhatsAppShareAction` mesajı (BR-161 birebir) ve `https://wa.me/<E.164 rakamları>?text=<encodeURIComponent>` bağlantısını sunucuda üretir (resmî "Tıkla ve sohbet et" biçimi doğrulandı); onay penceresinde alıcı adı ve telefonu gösterilir (BR-162); WhatsApp yalnızca kullanıcı "WhatsApp'ta aç" bağlantısına tıklayınca açılır (`target=_blank`, `rel="noopener noreferrer"`), otomatik gönderim/ön yükleme/harici istek yok; "Mesajı kopyala" alternatifi. Yeni audit olayı `ACCESS_LINK_SHARE_PREPARED {accessTokenId}` — gönderim/teslim iddia etmez. PHASE 07'ye kadar her bağlantı ekranında "müşteri paneli henüz açık değil; gerçek müşterilerle paylaşmayın" uyarısı.
  4. **PHASE 07 sözleşmesi:** müşteri oturumu (SECURITY §3.4) token kimliğini (`tid`) taşıyacak ve her istekte `revoked_at IS NULL` + başvuru silinme durumu kontrol edilecek → iptal/yenileme, eski token'a bağlı tüm oturumları bir sonraki istekte geçersiz kılar (BR-104). Bu fazda oturum/cookie/tablo yok; HTTP üzerinden erişimin açılıp kapandığı PHASE 07 E2E'siyle doğrulanacak.
- **Doğrulama:** izole integration (görüntüleme aynı bağlantı, eski kimlikle iptal/yenileme reddi, iptal → görüntüleme null, yeniden oluşturma, 5 tur eşzamanlı yenileme+iptal+yenileme: tam olarak bir başarı ve en fazla bir aktif token, yenileme sırasında token yazılamazsa eski bağlantı korunur, audit sırası ve içeriğinde bağlantı yok); izole E2E (gizli/göster, onaylı yenile/iptal, Escape ile vazgeçme, iki hesapta eski onayın reddi, WhatsApp alıcı/mesaj/`wa.me` yakalama — gerçek istek yok, pano doğrulaması Chromium'da).

### D-085 — Başvuru listesi: arama, filtre, sayfalama ve telefon normalizasyonu
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:** Kişisel veri içermeyen filtreler URL'de (`status`, `serviceId`, `page`, `pageSize` ∈ {10, 20, 50}, varsayılan 20; geçersiz değer varsayılana döner); **arama metni URL'ye yazılmaz** — `searchApplicationsAction` POST gövdesiyle gönderilir (tarayıcı geçmişi, erişim logları ve referrer'a sızmaz; sayfa yenilenince arama sıfırlanır — bilinçli ödünleşim). Arama: başvuru numarası birebir (büyük/küçük harf toleranslı) + `search_text` (BR-80 katlaması, LIKE kaçışlı, parametreli) + telefon rakamları (≥4 hane; E.164 rakamları, ulusal ve `0`'lı biçim `search_text`'te). Sunucu tarafı sayfalama `COUNT(*)` + `LIMIT/OFFSET`; sıra `created_at DESC, application_number DESC`; sınır dışı sayfa son sayfaya çekilir; sessiz 100 kesmesi yok. Hizmet filtresi pasif hizmetleri de listeler ("(pasif)"). Silme talepli başvurular hiçbir sorguda yok (BR-153). Telefon: `libphonenumber-js` **1.13.17** (MIT, exact; tam metadata, yalnızca sunucuda), varsayılan bölge TR, E.164 saklanır, uluslararası numaralar kabul; biçim doğrulaması sahiplik doğrulaması değildir. Arama ve liste log'a kişisel veri yazmaz.
- **Hata düzeltmesi (testle yakalandı):** listedeki "aktif bağlantı" alt sorgusunda Drizzle'ın tek tablolu sorguda kolonları niteliksiz yazması nedeniyle iç tabloya bağlanma; dış tablo açıkça nitelendi ve integration testine kontrol eklendi.

### D-086 — PHASE 06 test kapsamı ve ortak veritabanı güvenliği
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 06 sonu)
- **Decision:** Başvuru/token/WhatsApp/eşzamanlılık testlerinin tamamı commit ettiği için yalnızca izole Docker ortamında (D-077). `pnpm test:integration` (ortak `neondb`) yalnızca salt okunur veya tamamen geri alınan dosyaları çalıştırır (`auth`, `dashboard`, `privileges`, `services`); commit eden PHASE 02 dosyaları (`constraints`, `concurrency`, `transactions-and-deletion`) ve `applications` yalnızca `pnpm test:integration:isolated`'da. `privileges` testindeki audit ekleme denemesi geri alınan transaction'a alındı (ortak veritabanında artık `TEST_EVENT` birikmez). Dashboard E2E'sindeki sentetik başvuru testi izole ortama taşındı. Ortak veritabanında E2E salt okunurdur (form gönderilmez).

### D-087 — Bağlantı girişi `GET /b/[token]` ve token'sız URL
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · **Onay koşulları (Product Owner, 2026-11-25):** Açık kalan gereksinimler — hosting seviyesinde bearer token log redaksiyonu; tarayıcı geçmişi kaynaklı token riski; WhatsApp bağlantı önizleme güvenliği; edge kötüye kullanım koruması; gerçek cihaz ve WhatsApp in-app tarayıcı testleri; production HTTPS `Secure` cookie doğrulaması; anahtar yedekleme ve rotasyonu; mevcut production blocker'ları (PB-01…PB-11). · SECURITY §3.4, BR-102…BR-105, OD-02'yi uygular
- **Decision:** Route Handler (sayfa render etmez): (1) uzunluk = 43 kontrolü veritabanından önce; (2) kanonik base64url kontrolü + `HMAC(token)` ile tek sorgu (`revoked_at IS NULL` ve başvuru `deletion_requested_at IS NULL`; şifreli kopya çözülmez); (3) geçerliyse imzalı müşteri oturumu cookie'si (D-088) + `303 → APP_URL kökü + /portal/<bağlam>` (D-090); geçersiz/iptal/yenilenmiş/silinmekte → `303 /link-invalid` (ayrım yok); yapılandırma/veritabanı hatası → `303 /link-unavailable` ("şu anda erişilemiyor", geçersiz bağlantıdan ayrı — müşteri yanlışlıkla "bağlantınız iptal" sanmasın). Geçersiz bağlantı mevcut müşteri oturumuna dokunmaz ve başka bir oturuma yönlendirmez. GET hiçbir veri değiştirmez, audit yazmaz, token'ı tüketmez (link önizleme botları güvenli). Yönlendirme hedefi `Host`/`X-Forwarded-Host`'tan değil `APP_URL`'den. Her yanıt `Cache-Control: private, no-store, max-age=0`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow, noarchive`. Hata log'unda yalnızca hata kodu/türü.
- **Alternatives:** Ara sayfa/"Devam" butonu (bot güvenliği için gereksiz; OD-01 ek adım istemiyor); 200 + istemci yönlendirmesi (token geçmişte/DOM'da kalır).
- **Doğrulama:** unit (statik: token log yok, 303, APP_URL); izole integration (çözümleme yan etkisiz: token/başvuru/audit satırları değişmez); E2E (303 + cookie bayrakları, adres çubuğunda token yok, HTML/RSC/depolamada token yok, geçersiz/kısa/uzun/bozuk biçimler, iptal/yenileme/silme).

### D-088 — Müşteri oturumu biçimi, imzalama anahtarı ve cookie
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · D-032/SECURITY §3.4'ü kesinleştirir
- **Decision:** Oturum tablosu yok. Cookie değeri `base64url(JSON payload).base64url(HMAC-SHA256(CUSTOMER_SESSION_SECRET, payloadPart))`; payload `{ v:1, typ:"cs-portal", aid, tid, ctx, iat, exp }` — yalnızca teknik kimlikler (ad, telefon, e-posta, token yok). Doğrulama: uzunluk ≤ 512 → biçim → `timingSafeEqual` imza → Zod `.strict()` şema → `exp - iat ≤ 7 gün`, `iat ≤ now + 60 sn` → `exp > now` (süre sunucuda; cookie `Max-Age`'ine güvenilmez). `CUSTOMER_SESSION_SECRET`: base64, çözülmüş 32 bayt; `ACCESS_TOKEN_HMAC_KEY`, şifreleme anahtarları, `BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY_SECRET` ile aynı olamaz (`getCustomerSessionEnv()`, lazy; eksik/hatalı → yalnızca müşteri erişimi "şu anda erişilemiyor", personel paneli etkilenmez; log'da yalnızca değişken adı). Cookie: `__Host-cs_portal` (https `APP_URL`) / `cs_portal` (yerel http); `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`; https'te `Secure`. Personel cookie'sinden ayrı ad; personel oturumu müşteri yolunda hiç okunmaz. `pnpm env:token-keys` eksikse `CUSTOMER_SESSION_SECRET` ekler (üzerine yazmaz; PHASE 07'de çalıştırıldı, yalnızca bu anahtar eklendi, mevcut değerler korundu, dosya izni 600). Anahtar değişirse tüm müşteri oturumları sonlanır; bağlantılar geçerli kalır.
- **Doğrulama:** unit (tur, 7 gün sınırı, değiştirilmiş payload/imza, yanlış anahtar, fazla alan, aşırı ömür, gelecekteki iat, biçimsiz değerler, cookie bayrakları, env doğrulaması ve anahtar tekrarının reddi); E2E (değiştirilmiş ve süresi dolmuş cookie → güvenli hata).

### D-089 — Sabit süre ve her istekte iptal doğrulaması
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · BR-103, BR-104
- **Decision:** Oturum 7 gün sabittir; kullanım süreyi uzatmaz (kayan/idle süre yok). Yeni 7 günlük oturum yalnızca geçerli bağlantı yeniden açıldığında üretilir. Her korumalı müşteri isteği `requireCustomerAccess(context)` ile başlar: imza + süre + bağlam (D-090) + veritabanında `tokens.id = tid AND application_id = aid AND revoked_at IS NULL` ve başvuru silme sürecinde değil — önbellek yok. Böylece iptal, yenileme ve silme talebi o bağlantıyla açılmış **tüm** oturumları (farklı tarayıcılar dahil) bir sonraki istekte kapatır. Başarısızlık nedenleri müşteriye ayrıştırılmadan gösterilir (geçersiz/iptal/silinmiş → "Bağlantınız kullanılamıyor"; süre → "Oturumunuz sona erdi"; geçici hata → "Şu anda erişilemiyor").
- **Doğrulama:** izole integration (iptal ve yenileme tüm oturumları kapatır, yeni token çalışır, silme talebi, başka başvurunun token'ı ile çapraz kullanım reddi); E2E (açık sekme ve ikinci tarayıcıdaki oturum iptal/yenileme sonrası ilk yeniden yüklemede reddedilir).

### D-090 — Çoklu sekme izolasyonu: URL bağlam kimliği (TM-40)
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu)
- **Decision:** Her girişte 16 bayt rastgele bağlam kimliği (`ctx`, 22 karakter base64url) cookie payload'ına ve URL'ye (`/portal/<ctx>`) yazılır; sayfa yalnızca URL bağlamı cookie bağlamına eşitse veri gösterir. Bağlam kimliği gizli değildir ve tek başına erişim sağlamaz (cookie zorunlu). Aynı tarayıcıda **başka başvurunun** (veya yenilenmiş bağlantının) linki açılınca cookie yeni bağlamla değişir; eski sekme bir sonraki sunucu isteğinde "Bu sayfa artık güncel değil" gösterir — diğer başvurunun verisini asla göstermez. **Aynı bağlantı** (aynı başvuru + aynı token) yeniden açılırsa mevcut bağlam korunur (`entryContextId`), böylece WhatsApp'tan iki kez açmak ilk sekmeyi eskitmez. Sekmeye dönüşte (`visibilitychange`) `router.refresh()`, bfcache'ten dönüşte tam yeniden yükleme ile sunucu yeniden doğrular. Sınır: istemcide zaten render edilmiş içerik, sekme arka planda kalıp yeniden doğrulama tetiklenene kadar ekranda kalır (kendi başvurusunun verisi; başka başvurunun verisi değil). PHASE 08/09 mutasyonları bağlam kimliğini girdi olarak alır ve sunucuda cookie bağlamıyla karşılaştırır (D-095) → yanlış başvuruya yükleme/gönderim engellenir. Tek aktif bağlam bilinçli bir sınırdır: aynı tarayıcıda iki farklı başvuru aynı anda kullanılamaz.
- **Alternatives:** Birden çok başvuruyu taşıyan cookie (kapsam karışıklığı riski, daha büyük saldırı yüzeyi); istemci depolamasında başvuru kimliği (istemci değeri kapsam kaynağı olamaz); yalnızca cookie (eski sekme yeni başvuruyu gösterirdi — TM-40).
- **Doğrulama:** unit (bağlam üretimi/biçimi, giriş bağlamı yeniden kullanımı); E2E (B açılınca A sekmesi uyuşmazlık gösterir ve B verisi içermez — yenileme, geri/ileri, sekmeye dönüş; aynı anda iki bağlantı 3 tur; aynı bağlantı iki sekmede; yenilenmiş bağlantı yeni bağlam; rastgele bağlam veri göstermez) — Chrome, WebKit, mobil emülasyon.

### D-091 — Müşteri veri erişimi ve modül sınırı
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · TM-19, BR-121
- **Decision:** `src/features/customer-portal/queries.ts` → `getCustomerPortalView(db, access)` yalnızca doğrulanmış erişimin `applicationId`'siyle, açık kolon listesiyle okur: müşteri adı/soyadı, başvuru numarası, hizmet snapshot adı, oluşturma tarihi, statü, snapshot evrakları (başlık, açıklama, talimat, zorunluluk, statü) ve yalnızca `REVISION_REQUIRED` evraklarda en son `document_reviews.customer_message`. **İçermez:** telefon, e-posta, teknik kimlikler, iç notlar, audit, personel adları/aktörler, dosya bilgisi, token. ESLint kuralı müşteri modülü ve `(customer)` rotalarında iç not, audit, kimlik doğrulama ve token tablolarını, `@/server/auth*`, `@/server/audit/*`, `@/server/access-tokens/*`, personel action/service/sorgu modüllerini içe aktarmayı engeller. İstemciden `applicationId` alınmaz; kapsam yalnızca oturumdan.
- **Doğrulama:** izole integration (iç not işaretleyicisi, telefon, e-posta, kimlikler serileştirilmiş DTO'da yok; başka başvurunun verisi yok; düzeltme açıklaması); unit (statik DTO/içe aktarma kontrolleri); E2E (HTML ve satır içi RSC yükünde telefon, e-posta, başvuru/token kimliği ve token yok; iç not E2E'de tohumlanmadı — integration ile doğrulandı).

### D-092 — Süreç göstergesi ve evrak ilerlemesi eşlemesi
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · BUSINESS_RULES §11
- **Decision:** `processProgress(status)` BR §11.1 tablosunu birebir uygular (CANCELLED → nötr bilgi kartı); müşteri durum mesajları STATE_TRANSITIONS §1 müşteri sütunu; COMPLETED'a "(Resmî vize sonucu değildir.)". `documentCompletion`: payda zorunlu evraklar; pay `UPLOADED`/`PENDING_REVIEW`/`APPROVED` statülü zorunlu evraklar (düzeltme bekleyen sayılmaz — BR-111; PHASE 08'de "doğrulanıyor" durumu eklenecek); yüzde aşağı yuvarlanır; zorunlu evrak yoksa "Zorunlu evrak bulunmuyor". Ek satırlar: toplam (zorunlu/isteğe bağlı), eksik zorunlu, onaylanan zorunlu (varsa), düzeltme bekleyen (varsa). İlerleme çubuğu CSP nedeniyle satır içi stil yerine SVG ile. Yükleme yer tutucusu yalnızca `AWAITING_DOCUMENTS`/`REVISION_REQUIRED` ve onaylanmamış evraklarda; "İncelemeye Gönder" PHASE 09'a kadar devre dışı (mutasyon yok).
- **Doğrulama:** unit (7 statü eşlemesi, mesajlar, yuvarlama, sıfıra bölme); E2E (statü görünümleri, ilerleme metni, salt okunur modlar).

### D-093 — Müşteri yolu başlıkları, log redaksiyonu ve kötüye kullanım önlemleri
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · **Onay koşulları (Product Owner, 2026-11-25):** Açık kalan gereksinimler — hosting seviyesinde bearer token log redaksiyonu; tarayıcı geçmişi kaynaklı token riski; WhatsApp bağlantı önizleme güvenliği; edge kötüye kullanım koruması; gerçek cihaz ve WhatsApp in-app tarayıcı testleri; production HTTPS `Secure` cookie doğrulaması; anahtar yedekleme ve rotasyonu; mevcut production blocker'ları (PB-01…PB-11).
- **Decision:** `next.config.ts` müşteri yollarına (`/b/*`, `/portal`, `/portal/*`, `/link-invalid`, `/link-unavailable`) `Referrer-Policy: no-referrer` ve `Cache-Control: private, no-store, max-age=0`; mevcut nonce'lu CSP, `X-Robots-Tag` ve meta `robots noindex` geçerli; müşteri sayfalarında üçüncü taraf script/font/analytics yok. Next.js geliştirme sunucusu istek log'u `/b/` yollarını yazmaz (`logging.incomingRequests.ignore`) ve Server Function argümanlarını loglamaz (`logging.serverFunctions: false` — dev log'unda form değerleri/PII görünüyordu). **Kötüye kullanım değerlendirmesi:** token 256 bit olduğundan tahmin saldırısı pratikte imkânsızdır; biçim kontrolü veritabanı sorgusundan önce yapılır, geçersiz istek yalnızca tek indeksli sorgu üretir. Uygulama içi IP bazlı limit, güvenilir istemci IP başlığı doğrulanmadan uygulanamaz (TD-04; `X-Forwarded-For`'a güvenilmez); genel (IP'siz) limit tüm müşterileri kilitleyebileceği için (DoS) uygulanmadı. SECURITY §3.4'teki "IP başına 10 dk'da 30" limiti TD-04 ile birlikte PHASE 13'e (hosting/edge koruması) ertelendi. OTP veya yeni kimlik doğrulama mekanizması eklenmedi (OD-01).
- **Kalan risk:** Hosting altyapı loglarında yol (TM-15, kontrolümüz dışında); yük/kaba kuvvet istekleri için uygulama limiti yok (PHASE 13).
- **Doğrulama:** production ve dev smoke (başlıklar; dev log'unda token ve `/b/` yolu yok); E2E (başlıklar, harici istek yok, konsol/CSP hatası yok).

### D-094 — PHASE 07 test kapsamı ve E2E tohumlama
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · D-077, D-086'yı genişletir
- **Decision:** Token/oturum/çoklu sekme/statü testlerinin tamamı commit ettiği için yalnızca izole Docker ortamında. E2E tohumlaması (`tests/support/portal-seed.ts`) izole veritabanına sentetik başvuru + snapshot evrakı + token satırı yazar; ham token yalnızca test sürecinin belleğinde, hash izole ortamın rastgele `ACCESS_TOKEN_HMAC_KEY`'iyle hesaplanır; şifreli kopya alanı biçime uygun yer tutucudur (portal çözmez). İzole betik rastgele `CUSTOMER_SESSION_SECRET` üretir. Ortak `neondb`'de yalnızca geçersiz bağlantı/bağlamsız erişim gibi salt okunur testler çalışır. Ekran görüntüleri yalnızca sentetik veriyle, token/cookie içermeyen sayfalardan; Playwright trace kapalı; assertion'lar token'ı mesajlara yazmaz.
- **Doğrulama:** `neondb` parmak izi (hesap, credential, hizmet, evrak, başvuru 0, token 0, sayaç 0, audit 154) tüm testler öncesi/sonrası aynı.

### D-095 — PHASE 08/09 müşteri mutasyon güvenlik sözleşmesi
- **Date:** 2026-11-25 (PHASE 07) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 07 sonu) · API_CONTRACTS §3, FILE_STORAGE §2'yi bağlar
- **Decision:** Müşteri tarafı her mutasyon ve dosya isteği (yükleme token'ı, onay, kaldırma, görüntüleme/indirme, incelemeye gönderme): (1) Zod `.strict()` girdi — `applicationId` **yok**, bunun yerine `contextId` (URL bağlamı) zorunlu; (2) `requireCustomerAccess(contextId)` — imza, süre, bağlam eşitliği, token aktif, başvuru silinmemiş; (3) kapsam yalnızca oturumdaki `aid`; evrak/dosya kimliği bu başvuruya ait değilse 404; (4) kilit + `expectedVersion` + statü kontrolü (yükleme yalnızca `AWAITING_DOCUMENTS`/`REVISION_REQUIRED`); (5) audit aktörü `CUSTOMER` (token yazılmaz); (6) köken kontrolü (proxy) ve `no-store`. Bağlam uyuşmazlığında mutasyon reddedilir ve sayfa uyarı gösterir; istemci değeri asla kapsam kaynağı değildir. Personel oturumu müşteri mutasyonlarında kullanılmaz.
- **Durum:** PHASE 07'de müşteri mutasyonu yoktu. **PHASE 08'de dosya yükleme/görüntüleme için uygulandı** (D-100, D-104; bağlam uyuşmazlığında yükleme 409 ile reddedilir — E2E). İncelemeye gönderme mutasyonu PHASE 09'da (TM-40'ın gönderim kısmı açık).

### D-096 — Backblaze B2 adapter (S3 uyumlu API)
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · OD-25'i uygular
- **Decision:** `@aws-sdk/client-s3` **3.1176.0** (exact; Apache-2.0; deprecated değil; Node ≥ 20; `minimumReleaseAge` 24 saat kuralı nedeniyle 3.1177.0 yerine; yalnızca bu paket — ek AWS paketi yok) ile `src/server/storage/b2.ts`. İstemci yalnızca sunucuda; uç nokta/bölge/bucket/anahtar yalnızca doğrulanmış ortam değişkeninden (istek başlığı/kullanıcı girdisi değil). Ayarlar: path-style (`forcePathStyle`), `maxAttempts: 2` (en fazla 1 yeniden deneme), bağlantı 5 sn / istek 60 sn zaman aşımı, `requestChecksumCalculation`/`responseChecksumValidation: WHEN_REQUIRED` (SDK'nin varsayılan CRC32 "flexible checksum" başlıkları B2 belgelerinde yer almıyor — varsayılanların B2 ile birebir uyumlu olduğu varsayılmadı). Yazmada `x-amz-server-side-encryption: AES256` gönderilir ve yanıtta doğrulanır (yoksa `INTEGRITY`); tek parçalı ETag 32 hex ise içerik MD5'iyle karşılaştırılır. Silme yalnızca **versionId'li** `DeleteObject` (B2: versionId'siz silme yalnızca delete marker ekler, veri kalır — apidocs/s3-delete-object). Hata sınıflandırması: 403 + cap/limit → `LIMIT` (yeniden deneme yok), 401/403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 429 → `LIMIT`, 5xx/ağ → `UNAVAILABLE`; yazma sırasında yanıt alınamazsa `AMBIGUOUS`. Hata nesnesi yalnızca durum kodu/hata adı taşır (sağlayıcı mesajı, anahtar, URL yok).
- **Doğrulanan kaynaklar (2026-11-25):** backblaze.com/apidocs (s3-put-object, s3-head-object, s3-get-object, s3-delete-object, s3-list-object-versions, introduction-to-the-s3-compatible-api), docs (cloud-storage-s3-compatible-api, cloud-storage-file-versions, cloud-storage-server-side-encryption, cloud-storage-data-caps-and-alerts, cloud-storage-application-key-capabilities), cloud-storage/pricing, transaction-pricing. **Belgelerde bulunamayan:** `If-None-Match` koşullu yazma, checksum başlıkları, cap aşımındaki S3 hata kodu, S3 GET Range'in açık belgesi.
- **Alternatives:** B2 native API (ek kod, S3 uyumu yeterli); presigned/doğrudan tarayıcı yüklemesi (CORS açılması gerekir — kapsam dışı).

### D-097 — Storage sağlayıcı soyutlaması (B2 + yerel private)
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · D-040'ın yerine geçer
- **Decision:** `src/server/storage/`: `types.ts` (arayüz: `putObject`, `getObject`, `headObject`, `listObjectVersions`, `deleteObjectVersion`; nesne anahtarı biçimi), `errors.ts`, `b2.ts`, `local-private.ts`, `config.ts` (saf doğrulama), `factory.ts` (server-only, lazy), `quota.ts`. Domain kodu AWS SDK'ye bağlı değildir. Yerel adapter yalnızca izole testler ve açıkça yetkilendirilmiş yerel geliştirme içindir: B2 versiyon modelini taklit eder (`<kök>/<anahtar>/<versionId>`), yalnızca sunucu biçimli anahtar, kök sınırı, sembolik bağlantı reddi, `wx` (üzerine yazma yok), dizin 0700 / dosya 0600; `public/` altında olamaz; production'da kullanılamaz. **Sağlayıcılar arasında otomatik geçiş yoktur** — B2 erişilemezse dosya başka yere yazılmaz. Adapter dosyaları yalnızca göreli import kullanır (bakım betikleri Node ile doğrudan çalıştırır).

### D-098 — Güvenli ortam yapılandırması ve production izolasyonu
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu)
- **Decision:** Değişkenler: `STORAGE_PROVIDER` (`b2`|`local`), `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `B2_REGION`, `STORAGE_MAX_TOTAL_BYTES`, `STORAGE_WARNING_BYTES`, `STORAGE_LOCAL_ROOT` (yalnızca local). Doğrulama lazy (`getStorageEnv()` yalnızca dosya işlemlerinde): eksik/hatalı yapılandırma yalnızca yükleme/görüntülemeyi `503` ile durdurur; giriş, hizmet/başvuru yönetimi ve müşteri paneli okumaları etkilenmez. Kurallar: uç nokta `https://s3.<B2_REGION>.backblazeb2.com` ile birebir; `APP_ENV=production` geliştirme bucket'ını (`cs-global-documents`) kullanamaz (Next.js `NODE_ENV=production` ≠ `APP_ENV=production`); `ISOLATED_TEST_DB=1` veya `NODE_ENV=test` iken B2 reddedilir (testler gerçek bucket'a bağlanamaz); kota üst sınırı kod sabiti 9 000 000 000 (env yalnızca daha düşük değer verebilir); `MAX_PDF_SIZE_BYTES` sabittir (OD-16) — tanımlıysa koddaki değerle aynı olmalıdır (dinamik limit yok). Hata mesajları yalnızca değişken adı içerir. `pnpm env:b2`: etkileşimli terminal zorunlu; keyID görünür, Application Key yankısız; argüman/pipe/env kabul etmez (shell geçmişine düşmez); mevcut değişkenler korunur; yinelenen değişken varsa durur; mevcut B2 anahtarı yalnızca açık "evet" onayıyla değiştirilir; geçici dosya 0600 + atomik yer değiştirme; değer yazdırmaz. Gizli değerler sohbette istenmez. Client bundle canary kontrolüne B2 değişken adları/değerleri eklendi.

### D-099 — Yapısal PDF doğrulaması: pdf.js + nesne düzeyi tarama, izole worker
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** Yapısal doğrulama antivirüs değildir; gerçek PDF üreticileriyle uyumluluk ve yanlış ret oranı henüz doğrulanmadı; PB-05 açık. · TD-06'yı çözer; OD-07, BR-41
- **Decision:** `pdfjs-dist` **6.5.438** (Mozilla, Apache-2.0, bakımı süren; Node `>=22.13 || >=24`; isteğe bağlı native `@napi-rs/canvas` kurulmaz — `ignoredOptionalDependencies`; render yok). Değerlendirilip seçilmeyen: `pdf-lib` 1.17.1 (2021'den beri yayın yok), `@cantoo/pdf-lib`/`@pdfme/pdf-lib` (SVG/HTML ek bağımlılıkları, xref'i yok sayan ayrıştırıcı), `mupdf` (AGPL). Üç katman (hepsi geçmeli, fail-closed): (1) zarf — ilk baytta `%PDF-1.0…1.7|2.0` (önünde içerik → `NOT_PDF`, polyglot), son 1024 baytta `%%EOF`, `startxref` ofseti bir xref tablosunu (girdi biçimi + `trailer` + `/Root`) veya xref stream nesnesini (`/XRef`, `/Root`) gösterir; (2) nesne düzeyi ad taraması — tüm dosya ve FlateDecode **nesne akışları (ObjStm)** PDF sözdizimine göre taranır (yorum, dize ve diğer akış içerikleri atlanır; `#xx` kaçışları çözülür; dolaylı referanslar dahil her nesne taranır); yasaklı adlar: `/Encrypt` → `ENCRYPTED`; `/EmbeddedFile(s)`, `/FileAttachment` → `EMBEDDED_FILE`; `/JavaScript`, `/JS`, `/Launch`, `/SubmitForm`, `/ImportData`, `/GoToR`, `/GoToE`, `/RichMedia`, `/RichMediaExecute`, `/XFA`, `/Rendition`, `/Movie`, `/Sound` → `ACTIVE_CONTENT`; desteklenmeyen ObjStm kodlaması (predictor, dolaylı/çoklu/Flate dışı filtre) → `MALFORMED`; (3) pdf.js tam ayrıştırma — katalog, sayfa ağacı (her sayfa yüklenir), şifre (`PasswordException` → `ENCRYPTED`), ekler, belge/sayfa JavaScript eylemleri, açıklama türleri (`FileAttachment`, `RichMedia`, `Screen`, `Movie`, `Sound`), widget eylemleri, XFA. **`/OpenAction` ve `/AA` tek başına ret sebebi değildir** (ofis çıktılarında sayfa hedefi olarak yaygın); içerdikleri eylem türü yasaklıysa reddedilir. `/URI` bağlantıları kabul edilir. **İzolasyon:** her doğrulama ayrı `worker_threads` worker'ında — `resourceLimits` (eski nesil 256 MB, genç 32 MB, yığın 4 MB), 20 sn süre sınırı (aşılırsa `terminate` → `RESOURCE_LIMIT`), `env: {}` (worker hiçbir secret'ı göremez), `execArgv: []`; ağ/eval/sistem fontu/XFA/akış/aralık yükleme kapalı. Sınırlar: 2 000 sayfa, 100 000 nesne, 64 MiB açılmış ObjStm, 64 iç içe derinlik. Worker Next.js paketine `new Worker(...)` girişiyle alınır; pdf.js `serverExternalPackages` ile paketlenmez ve worker modülü açıkça yüklenir (paketlenmiş pdf.js kendi worker dosyasını bulamıyordu — E2E ile yakalandı). Beklenmeyen ayrıştırıcı hatası `MALFORMED` (yalnızca hata adı loglanır).
- **Sınırlar (dürüst beyan):** antivirüs değildir; görüntüleyici açıklarını, imza tabanlı zararlıları, ad taramasının göremediği yöntemleri tespit etmez; ad taraması içerik akışlarındaki metni taramaz (nesne değildir); yanlış pozitif (meşru PDF'in reddi) gerçek belge örnekleriyle ölçülmedi (PHASE 12).

### D-100 — Yükleme taşıması: ham PDF gövdesi → kimlik doğrulamalı Route Handler
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** Production hosting en az 10 MiB PDF + gerekli istek ek yükünü desteklemeli; proxy dışındaki dosya route'larında kimlik, yetki, köken, CSRF ve güvenlik başlığı kontrolleri korunmalı. · D-017'nin yerine geçer
- **Decision:** `POST /api/documents/[requirementId]/file` (personel) ve `POST /api/portal/[context]/documents/[requirementId]/file` (müşteri); gövde = ham PDF (`Content-Type: application/pdf`; multipart yok → çok parçalı ek yük ile dosya sınırı karışmaz), `?expectedVersion=` (evrak sürümü), görünen ad `X-Upload-Filename` (URL kodlu; kişisel veri URL'ye yazılmaz). Sıra: köken (Origin zorunlu = APP_URL; CSRF) → kimlik (personel `getCurrentStaff()` / müşteri `requireCustomerAccess(context)`) → Zod → ad → içerik türü + `Content-Length` zorunlu ve 1…10 485 760 → aktör başına rate limit (30/saat yükleme, 120/saat görüntüleme — Postgres sayaç) → kilitsiz ön kontrol (kapsam, BR-44, sürüm, kota; gövde okunmadan) → sınırlı eşzamanlılık (süreç başına 4; en fazla 16 bekleyen, 30 sn; aksi 503) → gövdenin sınırlı okunması (gerçek bayt sayısı; beyan edilenle uyuşmazlık/aşma → ret; 120 sn süre; istemci kopması) → doğrulama → yaşam döngüsü (D-103). Bellek: en fazla beyan edilen boyut kadar tampon (geçici dosya yok). **Proxy bu yolları kapsamaz:** Next.js proxy istek gövdesini belleğe alır ve 10 MB üstünü sessizce keser (`proxyClientMaxBodySize`, node_modules/next/dist/docs) — PDF kesik dosyaya dönüşmesin; köken/kimlik/başlıklar route içinde. Server Action gövde sınırı değiştirilmedi. Presigned/doğrudan tarayıcı yüklemesi yok (CORS kapalı kalır). İstemci: `XMLHttpRequest` + `upload.onprogress` (gerçek aktarım yüzdesi); aktarım bitince "Sunucuda doğrulanıyor ve kaydediliyor"; "Yüklendi" yalnızca başarılı yanıttan sonra; buton yükleme boyunca pasif.
- **Hosting uyumu:** 10 MiB gövde kabulü PHASE 13 için **zorunlu uyumluluk kriteri** (ör. Vercel Functions 4.5 MB gövde sınırı bu tasarımla uyumsuzdur — varsayılmadı).

### D-101 — Depolama kotası (sıfır maliyet koruması)
- **Partially Superseded by OD-26 / D-140 (2026-11-27):** 8 GB uyarı / 9 GB sınır değerleri ve "kart/ödeme bilgisi eklenmeyecek" koşulu yerine hedef 90 GB / 100 GB; kullanım hesabı (aktif + önceki + devam eden + temizlik bekleyen + kayıt dışı), atomik rezervasyon ve diğer hükümler aynen geçerli.
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** 8 GB uyarı / 9 GB sınır kabul; gerçek sağlayıcının kota aşımı hata davranışı doğrulanmadı; kullanıcı kart/ödeme bilgisi eklemeyecek.
- **Decision:** Kullanım = `blob_deleted_at IS NULL` olan tüm dosya kayıtlarının `size_bytes` toplamı (aktif + önceki versiyonlar + devam eden rezervasyonlar + temizlik bekleyen başarısız/yarım yüklemeler) + `storage_quota_state.untracked_bytes` (mutabakatta bulunan kayıt dışı/sahipsiz/yinelenen fiziksel versiyonlar). Yeni yükleme `toplam + boyut ≤ STORAGE_MAX_TOTAL_BYTES` ise kabul (sınır dahil); aksi `507 QUOTA_EXCEEDED` ("Depolama kapasitesi dolu…"). Atomiklik: rezervasyon transaction'ı tek satırlık `storage_quota_state` satırını `FOR UPDATE` kilitler (kilit sırası applications → requirements → files → storage_quota_state; aktivasyon kota kilidi almaz) → iki paralel yükleme aynı boş kapasiteyi kullanamaz. Kota durumu satırı yoksa hesap güvenilir değildir → yükleme durur. 8 000 000 000 bayt uyarı, 9 000 000 000 bayt sınır (env yalnızca daha düşük). Mevcut dosyalar kota nedeniyle silinmez veya erişime kapatılmaz. Dashboard kapasite kartı yalnızca DB'den (sayfa açılışında sağlayıcı çağrısı yok); "uygulama hesabı, sağlayıcı faturalama verisi değildir" notu ve son mutabakat zamanı. Müşteri panelinde şirket kapasitesi gösterilmez. **Uygulama kotası ve hesap cap'leri tüm olası ücretleri kesin olarak önlediğini garanti etmez** (cap davranışı/gecikmesi sağlayıcıya bağlıdır — "değişiklikler 10 dakikaya kadar sürebilir").

### D-102 — Sağlayıcı versiyon kimliği ve migration 0005
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** `storage_quota_state` ve `storage_version_id` kabul; ON DELETE CASCADE değişiklikleri gelecekteki fiziksel dosya silme sürecini bozmamalı — PHASE 10'da storage nesneleri silinmeden ilgili metadata kaybedilmemeli.
- **Decision:** Migration `0005_storage_b2`: (a) `application_document_files.storage_version_id text` (1–255; `ACTIVE` için zorunlu — CHECK): görüntüleme tam bu fiziksel versiyonu okur, temizlik versiyona özgü siler; (b) `storage_quota_state` (tek satır `id = 1`, `untracked_bytes bigint ≥ 0`, `reconciled_at`, `updated_at` trigger'ı; runtime rolüne yalnızca `SELECT, UPDATE`); (c) `app_doc_files_access_token_fk` ve `app_status_history_access_token_fk` **ON DELETE CASCADE** ile yeniden tanımlandı — NO ACTION, başvuru silmede zincirleme silmeyi müşteri yüklemesi varsa düşürüyordu (izole integration teardown ile yakalandı); token satırları yalnızca başvuruyla birlikte silinir (runtime rolünün token DELETE yetkisi yok). `blob_pathname` kolon adı korunur (artık sağlayıcıdan bağımsız nesne anahtarı). Yeni enum değeri yok. Önce izole Docker ortamında uygulandı ve test edildi.

### D-103 — Atomik yükleme yaşam döngüsü ve hata kurtarma
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · BR-42…BR-48, BR-70…BR-72, BR-90/91
- **Decision:** `src/features/documents/service.ts`: (1) doğrulama + SHA-256 (sunucuda gerçek baytlardan; istemci/ETag'e güvenilmez); reddedilen dosya storage'a hiç yazılmaz, kayıt oluşmaz, `DOCUMENT_VALIDATION_REJECTED` audit'i (gerekçe kodu); (2) **rezervasyon** — kısa TX: başvuru/evrak `FOR UPDATE`, müşteri token'ı aktif + oturum süresi, BR-44, `expectedVersion`; evrak başına devam eden yükleme: süresi dolmamışsa `409 UPLOAD_IN_PROGRESS`, dolmuşsa `EXPIRED` (BR-43'ün sunucu üzerinden yükleme uygulaması — paralel iki yükleme asla iki ACTIVE üretmez); kota kilidi; yeni `fileId` + UUID anahtar; `UPLOAD_PENDING` (boyut + SHA-256, 15 dk süre); (3) **storage yazımı** TX dışında; `AMBIGUOUS` → kör yeniden yazma yok, HEAD ile boyut eşleşirse o versiyon kullanılır, aksi `EXPIRED`; `LIMIT` → `503` + yeniden deneme yok; versiyon kimliği yoksa aktifleştirilmez; (4) **aktivasyon** — kısa TX, aynı kilit sırası: başvuru silinmiyor, müşteri token'ı hâlâ aktif ve oturum süresi dolmadı, BR-44/45, `expectedVersion`, rezervasyon hâlâ `UPLOAD_PENDING` → eski ACTIVE → `SUPERSEDED` (bitiren aktör), yeni → `ACTIVE` (v = max+1, `storage_version_id`), evrak statüsü (`UPLOADED`; `UNDER_REVIEW`'da personel → `PENDING_REVIEW`), evrak `version + 1`, audit `DOCUMENT_UPLOADED`/`DOCUMENT_REPLACED` (personelde `onBehalfOfCustomer`), onaylı evrak değiştirilince ek `DOCUMENT_APPROVAL_INVALIDATED {from: APPROVED, to: PENDING_REVIEW}` — eski inceleme kayıtları değişmez (BR-48, BR-57); durum değiştiyse `REJECTED (STATE_CHANGED)` + audit + nesne en iyi çabayla silinir; (5) başarı yalnızca commit sonrası. Aktivasyon hatası (audit dahil) → tam geri alma; sonuç belirsizse DB durumu yeniden okunur (ACTIVE ise başarı; aktif olabilecek nesne silinmez); `UPLOAD_PENDING` kalmışsa `EXPIRED` + `DOCUMENT_UPLOAD_FAILED`. Eski aktif dosya her hata yolunda korunur. `VALIDATING` statüsü bu akışta kullanılmaz (enum'da kalır). **Kaldırma** (BR-44 "kaldır", D2/D8, `REMOVED`) bu fazda uygulanmadı — PHASE 09'a ertelendi.

### D-104 — Dosya görüntüleme/indirme
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** Yetkili görüntüleme/indirme kabul; Range desteği, gerçek cihaz doğrulaması ve güvenli PDF görüntüleyici izolasyonu açık; hassas PDF'ler public CDN/paylaşılan önbellekte saklanmaz. · TD-12'yi kısmen çözer; FILE_STORAGE §3
- **Decision:** Ayrı yollar: `GET /api/files/[fileId]` (yalnızca personel oturumu; ACTIVE/SUPERSEDED/REMOVED) ve `GET /api/portal/[context]/files/[fileId]` (yalnızca müşteri oturumu + bağlam; yalnızca oturum başvurusunun ACTIVE dosyası). Aynı tarayıcıda iki cookie olsa da her yol yalnızca kendi kimliğini okur. Yetki + dosya/başvuru durumu + token aktifliği → audit (`DOCUMENT_VIEWED`/`DOCUMENT_DOWNLOADED`, storage okumasından önce) → `GetObject(key, versionId)` → akış (base64/tam tampon yok); sağlayıcı boyutu kayıttan farklıysa sunulmaz (`502 INTEGRITY`). Başlıklar: `application/pdf`, güvenli `Content-Disposition` (ASCII yedek + `filename*` UTF-8; CR/LF/tırnak üretilmez), `nosniff`, `private, no-store`, `no-referrer`, `X-Frame-Options: DENY`, `CORP: same-origin`; CSP — indirmede `default-src 'none'; sandbox; frame-ancestors 'none'`, satır içinde `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` (tarayıcının yerleşik görüntüleyicisi için `sandbox` yok; yalnızca yeni sekmede üst düzey belge — uygulama genelindeki CSP/frame-ancestors zayıflatılmadı). Range desteklenmez (`Accept-Ranges: none`): tarayıcı tüm dosyayı bir kez indirir (≤ 10 MiB); bant genişliği etkisi kabul edildi. Ham sağlayıcı URL'si, anahtar, nesne anahtarı veya imzalı URL istemciye gönderilmez. PDF.js görüntüleyici eklenmedi. **Gerçek tarayıcılarda (iOS Safari, Android Chrome, WhatsApp in-app) satır içi görüntüleme doğrulanmadı.**

### D-105 — Mutabakat ve teknik temizlik komutları
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · **Koşullar:** Versiyona özgü fiziksel silme canlı B2 testiyle doğrulandı; reconcile/cleanup'ın gerçek sağlayıcıdaki kapsamlı hata/kurtarma senaryoları doğrulanmadı; otomatik başarılı evrak silme yok. · TD-10'u (PHASE 08 kısmı) çözer
- **Decision:** `pnpm storage:reconcile [--apply]` — bucket'taki fiziksel versiyonları (en çok 50 sayfa, Class C) DB ile karşılaştırır; sahipsiz anahtar, önek dışı nesne, yinelenen versiyon, silme işareti, kayıtlı ama bulunamayan nesne sayar; `--apply` yalnızca `untracked_bytes` + `reconciled_at` yazar (hiçbir nesne silinmez) + audit `STORAGE_RECONCILED` (SYSTEM). `pnpm storage:cleanup [--apply]` — varsayılan dry-run; `--apply`: süresi dolmuş `UPLOAD_PENDING` → `EXPIRED` (koşullu güncelleme), `EXPIRED`/`REJECTED` kayıtların tüm fiziksel versiyonları versiyona özgü silinir ve listede kalmadığı doğrulanınca `blob_deleted_at`; kayıtlı dosyaların kayıtlı versiyon dışındaki yinelenen versiyonları silinir (kayıtlı versiyon listede yoksa o anahtara dokunulmaz); sahipliği doğrulanmamış nesneler yalnızca raporlanır; liste eksikse silme yok; başarısız silme yeniden denenebilir kalır; audit `TECHNICAL_CLEANUP_EXECUTED` (SYSTEM, yalnızca sayılar). ACTIVE/SUPERSEDED/REMOVED kayıtlı versiyonları asla silinmez. Ücretli cron/worker yok; çalıştırma elle (planlı bakım PHASE 10/13). Müşteri verisi saklama/silme politikası değildir.

### D-106 — Dosya testleri mimarisi
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu) · D-077, D-094'ü genişletir
- **Decision:** Otomatik testler gerçek B2 kullanmaz ve B2 anahtarı gerektirmez: izole betik her koşu için proje dışı geçici depolama kökü oluşturur (`STORAGE_PROVIDER=local`), B2 değişkenlerini boşaltır, çıkışta kökü siler; `ISOLATED_TEST_DB=1`/`NODE_ENV=test` iken B2 yapılandırması reddedilir. PDF'ler test sırasında sentetik üretilir (`tests/support/pdf-fixtures.ts`; repoda ikili fixture yok). Kota testleri test başına küçük kota değerleriyle (gerçek 8/9 GB yükleme yok). Hata senaryoları adapter sarmalayıcılarıyla (uygulamada test bypass'ı yok). Gerçek B2 yalnızca elle çalıştırılan `pnpm storage:verify` ile (≈10 API çağrısı; yalnızca `_verification/` altında kendi nesnesi; tüm versiyonları silinir; bucket listelenip toplu silme yok). GitHub CI gerçek Backblaze hesabı kullanmaz (canary değerler).

### D-107 — SHA-256 ve bütünlük
- **Date:** 2026-11-25 (PHASE 08) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 08 sonu)
- **Decision:** Her kabul edilen PDF için SHA-256 sunucuda gerçek baytlardan hesaplanır ve kaydedilir (audit'e yazılmaz). B2 ETag'i SHA-256 veya kesin içerik doğrulaması sayılmaz; yalnızca tek parçalı ETag biçimi MD5 ise ek karşılaştırma. Yazma bütünlüğü ayrıca SigV4 yük imzası ve SSE yanıtıyla; görüntülemede ikinci tam indirme yapılmaz, sağlayıcı boyutu kayıtla karşılaştırılır (uyuşmazlık → sunulmaz, log). Tam içerik doğrulaması gerekiyorsa `storage:verify` benzeri kontrollü prosedür (şüphe durumunda) — otomatik periyodik doğrulama yok.

### D-108 — Başvuru state machine uygulaması (T1–T12)
- **Date:** 2026-11-25 (PHASE 09) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · STATE_TRANSITIONS §1.2, BR-50…BR-62
- **Decision:** Tek saf domain modülü `src/features/applications/domain/application-status.ts`: `TRANSITIONS` tablosu (kaynak statüler, hedef, gerekçe, müşteri izni), `submissionBlockers` (BR-50/51), `requestRevisionBlockers` (BR-59), `approveDocumentsBlockers` (BR-60), `staffActions` (UI). Sunucu mutasyonları aynı fonksiyonları kilit altında gerçek kayıtlarla (aktif dosya, süresi dolmamış bekleyen yükleme) yeniden çağırır. **Hedef statü istemciden alınmaz:** istemci yalnızca aksiyon kodu gönderir (Zod enum; `SUBMIT/RESUBMIT` personel tarafında ayrı aksiyon); T8 hedefi son `→ CANCELLED` geçmiş kaydının `from_status`'u. Geçişler manueldir (BR-61): son evrak onaylanınca otomatik `DOCUMENTS_APPROVED` YOK — personel "Evrakları Onayla" (T3); düzeltme kararları evrak bazında, başvuru "Düzeltmeye Gönder" (T2) ile `REVISION_REQUIRED` olur. Matriste olmayan geçiş `NOT_ALLOWED`. Keyfî statü seçimi (dropdown) yok; pasif aksiyonlar nedenleriyle gösterilir. **Yorum (ürün kuralı eklemez):** zorunlu evrakı olmayan hizmette BR-50 koşulları boş kümede sağlanır → gönderim izinli (dokümandaki kural metni; yeni politika eklenmedi).
- **Doğrulama:** unit (12 geçişin kaynak/hedef/gerekçe/aktör tablosu, 7 statüde sunulan aksiyonlar, guard'lar); izole integration (ana akış T1→T2→T4→T3→T5→T6→T9→T7→T8, matris dışı ret); E2E.

### D-109 — Evrak kararı ve dosya kaldırma
- **Date:** 2026-11-25 (PHASE 09) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · BR-44, BR-55…BR-58, D2, D4–D8, D10
- **Decision:** `src/features/documents/domain/document-status.ts`: `reviewTarget` (yalnızca `UNDER_REVIEW`; `PENDING_REVIEW → APPROVED/REVISION_REQUIRED`, karar değişikliği `APPROVED ↔ REVISION_REQUIRED`; aynı karar tekrar verilemez), `canRemoveFile` (BR-44 "kaldır": `AWAITING_DOCUMENTS`'ta `UPLOADED`, `REVISION_REQUIRED`'da `UPLOADED`/`REVISION_REQUIRED`; müşteri = personel; `UNDER_REVIEW` ve sonrası yok; `APPROVED`/`PENDING_REVIEW` hiçbir zaman), `documentStatusAfterRemoval` (D2, D8). Karar girdisi `{requirementId, fileId, expectedVersion (evrak sürümü), decision, customerMessage?}`; sunucu kilit altında `fileId`'nin hâlâ ACTIVE dosya olduğunu doğrular (BR-57) — eski versiyona verilen karar reddedilir ("Bu evrak inceleme sırasında değiştirilmiş…"). Review kaydı değiştirilemez; düzeltme açıklaması 10–1000 (müşteriye görünür). Kaldırma: dosya `ACTIVE → REMOVED` (fiziksel silme yok; geçmişte ve kotada kalır; müşteri erişemez, personel geçmişten erişir); kaldırma onay penceresi ister (UX; gerekçe yok). Audit `DOCUMENT_APPROVED`, `DOCUMENT_REVISION_REQUESTED`, `DOCUMENT_DELETED` (`{fileId, requirementId, versionNumber, from, to}`).

### D-110 — İş akışı transaction'ları, eşzamanlılık ve idempotency
- **Date:** 2026-11-25 (PHASE 09) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · BR-53, BR-90, BR-91
- **Decision:** `src/features/workflow/service.ts`: her işlem tek transaction — başvuru `FOR UPDATE` (silme sürecinde değil) → müşteri token'ı + oturum süresi (kilit altında) → `expectedVersion` (başvuru veya evrak sürümü) → evraklar `FOR UPDATE` (id sırasıyla) → dosyalar → guard → yazma → statü geçmişi → audit. Kilit sırası applications → requirements → files (yükleme, bağlantı iptali/yenileme ile uyumlu: hepsi önce başvuru satırını kilitler). Başvuru `version` her statü geçişinde artar; evrak `version` her kararda/kaldırmada. **Idempotency:** gönderim/karar/geçiş/yeniden açma tekrarında sürüm veya statü kontrolü reddeder (yan etki yok; BR-53 "Başvurunuz zaten incelemede"); yarışlarda tam olarak biri başarılı olur. Yorumlarda bilinçli tekrar engellenmez (çift tıklama UI kilidiyle önlenir; istemci idempotency anahtarı yok — mevcut tabloda alan yok, migration eklenmedi). Seri hale getirme/kilitlenme hataları (40001/40P01/55P03) "durum değişmiş" olarak döner; otomatik yeniden deneme yok. İptal (T7): devam eden yüklemeler `EXPIRED` (aktivasyon reddedilir; nesne teknik temizlikte); dosyalar, evrak statüleri, kararlar ve bağlantı değişmez. Transaction içinde storage/PDF çağrısı yok.

### D-111 — Müşteri iş akışı giriş noktası (D-095 tamamlandı)
- **Date:** 2026-11-25 (PHASE 09) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı)
- **Decision:** Müşteri Server Action'ları `src/features/customer-portal/actions.ts` (`submitForReviewAction`, `removeOwnFileAction`) yalnızca `{contextId, expectedVersion[, fileId]}` alır (Zod `.strict()`; `applicationId`, aktör, statü yok) ve dar giriş noktası `src/features/workflow/customer-entry.ts`'yi çağırır: `requireCustomerAccess(contextId)` → aktör (başvuru yalnızca oturumdan) → servis (kilit altında token/süre yeniden). Bağlam uyuşmazlığı → "Bu sayfa artık güncel değil… İşlem yapılmadı."; iptal/yenileme/süre → "Oturumunuz sona erdi…". Personel oturumu müşteri yolunda okunmaz. Müşteri modülü ESLint sınırı korunur (personel auth/audit/token/iç not erişimi yok). Köken: proxy + Next.js Server Action kontrolü.
- **TM-40:** görüntüleme (PHASE 07), dosya yükleme/erişim (PHASE 08) ve iş akışı mutasyonu (gönderim — E2E; kaldırma ve başka başvuru kaynağı — integration) kapsamında doğrulandı.

### D-112 — Müşteriye görünür yorumlar ve herkese açık süreç geçmişi
- **Date:** 2026-11-25 (PHASE 09) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · BR-120…BR-123, STATE_TRANSITIONS §1.4
- **Decision:** `document_comments` (mevcut tablo): yalnızca personel yazar (iki hesap eşit); müşteri **yazamaz** (BR-122) — salt okunur "CS Global'den mesajlar" (yazar/personel bilgisi gösterilmez). Düz metin 1–2000, satır sonları korunur, kontrol karakteri reddi, HTML render edilmez; düzenleme/silme yok; statü değiştirmez; audit `DOCUMENT_COMMENT_ADDED {id, requirementId?}` (metin yok). Müşteri süreç geçmişi yalnızca statü + tarih (gerekçe, aktör, personel adı yok); iptal gerekçesi personel içidir (müşteriye gösterilmez). Personel zaman çizelgesi: geçiş etiketi, hedef statü, aktör ("Müşteri"/kullanıcı adı, "müşteri adına"), gerekçe. İç notlar (`application_internal_notes`) bu fazda yok (PHASE 10).

### D-113 — Müşteriye görünür yorumlarda sunucu/veritabanı düzeyi idempotency (migration 0006)
- **Date:** 2026-11-25 (PHASE 09.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · D-112'yi tamamlar; PHASE 06 `applications.idempotency_key` desenini izler
- **Context:** PHASE 09'da yorumlar yalnızca istemci buton kilidiyle korunuyordu; ağ tekrarı mükerrer yorum + audit üretebiliyordu.
- **Decision:** Migration `0006_comment_idempotency` (yalnızca ekleme): `document_comments.idempotency_key uuid UNIQUE` + `payload_hash text` (SHA-256; anahtar ile birlikte dolu/boş CHECK; biçim CHECK). Runtime yetkileri değişmedi (SELECT, INSERT — append-only korunur). `addCommentAction` girdisi `idempotencyKey` (UUID, zorunlu). Servis: başvuru kilidi + yetki/silinme kontrolü HER istekte önce; `payload_hash = SHA-256([applicationId, requirementId, authorUserId, body])`; `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` → eklendiyse audit aynı transaction'da; eklenmediyse mevcut kayıt okunur: hash eşitse aynı `commentId` (`created: false`, yeni yorum/audit yok), farklıysa genel `CONFLICT` ("Bu işlem başka bir istekle çakıştı…" — diğer işlemin kimliği/sonucu döndürülmez). Kapsam = doğrulanmış personel + başvuru + evrak + metin (hash'te); farklı hesap/başvuru aynı anahtarı kullanamaz. Metin üzerinden global tekilleştirme yok (aynı metin yeni anahtarla yeni yorum). İstemci: her mantıksal gönderimde `crypto.randomUUID()`; ağ hatasında aynı metin için anahtar korunur, başarıda veya metin değişince yenilenir. Audit hatası → tam geri alma; aynı anahtarla güvenli tekrar.
- **Doğrulama:** izole integration (sıralı tekrar; kilit altında sıraya giren 4 eşzamanlı istek; farklı başvurularda eşzamanlı aynı anahtar → veritabanı UNIQUE; farklı metin; aynı metin farklı anahtar; başka personel; silinmekte başvuruda tekrar; tetikleyiciyle zorlanan audit hatası + tekrar); unit (şema); E2E (çift tıklama → tek yorum).

### D-114 — Eşzamanlılık test yöntemi ve değiştirme ↔ karar yarışının sonucu
- **Date:** 2026-11-25 (PHASE 09.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-25 (PHASE 10 başlangıcı) · D-110'u tamamlar
- **Decision:** Yarış testleri bağımsız PostgreSQL bağlantıları ve kontrollü araya girmeyle yapılır: ayrı bir "kilit tutucu" bağlantı başvuru satırını `FOR UPDATE` tutar, yarışan işlemler ayrı havuz bağlantılarında başlatılır, `pg_stat_activity` ile gerçekten kilit beklediği doğrulanır, sonra kilit bırakılır; storage yazımı geçitli adapter ile durdurularak yükleme aşamaları arasına girilir. Yalnızca sıralı `Promise` yürütmesi yarış kanıtı sayılmaz. **Gözlenen ve kabul edilen davranış (yeni kural değil — BR-90 iyimser kilit):** personel dosya değiştirmesi storage yazımındayken aynı evraka karar verilirse evrak sürümü değiştiği için aktivasyon `REJECTED (STATE_CHANGED)` olur; eski (onaylı) dosya ve karar korunur; personel yeniden denediğinde yeni versiyon aktive olur ve onay devralınmaz (BR-48). Hiçbir sırada onay yanlış dosyaya geçmez.

---

### D-115 — Şirket içi notlar: sunucu/veritabanı düzeyi idempotency (migration 0007)
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · BR-120…BR-123; D-113 desenini yeniden kullanır
- **Decision:** `application_internal_notes.idempotency_key uuid UNIQUE` + `payload_hash text` (SHA-256 [başvuru, evrak, yazar, metin]; ikisi birlikte dolu/boş — CHECK). Ortak özet `src/server/idempotency/payload-hash.ts` (`textPayloadHash`; yorumlar aynı fonksiyonu kullanır, çıktı değişmedi). `addInternalNote`: başvuru `FOR UPDATE` (silme sürecinde değil) → evrak kapsamı → `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` → çakışmada aynı özet ise mevcut sonuç (`created:false`, yeni audit yok), aksi genel `CONFLICT` (diğer kaydın kimliği/içeriği ifşa edilmez) → audit `INTERNAL_NOTE_ADDED {id}` aynı transaction'da (metin yok; audit hatası → tam geri alma). Aynı metin + yeni anahtar = yeni not. İstemci anahtarı ağ hatasında korur, başarıda/metin değişince yeniler; hata sonrası metin silinmez. Notlar her başvuru statüsünde (COMPLETED/CANCELLED dahil) eklenebilir — BR-120…123 statü kısıtı koymaz; yeni terminal statü politikası icat edilmedi. Statü değişmez. Düzenleme/silme yok (BR-123). Liste sınırlı (en yeni 50 + toplam). Düz metin 1–5000 (DB CHECK ile aynı), kontrol karakteri reddi, satır sonu normalize. Müşteri görünürlüğü istemci bayrağıyla değil ayrı tablo + modül sınırıyla (ESLint: müşteri modülleri `@/features/internal-notes/*` içe aktaramaz).

### D-116 — Kalıcı başvuru silme: kalıcı durumlu, sınırlı ve sürdürülebilir iş akışı (migration 0007)
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · Zamana dayalı sonlandırma (madde 2) D-124 ile geçersizdir; yeniden etkinleştirilmez. · **Partially Superseded by D-124** (PHASE 10.1, 2026-11-26): madde 2'deki zamana dayalı bekleme kapısı (`settle_after = max(upload_expires_at) + 5 dk`) ve "artık risk" kabulü geçersiz — sonlandırma artık yalnızca kalıcı yazım girişimi kanıtlarıyla; `settle_after` kolonu yalnızca bilgi amaçlı (talep zamanı). Diğer maddeler geçerli. · OD-06, OD-24, BR-150…BR-155, BR-47, D-036 (uygulaması), D-101/D-102/D-103 ile uyumlu
- **Decision:** Yeni tablolar: `application_deletions` (PK = başvuru, CASCADE; gerekçe [personel içi, audit'e yazılmaz], talep eden, `settle_after`, `inventory_completed_at`, `storage_verified_at`, deneme sayısı, `last_error` kodu, kira `lease_id`/`lease_expires_at`) ve `application_deletion_objects` (sahipliği doğrulanmış her fiziksel sağlayıcı versiyonu: anahtar, versiyon kimliği, boyut, silme işareti, dosya kimliği, `PENDING`/`DELETED`, deneme, son hata; UNIQUE (anahtar, versiyon)). Runtime rolüne `SELECT, INSERT, UPDATE` (DELETE yok; satırlar başvuruyla CASCADE silinir). Yeni başvuru statüsü YOK; silme durumu T1–T12'den ayrıdır (`deletion_requested_*` + işlem kaydı).
  1. **Talep** (kısa TX): başvuru `FOR UPDATE`, `expectedVersion`, başvuru numarası sunucuda karşılaştırılır, gerekçe zorunlu → `deletion_requested_at/by`, sürüm+1, işlem kaydı, aktif bağlantı `APPLICATION_DELETION` ile iptal, audit `APPLICATION_DELETION_REQUESTED {fileCount}`. Tekrar talep → mevcut tek işlem (`alreadyRequested`, audit yok). Anında kapananlar: müşteri erişimi/oturum değişimi/mevcut oturumlar, yükleme rezervasyonu/değiştirme/aktivasyon, karar, gönderim, geçişler (T7/T8 dahil — yeniden açma yok), yorum, iç not, bağlantı yönetimi, dosya görüntüleme/indirme.
  2. **Bekleme kapısı:** `settle_after = max(upload_expires_at) + 5 dk` (talepten önce rezerve edilmiş yüklemeler; başvuru kilidi altında yeni rezervasyon oluşamaz). Bu süre dolmadan ve süresi+payı dolmamış `UPLOAD_PENDING` varken storage çağrısı yapılmaz. Sonra kalan yarım yüklemeler `EXPIRED`. **Artık risk:** süre dolması sağlayıcının çok gecikmiş bir PUT'u sonradan işlemeyeceğinin matematiksel kanıtı değildir; bu nedenle son doğrulama listelemesi sonlandırmadan hemen önce yapılır ve sonlandırma sonrası olası geç nesne `storage:reconcile`/`storage:cleanup` tarafından sahipsiz anahtar olarak raporlanır (kotaya `untracked_bytes` ile dahil; otomatik silinmez).
  3. **Adım** (kira 120 sn, TX dışında ağ): `applications/{id}/` öneki (sondaki ayraçla) listelenir (adım başına ≤5 sayfa); her versiyonun sahipliği bu başvurunun dosya kaydıyla doğrulanır — başka kayda ait → `OWNERSHIP_CONFLICT`, hiçbir kayda ait değil → `UNKNOWN_OBJECT` (hiçbir şey silinmeden durur, manuel inceleme); envantere yazılır; en fazla 50 versiyona özgü `DeleteObject` sıralı (paralel değil); yeniden listeleme. `DELETED` yalnızca eksiksiz listelemede yokluğu görülen versiyona yazılır (silme yanıtı/“bulunamadı” kanıt değildir; yanıt kaybı listelemeyle çözülür). Adım başına ≤4 tur. Hata kodları: `STORAGE_UNAVAILABLE`/`STORAGE_LIMIT`/`LISTING_INCOMPLETE`/`VERIFICATION_PENDING`/`FINALIZATION_FAILED` (yeniden denenebilir), `STORAGE_FORBIDDEN` (yetki/Object Lock/politika)/`STORAGE_NOT_CONFIGURED`/`UNKNOWN_OBJECT`/`OWNERSHIP_CONFLICT` (manuel). Hata kategorisi değişince audit `APPLICATION_DELETION_FAILED {reason, count}`. Sınırsız yeniden deneme yok; sağlayıcı politikası otomatik değiştirilmez. B2 `NoSuchBucket` artık `NOT_CONFIGURED` (önceden `NOT_FOUND` — yokluk sayılması silme doğrulamasını yanıltırdı).
  4. **Sonlandırma** (kısa TX; yalnızca önek boş + liste eksiksiz): başvuru + işlem kaydı (kira sahipliği) kilidi, devam eden yükleme/`PENDING` nesne yok → dosya kayıtları `blob_deleted_at` → kota kilidi (sıra: applications → files → storage_quota_state) → `storage_verified_at` → başvuru satırı silinir (CASCADE) → audit `APPLICATION_DELETED {fileCount, count}`. Audit/trigger hatası → tamamı geri alınır, `FINALIZATION_FAILED`, yeniden denenebilir; tamamlanmış silmede tekrar çağrı yan etkisiz (`DELETED`, ikinci audit yok).
  - **Kota:** kullanım tek kaynak olan dosya metadata'sından hesaplandığı için yalnızca fiziksel yokluk doğrulandıktan sonra (sonlandırmada) ve tek kez düşer; mantıksal kaldırma/iptal/tamamlama kotayı düşürmez; kısmi silmede tutucu (kayıtlar sayılmaya devam eder); `untracked_bytes` bir sonraki mutabakata kadar değişmez (yanlış boş kapasite gösterilmez).
  - Arka plan işi/kuyruk/cron YOK: talep sonrası ilk adım hemen denenir; kalanlar personelin “Silme İşlemini Sürdür” isteğiyle (iki hesap eşit; eşzamanlı istek kiraya takılır → “meşgul”). İlerleme yalnızca DB'den (sayfa açılışında sağlayıcı çağrısı ve polling yok). Silme sürecindeki başvuru detayında yalnızca ilerleme gösterilir (müşteri bilgisi, evraklar, notlar, aksiyonlar yok); “Silme İşlemleri” kartı başvuru listesinde (yalnızca numara + ilerleme). Toplu silme, otomatik saklama/silme, tekil dosya kalıcı silme yok (BR-47: geçerli versiyonlar yalnızca başvuru silmeyle silinir).

### D-117 — Veritabanı düzeyi silme koruması (D-102 koşulu)
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-125 ile genişletilmiş hâliyle kabul. · **Partially Superseded by D-125** (PHASE 10.1): koruma fonksiyonu migration 0008'de genişletildi (yazım girişimi ve sonlandırma listelemesi koşulları). · D-102'nin “storage nesneleri silinmeden metadata kaybedilmemeli” koşulunu DB'de zorunlu kılar
- **Decision:** `applications_guard_delete` BEFORE DELETE trigger'ı (migration 0007): tablo sahibi rolün üyesi olmayan her rol (runtime dahil) için başvuru satırı yalnızca `deletion_requested_at` dolu, işlem kaydında `storage_verified_at` dolu, başvurunun hiçbir dosya kaydında `blob_deleted_at IS NULL` yok ve envanterde `PENDING` versiyon yokken silinebilir; aksi `55000`. Böylece doğrudan `DELETE FROM applications` (runtime kodu veya runtime kimlik bilgisiyle çalışan betik) storage iş akışını atlayıp dosya metadata'sını CASCADE ile kaybedemez. Tablo sahibi (migration/test temizliği) muaftır — sahip tetikleyiciyi zaten kapatabilir; mutlak koruma değildir. Append-only korumalar zayıflatılmadı; runtime rolüne yeni DELETE/TRUNCATE/DDL yetkisi verilmedi.

### D-118 — Kalıcı silme onayı ve kapsamı
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · BR-150, BR-151, BR-154, BR-155
- **Decision:** “Tehlikeli İşlemler” bölümünde ayrı yıkıcı buton; onay penceresi: başvuru numarası, kapsam, “Bu işlem geri alınamaz”, saklama yükümlülüğü uyarısı, yedek/sağlayıcı kopyalarının hemen silinmeyebileceği notu, zorunlu gerekçe (1–1000, personel içi) ve başvuru numarasının yazılması (BR-151'in mevcut sözleşmesi). İstemcide ön kontrol yalnızca kolaylık; sunucu numarayı gerçek kayıtla karşılaştırır, `expectedVersion` ve güncel silme durumunu doğrular; “onaylandı” bayrağı kabul edilmez (`.strict()`). “Başvuru kalıcı olarak silindi.” yalnızca sunucu `DELETED` döndürünce. Personel onayı hukuki uygunluğun teknik doğrulaması değildir. Tekil dosya/eski versiyon kalıcı silme UYGULANMADI: BR-47 geçerli versiyonların yalnızca başvuru silmeyle silinmesine izin verir; yetki genişletilmedi.

### D-119 — Merkezi işlem geçmişi (audit) ekranı
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · SECURITY §8, BR-154
- **Decision:** Route `/dashboard/audit-logs` (ROADMAP ve mevcut menü — “İşlem Geçmişi”; iki hesap aynı menü/ekran). Salt okunur: değiştirme/silme/temizleme/dışa aktarma yok; listeleme audit'e yazılmaz. Merkezi Türkçe etiket eşlemesi (`AUDIT_ACTION_LABELS`); koddaki her event'in etiketi unit testle zorunlu; bilinmeyen event “Diğer işlem”. Metadata yalnızca allowlist ile biçimlendirilir (durum geçişi, geçiş kodu, versiyon no, sayılar, gerekçe KODU, değişen alan ADLARI, “müşteri adına”); kimlikler, serbest metin, tanınmayan anahtar/değerler gösterilmez; ham JSON yok. Silinmiş başvuru “Başvuru artık mevcut değil” (bozuk bağlantı yok). Filtreler: tarih aralığı (gün bazında Europe/Istanbul, bitiş günü dahil; gerçek takvim günü + sıra doğrulaması), işlem türü, aktör türü, personel (iki hesap), kayıt türü, başvuru. URL'de yalnızca kişisel veri içermeyen değerler (başvuru UUID'si dahil); başvuru numarası Server Action ile UUID'ye çözülür (URL/geçmişe yazılmaz). Ad/telefon/e-posta/serbest metin araması yok. Sayfalama: `(occurred_at, id)` keyset (aynı zaman damgasında tekrar/eksik yok), “daha yeni/daha eski”, 10/20/50 (sunucu en fazla 50). Parametreli sorgular. Yeni index eklenmedi (mevcut `occurred_at`, `action`, `actor_user_id`, `application_id` index'leri; ihtiyaç ölçülmedi — PHASE 11 sorgu planları). Başvuru detayında “Bu Başvurunun İşlem Geçmişi” bağlantısı; statü geçmişi, evrak karar geçmişi ve audit ayrı kavramlar olarak korunur.

### D-120 — Teknik temizlik ile kalıcı silmenin kapsam ayrımı
- **Date:** 2026-11-25 (PHASE 10) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-105'i tamamlar
- **Decision:** `pnpm storage:cleanup` silme sürecindeki başvuruların dosya kayıtlarına ve nesnelerine dokunmaz (yarım yükleme EXPIRED'lama ve fiziksel silme dahil) — o nesneler yalnızca kiralı silme iş akışına aittir; UI ve CLI çakışan mutasyon üretmez. Varsayılan dry-run, ACTIVE/SUPERSEDED/REMOVED versiyonlarını asla silmeme ve sahipsiz nesneyi yalnızca raporlama kuralları aynen geçerli. `storage:reconcile` salt okunur sayım olarak tüm kayıtları kullanmaya devam eder. Yeni silme CLI'ı (`storage:deletion-*`) EKLENMEDİ: personel yetkilendirmesini atlayan yıkıcı bir yol açmamak için sürdürme yalnızca personel arayüzündedir (iki hesap eşit). Bucket genelinde purge veya toplu müşteri silme komutu yok; zamanlanmış başarılı evrak silme yok.

### D-121 — Dayanıklı storage yazım girişimi kimliği ve tek fiziksel girişim (migration 0008)
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-103'ü tamamlar; D-102 koşulu
- **Decision:** Yeni tablo `storage_write_attempts` (her fiziksel PUT girişiminin kalıcı kimliği: başvuru, dosya, nesne anahtarı, durum, sonuç kodu, versiyon kimliği, kabul/başlangıç/çözüm zamanı). Girişim, yükleme rezervasyonuyla AYNI transaction'da başvuru kilidi altında `ADMITTED` olarak açılır (silme işaretliyse rezervasyon zaten reddedilir). Durumlar: `ADMITTED`, `IN_PROGRESS`, `CONFIRMED`, `FAILED`, `FENCED`, `UNKNOWN`; çözülmüş = `CONFIRMED | FAILED | FENCED`. Dosya yaşam döngüsünden (`ACTIVE/EXPIRED/REJECTED…`) ayrı eksendir: dosyanın EXPIRED/REJECTED olması yazımın bittiğini kanıtlamaz. B2 adapter'ında PUT için ayrı S3 istemcisi `maxAttempts: 1` (SDK gizli yeniden denemesi kapalı); uygulama da kör yeniden yazma yapmaz (D-103) → **bir girişim = en fazla bir fiziksel versiyon**, anahtar dosyaya (girişime) özgü. Okuma/listeleme/silme idempotent olduğundan 2 denemede kalır. Runtime rolü: `SELECT, INSERT, UPDATE` (DELETE yok; satırlar başvuruyla CASCADE silinir). Tüm yazım giriş noktaları (müşteri/personel ilk yükleme ve değiştirme) aynı `uploadDocumentFile` hattından geçer.

### D-122 — Yazım kabulü ve silme çiti (write admission fencing)
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı)
- **Decision:** PUT gönderilmeden ÖNCE kısa bir koşullu güncelleme commit edilir: `ADMITTED → IN_PROGRESS` (`beginStorageWrite`; ayrıca başvuru silme işaretli değil). Silme talebi transaction'ı (başvuru kilidi altında) başvurunun tüm `ADMITTED` girişimlerini `FENCED (FENCED_BY_DELETION)` yapar. Satır kilidi iki işlemi sıraya koyar: ya yazım başlamıştır (silme bunu `IN_PROGRESS` olarak bilir ve sonucunu bekler) ya da çitlenmiştir (başlatma 0 satır günceller → PUT hiç gönderilmez). Kabulden sonra duraklayıp silmeden sonra uyanan işçi bu nedenle yazamaz (Test F). Süresi dolmuş rezervasyonun başlamamış girişimi `storage:cleanup --apply` ile `FENCED (RESERVATION_EXPIRED)` yapılır; bu süre varsayımı değil, kalıcı çittir (çitlenen girişim bir daha başlatılamaz). Uzun transaction içinde ağ isteği beklenmez. Dağıtık kilit/kira uzak sağlayıcıdaki yazımı durduramaz — bu nedenle çit yalnızca HENÜZ BAŞLAMAMIŞ girişimleri durdurur; başlamış girişim için tek güvenli yol sonucunu kanıtla çözmektir (D-123, D-124).

### D-123 — Kesin ve belirsiz sağlayıcı sonucu; gözlem ile çözüm
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · **Koşul:** Gerçek B2 davranışı ve listeleme–okuma tutarlılığı gerçek sağlayıcıda doğrulanmadı (açık). · B2 belgeleri 2026-11-26 incelendi (s3-put-object, S3 API giriş, entegrasyon kontrol listesi, dosya versiyonları, native hata kodları)
- **Belgelenen / belgelenmeyen:** B2 S3 PutObject sayfası hata yanıtında nesne oluşmadığını, atomikliği, istemci zaman aşımı/bağlantı kopması sonrası sunucu tarafı tamamlanma süre sınırını **belgelemez**; tek parça PUT için iptal API'si yoktur; listeleme/okuma tutarlılık modeli (read/list-after-write) **belgelenmemiştir**. Başarılı PutObject `x-amz-version-id` döndürür; versionId'li DeleteObject kalıcıdır.
- **Decision:** Kesin başarı = sağlayıcı versiyon kimliğiyle başarı (`CONFIRMED / PROVIDER_CONFIRMED`). Kesin başarısızlık YALNIZCA istek sağlayıcıya hiç ulaşmadığında: TCP bağlantısı kurulamadı/ad çözülemedi (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN` → `StorageError("NOT_SENT")` → `FAILED / NOT_SENT`) — ağ semantiği gereği sunucu baytları almamıştır. Diğer her durum **belirsiz** (`UNKNOWN`): zaman aşımı, bağlantı sıfırlama, yanıt kaybı (`RESPONSE_LOST`), sağlayıcı 4xx/5xx/cap yanıtı (`PROVIDER_ERROR` — B2 belgeleri garanti vermediği için), versiyon kimliği yok (`NO_VERSION_ID`), bütünlük uyuşmazlığı (`INTEGRITY_MISMATCH`). Süreç çökmesi girişimi `IN_PROGRESS`'te bırakır = belirsiz. Belirsiz girişim yalnızca **gözlemle** çözülür: girişimin anahtarında, hiçbir girişimce sahiplenilmemiş bir fiziksel versiyonun görülmesi (yükleme yolundaki HEAD, silme envanteri veya teknik temizlik listelemesi) → `CONFIRMED / OBSERVED`. Gerekçe: tek girişim en fazla bir versiyon üretir; anahtarda gözlenen sahiplenilmemiş versiyon sayısı çözülmemiş girişim sayısına ulaşınca o anahtara başka yazım gelemez. Bilinen bir versiyonun silinmesi diğer belirsiz girişimleri çözmez (Test G). Boş liste, süre, kira bitişi çözüm kanıtı DEĞİLDİR. DB trigger'ı `UNKNOWN → FAILED/FENCED` ("elle çözüldü") geçişini reddeder.

### D-124 — Zamandan bağımsız silme sonlandırması (fail-closed)
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-116 madde 2'yi geçersiz kılar
- **Decision:** Zamana dayalı bekleme kapısı kaldırıldı (`DELETION_UPLOAD_SETTLE_GRACE_SECONDS` silindi; `settle_after` = talep zamanı, bilgi amaçlı). Her adım: listeleme (başlangıç anı DB saatiyle `clock_timestamp()` kaydedilir) → sahiplik + envanter → gözlemle çözüm → girişimi çözülmüş yarım kayıtların EXPIRED yapılması → silme → doğrulama listelemesi. Sonlandırma ön koşulları (kısa TX, kilit altında): başvuru silme talebinde; kira bu isteğe ait; çözülmemiş girişim YOK (aksi `UPLOAD_OUTCOME_UNKNOWN` — başvuru, dosya metadata'sı, girişim kayıtları, kota ve müşteri erişimi kapalılığı korunur, tamamlama audit'i yazılmaz); yazım takibi olmayan dosya kaydı YOK (aksi `LEGACY_UNVERIFIED`, D-126); her girişim sonlandırmayı mümkün kılan eksiksiz boş listelemenin BAŞLANGICINDAN önce çözülmüş (aksi yeniden listelenir); onaylanmış her versiyon envanterde silinmiş görülmüş veya versiyona özgü HEAD ile yok bulunmuş (varsa envantere eklenip silinir); envanterde bekleyen versiyon yok; önek boş ve liste eksiksiz. Sonlandırma `final_listing_started_at`'ı kaydeder. Sürenin geçmesi hiçbir koşulu karşılamaz: sonuç kalıcı olarak kanıtlanamazsa başvuru **süresiz** kilitli kalabilir (kabul edilen fail-closed davranış). "Zorla Sil", "Kontrolü Atla" veya "işlem çözüldü" düğmesi YOKTUR. Çözüm için gereken kanıt: ilgili anahtarda sahiplenilmemiş fiziksel versiyonun görülmesi (sonra silinir) veya sağlayıcıdan girişimin sonucuna dair resmî kanıt + tablo sahibi yetkisiyle belgelenmiş teknik müdahale (uygulama dışı, audit'lenmeli; PHASE 12/13 prosedürü). **Varsayım (doğrulanmadı):** sağlayıcının listeleme/HEAD sonucu, yanıtı dönmüş yazımları ve silmeleri yansıtır (B2 tutarlılık modeli belgelenmemiş) — gerçek B2 doğrulaması PHASE 12.

### D-125 — Veritabanı koruması v2 ve durum makinesi trigger'ları
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-117'yi genişletir
- **Decision:** Migration 0008: (a) `applications_guard_delete()` yeniden tanımlandı — 0007 koşullarına ek: başvurunun çözülmemiş yazım girişimi yok; yazım girişimi olmayan dosya kaydı yok; işlem kaydında `final_listing_started_at` dolu ve hiçbir girişim o andan sonra çözülmemiş. (b) `storage_write_attempts_guard_update` (tüm roller): kimlik alanları değişmez; yalnızca `ADMITTED→IN_PROGRESS|FENCED`, `IN_PROGRESS→CONFIRMED|FAILED|UNKNOWN`, `UNKNOWN→CONFIRMED`; çözülmüş kayıtlar değişmez. CHECK'ler: `FAILED` ⇒ `NOT_SENT`; `CONFIRMED` ⇔ versiyon kimliği; çözüm zamanı ⇔ çözülmüş durum. (c) `applications_guard_deletion_flag`: silme işareti bir kez yazıldıktan sonra geri alınamaz/değiştirilemez (müşteri erişimi yeniden açılamaz). Runtime rolüne DELETE/TRUNCATE/DDL verilmedi. **Sınır:** DB dış sağlayıcıyı doğrulayamaz; koşullar uygulamanın ürettiği kalıcı kanıtlar ve değişmezler üzerinde çalışır — runtime kimlik bilgisine sahip bir saldırgan izinli geçişlerle (ör. sahte versiyon kimliğiyle `CONFIRMED`) kanıt taklit edebilir; bu, runtime kimlik bilgisinin korunmasına bağlıdır (TM-41/TM-42). Tablo sahibi trigger'ları kapatabilir (mutlak koruma değildir).

### D-126 — Yazım takibi olmayan (eski) dosya kayıtları
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı)
- **Decision:** Migration 0008 eski dosya kayıtları için girişim satırı **üretmez** (backfill yok); girişim satırı olmayan dosya kaydı "kanıtsız" sayılır: kalıcı silme `LEGACY_UNVERIFIED` (manuel inceleme) ile durur, teknik temizlik bu kaydı sonlandırmaz (`blob_deleted_at` yazılmaz, kotada kalır; nesneleri versiyona özgü silinebilir). Gerekçe: 0008 öncesi PUT'larda SDK 2 deneme yapabiliyordu ve girişim sayısı/sonucu bilinmiyor; otomatik "çözülmüş" kabulü güvensiz. Gerçek etki: `neondb`'de dosya kaydı 0 (veri parmak izi); test tohumları sentetik dosyalara açıkça `CONFIRMED` girişim ekler.

### D-127 — Kurtarma arayüzü, teknik temizlik ve eski not erişimi
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · **Koşul:** Kalıcı olarak çözülemeyen yazım girişimleri için teknik kurtarma prosedürü açık. · D-116, D-120, D-115'i tamamlar
- **Decision:** Silme ilerleme kartı çözülmemiş yazım sayısını ve "Silme işlemi güvenli şekilde bekletiliyor… Müşteri erişimi kapalıdır; başvuru kayıtları güvenlik amacıyla korunmaktadır." mesajını gösterir; "süre geçmesi kanıt sayılmaz" açıklaması; "Silme İşlemini Sürdür" yeni kanıt arar (gözlem/HEAD); sahte başarı yok; zaman kapısı metni kaldırıldı. `storage:cleanup --apply`: süresi dolmuş rezervasyonun `ADMITTED` girişimini çitler; başarısız/yarım kayıtların anahtarlarında sahiplenilmemiş versiyonları çözülmemiş girişimlere atar; `blob_deleted_at`'ı yalnızca kaydın tüm girişimleri listeleme başlamadan önce çözülmüşse yazar (aksi kayıt kotada kalır — `unresolvedWrites`); takipsiz kayıtları sonlandırmaz (`legacyUnverified`); varsayılan dry-run ve silme sürecindeki başvuruları atlama (D-120) korunur. Yeni rapor sayaçları: `reservationsFenced`, `attemptsResolved`, `unresolvedWrites`, `legacyUnverified`. Şirket içi notlarda en yeni 50'den eskiler "Daha eski notları göster" ile sınırlı keyset sayfalarıyla (`listOlderInternalNotesAction`, `requireStaff()`) erişilebilir; sınırsız sorgu yok.

### D-128 — Silme eşzamanlılığı kanıt yöntemi
- **Date:** 2026-11-26 (PHASE 10.1) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-114'ü genişletir
- **Decision:** Silme yarışları gerçek PostgreSQL bağımsız bağlantılarıyla test edilir: tutucu bağlantı hedef satırı (`applications`, `application_deletions` veya `storage_quota_state`) `FOR UPDATE` kilitler; işlemler SIRAYLA başlatılır ve her biri `pg_stat_activity`'de kilit beklerken bir sonraki başlatılır (kilit kuyruğu sırası = iki yön de deterministik test edilir); sonra kilit bırakılır. Değişmez: silme işaretinin audit kaydından SONRA yarışan işlemin etkisi (audit) commit edilmez; silme önce ise işlem reddedilir. Storage aşamaları araçlı sağlayıcıyla (PUT duraklatma, zaman aşımı + sonradan yazım, yazıp yanıt vermeden çökme) ve DB zaman alanlarını geriye alarak ("süre geçti") test edilir — gerçek zaman beklenmez, üretim kodunda test bypass'ı yoktur (yalnızca isteğe bağlı `beforeStorageWrite` zamanlayıcı bağımlılığı; güvenlik kararını değiştirmez).

### D-129 — Ortak (Neon) veritabanında test izolasyonu korumaları
- **Date:** 2026-11-26 (PHASE 10.2) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-077, D-086, D-067'yi tamamlar
- **Olay:** PHASE 10.1'de Neon'da da çalışan `privileges.test.ts`'e eklenen geri alınmayan bir INSERT, `neondb`'ye kalıcı `TEST_EVENT` audit kaydı yazdı (id 970, `metadata {}`, kişisel veri yok; audit 154 → 155). Kayıt append-only korumayı bozmamak için **korunur** (silinmedi, trigger kapatılmadı); 155 yeni geliştirme parmak izi tabanıdır. **Kök neden:** Neon'da çalışan test dosyalarının bağlantılarında kalıcı yazımı engelleyen mekanizma yoktu (yalnızca geliştirici disiplini); ayrıca `ISOLATED_TEST_DB=1` işareti yanlış (uzak) veritabanıyla birlikte verilirse `runIf` koruması olmayan mutasyon dosyaları çalışabilirdi (fail-open).
- **Decision:** (1) `tests/support/db-guard.ts`: izole OLMAYAN veritabanında tüm integration test bağlantıları (`connectRuntime`, `connectOwner`, `createRuntimePool`, `createTestDatabase`) ve E2E `runtimeDb` korumalıdır — transaction dışı yazma ifadesi otomatik `BEGIN … ROLLBACK` içinde çalışır (hata davranışı, ör. 42501, korunur), yazma içeren transaction'ın `COMMIT`'i reddedilir; tek istisna D-067 ile onaylı kısa ömürlü teknik tablolar (`sessions` test oturumları, `rate_limit_buckets`). (2) `tests/support/data-fingerprint.ts`: Neon integration ve (gerçek hesaplı) Neon E2E çalıştırmalarının öncesi/sonrası veri parmak izi (sayılar + özetler; test oturumları ve rate limit hariç) karşılaştırılır; fark → çalıştırma başarısız. (3) `assertIsolationTargetConsistent()`: işaret var ama hedef izole değilse hiçbir test başlamadan durur. Negatif testler: unit (ifade sınıflandırma, otomatik geri alma, COMMIT reddi, onaylı tablolar, hedef tutarlılığı) + izole PostgreSQL'de korunan bağlantıyla yazmanın kalıcı olmadığı. Uygulama koduna/yetkilendirmeye etkisi yoktur (yalnızca `tests/`). **Production notu:** geliştirme veritabanındaki sentetik audit/test kayıtları production'a taşınmaz (DEPLOYMENT §14).

### D-130 — Mutabakat muhasebe nesli (migration 0009)
- **Date:** 2026-11-26 (PHASE 10.2) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · D-101, D-105'i düzeltir
- **Bulgu:** `storage:reconcile` önce sağlayıcıyı listeleyip sonra dosya kayıtlarını okuyor ve `untracked_bytes`'ı koşulsuz yazıyordu: listeleme ile kayıt okuma arasında bir başvuru silinip sonlandırılırsa silinen nesneler "kayıt dışı" sayılıp kotaya geri ekleniyordu; zaman kaymalı çok sayfalı envanter ve iki eşzamanlı mutabakatta eski sonucun yeniyi ezmesi de mümkündü (testler R1, R2, R5, R7 korumasız sürümde başarısız — mutasyon kontrolü).
- **Decision:** `storage_quota_state.accounting_epoch bigint ≥ 0` (migration 0009, yalnızca ekleme). Fiziksel silme veya kayıt sonlandırma/silme yapan her işlem nesli artırır: silme adımındaki versiyona özgü silmeler, silme sonlandırması, teknik temizliğin silme/sonlandırmaları, yükleme yolundaki en iyi çaba silme. Mutabakat nesli listelemeden ÖNCE okur; sonucunu tek koşullu ifadeyle yazar (`… WHERE accounting_epoch = <okunan>`; yazarken nesli artırır) → bayat/zaman kaymalı envanter ve eski eşzamanlı mutabakat uygulanmaz (`stale: true`, audit yazılmaz, CLI çıkış kodu 3 — yeniden çalıştırılır). Ağ çağrısı sırasında transaction/kilit tutulmaz; nesil artırımı kısa satır kilidiyle, dosya/silme kilitlerinden SONRA. Eksik liste veya liste hatası (R6) değer yazmaz (önceki davranış). Bilinmeyen kullanım sıfır varsayılmaz; kota hesabı ve 8 GB/9 GB sınırları değişmedi.

### D-131 — E2E konsol hatası denetiminde dar WebKit istisnası (ortam kök nedeni)
- **Date:** 2026-11-26 (PHASE 10.2) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · **Koşul:** Kurumsal filtre kök nedeni dolaylı kanıta dayanır; bağımsız (filtresiz) ortamda doğrulama açık. İstisnanın kapsamı genişletilemez.
- **Kök neden (kanıt):** `applications.spec.ts` oluşturma testi (Desktop WebKit) PHASE 10.1 tam paketlerinde, sayfadaki menü bağlantılarının RSC önceden yükleme isteklerinin WebKit konsolunda "Fetch API cannot load …?_rsc=… due to access control checks." hatası vermesiyle düştü. İnceleme: (1) bu makinede etkin kurumsal Network Extension içerik filtresi var (`systemextensionsctl`: Forcepoint Neo NE, GlobalProtect, Skyhigh); WebKit yüklemeleri sistem içerik filtresine danışır, aynı çalıştırmada WebKit "The URL was blocked by a content filter" hatası da verdi; (2) hatalar yalnızca WebKit'te; (3) teşhis çalıştırmalarında (gecikmeli/kesmeli önceden yükleme, 150 sert gezinme ≈ 1000 iptal edilen önceden yükleme, 6 paralel işçi, testin 8 tekrarı ve izlemeli tam paket) hiçbir 3xx/4xx/5xx RSC yanıtı, CSP/köken reddi veya uygulama hatası yok, tüm kullanıcı gezinmeleri başarılı; iptaller WebKit'te `cancelled`, Chrome'da `net::ERR_ABORTED` olarak görülüyor ve zararsız. Sonuç: uygulama veya güvenlik regresyonu değil; ortamın WebKit isteklerini ağ katmanında düşürmesi + testin bunu uygulama hatası sayması (assertion sorunu).
- **Decision:** Ortak `tests/e2e/console-errors.ts`: tüm konsol/sayfa hataları toplanır; YALNIZCA WebKit'te, mesaj tam olarak "Fetch API cannot load <url> due to access control checks." ise, URL yerel kökende `?_rsc=` önceden yükleme isteğiyse ve o istek HİÇ yanıt almadan (`response` olayı yok) `requestfailed` olduysa yok sayılır. Kökenler arası yönlendirme (3xx yanıtı alınır), 4xx/5xx, CSP ihlali, sayfa hatası, RSC dışı istek, başka tarayıcı yakalanmaya devam eder (unit negatif testler). CSP, köken/CSRF, kimlik doğrulama, WebKit projesi, retry ve zaman aşımları değiştirilmedi; test atlanmadı.

### D-132 — "Gönderilmedi" (NOT_SENT) sınıflandırmasının sıkılaştırılması
- **Date:** 2026-11-26 (PHASE 10.2) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı) · **Koşul:** Gerçek sağlayıcı/ağ davranışıyla doğrulama açık. · D-123'ü sıkılaştırır
- **Decision:** `isDefinitelyNotSent`: kesin başarısızlık yalnızca sağlayıcı yanıtı yokken (S3ServiceException değil), üst hata kodu `ECONNREFUSED`/`ENOTFOUND`/`EAI_AGAIN` iken, `AggregateError` ise TÜM iç hatalar da bu kodlardaysa ve SDK meta verisi varsa en fazla 1 deneme gösteriyorsa. Karışık iç hatalar, çoklu deneme, sıfırlama/zaman aşımı → belirsiz (`UNKNOWN`). PUT için `maxAttempts: 1` korunur.

### D-133 — Müşteri bilgisi düzenleme formunda odak yarışı düzeltmesi
- **Date:** 2026-11-26 (PHASE 10.2) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-26 (PHASE 11 başlangıcı)
- **Bulgu:** PHASE 10.2 tam izole E2E 2. çalıştırmada `applications.spec.ts` "detay … müşteri düzenleme" testi (Desktop WebKit + Mobile Safari) başarısız oldu; hata anı sayfa görüntüsünde telefon için yazılan değer "Ad" alanına düşmüştü ("Çağla+49 1512 3456789", geçersiz) → kayıt yapılmadı. Bu test PHASE 10/10.1 çalıştırmalarında da aralıklı başarısızdı. Kök neden: "Düzenle" tıklanınca ilk alana odak `requestAnimationFrame` ile ertelenerek veriliyordu; yük altında kare gecikince, kullanıcı/test telefon alanına geçip yazmaya başladıktan sonra odak "Ad"a taşınıyordu. Gerçek bir (küçük) arayüz/erişilebilirlik hatası — hızlı kullanıcıda da yazılan metin yanlış alana gidebilir; ortam kaynaklı değil.
- **Decision:** Odak, form açıldığı commit'te `useLayoutEffect` ile eşzamanlı verilir ve YALNIZCA odak henüz formun içinde değilse; ertelenmiş odak kaldırıldı. Test değiştirilmedi (zaman aşımı/retry yok). Doğrulama: iki önceki aralıklı test × 4 proje × 10 tekrar = 80/80 + iki tam izole E2E çalıştırması.
- **Ek bulgu (test verisi):** düzeltme sonrası tam paket çalıştırmasında `portal.spec.ts` (WebKit) tohumlama sırasında `applications_number_unique` çakışmasıyla düştü: `seedApplication` numarayı 900 000 olasılıklı aralıktan üretiyordu (paket başına yüzlerce tohum → doğum günü çakışması ~%5). Tohum (ve `applications.spec.ts` içindeki aynı desen) kriptografik rastgele 12 haneli numaraya geçirildi (biçim `CS-YYYY-[0-9]{6,}` izin verir; uygulama sayacı etkilenmez).

### D-134 — Performans ölçüm yöntemi (PHASE 11)
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · **Koşul:** Kayıp "önce" benchmark artifact'ları, kurtarılmış özet değerleri ve karşılaştırma sınırlamaları korunur.
- **Decision:** Ölçümler yalnızca izole geçici ortamda ve production build üzerinde yapılır: `pnpm perf:isolated` (Playwright, `playwright.perf.config.ts`, tek worker, Desktop Chrome + Mobile Chrome; LCP/CLS/INP standart Performance API init script'iyle; ağ bayt/istek sayısı Playwright olaylarıyla; SQL çağrı sayısı/süresi yalnızca geçici container'da `pg_stat_statements` ile — `scripts/test/isolated-db.ts` artık `shared_preload_libraries=pg_stat_statements` ile başlatır) ve `pnpm perf:db:isolated` (uygulamanın gerçek sorgu fonksiyonları + Drizzle logger + `EXPLAIN (ANALYZE, BUFFERS)`; 100/1 000/10 000 başvuru, 10 000/100 000 audit). Sağlayıcı trafiği ölçümlü sağlayıcı sarmalayıcısıyla (`tests/support/instrumented-storage.ts`). Sentetik PDF'ler `multiPagePdf(pages, bytes, layout)` (kümelenmiş = yaygın; dağınık = en kötü durum). Uygulamaya ölçüm kodu, header, endpoint veya telemetri eklenmez; gerçek Neon/B2 kullanılmaz; sonuçlar `perf-results/` (gitignore; Playwright `test-results/`'ı her çalıştırmada temizler). Normal kalite kapılarına dahil değildir.
- **Sınır:** localhost ölçümleri ağ gecikmesini içermez; bayt/istek sayıları ve sorgu planları taşınabilir, mutlak süreler değildir. Gerçek B2 ölçümü PHASE 12'ye planlandı.

### D-135 — Güvenli HTTP Range ile PDF teslimi
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · **Koşul:** Gerçek B2 davranışı, rate limit ve PDF audit tekilleştirme güvenliği doğrulanacak. · D-104 koşulunu (Range desteği) karşılar; FILE_STORAGE §3
- **Decision:**
  1. `GET`/`HEAD` `/api/files/[id]` ve `/api/portal/[context]/files/[id]`: tek aralık (`bytes=a-b`, `a-`, `-n`) desteklenir; sınırlar kayıtlı `size_bytes`'a göre sunucuda hesaplanır. Range yok veya bilinmeyen birim → 200 tam. Çoklu aralık, bozuk sözdizimi, > 100 karakter başlık, > 15 basamak, başlangıç ≥ boyut, `-0`, boş dosya → **416** + `Content-Range: bytes */boyut` (sağlayıcıya gidilmez; tam dosyaya düşülmez).
  2. `If-Range`: yalnızca güçlü ETag birebir eşleşirse aralık; aksi hâlde tam 200. ETag = `sha256("cs-file-etag:v1:"+fileId+":"+sha256)` ilk 32 hex — storage anahtarı/versiyonu veya içerik hash'ini açığa çıkarmaz; dosya kimliği değişmez içeriğe bağlıdır.
  3. Sağlayıcıya YALNIZCA aralık iletilir: B2 `GetObject` + `Range` + kayıtlı `VersionId` (tam indirme + uygulamada kesme yok). Yanıt doğrulaması: `Content-Range` birebir (başlangıç/bitiş/toplam = kayıt), uzunluk, versiyon kimliği; aralık istenip 200 dönerse gövde iptal + `INTEGRITY` (502). Gövde `exactLengthStream` ile sınırlanır (kısa/uzun → akış hata ile kesilir). İstemci iptali ve `request.signal` sağlayıcı isteğine/akışına iletilir.
  4. HEAD: aynı yetki ve kapsam; gövde yok; **sağlayıcıya istek yok; audit yok** (PHASE 10'da Next.js HEAD'i GET işleyicisiyle çalıştırıyordu → tam sağlayıcı GET'i ve gereksiz audit; düzeltildi).
  5. İstek sınıfları ve rate limit: `transfer` (tam veya > `MAX_RANGE_CHUNK_BYTES` = 1 MiB aralık) → mevcut `FILE_DOWNLOAD_RATE_LIMIT` 120/saat; `chunk` (≤ 1 MiB) ve `meta` (HEAD, 416, bulunamayan) → yeni `FILE_RANGE_RATE_LIMIT` 600/saat (aktör başına). Kötü durum sağlayıcı çıkışı aktör başına ~1,8 GiB/saat ile sınırlı.
  6. Audit: `transfer` istekleri her seferinde; `chunk` istekleri aktör + dosya + biçim başına **10 dakikalık pencerede bir** `DOCUMENT_VIEWED/DOWNLOADED` (`rate_limit_buckets` kısa ömürlü işaret anahtarı; kişisel veri yok). HEAD/416/404 audit yazmaz. Herhangi bir baytın okunması pencere içinde en az bir kayıt üretir (bayt 0'dan kaçınarak audit atlatılamaz).
  7. Yanıt başlıkları: `Accept-Ranges: bytes`, `ETag`, 206'da `Content-Range`; `no-store`, `nosniff`, `no-referrer`, CORP `same-origin`, mevcut CSP; CORS başlığı yok.
- **Sınır:** gerçek B2'nin `Range`+`VersionId` yanıtı (206/Content-Range/x-amz-version-id) yalnızca sahte S3 uç noktasıyla doğrulandı; canlı doğrulama PHASE 12.

### D-136 — Uygulama içi tembel PDF görüntüleyici (pdf.js, yerel worker)
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · **Koşul:** Aktif içerik güvenliği, renderer kaynak sınırları, worker izolasyonu ve gerçek cihaz doğrulaması açık. · TD-12 (görüntüleyici izolasyonu) kısmen
- **Decision:** "Görüntüle" artık yeni sekme bağlantısı değil, Radix Dialog açan bir düğmedir (`PdfViewerDialog`); görüntüleyici `React.lazy` ile ve pdf.js `import("pdfjs-dist")` ile yalnızca açılışta yüklenir (ilk sayfa yükünde pdf.js yok). Worker paketten yerel derlenir (`new Worker(new URL("./pdf.worker.ts", import.meta.url))` → Turbopack worker chunk'ı, aynı köken; harici CDN yok). Veri yalnızca `PDFDataRangeTransport` ile aralık uç noktasından: ≤ 1 MiB dosya tek istekte, büyük dosyada ilk 256 KiB + pdf.js'in istediği parçalar; her pdf.js isteği TEK teslimle karşılanır (pdf.js koşulu — parça parça teslim büyük tek nesnelerde görüntüleyiciyi bozuyordu, testle yakalandı); ilk 4 istekten sonra istekler hizalı 1 MiB bloklara yuvarlanır ve uçuştaki bloklar paylaşılır (dağınık yapılı PDF'lerde pdf.js sayfa ağacını sondan başa ve paralel yürür: ölçülen 39 → 14 istek); bloklar yalnızca görüntüleyici oturumunun belleğinde tutulur; `disableAutoFetch`, `disableStream`, `enableXfa: false`, `useWasm: false`, annotation/form/metin katmanı yok (`annotationMode: 0`), betik yok, tuval ≤ 16,7 MP. Yanıt doğrulaması (206 + birebir Content-Range + uzunluk). Kapatınca istekler iptal, belge ve worker yok edilir; PDF baytları IndexedDB/localStorage/Cache API/Service Worker'a yazılmaz. CSP'ye yalnızca `worker-src 'self'` eklendi (joker, `blob:`, `data:`, `unsafe-eval`, `wasm-unsafe-eval` yok). Radix kaydırma kilidi stili için müşteri düzenine de belge nonce'u verilir (D-071 deseni `src/components/csp-nonce.tsx`). İndirme bağlantısı aynen kalır.
- **Sınır:** gerçek cihaz/WhatsApp in-app tarayıcı doğrulaması yok (emülasyon: Chrome, WebKit, Pixel 7, iPhone 15). Yapısı dağınık (sayfa sözlükleri büyük görsellerin arasında) PDF'lerde pdf.js sayfa ağacını yürürken dosyanın çoğunu ister (ölçüldü: en kötü durum ≈ tam dosya + %5, 14 istek; günlük kapasite eski 100 → 95 görüntüleme — FILE_STORAGE §7.1).

### D-137 — Ön-getirme (prefetch) politikası
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı)
- **Decision:** Next.js `Link` ön-getirmesi yalnızca ana gezinme (sidebar/mobil menü), breadcrumb ve 404 dönüş bağlantısında açık; liste/tablo satırları, kart bağlantıları, sayfalama, filtre, son başvurular, inceleme kuyruğu, silme kuyruğu ve aksiyon bağlantılarında `prefetch={false}` (App Router'da görünüm alanı ve hover ön-getirmesi kapalı). Bearer bağlantısı (`/b/…`), dosya uç noktaları ve yıkıcı aksiyonlar hiçbir zaman `Link` değildir (statik test). Ölçüm (soğuk açılış, Desktop Chrome): Genel Bakış ön-getirme 25 → 6 istek, toplam istek 41 → 22; Başvurular 17 → 6; Hizmetler 20 → 6; Mobile Chrome Genel Bakış 10 → 0.

### D-138 — İşlem geçmişi bileşik indeksi (migration 0010)
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · DATABASE_SCHEMA §9
- **Decision:** `audit_logs_occurred_at_id_idx` = `(occurred_at DESC NULLS FIRST, id DESC NULLS FIRST)` — yalnızca ek (additive) `CREATE INDEX`. Gerekçe (EXPLAIN ANALYZE, 100 000 audit): liste 26–29 ms (tam tarama + hash join + sıralama) → 0,05 ms; keyset 2. sayfa 39 ms → 0,05 ms; işlem türü filtresi 10 ms → 0,06 ms. Sıra yönü sorgunun `ORDER BY … DESC` (Postgres'te NULLS FIRST) ile birebir olmalıdır; Drizzle varsayılanı `NULLS LAST` indeks kullanılmıyordu (ölçüldü). Mevcut `audit_logs_occurred_at_idx` artık gereksizdir; kaldırılması ayrı onay gerektirir (bu fazda kaldırılmadı). Başvuru sorguları 10 000 başvuruda ≤ 7,4 ms → yeni indeks gerekmedi.

### D-139 — E2E: test kaynaklı gezinmeden önce uçuştaki isteklerin beklenmesi (WebKit)
- **Date:** 2026-11-26 (PHASE 11) · **Status:** **Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · D-131 kapsamı DEĞİŞMEDİ
- **Bulgu:** PHASE 11 1. tam izole E2E çalıştırmasında `applications.spec.ts` "oluşturma…" testi Mobile Safari'de konsol/sayfa hatası iddiasıyla düştü: `pageerror` "Fetch API cannot load http://localhost:3200/dashboard?_rsc=… due to access control checks." (Next.js yönlendirici fetch'i). Teşhis (geçici, geri alındı): hatalı `_rsc` istekleri Playwright'ta HİÇ `request` olayı üretmedi (ağa çıkmadı); hash başvuru detay sayfasının yönlendirici durumuna ait (gezinme/breadcrumb ön-getirmeleri); test aynı anda `page.goto("/dashboard")` çağırıyordu. WebKit içerik kısıtlaması günlüğünde engelleme yok (tüm kararlar "Allowed") → D-131'deki kurumsal filtre açıklaması bu olay için KULLANILMADI. Hata oranı: beklemesiz 4/140 (~%3), testte `goto` öncesi `waitForLoadState("networkidle")` ile **0/240**.
- **Decision:** Test, kendi başlattığı gezinmeden önce sayfanın uçuştaki isteklerini bekler (yalnızca bu adım). Hata toplayıcı, D-131 istisnası ve tüm güvenlik/konsol iddiaları aynen korunur. Uygulama davranışı değişmedi (gerçek kullanıcıda etkisi: sayfadan ayrılırken iptal edilen ön-getirme için konsolda ret kaydı; görünür hata yok).
- **Sınır:** WebKit'in iptal edilen fetch'i neden "access control checks" olarak raporladığı tarayıcı içi davranıştır; bağımsız ortamda (kurumsal ağ uzantıları olmadan) doğrulanmadı.

### D-140 — Kapasite yapılandırması: kod tavanı 100 GB, güvenli aktif değer, etkinleştirme prosedürü
- **Date:** 2026-11-27 (PHASE 11.1) · **Status:** **Conditionally Accepted** · **Approved By:** Product Owner · **Approval Date:** 2026-11-27 (PHASE 12 başlangıcı) · **Koşul:** Sağlayıcı hesabı hazırlığı ve aktif kapasite onayı açık; hazır olmadan aktif kapasite artırılmaz. · OD-26'yı uygular; D-101'i kısmen günceller
- **Decision:** `STORAGE_HARD_MAX_TOTAL_BYTES = 100 000 000 000` (kod tavanı; env yalnızca eşit/daha düşük verebilir), `STORAGE_DEFAULT_WARNING_BYTES = 90 000 000 000`; uyarı tanımsızsa sınırın %90'ı. Sınırlar yalnızca `src/config/constants.ts` + env doğrulamasında (`src/server/storage/config.ts`); başka yerde sabit yok (statik tarama). **Şema değişikliği yok** (`untracked_bytes` bigint, toplamlar `numeric→Number` — 10¹¹ ≪ 2⁵³). Aktif `.env.local` güvenli değerde kalır (9 GB / 8 GB); `pnpm env:b2` yalnızca tanımsızsa aynı güvenli değeri yazar. Hedefe geçiş = kullanıcı panel adımları (FILE_STORAGE §7.2) tamamlanıp doğrulandıktan sonra `.env.local`/hosting env'de iki değerin değiştirilmesi; kod değişikliği gerekmez. Mevcut kullanım/muhasebe kayıtları sıfırlanmaz.
- **Doğrulama:** unit (100 GB ±1 bayt, 10 MiB tam sınır, 90 GB uyarı, negatif kalan yok, güvenli tamsayı, güvenli 9/8 GB yapılandırması, tavan aşımı reddi) + izole integration `storage-capacity.test.ts` (sentetik kayıt dışı kullanımla 90 GB uyarı ve 100 GB sınır, gerçek yükleme hattı, sınırda eşzamanlı atomik rezervasyon, önceki versiyon + belirsiz yazım kullanımı, negatif kullanım DB CHECK). Mutabakat ve kalıcı silmenin kotaya etkisi R1–R7 ve A–K'da (sınır değerinden bağımsız) doğrulanmaya devam eder.
- **Rate limit (değişiklik yok):** ölçüm — 10 MB/100 sayfalık belgenin tamamını okumak ≤ 14 parça isteği, tipik görüntüleme 1–3; 600/saat parça ve 120/saat tam/uzun istek sınırları meşru personel kullanımını engellemiyor; müşteri sayaçları token başına (diğer müşterileri/personeli etkilemez). Hesap cap'leri ile uygulama rate limit'i ayrı kavramlardır.

### D-141 — Bağlantı önizleme azaltma seçeneği: kullanıcı onaylı ara sayfa
- **Date:** 2026-11-27 (PHASE 12) · **Status:** **ACCEPTED** (Product Owner, 2026-11-27 — PHASE 12.1 başlangıcı) · **UYGULANDI (PHASE 12.1)** · SEC-02, TM-59, PB-04
- **Uygulama (PHASE 12.1):** `GET /b/<token>` (`src/app/(customer)/b/[token]/page.tsx`) veritabanına erişmeyen, oturum açmayan, cookie yazmayan genel ara sayfadır (geçerli/geçersiz bağlantı aynı sayfa — varlık kahini yok; biçimsiz girdi veritabanısız `/link-invalid`). Oturum yalnızca "Başvurumu Görüntüle" ile yerel form `POST /b/enter` (`src/app/(customer)/b/enter/route.ts`): köken (proxy + route), gövde biçimi (yalnızca `token`, ≤ 512 bayt), HMAC arama + iptal/silme kontrolleri, geçerli token başına rate limit (D-150), mevcut cookie politikası ve tek bağlam sözleşmesi (D-090), 303 → `/portal/<bağlam>`. Token POST gövdesinde (log satırında/URL'de değil). Eski GET tabanlı oturum açma yolu kaldırıldı; başka route/action yok (statik test). **Kalan risk:** ara sayfa otomatik GET/HEAD önizlemesini azaltır; bağlantıyı ele geçiren ya da bilinçli POST yapan istemciye karşı ikinci faktör değildir (PB-04 açık). Gerçek WhatsApp davranışı doğrulanmadı.
- **Öneri:** `GET /b/<token>` oturum açmak yerine kişisel veri içermeyen bir ara sayfa gösterir ("Başvurunuzu görüntülemek için devam edin"); oturum yalnızca kullanıcının düğmeye basmasıyla (aynı köken POST + Origin kontrolü) açılır. Cookie saklayan önizleme botları düğmeye basmadığından portal verisini alamaz. Maliyet: müşteri için bir dokunuş; BR-102…BR-105 ve D-087 metinlerinin güncellenmesi. Alternatif: PB-04 kapsamında yazılı risk kabulü.

### D-142 — Yedek/geri yükleme tatbikatı ve geri yükleme sonrası prosedür
- **Date:** 2026-11-27 (PHASE 12) · **Status:** **SUPERSEDED by OD-27** (2026-11-27 — uygulamaya özel yedek/geri yükleme altyapısı kapsam dışı; `test:restore-drill`, `ops:post-restore` kaldırıldı). Önceki durum: CONDITIONALLY ACCEPTED (koşul: silinmiş verinin yeniden etkinleşmesi ve TÜM depolama versiyon referansları güvenle ele alınmalı) · SEC-03, TM-60, PB-08, PB-12
- **PHASE 12.1 durumu:** `pnpm ops:post-restore` (salt okunur GO/NO-GO raporu + onaylı `--lockdown`) ve genişletilmiş tatbikat (R-A…R-I) eklendi — OPERATIONS_RUNBOOK §2.4. Koşul **KISMEN** karşılandı: iptal/yenileme/oturum geri dönüşü kilitlemeyle engellenir; sağlayıcıda versiyonu eksik başvurular karantinaya alınır; başlamış ama nesnesi henüz silinmemiş silme sağlayıcıdan **tespit edilemez** (PB-12 açık). Bucket değişiminde tam versiyon eşleme planı fail-closed (D-148, Proposed — uygulanmadı).
- **Decision:** `pnpm test:restore-drill` (yalnızca geçici Docker container'ları + sentetik veri) şema/kısıt/indeks/trigger/yetki/veri parmak izi eşitliğini, audit değiştirilemezliğini ve silme korumasını doğrular; silinmiş/iptal edilmiş verinin geri dönüşünü ve nesne VersionId değişimini kanıtlar. Geri yükleme sonrası zorunlu prosedür (müşteri erişimi açılmadan bağlantıların iptali, silmelerin yeniden uygulanması, SHA-256 ile versiyon eşleme): OPERATIONS_RUNBOOK §2.4–2.5. Otomatik koruma (veritabanı dışı silme defteri) eklenmedi — PB-12 kararı.

### D-143 — Salt okunur sağlayıcı denetimi ve en az yetkili B2 anahtarı
- **Date:** 2026-11-27 (PHASE 12) · **Status:** **CONDITIONALLY ACCEPTED** (Product Owner, 2026-11-27 — gerçek anahtar oluşturma ve sağlayıcı doğrulaması açık) · SEC-01, TM-51, PB-13
- **PHASE 12.1 düzeltmesi:** resmî "S3-Compatible App Key Capabilities" tablosuna göre uygulamanın asgari yetkileri `listFiles, readFiles, writeFiles, deleteFiles`'tır; uygulama ListBuckets/HeadBucket çağırmaz → `listBuckets` yalnızca `storage:inspect` HeadBucket kontrolü için isteğe bağlıdır. Panel yalnızca Read and Write / Read Only / Write Only sunar; özel yetki kümesi yalnızca `b2_create_key` API ile (OPERATIONS_RUNBOOK §3.1). D-143 onayı canlı mutasyon yetkisi değildir.
- **Decision:** `pnpm storage:inspect` — yazma/silme/indirme yapmadan anahtar kapsamını (yetkiler, bucket/önek kısıtı, son kullanma), bucket ayarlarını (versiyonlama, şifreleme, CORS, lifecycle), nesne sayılarını ve kimliksiz erişim reddini raporlar; secret/token/nesne adı yazdırmaz. Uygulama yalnızca `listBuckets, listFiles, readFiles, writeFiles, deleteFiles` gerektirir; mevcut anahtardaki 7 fazla yetki (writeBuckets, writeBucket*, shareFiles) kaldırılmalıdır — yeni anahtarı kullanıcı oluşturur (OPERATIONS_RUNBOOK §3.1). Asistan sağlayıcı ayarı/anahtar değiştirmedi.

### D-144 — Runtime rolünün `users`/`accounts` yazma yetkisinin daraltılması (öneri)
- **Date:** 2026-11-27 (PHASE 12) · **Status:** **ACCEPTED** (Product Owner, 2026-11-27) · **İzole ortamda UYGULANDI (PHASE 12.1); Neon'a UYGULANMADI** (ayrı onay) · SEC-04, TM-41
- **Uygulama (PHASE 12.1):** migration `0011_runtime_auth_least_privilege` — `REVOKE INSERT, UPDATE ON users, accounts` ve `REVOKE INSERT, UPDATE, DELETE ON verifications` (SELECT kalır; `sessions` değişmez — giriş oturum oluşturur, çıkış siler). Ölçüm: Better Auth giriş/oturum/çıkış izole tam regresyonda users/accounts'a yazmadı. `pnpm auth:bootstrap` / `auth:reset-password` ve E2E geçici hesap kurulumu artık **sahip (operatör)** bağlantısını kullanır. Negatif testler: runtime ile hesap/credential ekleme-değiştirme-silme, doğrulama kaydı, kendine GRANT (etkisiz), ALTER ROLE → reddedilir. Neon için değişiklik listesi/etki/geri alma: PROJECT_STATE "Kullanıcı İşlemleri".
- **Öneri:** Yeni migration ile `REVOKE INSERT ON users, accounts FROM cs_app_runtime` (UPDATE ihtiyacı Better Auth giriş akışında izole ortamda ölçülerek belirlenir). Ön koşul: E2E global-setup'ın geçici hesapları runtime yerine owner bağlantısıyla oluşturması. Önce izole ortamda tam regresyon, sonra onayla Neon.

### D-145 — CI'da izole Docker paketleri ve deterministik izole kota
- **Date:** 2026-11-27 (PHASE 12) · **Status:** **CONDITIONALLY ACCEPTED** (Product Owner, 2026-11-27 — uzak GitHub CI doğrulanmadı) · SEC-07, SEC-09
- **Decision:** `.github/workflows/ci.yml`'a `isolated` işi: `pnpm test:integration:isolated` + `pnpm test:e2e:isolated` (geçici PostgreSQL, rastgele secret'lar, gerçek Neon/B2 yok; workflow secret kullanmaz → untrusted PR'lar da secret almaz; `permissions: contents: read`). `scripts/test/isolated-db.ts` kotayı açıkça 9 GB / 8 GB verir (geliştirici `.env.local`'ından bağımsız).
### D-146 — Bağlantı ara sayfasında `Referrer-Policy: strict-origin`
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **Proposed** (kullanıcı onayı gerekiyor — "no-referrer korunmalıdır" talimatından dar sapma) · D-141, D-069, D-093
- **Sorun:** `no-referrer` altında tarayıcılar form POST'unda `Origin: null` gönderir (Fetch standardı); köken/CSRF kontrolü (D-069) meşru girişi de 403 ile reddetti (ilk E2E koşusu). `Origin: null` kabul etmek CSRF/oturum sabitleme korumasını kaldırırdı.
- **Decision:** YALNIZCA `/b/<43 karakter>` ara sayfası `strict-origin` (başlık + meta): Referer EN FAZLA köken içerir, yol/token asla gönderilmez; aynı köken POST gerçek `Origin` taşır. Sayfada harici kaynak/bağlantı yoktur (CSP). `/b/enter` yanıtı, portal ve diğer müşteri sayfaları `no-referrer` kalır. Test: POST'un Referer'ı yok veya yalnızca köken; token içermez.

### D-147 — Sağlayıcı yanıt kimliği ve yokluk kanıtı sözleşmesi
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **Proposed** · REVIEW-06, D-102, D-123, D-132, D-135
- **Decision:** (1) Versiyona özgü GET yanıtı aynı `VersionId`'yi bildirmelidir; eksik veya farklıysa gövde aktarılmadan INTEGRITY (Backblaze belgeleri `x-amz-version-id`'yi yalnızca örnek yanıtta gösterir — sözleşme değil; gerçek davranış Checkpoint B / B2-02). (2) "Yok" yalnızca S3 hata kodlu `NoSuchKey`/`NoSuchVersion` (GET/DELETE); kodsuz 404 (yanlış uç nokta/HTML) UNAVAILABLE; gövdesiz HEAD'de `NotFound` kabul edilir ama tek başına silme/sonlandırma kanıtı değildir (tam envanter). (3) Belirsiz yazımda gözlenen versiyon yalnızca o versiyonun sınırlı SHA-256 okumasıyla doğrulanırsa CONFIRMED (OBSERVED); aksi UNKNOWN. Normal görüntüleme/indirme akışına ek GET eklenmez.

### D-148 — Bucket değişiminde tam VersionId eşleme (çevrimdışı prosedür tasarımı)
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **WITHDRAWN** (OD-27 — bucket'lar arası VersionId eşlemesi kapsam dışı; uygulanmadı, `planVersionMapping` kaldırıldı). Önceki durum: Proposed · SEC-03, PB-12, REVIEW-04
- **Bulgu:** Başka bucket'a kopyada VersionId'ler değişir; referanslar `application_document_files.storage_version_id`, `storage_write_attempts.version_id` (kimlik değişmez — tetikleyici, sahip rolüyle bile 55000) ve `application_deletion_objects.version_id`'dedir. Aynı içerikli farklı tarihî versiyonlar yalnızca hash ile ayırt edilemez.
- **Öneri:** Desteklenen kurtarma yolu aynı bucket'tır (versiyonlar korunur, lifecycle yok). Bucket kaybında: `planVersionMapping` (anahtar + boyut + SHA-256, tek aday) — tüm referanslar VERIFIED değilse NO-GO; uygulamak için yeni, onaylı, çevrimdışı bir eşleme tablosu/migration gerekir (eski yerleşim kanıtı yeniden yazılmaz). Kullanıcı kararı.

### D-149 — Testler ortak veritabanına migration uygulamaz
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **Proposed** · D-059, D-086, D-129, D-144
- **Decision:** Integration global setup migration'ları yalnızca izole geçici veritabanına uygular. Ortak veritabanında (Neon) bekleyen migration varsa hiçbir test başlamadan durulur; uygulama yalnızca `pnpm db:migrate` ile ve ayrı onayla. Sebep: 0011 gibi yetki değişikliklerinin test komutuyla onaysız Neon'a gitmesini önlemek.

### D-150 — Müşteri bağlantısı girişi için geçerli token başına sınır
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **Proposed** · SEC-06, D-141, D-093
- **Decision:** `POST /b/enter` geçerli token başına saatte 30 (`CUSTOMER_LINK_EXCHANGE_RATE_LIMIT`; anahtar `link:exchange:<token kimliği>` — gizli/kişisel değil). Satır yalnızca geçerli token'da oluşur (rastgele token'lar satır üretmez → kardinalite gerçek token sayısıyla sınırlı). Aşımda genel "erişilemiyor" ekranı. GET ara sayfası veritabanına gitmez (DB tabanlı sınır gereksiz). Geçersiz token denemeleri tek indeksli okumadır; hacimsel kötüye kullanım için istemci kimliği gerekir → hosting/edge koruması (PB-01 kapsamı; güvenilir proxy sözleşmesi doğrulanmadan IP tabanlı koruma tam güvenli sayılmaz).

### D-151 — Kapasite değerlerinin production'da zorunlu olması
- **Date:** 2026-11-27 (PHASE 12.1) · **Status:** **Proposed** · REVIEW-05, D-140, OD-26
- **Decision:** `STORAGE_MAX_TOTAL_BYTES` ve `STORAGE_WARNING_BYTES` production/preview'da zorunlu (eksik → depolama yapılandırması reddedilir). Development'ta eksikse güvenli 9 GB / 8 GB (`STORAGE_SAFE_DEFAULT_*`). 100 GB kod tavanı hiçbir ortamda kendiliğinden etkinleşmez.


## C. Faz Onayları


| Faz | Onay | Approved By | Tarih | Not |
|---|---|---|---|---|
| PHASE 00 — Project Foundation & Architecture (+ revizyon) | **ACCEPTED** | Product Owner | 2026-11-24 | D-002 (TS 6.0.3), D-003 (Node 24 LTS), D-004 (pnpm 10.34.9), D-031 (.gitignore) aynı onayla kabul edildi. PHASE 01 başlatma yetkisi verildi (yalnızca PHASE 01). Bu onay production güvenliği veya KVKK uyumluluğu onayı **değildir**; PB-01…PB-11 açık kalır. |
| PHASE 01 — Project Initialization | **ACCEPTED** | Product Owner | 2026-11-24 | D-042…D-051 aynı onayla kabul edildi. PHASE 02 başlatma yetkisi verildi (yalnızca PHASE 02). Onay mevcut güvenlik risklerini ve PB-01…PB-11'i kapatmaz. |
| PHASE 02 — Database Foundation | **ACCEPTED** | Product Owner | 2026-11-24 | D-052…D-058 kabul edildi; D-055'in D-059 ile geçersiz kılınan kısımları (ayrı test veritabanı, ortam işareti) yeniden etkinleştirilmez. Owner şifresi sıfırlandı. PHASE 03 başlatma yetkisi (yalnızca PHASE 03). |
| PHASE 03 — Authentication & Equal Staff Access | **ACCEPTED** (PHASE 04 başlatıldı) | Product Owner | 2026-11-24 | OD-24 uygulandı; D-060…D-064, D-066 Accepted; D-065 koşullu Accepted. Gerçek ADMIN ve EMPLOYEE hesapları kullanıcı tarafından `pnpm auth:bootstrap` ile oluşturuldu ve salt okunur doğrulandı. PHASE 04 açık konuları P4-01…P4-04 (PROJECT_STATE). PB-01…PB-11 açık. |
| PHASE 04 — Dashboard Foundation | **ACCEPTED** (PHASE 05 başlatıldı) | Product Owner | 2026-11-24 | D-069, D-070, D-071 Accepted; D-067 ve D-068 koşullu Accepted; D-063 ve D-065 Partially Superseded. P4-01 PARTIAL (tam kimlik doğrulama test kapsamı), P4-03 MITIGATED, P4-04 DEFERRED. P4-01, P4-02 çözüldü; P4-03 azaltıldı (hesap başına kilitleme DoS'u açık); P4-04 yapılandırma düzeyinde doğrulandı, gerçek HTTPS doğrulaması PHASE 13'e kaldı. PB-01…PB-11 açık. |
| PHASE 05 — Service & Document Template Management | **ACCEPTED** (PHASE 06 başlatıldı) | Product Owner | 2026-11-24 | D-072…D-077 Accepted; P4-01 RESOLVED (yerel test izolasyonu); migration 0004. Docker izole test ortamı kullanıcı onayıyla. PB-01…PB-11 açık. |
| PHASE 06 — Customer & Application Management | **ACCEPTED** (PHASE 07 başlatıldı) | Product Owner | 2026-11-25 | D-078…D-080, D-082…D-086 Accepted; D-081 koşullu Accepted (anahtar yedekleme/kurtarma/rotasyon production öncesi); yeni migration yok; `libphonenumber-js` 1.13.17. PB-01…PB-11 açık. |
| PHASE 07 — Customer Portal | **ACCEPTED** (PHASE 08 başlatıldı) | Product Owner | 2026-11-25 | D-088…D-092, D-094, D-095 Accepted; D-087 ve D-093 koşullu Accepted (hosting log redaksiyonu, tarayıcı geçmişi, WhatsApp önizleme, edge koruması, gerçek cihaz/in-app testleri, HTTPS `Secure` cookie, anahtar yedekleme/rotasyon, PB'ler açık); D-081 koşullu Accepted kalır. TM-40 görüntüleme izolasyonu doğrulandı; dosya/mutasyon kısmı PHASE 08/09. Geliştirme açısından tamamlandı. PB-01…PB-11 açık. |
| PHASE 08 — Secure PDF Upload & Backblaze B2 Private Storage | **ACCEPTED** (PHASE 09 başlatıldı) | Product Owner | 2026-11-25 | OD-25 geçerli; D-096, D-097, D-098, D-103, D-106, D-107 Accepted; D-099, D-100, D-101, D-102, D-104, D-105 koşullu Accepted; D-081, D-087, D-093 koşulları korunur. **Canlı B2 duman testi (`pnpm storage:verify`) kullanıcı terminalinde PASS** (yalnızca kontrollü storage smoke kapsamı). PB-01…PB-11 açık. |
| PHASE 09 — Document Review & Application Workflow (+ 09.1 kapanış) | **ACCEPTED** (PHASE 10 başlatıldı) | Product Owner | 2026-11-25 | D-108…D-114 Accepted; PHASE 09.1: migration 0006 (yorum idempotency), 19 adımlı ana senaryo E2E (Chrome + WebKit), eşzamanlılık kapsamı. Önceki koşullu onaylar (D-081, D-087, D-093, D-099, D-100, D-101, D-102, D-104, D-105) değişmedi; D-102 depolama ↔ DB silme tutarlılığı koşulu PHASE 10 kritik kabul kriteri. PB-01…PB-11 açık. |
| PHASE 10 — Administration & Operations (+ 10.1, 10.2 kapanış) | **ACCEPTED** (PHASE 11 başlatıldı) | Product Owner | 2026-11-26 | D-115, D-116 (D-124 ile güncel), D-117 (D-125 ile genişletilmiş), D-118…D-122, D-124…D-126, D-128…D-130, D-133 Accepted; D-123 (gerçek B2 davranışı / listeleme-okuma tutarlılığı), D-127 (çözülemeyen yazımlar için teknik kurtarma prosedürü), D-131 (kurumsal filtre kök nedeni dolaylı kanıt; bağımsız ortam doğrulaması), D-132 (gerçek sağlayıcı/ağ doğrulaması) koşullu Accepted. D-116 zamana dayalı sonlandırması yeniden etkinleştirilmez. D-102 izole PASS; gerçek B2 doğrulaması açık. Neon TEST_EVENT (audit id 970) korunur; 155 audit satırı referans. migration 0007–0009. PB-01…PB-11 açık. |
| PHASE 11 — UI/UX Polish & Performance Optimization (+ 11.1 depolama bütçesi kapanışı) | **ACCEPTED** (PHASE 12 başlatıldı) | Product Owner | 2026-11-27 | D-137, D-138, D-139 Accepted; D-134 (kayıp önce artifact'ları/kurtarılmış özet), D-135 (gerçek B2, rate limit, audit tekilleştirme), D-136 (aktif içerik, kaynak sınırları, worker izolasyonu, gerçek cihaz), D-140 (hesap hazırlığı, aktif kapasite onayı) koşullu Accepted. OD-26 ACCEPTED (B2 ~10 USD/yıl, 100/90 GB hedef). Aktif kapasite 9/8 GB. Neon audit 155 / id 970 korunur. PB-01…PB-11 açık. |
| PHASE 12 — Testing & Security Audit | **Değerlendirildi — nihai onay PHASE 12.1 sonrası** | Product Owner | 2026-11-27 | D-141, D-144 ACCEPTED; D-142, D-143, D-145 CONDITIONALLY ACCEPTED (koşullar ilgili kayıtlarda). PB-12, PB-13 production blocker olarak kabul edildi. Bağımsız kaynak kodu incelemesi (REVIEW-01…06) PHASE 12.1'e aktarıldı. |
| PHASE 12.1 — Targeted Security Remediation & Final Verification | **Onay bekliyor** | — | — | D-146, D-147, D-149…D-151 Proposed; D-148 WITHDRAWN ve D-142 SUPERSEDED (OD-27 ACCEPTED — özel yedek/geri yükleme kapsam dışı). Migration 0011 yalnızca izole; Neon'a uygulanmadı. |

### Not — Canlı Backblaze B2 doğrulaması (2026-11-25, PHASE 08 onayı)
Kullanıcı kendi terminalinde B2 anahtarını `pnpm env:b2` ile yapılandırıp `pnpm storage:verify` çalıştırdı: bucket erişimi (ListObjectVersions) PASS; başlangıç envanteri 0 nesne; sentetik PDF yazma PASS; SSE-B2 AES256 yanıtı PASS; sağlayıcı versiyon kimliği PASS; HEAD 400/400 bayt; GET SHA-256 PASS; imzasız erişim path-style / virtual-host / friendly URL → HTTP 401; versiyona özgü fiziksel silme PASS (1 versiyon). **Kapsam:** yalnızca kontrollü storage smoke testi. Doğrulanmış SAYILMAZ: müşteri tarayıcısından B2'ye kadar tam uygulama yükleme akışı, gerçek kota/cap aşımı davranışı, tüm sağlayıcı hata/kurtarma senaryoları, gerçek cihaz PDF görüntüleme, Object Lock/replikasyon, production deployment ve production veri izolasyonu.
