# Karar Kaydı (Decision Log)

> Durumlar: **Proposed** (öneri, onay bekliyor) · **Accepted** · **Rejected** · **Superseded**.
> Yalnızca brief'te açıkça belirtilen veya zorunlu kılınan konular **Accepted** işaretlenmiştir. Diğer tüm kararlar kullanıcı onayına kadar **Proposed**'dır.
> Açık ürün kararları (OD-xx) [PROJECT_STATE.md](PROJECT_STATE.md) §Open Decisions içinde.

---

### D-001 — Modüler monolit, tek Next.js uygulaması
- **Date:** 2026-11-24 · **Status:** Accepted (brief §4, §17)
- **Context:** İki arayüz (personel + müşteri), küçük/orta ölçek.
- **Alternatives:** Ayrı backend (Express/NestJS); mikroservis; iki ayrı Next.js uygulaması.
- **Decision:** Tek repo, tek Next.js App Router uygulaması; feature tabanlı modüller.
- **Rationale:** Brief zorunlu kılıyor; operasyon ve maliyet en düşük.
- **Consequences:** Müşteri ve personel kodu aynı bundle sisteminde → import sınırları lint ile zorlanır.

### D-002 — TypeScript 6.0.x (7.x değil)
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** `typescript@latest` = 7.0.2; `typescript-eslint@8.74.0` peer `<6.1.0`; `eslint-config-next` buna bağımlı.
- **Alternatives:** TS 7.0.2 (lint uyumsuz); TS 5.9.3.
- **Decision:** TypeScript **6.0.3** exact.
- **Rationale:** Tüm araç zinciriyle uyumlu en güncel kararlı sürüm.
- **Consequences:** TS 7'nin derleme hızı kazanımı ertelenir; typescript-eslint desteği gelince yeniden değerlendirilir.

### D-003 — Node.js 24.x LTS
- **Date:** 2026-11-24 · **Status:** Proposed (OD-13)
- **Context:** Node 26 (LTS, Vercel varsayılanı) ve 24 (LTS, yerel kurulu) destekli.
- **Alternatives:** Node 26.x.
- **Decision:** `engines.node = "24.x"`; yerelde 24.22.3'e yama güncellemesi önerilir.
- **Rationale:** Yerel ortamla eşitlik; tüm bağımlılık `engines` aralıklarında; daha uzun süredir LTS.
- **Consequences:** Vercel varsayılanı 26 olduğundan sabitleme zorunlu. Node 24 destek ömrü 26'dan kısa → ileride geçiş.

### D-004 — pnpm sürümünün sabitlenmesi
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Yerel 10.28.2; npm `latest` 12.23.0; Vercel'de pnpm 12 desteği doğrulanmadı.
- **Alternatives:** 10.x'te kal; 12.x'e geç.
- **Decision:** PHASE 01'de Vercel'in desteklediği en güncel pnpm major'ı doğrulanıp `packageManager` alanıyla sabitlenir (Corepack).
- **Rationale:** Tekrar üretilebilir kurulum; yerel/CI/Vercel eşitliği.
- **Consequences:** Geliştiricinin yerel pnpm'i Corepack ile otomatik eşleşir.

### D-005 — Drizzle ORM 0.45.x (1.0 RC değil)
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** 1.0 RC/beta mevcut; Better Auth her ikisini destekliyor.
- **Decision:** `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`.
- **Rationale:** Production için kararlı sürüm (brief kural 6).
- **Consequences:** 1.0 stable olduğunda migration rehberiyle yükseltme planlanır.

