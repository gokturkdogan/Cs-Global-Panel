# Yetkilendirme Modeli

> **OD-24 (2026-11-24):** Sistemde yalnızca **iki sabit şirket hesabı** vardır: bir `ADMIN`, bir `EMPLOYEE`. İkisi **birebir aynı uygulama yetkilerine** sahiptir. Rol bazlı (RBAC) veya izin bazlı yetkilendirme, izin matrisi, kullanıcıya özel yetki, rol bazlı menü ve ADMIN-only sayfa/işlem **yoktur**. Hesap türü yalnızca hesabı tanımlamak ve işlem geçmişinde ayırt etmek içindir.
> Önceki rol × izin matrisi ve `can(role, permission)` tasarımı kaldırıldı (geçmiş: [DECISION_LOG.md](DECISION_LOG.md) OD-24).

## 1. Erişim Kategorileri

| Kategori | Kimlik kaynağı | Kapsam |
|---|---|---|
| **Authenticated Staff** | Better Auth personel oturumu (geçerli, süresi dolmamış, veritabanında doğrulanan) + hesabın mevcut olması + hesap türünün `admin` veya `employee` olması | Şirket panelinin **tamamı** — iki hesap için **eşit** |
| **Customer** | Müşteri oturum cookie'si (bağlantıyla oluşturulur — PHASE 07) | **Yalnızca** oturumun bağlı olduğu tek başvuru; müşteri DTO'su |
| **Unauthenticated** | — | Korumalı hiçbir veri ve işlem yok (yalnızca giriş ekranı, geçersiz bağlantı sayfası) |

`SYSTEM` (cron, storage callback) secret/SDK doğrulamasıyla çalışan teknik işlerdir; kullanıcı kategorisi değildir.

## 2. Authenticated Staff — eşit erişim

Her iki hesap aşağıdakilerin **tamamını** yapabilir. Hesap türüne göre fark yoktur:

- Dashboard; tüm başvuruları görüntüleme, arama, filtreleme (atama yok — OD-03).
- Başvuru oluşturma ve müşteri bilgilerini düzenleme (PHASE 06 — uygulandı; 8 action'ın tamamı `requireStaff()` ile başlar, aktör oturumdan; E2E'de bir hesabın oluşturduğu başvuruyu diğer hesabın düzenlediği/bağlantısını yenilediği doğrulandı).
- Hizmet oluşturma/düzenleme/pasifleştirme/yeniden aktifleştirme; evrak şablonu ekleme/düzenleme/pasifleştirme/yeniden aktifleştirme/sıralama (PHASE 05 — uygulandı; her action `requireStaff()`, aktör oturumdan; E2E'de iki hesabın aynı form/aksiyonları gördüğü ve oluşturan/düzenleyen hesabın farklı olabildiği doğrulandı).
- Müşteri adına PDF yükleme ve değiştirme (BR-44), evrak inceleme, onay, düzeltme talebi.
- Statü geçişleri T1–T12 (iptal, iptal edilmişi/tamamlanmışı yeniden açma, izin verilen önceki statülere dönme dahil).
- Müşteri bağlantısını görüntüleme, kopyalama, WhatsApp ile paylaşma, iptal etme, yenileme (PHASE 06 — uygulandı; açığa çıkarma ve paylaşım hazırlığı audit'lenir).
- Şirket içi notlar; yorumlar; başvurunun işlem geçmişi; genel audit log görüntüleme.
- Başvurunun ve ilgili müşteri verilerinin/PDF'lerinin manuel kalıcı silinmesi (BR-150…BR-155).

Eşit ve tam yetki şu anlama **gelmez**:
- Keyfî statü değişikliği: her iki hesap da yalnızca [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) matrisindeki geçişleri, guard'larıyla yapar.
- Hassas işlemlerdeki onay, gerekçe, transaction ve audit gereksinimlerinin atlanması (iptal gerekçesi, silmede başvuru numarası onayı, bağlantı yenileme onayı).
- Audit kayıtlarının değiştirilmesi veya silinmesi (hiçbir hesap yapamaz — D-039).
- Veritabanı sahip yetkisi (uygulama her zaman en az yetkili `cs_app_runtime` ile çalışır — D-054).
- Müşterilerin şirket paneline erişmesi.

**Hesap yönetimi uygulamada yoktur.** Hiçbir hesap uygulama içinden kendi veya diğer hesabın şifresini değiştiremez, kullanıcı oluşturamaz/silemez/pasifleştiremez, rol değiştiremez. Hesaplar yalnızca yerel CLI ile oluşturulur (`pnpm auth:bootstrap`) ve şifre yalnızca yerel CLI ile sıfırlanır (`pnpm auth:reset-password`) — SECURITY §2.

## 3. Customer (PHASE 07)

- Müşteri oturumu tam olarak **bir** `application_id`'ye bağlıdır. Tüm müşteri sorguları oturumdan gelen `applicationId` ile kapsanır; istemciden gelen `applicationId` **kabul edilmez**.
- Her müşteri isteğinde: oturum imzası + süresi + bağlı bağlantının iptal edilmemiş olması + başvurunun silinme sürecinde olmaması kontrol edilir (BR-104).
- Müşteri yalnızca kendi başvurusunda: bilgileri ve statüyü görme, izinli durumlarda yükleme/değiştirme/kaldırma (BR-44), gönderme (BR-50), kendi `ACTIVE` dosyalarını görüntüleme/indirme, kendisine yazılan yorumları okuma.
- Müşteri dosya isteği: dosyanın `application_id`'si oturumla eşleşmiyorsa veya dosya `ACTIVE` değilse **404**.
- Müşteri DTO'ları whitelist alanlardan oluşur; iç notlar, personel adları, aktörler, gerekçeler, `rejection_reason` kodu, eski versiyonlar, audit verisi **hiçbir zaman** dahil edilmez (BR-121).

## 4. Uygulama Kuralları (kod)

1. Tek ortak personel kontrolü: `getCurrentStaff()` (oturum yoksa `null`) ve `requireStaff()` (yoksa `/login`'e yönlendirir; Route Handler'da 401). `requireAdmin()`, `requirePermission()`, `can()` veya rol bazlı guard **yoktur**.
2. Her Server Action / Route Handler / hassas veri okuyan Server Component kontrolü **kendi içinde** yapar. `proxy.ts`, layout, menü gizleme veya istemci kontrolü güvenlik sınırı değildir.
3. Akış: **(1) Zod doğrula → (2) personel/müşteri oturumunu sunucuda çöz → (3) kaynak kontrolü → (4) domain guard (kilit altında) → (5) transaction → (6) audit → (7) DTO**.
4. İstemciden gelen kullanıcı ID'si, rol, `status`, `version`, `created_by` kabul edilmez (Zod `.strict()`); audit ve kayıtlardaki aktör kimliği yalnızca doğrulanmış oturumdan alınır.
5. Oturumu olmayan istek: sayfada `/login`'e yönlendirme, Route Handler'da 401. Müşteri için kapsam dışı kaynak = 404.
6. Testler: her korumalı giriş noktası için oturumsuz erişim reddi; her iki hesabın aynı kontrolden geçtiği; manipüle edilmiş rol/aktör bilgisinin etkisiz olduğu ([TESTING_STRATEGY.md](TESTING_STRATEGY.md)).
