# API Sözleşmeleri

> Bu doküman **plan**dır; PHASE 00'da hiçbir endpoint implement edilmemiştir. İsimler PHASE ilerledikçe kesinleşir; değişiklikler CHANGELOG'a yazılır.
> Mimari gerekçe: [ARCHITECTURE.md](ARCHITECTURE.md) §6 · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) · Kurallar: [BUSINESS_RULES.md](BUSINESS_RULES.md)

## 1. Ortak Sözleşme

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```
- `message` Türkçe, kullanıcıya gösterilebilir; teknik ayrıntı içermez.
- Tüm action input'ları Zod `.strict()` şemalarıyla doğrulanır.
- Optimistic lock gerektiren mutasyonlar `expectedVersion: number` alır; uyuşmazlıkta `CONFLICT`.
- Liste uç noktaları: `page` (≥1), `pageSize` (10/20/50, varsayılan 20), sonuç `{ items, total, page, pageSize }`.
- Tarihler ISO 8601 UTC string olarak DTO'da; formatlama UI'da.

## 2. Server Actions — Personel

Tüm aksiyonlar `requireStaff(permission)` ile başlar.

### 2.1 Auth / Hesap (`features/auth/actions.ts`)
| Action | Input | Çıktı | İzin | Audit |
|---|---|---|---|---|
| `changeOwnPasswordAction` | `{ currentPassword, newPassword }` | `void` | 👤 | `USER_PASSWORD_CHANGED` |
| `revokeOwnOtherSessionsAction` | `{}` | `{ count }` | 👤 | `USER_SESSIONS_REVOKED` |

Giriş/çıkış Better Auth client (`authClient.signIn.username`, `signOut`) üzerinden `/api/auth/*`'a gider.

### 2.2 Başvurular (`features/applications/actions.ts`)
| Action | Input | Çıktı | İzin | Audit |
|---|---|---|---|---|
| `findCustomerMatchesAction` | `{ phone, email }` | `{ matches: { customerId, maskedName, maskedPhone, maskedEmail, applicationCount }[] }` | `application:create` | — |
| `createApplicationAction` | `{ idempotencyKey, firstName, lastName, phone, email, serviceId, internalNote?, customerChoice: { type: 'new' } \| { type: 'existing', customerId, updateContact: boolean } }` | `{ applicationId, applicationNumber, customerFullName, serviceName, accessLink }` | `application:create` | `APPLICATION_CREATED`, `ACCESS_LINK_CREATED` |
| `updateCustomerInfoAction` | `{ applicationId, expectedVersion, firstName, lastName, phone, email }` | `{ version }` | `application:update_customer_info` | `APPLICATION_UPDATED` |
| `transitionApplicationAction` | `{ applicationId, expectedVersion, action: 'REQUEST_REVISION' \| 'APPROVE_DOCUMENTS' \| 'START_PROCESSING' \| 'COMPLETE' \| 'CANCEL', reason? }` | `{ status, version }` | `application:transition` / `application:cancel` | `APPLICATION_STATUS_CHANGED` |
| `submitOnBehalfAction` | `{ applicationId, expectedVersion }` | `{ status, version }` | `application:submit` | `APPLICATION_SUBMITTED` / `RESUBMITTED` |
| `archiveApplicationAction` / `unarchiveApplicationAction` | `{ applicationId }` | `void` | `application:archive` | `APPLICATION_ARCHIVED` / `UNARCHIVED` |
| `assignApplicationAction` (OD-03) | `{ applicationId, userId \| null }` | `void` | `application:assign` | `APPLICATION_UPDATED` |
| `revealAccessLinkAction` | `{ applicationId }` | `{ accessLink, expiresAt }` | `access_link:view_copy` | `ACCESS_LINK_VIEWED` |
| `rotateAccessLinkAction` | `{ applicationId }` | `{ accessLink, expiresAt }` | `access_link:rotate` | `ACCESS_LINK_ROTATED` |
| `revokeAccessLinkAction` | `{ applicationId }` | `void` | `access_link:revoke` | `ACCESS_LINK_REVOKED` |
| `addInternalNoteAction` | `{ applicationId, requirementId?, body }` | `{ noteId }` | `internal_note:create` | `INTERNAL_NOTE_ADDED` |

Okuma (RSC'den doğrudan çağrılan server-only fonksiyonlar, action değil): `listApplications(actor, filters)`, `getStaffApplicationDetail(actor, id)`, `getDashboardStats(actor)`.

Liste filtreleri (`searchParams`, Zod ile parse): `q` (2–100 kr.), `serviceId`, `status`, `createdFrom`, `createdTo` (Europe/Istanbul günü → UTC aralık), `archived` (`exclude` \| `only`), `page`, `pageSize`, `sort` (`created_desc` varsayılan).

### 2.3 Evraklar (`features/documents/actions.ts`)
| Action | Input | Çıktı | İzin | Audit |
|---|---|---|---|---|
| `reviewDocumentAction` | `{ requirementId, expectedVersion, decision: 'APPROVED' \| 'REVISION_REQUIRED', customerMessage? }` | `{ status, version, reviewId }` | `document:review` | `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` |
| `addDocumentCommentAction` | `{ applicationId, requirementId?, body }` | `{ commentId }` | `document_comment:create` | `DOCUMENT_COMMENT_ADDED` |
| `removeFileAction` (personel) | `{ fileId }` | `{ requirementStatus }` | `file:remove` | `DOCUMENT_DELETED` |
| `confirmUploadAction` (ortak) | `{ fileId }` | `{ fileId, uploadStatus, scanStatus }` | upload'ı başlatan aktör | `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` |

### 2.4 Hizmetler (`features/services/actions.ts`) — yalnızca ADMIN
| Action | Input | Çıktı | Audit |
|---|---|---|---|
| `createServiceAction` | `{ name, description?, isActive }` | `{ serviceId }` | `SERVICE_CREATED` |
| `updateServiceAction` | `{ serviceId, name, description? }` | `void` | `SERVICE_UPDATED` |
| `setServiceActiveAction` | `{ serviceId, isActive }` | `void` | `SERVICE_ACTIVATED` / `DEACTIVATED` |
| `reorderServicesAction` | `{ orderedIds: uuid[] }` | `void` | `SERVICE_UPDATED` |
| `createDocumentTemplateAction` | `{ serviceId, title, description?, instructions?, isRequired, maxFileSizeBytes?, maxFileCount? }` | `{ requirementId }` | `DOCUMENT_TEMPLATE_CREATED` |
| `updateDocumentTemplateAction` | `{ requirementId, ...aynı alanlar, isActive }` | `void` | `DOCUMENT_TEMPLATE_UPDATED` |
| `reorderDocumentTemplatesAction` | `{ serviceId, orderedIds }` | `void` | `DOCUMENT_TEMPLATE_UPDATED` |

### 2.5 Çalışanlar (`features/employees/actions.ts`) — yalnızca ADMIN
Better Auth admin plugin'in **server-side** API'si (`auth.api.*`) üzerinden; istemciye admin client açılmaz.

| Action | Input | Çıktı | Audit |
|---|---|---|---|
| `createEmployeeAction` | `{ name, username, email, role, temporaryPassword }` | `{ userId }` | `USER_CREATED` |
| `updateEmployeeAction` | `{ userId, name, username, email }` | `void` | `USER_UPDATED` |
| `setEmployeeRoleAction` | `{ userId, role }` | `void` | `USER_ROLE_CHANGED` |
| `deactivateEmployeeAction` / `reactivateEmployeeAction` | `{ userId, reason? }` | `void` | `USER_DEACTIVATED` / `REACTIVATED` |
| `resetEmployeePasswordAction` | `{ userId, temporaryPassword }` | `void` | `USER_PASSWORD_RESET` (+ oturum iptali) |
| `revokeEmployeeSessionsAction` | `{ userId }` | `{ count }` | `USER_SESSIONS_REVOKED` |

Geçici şifre: ADMIN UI'da güvenli rastgele şifre **üretilir** (client-side `crypto.getRandomValues`) ve bir kez gösterilir; sunucuya yalnızca action input'u olarak gider, loglanmaz.

### 2.6 Ayarlar (`features/settings/actions.ts`) — yalnızca ADMIN
| Action | Input | Audit |
|---|---|---|
| `updateSettingsAction` | `system_settings` alanlarının alt kümesi (Zod) | `SETTINGS_UPDATED` |

### 2.7 Audit (okuma)
`listAuditLogs(actor, { action?, actorUserId?, resourceType?, resourceId?, applicationId?, from?, to?, page, pageSize })` — yalnızca ADMIN.

## 3. Server Actions — Müşteri (`features/portal/actions.ts`)

Kapsam her zaman oturumdan (`requireCustomer()`); input'ta `applicationId` **yoktur**.

| Action | Ön koşul | Input | Çıktı | Audit |
|---|---|---|---|---|
| `requestOtpAction` | Pre-auth cookie | `{}` | `{ maskedEmail, resendAvailableAt }` | `CUSTOMER_OTP_SENT` |
| `verifyOtpAction` | Pre-auth cookie | `{ code: /^\d{6}$/ }` | redirect `/portal` | `CUSTOMER_ACCESS_GRANTED` / `CUSTOMER_OTP_FAILED` |
| `exchangeFragmentTokenAction` (yalnızca OD-02 = fragment) | — | `{ token }` | redirect `/portal/verify` | — |
| `submitForReviewAction` | Customer session | `{ expectedVersion }` | `{ status }` | `APPLICATION_SUBMITTED` / `RESUBMITTED` |
| `removeOwnFileAction` | Customer session | `{ fileId }` | `{ requirementStatus }` | `DOCUMENT_DELETED` |
| `confirmUploadAction` | Customer session | `{ fileId }` | `{ uploadStatus, scanStatus }` | `DOCUMENT_UPLOADED` |
| `getUploadStatusAction` | Customer session | `{ fileIds: uuid[] (≤10) }` | `{ fileId, scanStatus }[]` | — (tarama durumunu poll etmek için, 3 sn aralık, maks 2 dk) |
| `customerLogoutAction` | Customer session | `{}` | redirect | — |

Okuma: `getCustomerPortalView(customerSession)` → `CustomerPortalDTO`:
```ts
type CustomerPortalDTO = {
  customer: { firstName: string; lastName: string; phone: string; email: string };
  application: { number: string; serviceName: string; createdAt: string; status: ApplicationStatus; statusLabel: string; readOnly: boolean };
  progress: { activeStep: 1|2|3|4|5|null; revision: boolean };
  completion: { requiredTotal: number; requiredUploaded: number; requiredApproved: number; percent: number };
  documents: Array<{
    id: string; title: string; description: string | null; instructions: string | null;
    isRequired: boolean; status: DocumentStatus; statusLabel: string;
    maxFileSizeBytes: number; maxFileCount: number; canModify: boolean;
    latestRevisionMessage: string | null;
    comments: Array<{ body: string; createdAt: string }>;
    files: Array<{ id: string; name: string; sizeBytes: number | null; uploadedAt: string | null; scanStatus: 'PENDING'|'CLEAN'|'REJECTED'|'ERROR'; canRemove: boolean }>;
  }>;
  canSubmit: boolean; submitBlockers: string[];
  contact: { companyName: string; phone?: string; email?: string; whatsapp?: string; message?: string };
};
```
**İçermez:** iç notlar, personel adları, aktörler, iptal gerekçesi, `scan_reason_code`, eski versiyonlar, audit, assigned user, ID'ler dışında iç alanlar.

## 4. Route Handlers

### 4.1 `GET|POST /api/auth/[...all]`
Better Auth `toNextJsHandler(auth)`. Açık uç noktalar (PHASE 03'te kesinleşir): `sign-in/username`, `sign-out`, `get-session`, `change-password`, `admin/*` (yalnızca server-side `auth.api` ile kullanılır; client admin çağrıları için de sunucu yetki kontrolü Better Auth'ta). Kapatılanlar: `sign-up/*`, `sign-in/email`, `is-username-available`, `admin/impersonate-user`.

### 4.2 `POST /api/uploads`
`handleUpload` (`@vercel/blob/client`).
- **Token isteği** (client'tan): `clientPayload = JSON.stringify({ requirementId, fileName, size })`. `onBeforeGenerateToken`: aktör (staff veya customer cookie) + BR-44 + limitler → `PENDING` kayıt → `{ allowedContentTypes: ['application/pdf'], maximumSizeInBytes, validUntil, addRandomSuffix: false, tokenPayload: JSON.stringify({ fileId }) }`. Pathname sunucu tarafından belirlenir.
- **Callback** (Blob'dan): `onUploadCompleted({ blob, tokenPayload })` → `completeUpload(fileId, blob)` idempotent → tarama tetikle.
- Hatalar: 400 (kalıcı — Blob yeniden denemez), 429 (rate limit), 500 (geçici).
- Cookie tabanlı auth: token isteği same-origin `fetch` ile gelir; Origin header kontrolü yapılır (Server Action dışı olduğu için CSRF korumasını elle uygula: `Origin === APP_URL`).

### 4.3 `GET /api/files/[fileId]?disposition=inline|attachment`
[FILE_STORAGE.md](FILE_STORAGE.md) §3. Yanıt: `200` stream · `401` · `404` (yetkisiz/kapsam dışı/temiz değil — ayırt edilmez) · `429`.

### 4.4 `GET /b/[token]`
| Durum | Yanıt |
|---|---|
| Geçerli | `303 → /portal/verify` + `Set-Cookie: __Host-cs_preauth` |
| Geçersiz / iptal / süresi dolmuş | `200` genel bilgi sayfası (veya `303 → /portal/link-invalid`); ayrım yapılmaz: "Bu bağlantı geçerli değil veya süresi dolmuş. Lütfen CS Global ile iletişime geçin." |
| Rate limit | `429` aynı genel sayfa |
Her yanıt: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.

### 4.5 `GET /api/cron/cleanup`
`Authorization: Bearer ${CRON_SECRET}` zorunlu. Görevler: süresi dolan `PENDING` upload'lar, `REJECTED` blob'lar, OTP/oturum/rate-limit temizliği, terminal başvuruların bağlantı süresi, (ayar dolu ise) saklama süresi dolan dosyalar, tarama yeniden denemeleri. Her görev sınırlı batch (ör. 100) ile çalışır; yanıt `{ tasks: { name, processed }[] }`. Audit `RETENTION_PURGE_EXECUTED`.

## 5. Mutasyon Envanteri (özet)

| Alan | Mutasyon sayısı | Mekanizma |
|---|---|---|
| Auth/hesap | 2 + Better Auth | SA + RH |
| Başvuru | 11 | SA |
| Evrak/dosya | 4 + upload RH | SA + RH |
| Hizmet/şablon | 7 | SA |
| Çalışan | 6 | SA |
| Ayar | 1 | SA |
| Müşteri | 7 (+1 opsiyonel) | SA |
| Bakım | 1 | RH (cron) |
