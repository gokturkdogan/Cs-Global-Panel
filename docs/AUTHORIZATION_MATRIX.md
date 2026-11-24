# Yetkilendirme Matrisi

> Yetkilendirme iki katmanlıdır:
> 1. **RBAC** — rol bu aksiyona izin veriyor mu? (`can(role, permission)`)
> 2. **Kaynak bazlı** — aktör *bu* kaynağa erişebilir mi + iş kuralı guard'ları ([STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)). Personel için kaynak kontrolü: başvuru var ve silinme sürecinde değil. Müşteri için: kaynak, oturumun bağlı olduğu tek başvuruya ait.
>
> Kontroller her Server Action / Route Handler / veri okuma fonksiyonunun **içinde** yapılır. `proxy.ts` yalnızca iyimser yönlendirme yapar.

## 1. Aktör Tipleri

| Aktör | Kimlik kaynağı | Kapsam |
|---|---|---|
| `ADMIN` | Better Auth session (`users.role = 'admin'`) | Tüm sistem |
| `EMPLOYEE` | Better Auth session (`users.role = 'employee'`) | **Tüm başvurular** (OD-03) — yönetim işlemleri hariç |
| `CUSTOMER` | Müşteri oturum cookie'si (bağlantıyla oluşturulur) | **Yalnızca** oturumun bağlı olduğu tek başvuru |
| `SYSTEM` | Cron / Blob callback (secret veya SDK doğrulaması) | Tanımlı teknik işler |

Pasif (`banned = true`) kullanıcı her istekte reddedilir. Atama, "yalnızca atananlar" kapsamı, kapsam ayarı **yoktur** (OD-03). Tüm başvurulara erişim, EMPLOYEE'ye yönetici yetkisi vermez.

## 2. İzin Matrisi

Lejant: ✅ izinli · ❌ yasak · 🔶 koşullu (BR / guard referansı)

### 2.1 Başvurular

| İzin kodu | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `application:list` | ✅ | ✅ | ❌ |
| `application:read` | ✅ | ✅ | 🔶 yalnızca kendi oturum başvurusu, müşteri DTO'su |
| `application:create` | ✅ | ✅ | ❌ |
| `application:update_customer_info` | ✅ | ✅ | ❌ |
| `application:submit` (T1/T4) | ✅ müşteri adına | ✅ müşteri adına | 🔶 kendi başvurusu, BR-50 |
| `application:transition` (T2, T3, T5, T6) | ✅ | ✅ | ❌ |
| `application:cancel` (T7, gerekçeli) | ✅ | ✅ | ❌ |
| `application:reopen_revert` (T8–T12, gerekçeli) | ✅ | ❌ | ❌ |
| `application:delete` (BR-150) | ✅ | ❌ | ❌ |
| `application:read_status_history` | ✅ tam | ✅ tam | 🔶 statü + tarih |
| `application:read_activity` (başvurunun işlem geçmişi) | ✅ | ✅ | ❌ |

### 2.2 Müşteri bağlantısı (OD-19)

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `access_link:view_copy` (görüntüle, kopyala, WhatsApp ile paylaş) | ✅ | ✅ | ❌ |
| `access_link:rotate` (yenile / iptal edilmişin yerine yeni oluştur) | ✅ | ✅ | ❌ |
| `access_link:revoke` (iptal) | ✅ | ✅ | ❌ |

### 2.3 Evraklar ve dosyalar

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `document:read` (liste, statü) | ✅ | ✅ | 🔶 kendi başvurusu |
| `file:view_download` | ✅ `ACTIVE`/`SUPERSEDED`/`REMOVED` | ✅ aynı | 🔶 yalnızca kendi başvurusunun `ACTIVE` dosyaları |
| `file:upload` / `file:replace` | 🔶 müşteri adına, BR-44 (UNDER_REVIEW dahil) | 🔶 aynı | 🔶 BR-44 (UNDER_REVIEW hariç) |
| `file:remove` | 🔶 BR-44 (UNDER_REVIEW hariç) | 🔶 aynı | 🔶 BR-44 |
| `document:review` (onay / düzeltme) | 🔶 D4–D6, BR-57 | 🔶 aynı | ❌ |
| `document:read_versions` | ✅ | ✅ | ❌ |
| `document_comment:create` | ✅ | ✅ | ❌ |
| `document_comment:read` | ✅ | ✅ | 🔶 kendi başvurusu |

