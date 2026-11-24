# Karar Kaydı (Decision Log)

> Durumlar: **Proposed** · **Accepted** · **Rejected** · **Superseded**.
> Bölüm A: Product Owner tarafından onaylanan ürün kararları (OD-01…OD-23). Bölüm B: teknik kararlar (D-001…D-051). Bölüm C: faz onayları.
> Bir ürün kararının **ACCEPTED** olması, ilgili riskin güvenlik denetiminden geçtiği veya hukuki uygunluğun doğrulandığı anlamına gelmez — bkz. [THREAT_MODEL.md](THREAT_MODEL.md), [DATA_PRIVACY.md](DATA_PRIVACY.md), [SECURITY.md](SECURITY.md) §11.
> Geçmiş kararlar silinmez; yerine geçilenler **Superseded** olarak işaretlenir.

---

## A. Ürün Kararları (OD-01…OD-23)

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
- **Önceki öneri:** ADMIN, yalnızca terminal statülerde arşivleme (BR-140 eski).
- **Nihai karar:** Arşiv, arşiv sayfası, geri çıkarma, otomatik arşiv, ayarlar, ARCHIVED statüsü, `archived_*` alanları yok; tek liste + statü filtreleri; yalnızca ADMIN manuel silme.
- **Mimari etki:** Arşiv route/action/filtreleri kaldırıldı.
- **Veri modeli etkisi:** `archived_at`, `archived_by_user_id` ve ilgili CHECK/index kaldırıldı.
- **Etkilenen dokümanlar:** BUSINESS_RULES §14, BR-82, DATABASE_SCHEMA, API_CONTRACTS, DESIGN_SYSTEM §6, TESTING_STRATEGY.
- **Faz:** PHASE 06.

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
- **Status:** Proposed

### D-018 — Katmanlı dosya güvenliği + AV
- **Status:** **Superseded** by OD-07 / D-035.

### D-019 — Rate limiting Postgres'te
- **Status:** Proposed · Revizyon: Better Auth `rateLimit` tablosu kullanılmaz (`disableIpTracking` yerleşik limiter'ı kapatır); tüm limitler `rate_limit_buckets` (HMAC'li, süreli anahtarlar).

### D-020 — Geçici şifre + zorunlu değişim
- **Status:** **Superseded** by OD-11.

### D-021 — Pasifleştirme = Better Auth `banUser`
- **Status:** Proposed

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
- **Date:** 2026-11-24 · **Status:** Proposed (OD-07 uygulaması)
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
- **Date:** 2026-11-24 · **Status:** Proposed (OD-12 uygulaması)
- **Decision:** Sunucuda `src/server/storage/storage.ts`, client'ta `src/lib/upload-client.ts`; tüm storage çağrıları yalnızca bu iki dosyadan. Çoklu sağlayıcı arayüzü/adaptör katmanı yok.

### D-041 — ADMIN yeniden açma/geri alma geçiş seti
- **Date:** 2026-11-24 · **Status:** Proposed (OD-05 uygulaması)
- **Decision:** T8 `CANCELLED → iptal öncesi statü` (hedefi sunucu belirler), T9 `COMPLETED → IN_PROCESS`, T10 `IN_PROCESS → DOCUMENTS_APPROVED`, T11 `DOCUMENTS_APPROVED → UNDER_REVIEW`, T12 `{DOCUMENTS_APPROVED, IN_PROCESS} → REVISION_REQUIRED` (seçilen evrakların onayı geçersiz). Tümü gerekçeli.
- **Alternatives:** ADMIN'in serbest hedef statü seçmesi (keyfî değişikliğe açık — reddedildi); daha az geçiş (operasyonel ihtiyaçları karşılamayabilir).
- **Consequences:** Evrak statüleriyle tutarlılık korunur; yeni geçiş ihtiyacı ayrı karar gerektirir.

