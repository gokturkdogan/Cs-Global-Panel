# Changelog

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esinli; fazlara göre gruplanır. Tarihler `YYYY-MM-DD`.

## [PHASE 00 — Revizyon] — 2026-11-24

Product Owner'ın OD-01…OD-23 kararları (23/23 ACCEPTED) tüm dokümanlara işlendi.

### Added
- DECISION_LOG Bölüm A: 23 ürün kararı (önceki öneri, nihai karar, etkiler, faz).
- Teknik kararlar D-032…D-041 (imzalı portal cookie'si, müşteri bilgisinin başvuruda tutulması, tek aktif dosya modeli, senkron PDF doğrulaması, iki aşamalı silme, sabit yapılandırma, Better Auth IP/UA saklamama, append-only audit, storage sınırı, ADMIN geçiş seti).
- ADMIN yeniden açma/geri alma geçişleri T8–T12; personelin `UNDER_REVIEW` yüklemesi (D9); ADMIN geçişinde onay geçersizleştirme (D10).
- ADMIN manuel başvuru silme (BR-150…BR-155), WhatsApp kişiselleştirilmiş mesaj (BR-160…BR-162), sabit iletişim/logo kuralları (BR-170…BR-172).
- THREAT_MODEL: yeni sütunlar (kalan risk, doğrulama, production blocker), birleşik risk analizi, düşük maliyetli ek önlem seçenekleri (uygulanmadı).
- SECURITY §11 production blocker tablosu (PB-01…PB-11); PROJECT_STATE'te teknik karar listesi (TD-01…TD-12) ve bekleyen girdiler.
- DEPLOYMENT: sıfır maliyet stratejisi, ücretsiz plan değerlendirmesi, kapasite hesabı, alan adı değişikliği etkileri.
- TECH_STACK §7 yeniden doğrulama kaydı.

### Changed
- Müşteri erişimi: bağlantı + OTP → **yalnızca bağlantı** (bearer, süresiz, path tabanlı), 7 günlük imzalı oturum cookie'si.
- Personel: şifreyi yalnızca ADMIN belirler; min 8 karakter; 7 gün sabit oturum; self-servis şifre işlemleri ve zorunlu ilk değişim yok.
- Veri modeli: 23 → 17 tablo; müşteri bilgileri `applications`'ta; dosya modeli tek `status` ekseni + tek aktif PDF; inceleme `file_id`'ye bağlı.
- Dosya limitleri sabit (PDF, 10 485 760 bayt, evrak başına 1 aktif).
- PDF güvenliği: harici AV yerine yalnızca yapısal doğrulama; "virüssüz" etiketi yok.
- Rate limiting: Better Auth yerleşik limiter yerine uygulama limitleyicisi (HMAC'li, süreli anahtarlar).
- Bağlantı yönetimi yetkileri ADMIN = EMPLOYEE.
- Env değişkenleri sadeleşti (`NEXT_PUBLIC_*`, OTP, e-posta, tarama, IP hash değişkenleri kaldırıldı).
- Roadmap tüm fazlarda güncellendi.
- Tehdit kimlikleri `T01…T39` → `TM-01…TM-39` (yeni ADMIN geçişleri T10–T12 ile çakışmayı önlemek için).
- D-003 ve D-031 **Accepted**; D-011, D-033 **Accepted** (ürün kararlarıyla); D-009, D-012, D-013, D-014, D-018, D-020, D-024, D-025, D-026, D-029, D-030 **Superseded**.

### Removed
- OTP (e-posta/SMS), e-posta entegrasyonu, müşteri profili/eşleştirme/birleştirme, çalışan atama ve görünürlük kapsamı, arşivleme, ayarlar sayfası ve `system_settings`, otomatik saklama/silme ve bağlantı süre sonu, dinamik dosya limitleri, evrak başına çoklu dosya, harici antivirüs, `/dashboard/account`, `/dashboard/settings`, `/portal/verify`, fragment tabanlı bağlantı, `customers`, `customer_otp_challenges`, `customer_sessions`, `document_review_files` tabloları, Better Auth `rateLimit` tablosu, IP/UA saklama.

### Not Changed
- Kod, bağımlılık, veritabanı, storage, deployment: yok. `.gitignore` değiştirilmedi (PHASE 01). Commit yapılmadı.

## [PHASE 00] — 2026-11-24

### Added
- `CLAUDE.md` ve `docs/` altında 20 proje dokümanı.
- Teknoloji sürümleri ve platform özellikleri doğrulaması.
- 31 karar kaydı (D-001…D-031), 23 açık ürün kararı (OD-01…OD-23).

### Changed
- `README.md` — mevcut başlık ve açıklama korunarak genişletildi.

### Not Changed
- `.gitignore` — uygunsuzluk tespit edildi, PHASE 01 için önerildi (D-031). Commit yapılmadı.