### D-006 — DB sürücüsü: `drizzle-orm/node-postgres` + `pg` + Neon pooled URL
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Başvuru oluşturma, gönderim, inceleme **interactive transaction** gerektirir. Neon HTTP sürücüsü yalnızca non-interactive transaction destekler.
- **Alternatives:** `neon-http` (yetersiz); `neon-serverless` (WebSocket Pool; istek içinde aç/kapat, `waitUntil(pool.end())`).
- **Decision:** `pg.Pool` + pooled (PgBouncer transaction mode) URL runtime için; direct URL migration için.
- **Rationale:** Neon'un Drizzle rehberinin Node.js önerisi; Vercel Fluid compute'ta instance yeniden kullanımıyla uyumlu; standart sürücü.
- **Consequences:** Session seviyesinde PG özellikleri kullanılamaz; pool boyutu ve bağlantı sızıntısı PHASE 02'de ayarlanır (Vercel'in pool yardımcıları değerlendirilecek). Sorun çıkarsa `neon-serverless`'a geçiş Drizzle'da tek satırlık sürücü değişimidir.

### D-007 — Domain PK'ları UUID v4; public referans başvuru numarası
- **Date:** 2026-11-24 · **Status:** Proposed
- **Alternatives:** `bigserial` (tahmin edilebilir, URL'de ID sızdırır); UUID v7 (sıralı; PG18 `uuidv7()` — Neon PG sürümü doğrulanmadı).
- **Decision:** `uuid DEFAULT gen_random_uuid()`; `application_number` görüntüleme referansı; audit log `bigint identity`.
- **Rationale:** Tahmin edilemez ID'ler ek savunma; yerleşik fonksiyon; bu ölçekte performans farkı önemsiz.
- **Consequences:** Better Auth tabloları text ID kullanır; FK tipleri karışık (text/uuid) — şemada açıkça belirtildi.

### D-008 — Başvuru numarası: yıllık sayaç tablosu
- **Date:** 2026-11-24 · **Status:** Proposed
- **Alternatives:** PG `SEQUENCE` (boşluklu, yıllık sıfırlama yok); `MAX()+1` (yarış durumu); advisory lock (pooled bağlantıda riskli).
- **Decision:** `application_number_counters` + `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` aynı transaction içinde.
- **Rationale:** Çakışmasız, boşluksuz, yıllık sıfırlama; basit.
- **Consequences:** Aynı anda oluşturmalar sayaç satırında kısa süre sıraya girer (ölçek için sorun değil).

### D-009 — Mükerrer müşteri: aday gösterimi + açık seçim, otomatik birleştirme yok
- **Date:** 2026-11-24 · **Status:** Proposed (OD-10 ile birlikte)
- **Context:** Brief §7: eşleşme otomatik birleştirme sebebi değil.
- **Alternatives:** Her başvuruda yeni müşteri (mükerrer çoğalır); otomatik birleştirme (yanlış kişiye bağlama riski → veri sızıntısı).
- **Decision:** BR-05.
- **Consequences:** Aynı müşteri iki kez oluşturulabilir; merge aracı ileride.

### D-010 — Evrak gereksinimi snapshot'ı
- **Date:** 2026-11-24 · **Status:** Accepted (brief §9 "zorunludur")
- **Decision:** Oluşturma anında aktif şablonlar `application_document_requirements`'a tam kopya.
- **Consequences:** Şablon değişiklikleri geriye etki etmez; başvuruya özel evrak eklemeye hazır model.

### D-011 — Erişim token'ı: HMAC hash + AES-256-GCM şifreli kopya
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Personel bağlantıyı tekrar görebilmeli (brief §21) ↔ güvenli saklama.
- **Alternatives:** Düz metin; yalnızca hash; yalnızca hash + her seferinde yenile (SECURITY §3.2).
- **Decision:** Seçenek C.
- **Rationale:** Gereksinimi karşılayan en güvenli seçenek; DB sızıntısı tek başına yetmez.
- **Consequences:** Anahtar yönetimi ve rotasyon prosedürü gerekir; her gösterim audit'lenir.

### D-012 — Müşteri doğrulama: bağlantı + e-posta OTP + süreli oturum
- **Date:** 2026-11-24 · **Status:** Proposed (OD-01 — ürün kararı)
- **Alternatives:** Yalnızca bağlantı; SMS OTP; bilgi faktörü (SECURITY §4.1).
- **Decision:** Model B.
- **Rationale:** Hassas belgeler için bağlantı tek başına yetersiz; iki bağımsız kanal; ek kişisel veri toplamaz.
- **Consequences:** E-posta sağlayıcı (OD-08) gerekir; müşteri her yeni oturumda kod girer; Better Auth email-otp plugin'i kullanıcıya bağlı olduğundan OTP uygulama içinde yazılır.

### D-013 — Bağlantı biçimi: path (baseline) vs fragment (önerilen)
- **Date:** 2026-11-24 · **Status:** Proposed (OD-02)
- **Context:** `/b/<token>` path'i platform loglarına ve önizleme botlarına görünür.
- **Alternatives:** Path tabanlı (`/b/<token>`, brief örneği); fragment tabanlı (`/b#<token>`).
- **Decision:** Öneri fragment tabanlı; kullanıcı onayına kadar dokümanlar path tabanlı baseline'ı anlatır.
- **Consequences:** Fragment seçilirse `/b` sayfası küçük bir client script ve `exchangeFragmentTokenAction` içerir; in-app tarayıcı testi gerekir.

### D-014 — Çalışan görünürlük kapsamı ayarlanabilir
- **Date:** 2026-11-24 · **Status:** Proposed (OD-03)
- **Decision:** `employee_application_scope` ayarı (`ALL` varsayılan / `ASSIGNED_ONLY`), tek kapsam filtresi fonksiyonu, `assigned_user_id` kolonu.
- **Consequences:** Kapsam değişikliği kod değişikliği gerektirmez.

### D-015 — Server Actions / Route Handlers ayrımı
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** ARCHITECTURE §6 tablosu.
- **Rationale:** Form mutasyonlarında yerleşik CSRF ve tipli sözleşme; binary/harici callback/auth için Route Handler.

### D-016 — Cache: `cacheComponents` kapalı, hassas veride cache yok
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** ARCHITECTURE §9.
- **Rationale:** Kullanıcılar arası sızıntı riskini sıfırlamak; ölçek cache gerektirmiyor.
- **Consequences:** Her istek DB'ye gider; nonce'lu CSP ile uyumlu.

### D-017 — Doğrudan client upload (Private Blob)
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Function body limiti 4.5 MB; Server Action limiti 1 MB; hedef 10 MB.
- **Decision:** `handleUpload` + `upload()` (private); pathname sunucu belirler; callback + client confirm idempotent.
- **Consequences:** Dosya, doğrulanmadan önce Blob'a ulaşır → "erişilemez karantina" uygulama seviyesinde.

### D-018 — Katmanlı dosya güvenliği; AV sağlayıcısı açık
- **Date:** 2026-11-24 · **Status:** Proposed (OD-07)
- **Decision:** FILE_STORAGE §6.2: yapısal doğrulama (zorunlu) + AV (a/b önerilir) + güvenli sunum.
- **Consequences:** AV kararı verilmeden production açılmaz (blocker).

### D-019 — Rate limiting Postgres'te
- **Date:** 2026-11-24 · **Status:** Proposed
- **Alternatives:** Bellek içi (serverless'ta güvenilmez); Redis/Upstash (ek servis + maliyet + DPA).
- **Decision:** Better Auth `storage: "database"` + uygulama `rate_limit_buckets`.
- **Consequences:** Her sınırlı istek bir DB yazımı; bu ölçekte kabul edilebilir.

### D-020 — Personel şifre sıfırlama: ADMIN geçici şifre + zorunlu değişim
- **Date:** 2026-11-24 · **Status:** Proposed (OD-11)
- **Alternatives:** E-posta ile self-servis sıfırlama.
- **Decision:** MVP'de yalnızca ADMIN `setUserPassword` + `must_change_password`.
- **Consequences:** Personel için e-posta akışı gerekmez; ADMIN'in kendi şifresini unutması durumunda bootstrap benzeri bir kurtarma script'i gerekir (PHASE 03).

### D-021 — Pasifleştirme = Better Auth `banUser`
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** Ayrı `is_active` alanı yerine admin plugin'in `banned` alanı.
- **Rationale:** Oturum iptali dahil hazır mekanizma (kural: kütüphaneyi yeniden yazma).

### D-022 — Ortam izolasyonu: ayrı Neon projeleri ve Blob store'ları
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** DEPLOYMENT §1.
- **Rationale:** Preview'ın production verisine erişememesi garanti.
- **Consequences:** Neon'da 2 proje (Free planda proje sayısı limiti PHASE 02'de kontrol edilir).

### D-023 — Bölgeler: Frankfurt
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** Vercel `fra1`, Neon `aws-eu-central-1`, Blob `fra1`.
- **Rationale:** Türkiye'ye en yakın, tüm servislerde mevcut; AB bölgesi.
- **Consequences:** Yurt dışı aktarım değerlendirmesi yine gerekli (DATA_PRIVACY §8).

### D-024 — Production için Vercel Pro ve Neon ücretli plan
- **Date:** 2026-11-24 · **Status:** Proposed (OD-12)
- **Context:** Vercel Hobby Terms §4 ticari kullanımı yasaklar; Neon Free SLA'sız, 6 saat PITR.
- **Decision:** Vercel Pro + Neon Launch (minimum), Scale ihtiyaca göre.
- **Consequences:** Aylık ~$30 + e-posta + tarama (DEPLOYMENT §6.2).

### D-025 — Audit log append-only (DB yetkisi + trigger)
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** DATABASE_SCHEMA §4.17.
- **Consequences:** Saklama silmesi ayrı rol ile; Neon rol desteği PHASE 02'de doğrulanır.

### D-026 — `system_settings` tipli tek satır
- **Date:** 2026-11-24 · **Status:** Proposed
- **Alternatives:** Key-value + JSON.
- **Decision:** Tek satır, tipli kolonlar, CHECK kısıtları.

### D-027 — Başvuru statü geçişleri manuel
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Son evrak onaylandığında otomatik `DOCUMENTS_APPROVED` mümkün.
- **Decision:** T2/T3 personel butonuyla; otomatik geçiş yok.
- **Rationale:** Personel son kontrolü yapar; beklenmeyen durum değişimi yok.

### D-028 — Renk paleti erişilebilirlik ayarlamaları
- **Date:** 2026-11-24 · **Status:** Proposed
- **Decision:** Metin kullanımında success `#15803D`, warning `#B45309`; input kenarlığı `#64748B`; açık zeminlerde ikincil metin `#475569`.
- **Rationale:** Ölçülen kontrastlar AA altında (DESIGN_SYSTEM §1).

### D-029 — Dosya versiyonlama: değiştirilemez dosya satırları + inceleme-dosya bağlantı tablosu
- **Date:** 2026-11-24 · **Status:** Proposed
- **Alternatives:** Üzerine yazma (yasak); "versiyon seti" tablosu (ek karmaşıklık).
- **Decision:** `application_document_files` (immutable) + `document_review_files`.
- **Rationale:** Çoklu dosyalı evraklarda hangi dosyaların incelendiği kesin izlenir; ek tablo minimal.

### D-030 — E-posta sağlayıcı (OTP)
- **Date:** 2026-11-24 · **Status:** Proposed (OD-08)
- **Context:** B modeli transactional e-posta gerektirir.
- **Decision:** Henüz seçilmedi. Kriterler: AB veri merkezi seçeneği, DPA, işlemsel e-posta, makul ücretsiz/düşük katman, SPF/DKIM/DMARC desteği, basit HTTP API (ek SDK gerekmeyebilir).
- **Consequences:** PHASE 07 başlamadan seçilmeli; domain DNS erişimi gerekir.

### D-031 — `.gitignore`'un Node/Next.js şablonuyla değiştirilmesi
- **Date:** 2026-11-24 · **Status:** Proposed
- **Context:** Mevcut dosya Visual Studio şablonu; `.env.local`, `node_modules`, `.next` kapsanmıyor.
- **Decision:** PHASE 01'in ilk adımı olarak, mevcut dosya kullanıcı onayıyla değiştirilir (Next.js + Node + env + test çıktıları + OS dosyaları).
- **Consequences:** Secret sızıntısı riskinin kapatılması.