### D-042 — ESLint 10.15.0 (ESLint 9 değil)
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Context:** `eslint-config-next@16.4.6` içindeki `eslint-plugin-react@7.37.5`, `eslint-plugin-import@2.32.0`, `eslint-plugin-jsx-a11y@6.10.2` peer aralığı ESLint ^9'da bitiyor. `eslint@9.39.5` npm'de **deprecated** ("This version is no longer supported") ve ESLint destek politikasına göre 2026-08-06'dan beri **EOL**. create-next-app@16.4.6 hâlâ `eslint: ^9` öneriyor. Next.js ESLint dokümanı (son güncelleme 2026-11-18): "eslint-config-next supports ESLint 9 and ESLint 10 … Starting with eslint-config-next@16.4.0 … works with ESLint 10. Some of the plugins … don't list ESLint 10 in their peer dependencies yet, so your package manager may show peer dependency warnings."
- **Alternatives:** ESLint 9.39.5 (deprecated/EOL — CLAUDE.md deprecated paket yasağı); `eslint-config-next`'i bırakıp eklentileri tek tek kurmak (jsx-a11y/react kuralları kaybolur, temel stack'ten sapma).
- **Decision:** `eslint@10.15.0` + `eslint-config-next@16.4.6`. Bilinen 3 peer uyarısı **bastırılmaz** (`--force`, `--legacy-peer-deps`, override, `peerDependencyRules` yok) ve raporlanır. `strictPeerDependencies` açılmaz (Next.js dokümanına göre kurulum başarısız olur).
- **Doğrulama:** Proje kuralları ESLint 10 altında çalıştırıldı; `react/no-danger` dahil 10 kural ihlal dosyasında tetiklendi.
- **Consequences:** Eklentiler ESLint 10'u peer olarak listeleyince uyarılar kendiliğinden kalkar; her faz sonunda yeniden kontrol edilir.

### D-043 — shadcn/ui: Radix tabanı, minimum bağımlılık
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Context:** `shadcn@4.23.0 init -b radix -p nova` → `components.json` (`style: radix-nova`). CLI ayrıca `cn@0.5.2` (shadcn'in yeni, 0.x sınıf birleştirme paketi; CLI `bin`'i içerir), `shadcn` CLI paketini **runtime** bağımlılığı olarak (32 bağımlılık; yalnızca `shadcn/tailwind.css` için) ve `tw-animate-css` ekledi.
- **Decision:** `cn` yerine olgun **clsx 2.1.1 + tailwind-merge 3.7.1** (`src/lib/utils.ts`); `shadcn` runtime bağımlılığı kaldırıldı, kullanılan 3 özel variant (`data-disabled`, `data-horizontal`, `data-vertical`) MIT lisanslı kaynaktan `globals.css`'e alındı; `tw-animate-css` kaldırıldı (animasyonlu bileşen yok — Dialog/Sheet eklenecek fazda yeniden değerlendirilir). Bileşenler: Button, Card, Badge, Alert, Separator, Input, Label; tasarım token'larına ve erişilebilirlik kurallarına uyarlandı. CLI `pnpm dlx shadcn@4.23.0` ile çalıştırılır, bağımlılık değildir.
- **Consequences:** Sonraki `shadcn add` çalıştırmaları `cn`/`shadcn`/`tw-animate-css` ekleyebilir; her eklemede `package.json` farkı incelenir.

### D-044 — Tailwind entegrasyonu `@tailwindcss/postcss`; şablon varsayılanlarının ayıklanması
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Context:** create-next-app@16.4.6 şablonu `@tailwindcss/turbopack` loader'ı, **`cacheComponents: true`**, `partialPrefetching: true`, dark mode bloğu ve `next/font/google` ile geliyor.
- **Decision:** Tailwind resmî Next.js rehberi ve TECH_STACK'teki `@tailwindcss/postcss` kullanıldı. `cacheComponents` ve `partialPrefetching` eklenmedi (D-016). Next/Vercel görselleri ve favicon kopyalanmadı (logo tasarlanmaz — OD-15).
- **Consequences:** Turbopack ve webpack ile aynı yapılandırma çalışır.

### D-045 — Font: yerel `geist` paketi
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** `geist@1.9.2` (`next/font/local`, değişken Geist Sans). Çalışma zamanında harici font isteği yok (E2E ile doğrulandı). Türkçe glifler (ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü â î û) fontun `cmap` tablosunda doğrulandı. Geist Mono kullanılmadığı için yüklenmez.

