# Proje Durumu

> Her faz sonunda güncellenir. Son güncelleme: **2026-11-24**

## Current Phase
**PHASE 00 — Project Foundation & Architecture** — tamamlandı, **kullanıcı onayı bekleniyor**.

## Completed Phases
- (Onay bekleyen) PHASE 00

## Project Status
Yalnızca dokümantasyon. Uygulama kodu, bağımlılık, veritabanı, storage, hesap veya deployment **yok**.

## Implemented Features
- Yok (PHASE 00 doküman fazıdır).

## Pending Features
Tüm ürün özellikleri — [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) PHASE 01–13.

## Known Issues
1. `.gitignore` Visual Studio şablonu; Node/Next.js projesine uygun değil, `.env.local` vb. kapsamıyor (D-031) — PHASE 01 ilk adım.
2. Mevcut `README.md` 2 satırlık bir yer tutucuydu; içeriği korunarak genişletildi.
3. Yerel Node.js 24.22.1; güncel LTS yaması 24.22.3 (güvenlik yaması olabilir) — güncelleme önerilir.
4. PHASE 00 brief'i mesaj sınırı nedeniyle **§35'in sonunda kesik** ulaştı ("Git commit veya push gerçekleştirm…"). Sonrasında ek talimat/rapor formatı varsa iletilmeli.

## Technical Debt
- Yok (kod yok).

## Open Decisions

| ID | Konu | Öneri | Gerekli olduğu faz |
|---|---|---|---|
| **OD-01** | Müşteri erişim modeli (A / B / C) | **B**: bağlantı + e-posta OTP + süreli oturum (D-012) | PHASE 07 (blocker) |
| **OD-02** | Bağlantı biçimi: `/b/<token>` (path) vs `/b#<token>` (fragment) | Fragment (D-013) | PHASE 06–07 |
| **OD-03** | Çalışan tüm başvuruları mı, yalnızca atananları mı görür? | Ayarlanabilir; varsayılan `ALL` (D-014) | PHASE 06 |
| **OD-04** | Bağlantı süre sonu varsayılanları | 180 gün; terminal statüden 30 gün sonra otomatik geçersiz | PHASE 06 |
| **OD-05** | İptal yetkisi (EMPLOYEE de mi?) ve yeniden açma geçişleri (CANCELLED→AWAITING, APPROVED/IN_PROCESS→REVISION, COMPLETED yeniden açma) | İptal: ADMIN+EMPLOYEE gerekçeli; yeniden açma: MVP'de yok | PHASE 09 |
| **OD-06** | Saklama süreleri (belgeler, eski versiyonlar, müşteri verisi, audit) | DATA_PRIVACY §4 önerileri — **hukukçu onayı** | PHASE 10 / production blocker |
| **OD-07** | Zararlı yazılım tarama yöntemi (ClamAV-self-hosted / ticari API / yalnızca yapısal) | Yapısal doğrulama + (a) veya (b) | PHASE 08 (blocker) |
| **OD-08** | E-posta sağlayıcı | Kriterlere göre seçim (D-030) | PHASE 07 (blocker) |
| **OD-09** | IP / user-agent saklama | Ham IP yok, HMAC'li IP; UA yok | PHASE 03 |
| **OD-10** | Mevcut müşteriye bağlarken iletişim bilgileri güncellensin mi? | Yalnızca çalışan açıkça işaretlerse | PHASE 06 |
| **OD-11** | Personel e-posta ile self-servis şifre sıfırlama | MVP'de yok (D-020) | PHASE 03 |
| **OD-12** | Production planları ve bütçe (Vercel Pro, Neon Launch/Scale) | Pro + Launch (D-024) | PHASE 13 |
| **OD-13** | Node.js 24 vs 26 | 24.x (D-003) | PHASE 01 |
| **OD-14** | Müşteri paneli iletişim alanı içeriği, şirket bilgileri | Şirket sağlayacak | PHASE 07 |
| **OD-15** | Logo ve kurumsal kimlik | Geçici metin logo | PHASE 11 |
| **OD-16** | Varsayılan dosya limitleri (10 MB, şablon başına 1 dosya, maks 10) | Önerildiği gibi | PHASE 05 |
| **OD-17** | Personel `UNDER_REVIEW` sırasında müşteri adına yükleme yapabilsin mi? | Hayır — müşteriyle aynı kural (BR-44) | PHASE 08 |
| **OD-18** | Başvuru başına tek aktif bağlantı | Evet (BR-100) | PHASE 06 |
| **OD-19** | EMPLOYEE bağlantıyı yenileyebilsin mi? (iptal yalnızca ADMIN) | Yenileme: evet önerilir; onaya kadar hayır | PHASE 06 |
| **OD-20** | Production domain'i | Şirket belirleyecek (ör. `panel.<domain>`) | PHASE 13 |
| **OD-21** | WhatsApp hazır mesaj metni (müşteri adı içersin mi?) | Ad içermeyen kısa metin | PHASE 06 |
| **OD-22** | Güvenlik parametreleri: personel şifresi min 12 kr., personel oturumu 12 saat, müşteri oturumu 12 saat / 60 dk boşta, OTP 10 dk / 5 deneme | Önerildiği gibi | PHASE 03 / 07 |
| **OD-23** | Arşivleme yalnızca terminal statülerde mi? (BR-140) | Evet | PHASE 06 |

## Security Blockers (production öncesi)
[SECURITY.md](SECURITY.md) §11 listesi. Özet: OD-01, OD-07, OD-08 kararları; KVKK hukuki değerlendirmesi; ücretli planlar; ortam izolasyonu; güvenlik testleri; yedek provası; bağımlılık taraması; `.gitignore`.

## Latest Verification Results (2026-11-24)
- Çalışma dizini: Git repo, `main`, temiz; yalnızca `README.md` ve `.gitignore` mevcuttu; remote `origin` = GitHub `gokturkdogan/Cs-Global-Panel`.
- Ortam: Node 24.22.1, pnpm 10.28.2, Git 2.54.0.
- Paket sürümleri npm registry'den doğrulandı ([TECH_STACK.md](TECH_STACK.md) §2).
- Peer dependency analizi: TS 7 ↔ typescript-eslint uyumsuzluğu tespit edildi; diğer peer'lar uyumlu.
- Platform özellikleri resmî dokümanlardan doğrulandı: Vercel Blob private storage, client upload, Functions limitleri, Node sürümleri, bölgeler, Hobby ticari kullanım kısıtı; Neon planları/bölgeleri/sürücüleri/branching; Better Auth username/admin/rate-limit/session; Next.js 16 cache/proxy/Server Actions/CSP.
- Doğrulanamayanlar: [TECH_STACK.md](TECH_STACK.md) §6.
- Doküman tutarlılık kontrolü: tamamlandı (ID referansları BR/D/OD/T/S çapraz kontrol edildi).
- Test: uygulanmadı (kod yok).
- Commit: **yapılmadı** (PHASE 00 kısıtı).

## Next Phase
**PHASE 01 — Project Initialization** — başlamak için: PHASE 00 onayı + D-002, D-003 (OD-13), D-004, D-031 onayı.
