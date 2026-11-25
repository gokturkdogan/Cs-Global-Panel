# Karar Kaydı (Decision Log)

> Durumlar: **Proposed** · **Accepted** · **Rejected** · **Superseded**.
> Bölüm A: Product Owner tarafından onaylanan ürün kararları (OD-01…OD-24). Bölüm B: teknik kararlar (D-001…D-066). Bölüm C: faz onayları.
> Bir ürün kararının **ACCEPTED** olması, ilgili riskin güvenlik denetiminden geçtiği veya hukuki uygunluğun doğrulandığı anlamına gelmez — bkz. [THREAT_MODEL.md](THREAT_MODEL.md), [DATA_PRIVACY.md](DATA_PRIVACY.md), [SECURITY.md](SECURITY.md) §11.
> Geçmiş kararlar silinmez; yerine geçilenler **Superseded** olarak işaretlenir.

---

## A. Ürün Kararları (OD-01…OD-24)

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
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** `createApplication` tek transaction: idempotency kontrolü → `services` satırı `FOR SHARE` (aktif değilse ret — BR-21) → aktif şablonlar belirleyici sırada (`sort_order, created_at, id`; yoksa ret — BR-32) → parmak izi doğrulaması (D-079) → yıllık sayaç `INSERT … ON CONFLICT DO UPDATE … RETURNING` (yıl `now() AT TIME ZONE 'Europe/Istanbul'`; MAX+1 yok) → `applications` (müşteri alanları, `search_text`, `service_name_snapshot`, `AWAITING_DOCUMENTS`, `created_by` oturumdan) → `application_document_requirements` snapshot'ı (başlık, açıklama, talimat, zorunluluk, sıra, `source_requirement_id`) → `application_status_history` (`NULL → AWAITING_DOCUMENTS`, `CREATE`) → token (D-080) → audit `APPLICATION_CREATED {serviceId}` + `ACCESS_LINK_CREATED {accessTokenId}`. Herhangi bir adım başarısızsa hiçbir satır kalmaz; sayaç artışı da geri alınır (bu nedenle geri alınan oluşturma numara boşluğu bırakmaz; silinen başvurunun numarası yeniden kullanılmaz — BR-12). Biçim `CS-{YYYY}-{NNNNNN}` (BR-10/13).
- **Doğrulama:** izole integration — numara/statü/snapshot/geçmiş/token/audit; 12 eşzamanlı oluşturmada benzersiz ve ardışık numara; snapshot, statü geçmişi, token ve audit yazımı başarısız olduğunda tam geri alma (sayaç dahil).
- **Kapsam notu:** API_CONTRACTS'taki `internalNote` (şirket içi not) PHASE 06 talimatında yer almadığı için **uygulanmadı** (iç notlar modülüyle birlikte sonraki faz).

### D-079 — Önizleme–oluşturma tutarlılığı: sunucu doğrulamalı şablon parmak izi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Context:** Hizmet `version`'ı yalnızca hizmet alanlarında artar; evrak içerik/aktiflik değişikliği evrak `version`'ını artırır, sıra değişikliği yalnızca `sort_order`'u değiştirir (D-074/D-075). Yalnızca hizmet version'ı kontrolü şablon değişikliklerini yakalamaz.
- **Decision:** `templateFingerprint = SHA-256(JSON[service.id, service.version, [(req.id, req.version, req.sort_order)…]])` (aktif evraklar, snapshot sırasıyla). Önizleme (`getServicePreviewAction`) parmak izini döndürür; oluşturma aynı değeri gönderir; sunucu `FOR SHARE` kilidi altında yeniden hesaplar, uyuşmazlıkta `STALE_PREVIEW` döner (kayıt yok) ve form önizlemeyi yeniler. Parmak izi gizli değildir; yalnızca tutarlılık kontrolüdür. Yeni şema/migration gerekmedi.
- **Doğrulama:** unit (her değişiklik türü parmak izini değiştirir); izole integration (şablon kilidi sürerken oluşturma bekler, commit sonrası `STALE_PREVIEW`; güncel önizlemeyle başarılı); izole E2E (form, şablon değişince oluşturmaz ve listeyi yeniler).