### D-046 — pnpm kurulum güvenliği
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** `pnpm-workspace.yaml`: kurulum script'leri pnpm 10 varsayılanıyla engelli; `sharp` ve `unrs-resolver` script'leri bilinçli olarak yok sayılır (önceden derlenmiş paketleri var). `minimumReleaseAge: 1440` — 24 saatten yeni yayımlanmış sürümler kurulmaz (tedarik zinciri saldırılarına karşı). pnpm sürümü `packageManager` ile proje düzeyinde sabit (global kurulum değiştirilmedi; pnpm kendi sürüm yönetimiyle 10.34.9'u kullanır). Tek lockfile `pnpm-lock.yaml`.
- **Consequences:** Acil güvenlik yaması 24 saatten yeniyse `minimumReleaseAgeExclude` ile bilinçli istisna gerekir.

### D-047 — Ortam değişkeni doğrulaması: lazy, fail-closed
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** `src/server/env.ts` (`server-only`, Zod): ilk kullanımda doğrulama; PHASE 01'de yalnızca `APP_ENV`, `APP_URL`. `NODE_ENV=production` iken `APP_ENV` zorunlu; development dışında `APP_URL` zorunlu ve `https` origin olmalı; development'ta varsayılan `http://localhost:3000`. Hata mesajları yalnızca değişken adı içerir. Sonraki fazların secret'ları, onları kullanan kodla birlikte şemaya eklenir ve production'da zorunlu olur. Zod `.strict()` env nesnesine uygulanmaz (`process.env` sistem değişkenleri içerir).

### D-048 — Temel güvenlik header'ları; nonce'lu CSP sonraki fazda
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** `next.config.ts` `headers()`: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Robots-Tag`, `poweredByHeader: false` ve script çalıştırmayı etkilemeyen temel CSP (`base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`). Nonce'lu `script-src`/`style-src` CSP'si `src/proxy.ts` ile PHASE 03'te (dinamik render gerektirir), rota bazlı `no-referrer` ve `no-store` ilgili rotalarla (PHASE 03/07/08) eklenir.

### D-049 — Tasarım token'ları (D-028 uygulaması)
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** CSS değişkeni + Tailwind 4 `@theme inline` ile semantik token'lar (`src/app/globals.css`). `--muted-foreground` = `#475569` (palet `#64748B` `#EFF6FF`/`#F1F5F9` zeminlerde AA altında kaldığı için; `#64748B` input kenarlığı `--input` olarak kullanılır). Metin tonları `*-strong`, zeminler `*-soft` (success/warning/destructive). Birincil hover `#1D4ED8` (beyaz metinle 6.70). Yalnızca açık tema: `dark:` variant'ı hiç kullanılmayan `.dark` sınıfına bağlı; `color-scheme: light`. Tüm kombinasyonların kontrastı hesaplandı (DESIGN_SYSTEM §1.3).

### D-050 — Test ve CI düzeni
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Decision:** `pnpm test` = Vitest unit (`vitest run`, watch yok); `test:unit` adı kullanılmaz (dokümanlar güncellendi), `test:integration` PHASE 02'de eklenir. Playwright production build üzerinde (`next build` + `next start`, port 3100); projeler Desktop Chrome, Mobile Chrome (Pixel 7), Mobile Safari (iPhone 15), Desktop WebKit. CI: GitHub Actions (repo herkese açık → standart runner'lar ücretsiz), yalnızca resmî action'lar commit SHA'sıyla sabit, pnpm Corepack ile `packageManager`'dan. Husky/lint-staged yok.

### D-051 — Next.js `agentRules` kapalı
- **Date:** 2026-11-24 (PHASE 01) · **Status:** Proposed
- **Context:** Next.js 16.4 `next dev` çalıştığında kök dizine `AGENTS.md` yazar.
- **Decision:** `agentRules: false`; ajan talimatlarının tek kaynağı `CLAUDE.md`. Faydalı ipucu (sürüme uygun dokümanlar `node_modules/next/dist/docs/`) CLAUDE.md'ye eklendi.

---

## C. Faz Onayları

| Faz | Onay | Approved By | Tarih | Not |
|---|---|---|---|---|
| PHASE 00 — Project Foundation & Architecture (+ revizyon) | **ACCEPTED** | Product Owner | 2026-11-24 | D-002 (TS 6.0.3), D-003 (Node 24 LTS), D-004 (pnpm 10.34.9), D-031 (.gitignore) aynı onayla kabul edildi. PHASE 01 başlatma yetkisi verildi (yalnızca PHASE 01). Bu onay production güvenliği veya KVKK uyumluluğu onayı **değildir**; PB-01…PB-11 açık kalır. |
