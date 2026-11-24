# Yetkilendirme Matrisi

> Yetkilendirme **iki katmanlıdır**:
> 1. **RBAC** — rol bir aksiyona izin veriyor mu? (`can(actor, permission)`)
> 2. **Kaynak bazlı (ABAC)** — bu aktör *bu* kaynağa erişebilir mi? (`canAccessApplication(actor, application)`) + iş kuralı guard'ları ([STATE_TRANSITIONS.md](STATE_TRANSITIONS.md)).
>
> Kontroller her Server Action / Route Handler / veri okuma fonksiyonunun **içinde** yapılır. `proxy.ts` yalnızca iyimser (optimistic) yönlendirme yapar; güvenlik sınırı değildir.

## 1. Aktör Tipleri

| Aktör | Kimlik kaynağı | Kapsam |
|---|---|---|
| `ADMIN` | Better Auth session (`users.role = 'admin'`) | Tüm sistem |
| `EMPLOYEE` | Better Auth session (`users.role = 'employee'`) | Görünürlük kapsamındaki başvurular (§3) |
| `CUSTOMER` | `customer_sessions` (bağlantı + doğrulama sonrası) | **Yalnızca** oturumun bağlı olduğu tek başvuru |
| `SYSTEM` | Cron / callback (secret veya imza doğrulamalı) | Tanımlı bakım işleri |

Pasif (`banned = true`) kullanıcı her istekte reddedilir (session doğrulaması + kullanıcı durumu kontrolü).

## 2. İzin Matrisi

Lejant: ✅ izinli · ❌ yasak · 🔶 kapsam/koşul (§3, BR referansı) · 👤 yalnızca kendi kaydı

### 2.1 Başvurular

| İzin kodu | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `application:list` | ✅ tümü | 🔶 kapsam | ❌ |
| `application:read` | ✅ | 🔶 kapsam | 🔶 yalnızca kendi oturum başvurusu, müşteri DTO'su |
| `application:create` | ✅ | ✅ | ❌ |
| `application:update_customer_info` | ✅ | 🔶 kapsam | ❌ |
| `application:archive` / `unarchive` | ✅ (BR-140) | ❌ | ❌ |
| `application:assign` (atama) | ✅ | ❌ (Proposed) | ❌ |
| `application:submit` (T1/T4) | ✅ müşteri adına | 🔶 müşteri adına | 🔶 kendi başvurusu |
| `application:transition` (T2/T3/T5/T6) | ✅ | 🔶 kapsam | ❌ |
| `application:cancel` (T7) | ✅ | 🔶 kapsam (OD-05) | ❌ |
| `application:read_status_history` | ✅ tam | 🔶 tam | 🔶 statü + tarih |
| `application:read_activity` (işlem geçmişi) | ✅ | 🔶 kapsam | ❌ |

### 2.2 Erişim bağlantısı

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `access_link:view_copy` | ✅ | 🔶 kapsam | ❌ |
| `access_link:rotate` (yenile) | ✅ | ❌ (OD-19 onaylanırsa 🔶 kapsam) | ❌ |
| `access_link:revoke` (iptal) | ✅ | ❌ (Proposed) | ❌ |

> Brief: ADMIN "iptal etme ve yenileme", EMPLOYEE "görüntüleme ve kopyalama". Çalışanın müşteri bağlantıyı kaybettiğinde yenileyebilmesi operasyonel olarak gerekli olabilir → **OD-19**. Onaylanana kadar varsayılan: EMPLOYEE yalnızca görüntüle/kopyala.

### 2.3 Evraklar ve dosyalar

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `document:read` (liste, statü) | ✅ | 🔶 kapsam | 🔶 kendi başvurusu |
| `file:view_download` | ✅ `CLEAN` | 🔶 kapsam, `CLEAN` | 🔶 kendi başvurusu, `CLEAN` |
| `file:upload` | ✅ müşteri adına, BR-44 | 🔶 müşteri adına, BR-44 | 🔶 BR-44 |
| `file:remove` | ✅ BR-44 | 🔶 BR-44 | 🔶 BR-44 |
| `document:review` (onay / düzeltme) | ✅ D4–D6 | 🔶 kapsam, D4–D6 | ❌ |
| `document:read_versions` (eski versiyonlar) | ✅ | 🔶 kapsam | ❌ (yalnızca güncel set) |
| `document_comment:create` | ✅ | 🔶 kapsam | ❌ |
| `document_comment:read` | ✅ | 🔶 kapsam | 🔶 kendi başvurusu |