### D-080 — Müşteri bağlantı token'ı biçimi ve kriptografik saklama
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed** · SECURITY §3.2'yi uygular, AAD'yi genişletir
- **Decision:** `src/server/access-tokens/crypto.ts` (server-only, Node `crypto`): token `randomBytes(32)` → base64url 43 karakter, kanonik biçim zorunlu; `token_hash = HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` hex (UNIQUE); şifreli kopya AES-256-GCM, her şifrelemede 12 bayt rastgele IV, 16 bayt tag, biçim `v1:<keyId>:<iv>:<ct>:<tag>` (base64url parçalar). **AAD = `cs-access-token:v1:<applicationId>:<tokenId>`** — SECURITY'deki "AAD = application_id"den daha sıkı: şifreli kopya başka başvuruya veya başka token satırına taşınırsa çözülmez (token kimliği uygulamada `randomUUID()` ile önceden üretilir). Çözme hatası (yanlış anahtar, bozuk metin/tag, bağlam, bilinmeyen anahtar kimliği) ayrım yapmadan `AccessTokenCryptoError` → fail-closed. Bağlantı yalnızca `APP_URL` kökünden (`${origin}/b/${token}`); `Host`/`X-Forwarded-Host` kullanılmaz (BR-107). Düz token DB'de, log'da, audit'te, URL'de, tarayıcı depolamasında yoktur.
- **Doğrulama:** unit (2000 token benzersiz/kanonik, HMAC, GCM turu, IV benzersizliği, IV/ct/tag/sürüm/anahtar/bağlam manipülasyonu reddi, hata mesajında token yok, APP_URL kökü); izole integration (hash = HMAC(token), şifreli biçim, DB'de düz token yok, bozuk şifreli kopya ve yanlış anahtarla fail-closed).

### D-081 — Token anahtarı yönetimi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** `getAccessTokenEnv()` (lazy, yalnızca token işlemlerinde): `ACCESS_TOKEN_HMAC_KEY` (base64, 32 bayt), `ACCESS_TOKEN_ENCRYPTION_KEYS` (JSON `{"k1":"<base64 32 bayt>"}`, kimlik `^[A-Za-z0-9_-]{1,32}$`), `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` (haritada olmalı). Tüm anahtarlar birbirinden ve `BETTER_AUTH_SECRET`/`RATE_LIMIT_KEY_SECRET`'tan farklı olmalı. Eksik/hatalı → yalnızca token gerektiren işlemler genel Türkçe hata ile reddedilir (başvuru oluşturulmaz); giriş ve hizmet yönetimi etkilenmez; log'a yalnızca değişken adı. Yerel: `pnpm env:token-keys` yalnızca EKSİK anahtarları `.env.local`'a ekler (üzerine yazmaz, değer göstermez — PHASE 06'da çalıştırıldı, dosya izni 600). İzole testler kendi rastgele anahtarlarını kullanır. Production anahtarları hosting env'inde, yetkili kişi tarafından üretilir ve yedeklenir; HMAC anahtarı değişirse tüm bağlantılar geçersiz olur, şifreleme anahtarı değişirse eski kopyalar çözülemez (rotasyon: yeni kimlik ekle → aktif yap → yeniden şifreleme betiği → eskiyi kaldır; betik henüz yok — PHASE 13 öncesi).

### D-082 — Başvuru oluşturmada idempotency
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** Form oturumu başına istemcide `crypto.randomUUID()` anahtarı (ilk gönderimde üretilir; hata/ağ kesintisinde korunur; başarıdan sonra "Yeni başvuru" ile sıfırlanır) → mevcut `applications.idempotency_key` UNIQUE kolonu. Transaction başında aynı anahtarlı başvuru varsa yeni kayıt açılmaz, mevcut başvuru (ve aktif bağlantısı) `replayed: true` ile döner; eşzamanlı aynı gönderimde ikinci transaction UNIQUE'e takılır ve mevcut sonuç döndürülür. Ayrıca gönderim butonu ref kilidiyle çift tıklamayı engeller. Bilinçli ikinci başvuru (yeni form) engellenmez; müşteri eşleştirmesi yoktur (OD-10).
- **Doğrulama:** izole integration (sıralı ve eşzamanlı tekrar → tek başvuru; bilinçli ikinci başvuru serbest); izole E2E (çift tıklama → tek kayıt).

### D-083 — Müşteri bilgisi düzenleme ve iletişim değişikliği politikası
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** `updateCustomerInfoAction({ applicationId, expectedVersion, firstName, lastName, phone, email })` — `applications FOR UPDATE`, version kontrolü (`CONFLICT`), değişiklik yoksa no-op, `search_text` yeniden üretilir, audit `APPLICATION_UPDATED {changedFields}` (eski/yeni değer yok). Yalnızca bu başvuru değişir (BR-03). Tüm statülerde düzenlenebilir (BR'de kısıt yok); silme talepli başvuru `NOT_FOUND`. Telefon/e-posta değişince bağlantı **kendiliğinden yenilenmez** (ürün kararı yok); arayüz "mevcut bağlantı önceki alıcıda kalmış olabilir" uyarısı ve bağlantı yönetimine geçiş gösterir.

### D-084 — Bağlantı yönetimi: istek üzerine açığa çıkarma, iptal/yenileme eşzamanlılığı, WhatsApp hazırlığı ve PHASE 07 oturum sözleşmesi
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:**
  1. **İstek üzerine açığa çıkarma:** liste/detay DTO'ları yalnızca aktif token kimliğini (gizli değil) taşır; düz bağlantı yalnızca `revealAccessLinkAction` (Göster/Kopyala) ile sunucuda çözülür ve yanıtta döner, audit `ACCESS_LINK_VIEWED {accessTokenId}`. Toplu çözme, ön yükleme, URL/sorgu dizesi, `localStorage/sessionStorage` yok; varsayılan gizli gösterim. Kopyalama `navigator.clipboard` sonucunu doğrular; başarısızsa seçilebilir alan (elle kopyalama).
  2. **İptal/yenileme:** `applications FOR UPDATE` → aktif token `FOR UPDATE`; istemci gördüğü **aktif token kimliğini** (`expectedActiveTokenId`, yoksa `null`) gönderir; uyuşmazsa `CONFLICT` — eski onay/sekme daha yeni bağlantıyı fark etmeden iptal edemez (API_CONTRACTS'taki `expectedVersion` yerine; başvuru version'ı müşteri formuyla çakışmasın diye). Yenileme: eski token `ROTATED` + yeni token aynı transaction'da (yeni token yazılamazsa eski bağlantı korunur); iptal edilmişin yerine yeni bağlantı aynı action (`expectedActiveTokenId: null`, audit `ACCESS_LINK_CREATED`). Partial unique index son savunma. Silme talepli başvuruda tüm bağlantı işlemleri `NOT_FOUND`. Statü/zamana bağlı otomatik iptal yok (OD-04).
  3. **WhatsApp:** `prepareWhatsAppShareAction` mesajı (BR-161 birebir) ve `https://wa.me/<E.164 rakamları>?text=<encodeURIComponent>` bağlantısını sunucuda üretir (resmî "Tıkla ve sohbet et" biçimi doğrulandı); onay penceresinde alıcı adı ve telefonu gösterilir (BR-162); WhatsApp yalnızca kullanıcı "WhatsApp'ta aç" bağlantısına tıklayınca açılır (`target=_blank`, `rel="noopener noreferrer"`), otomatik gönderim/ön yükleme/harici istek yok; "Mesajı kopyala" alternatifi. Yeni audit olayı `ACCESS_LINK_SHARE_PREPARED {accessTokenId}` — gönderim/teslim iddia etmez. PHASE 07'ye kadar her bağlantı ekranında "müşteri paneli henüz açık değil; gerçek müşterilerle paylaşmayın" uyarısı.
  4. **PHASE 07 sözleşmesi:** müşteri oturumu (SECURITY §3.4) token kimliğini (`tid`) taşıyacak ve her istekte `revoked_at IS NULL` + başvuru silinme durumu kontrol edilecek → iptal/yenileme, eski token'a bağlı tüm oturumları bir sonraki istekte geçersiz kılar (BR-104). Bu fazda oturum/cookie/tablo yok; HTTP üzerinden erişimin açılıp kapandığı PHASE 07 E2E'siyle doğrulanacak.
- **Doğrulama:** izole integration (görüntüleme aynı bağlantı, eski kimlikle iptal/yenileme reddi, iptal → görüntüleme null, yeniden oluşturma, 5 tur eşzamanlı yenileme+iptal+yenileme: tam olarak bir başarı ve en fazla bir aktif token, yenileme sırasında token yazılamazsa eski bağlantı korunur, audit sırası ve içeriğinde bağlantı yok); izole E2E (gizli/göster, onaylı yenile/iptal, Escape ile vazgeçme, iki hesapta eski onayın reddi, WhatsApp alıcı/mesaj/`wa.me` yakalama — gerçek istek yok, pano doğrulaması Chromium'da).

### D-085 — Başvuru listesi: arama, filtre, sayfalama ve telefon normalizasyonu
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** Kişisel veri içermeyen filtreler URL'de (`status`, `serviceId`, `page`, `pageSize` ∈ {10, 20, 50}, varsayılan 20; geçersiz değer varsayılana döner); **arama metni URL'ye yazılmaz** — `searchApplicationsAction` POST gövdesiyle gönderilir (tarayıcı geçmişi, erişim logları ve referrer'a sızmaz; sayfa yenilenince arama sıfırlanır — bilinçli ödünleşim). Arama: başvuru numarası birebir (büyük/küçük harf toleranslı) + `search_text` (BR-80 katlaması, LIKE kaçışlı, parametreli) + telefon rakamları (≥4 hane; E.164 rakamları, ulusal ve `0`'lı biçim `search_text`'te). Sunucu tarafı sayfalama `COUNT(*)` + `LIMIT/OFFSET`; sıra `created_at DESC, application_number DESC`; sınır dışı sayfa son sayfaya çekilir; sessiz 100 kesmesi yok. Hizmet filtresi pasif hizmetleri de listeler ("(pasif)"). Silme talepli başvurular hiçbir sorguda yok (BR-153). Telefon: `libphonenumber-js` **1.13.17** (MIT, exact; tam metadata, yalnızca sunucuda), varsayılan bölge TR, E.164 saklanır, uluslararası numaralar kabul; biçim doğrulaması sahiplik doğrulaması değildir. Arama ve liste log'a kişisel veri yazmaz.
- **Hata düzeltmesi (testle yakalandı):** listedeki "aktif bağlantı" alt sorgusunda Drizzle'ın tek tablolu sorguda kolonları niteliksiz yazması nedeniyle iç tabloya bağlanma; dış tablo açıkça nitelendi ve integration testine kontrol eklendi.

### D-086 — PHASE 06 test kapsamı ve ortak veritabanı güvenliği
- **Date:** 2026-11-24 (PHASE 06) · **Status:** **Proposed**
- **Decision:** Başvuru/token/WhatsApp/eşzamanlılık testlerinin tamamı commit ettiği için yalnızca izole Docker ortamında (D-077). `pnpm test:integration` (ortak `neondb`) yalnızca salt okunur veya tamamen geri alınan dosyaları çalıştırır (`auth`, `dashboard`, `privileges`, `services`); commit eden PHASE 02 dosyaları (`constraints`, `concurrency`, `transactions-and-deletion`) ve `applications` yalnızca `pnpm test:integration:isolated`'da. `privileges` testindeki audit ekleme denemesi geri alınan transaction'a alındı (ortak veritabanında artık `TEST_EVENT` birikmez). Dashboard E2E'sindeki sentetik başvuru testi izole ortama taşındı. Ortak veritabanında E2E salt okunurdur (form gönderilmez).

---

## C. Faz Onayları

| Faz | Onay | Approved By | Tarih | Not |
|---|---|---|---|---|
| PHASE 00 — Project Foundation & Architecture (+ revizyon) | **ACCEPTED** | Product Owner | 2026-11-24 | D-002 (TS 6.0.3), D-003 (Node 24 LTS), D-004 (pnpm 10.34.9), D-031 (.gitignore) aynı onayla kabul edildi. PHASE 01 başlatma yetkisi verildi (yalnızca PHASE 01). Bu onay production güvenliği veya KVKK uyumluluğu onayı **değildir**; PB-01…PB-11 açık kalır. |
| PHASE 01 — Project Initialization | **ACCEPTED** | Product Owner | 2026-11-24 | D-042…D-051 aynı onayla kabul edildi. PHASE 02 başlatma yetkisi verildi (yalnızca PHASE 02). Onay mevcut güvenlik risklerini ve PB-01…PB-11'i kapatmaz. |
| PHASE 02 — Database Foundation | **ACCEPTED** | Product Owner | 2026-11-24 | D-052…D-058 kabul edildi; D-055'in D-059 ile geçersiz kılınan kısımları (ayrı test veritabanı, ortam işareti) yeniden etkinleştirilmez. Owner şifresi sıfırlandı. PHASE 03 başlatma yetkisi (yalnızca PHASE 03). |
| PHASE 03 — Authentication & Equal Staff Access | **ACCEPTED** (PHASE 04 başlatıldı) | Product Owner | 2026-11-24 | OD-24 uygulandı; D-060…D-064, D-066 Accepted; D-065 koşullu Accepted. Gerçek ADMIN ve EMPLOYEE hesapları kullanıcı tarafından `pnpm auth:bootstrap` ile oluşturuldu ve salt okunur doğrulandı. PHASE 04 açık konuları P4-01…P4-04 (PROJECT_STATE). PB-01…PB-11 açık. |
| PHASE 04 — Dashboard Foundation | **ACCEPTED** (PHASE 05 başlatıldı) | Product Owner | 2026-11-24 | D-069, D-070, D-071 Accepted; D-067 ve D-068 koşullu Accepted; D-063 ve D-065 Partially Superseded. P4-01 PARTIAL (tam kimlik doğrulama test kapsamı), P4-03 MITIGATED, P4-04 DEFERRED. P4-01, P4-02 çözüldü; P4-03 azaltıldı (hesap başına kilitleme DoS'u açık); P4-04 yapılandırma düzeyinde doğrulandı, gerçek HTTPS doğrulaması PHASE 13'e kaldı. PB-01…PB-11 açık. |
| PHASE 05 — Service & Document Template Management | **ACCEPTED** (PHASE 06 başlatıldı) | Product Owner | 2026-11-24 | D-072…D-077 Accepted; P4-01 RESOLVED (yerel test izolasyonu); migration 0004. Docker izole test ortamı kullanıcı onayıyla. PB-01…PB-11 açık. |
| PHASE 06 — Customer & Application Management | **COMPLETED (teknik)** — kullanıcı onayı bekleniyor | — | 2026-11-24 | D-078…D-086 Proposed; yeni migration yok; `libphonenumber-js` 1.13.17. PB-01…PB-11 açık. |