### 2.4 Şirket içi notlar

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `internal_note:create` | ✅ | ✅ | ❌ |
| `internal_note:read` | ✅ | ✅ | ❌ **(hiçbir payload'da yer almaz — BR-121)** |

### 2.5 Yönetim

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `service:read` (aktif hizmetler — başvuru formu) | ✅ | ✅ | ❌ |
| `service:manage` (oluştur/düzenle/aktif-pasif/sırala) | ✅ | ❌ | ❌ |
| `document_template:manage` | ✅ | ❌ | ❌ |
| `user:list` / `user:read` | ✅ | ❌ | ❌ |
| `user:create` (kullanıcı adı + şifre belirler) | ✅ | ❌ | ❌ |
| `user:update` (ad, kullanıcı adı, e-posta) | ✅ (BR-133) | ❌ | ❌ |
| `user:set_role` | ✅ (BR-133) | ❌ | ❌ |
| `user:deactivate` / `reactivate` | ✅ (BR-133) | ❌ | ❌ |
| `user:set_password` (yeni şifre atar, mevcut şifreyi göremez; oturumları iptal eder) | ✅ (kendi hesabı dahil) | ❌ | ❌ |
| `user:revoke_sessions` | ✅ | ❌ | ❌ |
| `user:change_own_password` / self-servis sıfırlama | ❌ (ADMIN `user:set_password` kullanır) | ❌ (OD-11) | ❌ |
| `user:impersonate` | ❌ (devre dışı) | ❌ | ❌ |
| `audit_log:read` (genel işlem geçmişi sayfası) | ✅ | ❌ | ❌ |
| `dashboard:read_stats` | ✅ | ✅ | ❌ |

Ayarlar sayfası ve `settings:*` izinleri **yoktur** (sabit yapılandırma — OD-12, OD-14, OD-16, OD-22).

## 3. Kapalı Better Auth Uç Noktaları

Doğrudan API çağrısıyla yetki aşımını engellemek için (OD-11) aşağıdakiler HTTP üzerinden **kullanılamaz** olmalıdır: `sign-up/*`, `sign-in/email`, `change-password`, `change-email`, `update-user`, `delete-user`, `request-password-reset` / `forget-password`, `reset-password`, `is-username-available`, `admin/impersonate-user`, `admin/stop-impersonating`. Admin plugin uç noktaları (`admin/*`) HTTP'den çağrılamaz; yalnızca sunucudaki Server Action'lar `auth.api` ile kullanır (audit ve BR-133 kontrolleri atlanmasın diye). Uygulama yöntemi (`disabledPaths` + `hooks.before`) ve `auth.api` çağrılarına etkisi PHASE 03'te doğrulanır (TD-03).

## 4. Müşteri Erişimi Kuralları

- Müşteri oturumu tam olarak **bir** `application_id`'ye bağlıdır. Tüm müşteri sorguları oturumdan gelen `applicationId` ile kapsanır; istemciden gelen `applicationId` **kabul edilmez**.
- Her müşteri isteğinde: oturum imzası + süresi + bağlı bağlantının iptal edilmemiş olması + başvurunun silinme sürecinde olmaması kontrol edilir (BR-104).
- Müşteri dosya isteği: dosyanın `application_id`'si oturumla eşleşmiyorsa veya dosya `ACTIVE` değilse **404**.
- Müşteri DTO'ları whitelist alanlardan oluşur; iç notlar, personel adları, aktörler, gerekçeler, `rejection_reason` kodu, eski versiyonlar, audit verisi **hiçbir zaman** dahil edilmez.

## 5. Uygulama Kuralları (kod)

1. İzinler `src/server/auth/permissions.ts` içinde tek yerde (`Permission` union + rol → izin haritası).
2. Her Server Action: **(1) Zod doğrula → (2) aktörü sunucuda çöz → (3) RBAC → (4) kaynak kontrolü → (5) domain guard (kilit altında) → (6) transaction → (7) audit → (8) DTO**.
3. Mass assignment engeli: input şemaları `.strict()`; `role`, `status`, `version`, `created_by` istemciden alınmaz (statü için aksiyon kodu alınır).
4. Yetki hataları genel mesajla döner ("Bu işlem için yetkiniz bulunmuyor."). Müşteri için kapsam dışı kaynak = 404.
5. Matristeki her ❌ ve 🔶 hücre için en az bir test ([TESTING_STRATEGY.md](TESTING_STRATEGY.md) §4).