### 2.4 Şirket içi notlar

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `internal_note:create` | ✅ | 🔶 kapsam | ❌ |
| `internal_note:read` | ✅ | 🔶 kapsam | ❌ **(hiçbir payload'da yer almaz — BR-121)** |

### 2.5 Yönetim

| İzin | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| `service:read` (aktif liste — başvuru formu için) | ✅ | ✅ | ❌ |
| `service:manage` (oluştur/düzenle/aktif-pasif/sırala) | ✅ | ❌ | ❌ |
| `document_template:manage` | ✅ | ❌ | ❌ |
| `user:list` / `user:read` | ✅ | 👤 kendi profili | ❌ |
| `user:create` | ✅ | ❌ | ❌ |
| `user:update` (ad, e-posta, kullanıcı adı) | ✅ (BR-133) | ❌ | ❌ |
| `user:set_role` | ✅ (BR-133) | ❌ | ❌ |
| `user:deactivate` / `reactivate` | ✅ (BR-133) | ❌ | ❌ |
| `user:reset_password` | ✅ | ❌ | ❌ |
| `user:revoke_sessions` | ✅ | 👤 kendi diğer oturumları | ❌ |
| `user:change_own_password` | 👤 | 👤 | ❌ |
| `user:impersonate` | ❌ (devre dışı — Proposed) | ❌ | ❌ |
| `settings:read` | ✅ | ❌ (yalnızca iletişim bilgileri gibi gerekli public ayarlar sunucu tarafında kullanılır) | ❌ |
| `settings:update` | ✅ | ❌ | ❌ |
| `audit_log:read` | ✅ | ❌ | ❌ |
| `dashboard:read_stats` | ✅ tümü | 🔶 kapsam | ❌ |

## 3. Çalışan Görünürlük Kapsamı (ürün kararı — OD-03)

Sistem ayarı: `employeeApplicationScope: 'ALL' | 'ASSIGNED_ONLY'` (Proposed varsayılan: `ALL`).

| Kapsam | EMPLOYEE görebildikleri |
|---|---|
| `ALL` | Tüm arşivlenmemiş başvurular |
| `ASSIGNED_ONLY` | `assigned_user_id = actor.id` **veya** `created_by_user_id = actor.id` olan başvurular |

Uygulama:
- Tek bir fonksiyon: `applicationScopeFilter(actor): SQL` — tüm liste/arama/sayaç sorgularına eklenir.
- Tek bir fonksiyon: `assertCanAccessApplication(actor, applicationId)` — tüm detay/mutasyon girişlerinde çağrılır; kapsam dışındaysa **404** döner (varlığı sızdırmamak için 403 yerine).
- `applications.assigned_user_id` kolonu MVP'de bulunur (nullable). Atama UI'ı OD-03 kararına göre PHASE 06/10'da eklenir.

## 4. Müşteri Erişimi Kuralları

- Müşteri oturumu tam olarak **bir** `application_id`'ye bağlıdır. Tüm müşteri sorguları `WHERE application_id = session.applicationId` ile başlar; istemciden gelen `applicationId` **kabul edilmez**.
- Müşteri dosya isteği: `fileId` → dosyanın `application_id`'si oturumla eşleşmiyorsa **404**.
- Müşteri, `customer_id` üzerinden başka başvurulara asla yönlendirilmez.
- Müşteri DTO'ları whitelist alanlardan oluşur; `internal_notes`, `assigned_user`, aktör adları, `reason` (iptal), tarama ayrıntıları, audit verisi **hiçbir zaman** dahil edilmez.

## 5. Uygulama Kuralları (kod)

1. İzinler `src/server/auth/permissions.ts` içinde tek yerde tanımlanır (`Permission` union tipi + rol → izin haritası). Better Auth admin plugin'in `createAccessControl` mekanizması kullanıcı yönetimi uç noktaları için aynı haritadan beslenir.
2. Her Server Action şu sırayı izler: **(1) input'u Zod ile doğrula → (2) aktörü sunucuda çöz → (3) RBAC → (4) kaynak kapsamı → (5) domain guard → (6) transaction → (7) audit → (8) DTO döndür.**
3. Mass assignment engeli: action input şemaları yalnızca izin verilen alanları içerir; `role`, `status`, `version`, `created_by` gibi alanlar istemciden alınmaz (status için aksiyon kodu alınır).
4. Yetki hataları kullanıcıya genel mesajla döner ("Bu işlem için yetkiniz bulunmuyor."); ayrıntı loglanır (PII'siz).
5. Her matristeki ❌ hücre için en az bir negatif test bulunur ([TESTING_STRATEGY.md](TESTING_STRATEGY.md) §4).
