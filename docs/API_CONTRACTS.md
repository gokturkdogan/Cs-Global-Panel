# API Sözleşmeleri

> **Plan**dır; uygulananlar işaretlidir (PHASE 03: giriş/çıkış; PHASE 05: §2.3 hizmetler; PHASE 06: §2.1 başvuru oluşturma, müşteri bilgisi, bağlantı ve arama). Değişiklikler CHANGELOG'a yazılır.
> Mimari: [ARCHITECTURE.md](ARCHITECTURE.md) §6 · Yetkiler: [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) · Kurallar: [BUSINESS_RULES.md](BUSINESS_RULES.md) · Şema: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

## 1. Ortak Sözleşme

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```
- `message` Türkçe, kullanıcıya gösterilebilir; token/iç ayrıntı içermez.
- Input'lar Zod `.strict()`.
- Optimistic lock gerektiren mutasyonlar `expectedVersion` alır → uyuşmazlıkta `CONFLICT`.
- Liste: `page` (≥1), `pageSize` (10/20/50, varsayılan 20) → `{ items, total, page, pageSize }`.
- Tarihler DTO'da ISO 8601 UTC.

## 2. Server Actions — Personel

Tümü `requireStaff()` ile başlar — iki hesap için aynı kontrol, rol/izin farkı yok (OD-24). "Erişim" kolonu yalnızca kimin çağırabileceğini gösterir.

### 2.1 Başvurular (`features/applications/actions.ts`)

**PHASE 06'da uygulanan sözleşme (D-078…D-085)** — planlanan tablodan farkları kalın:

| Action | Input | Çıktı | Audit |
|---|---|---|---|
| `getServicePreviewAction` (okuma) | `{ serviceId }` | `{ service: { id, name, description }, requirements: [{ id, title, description, instructions, isRequired }], fingerprint }` | — |
| `createApplicationAction` | `{ idempotencyKey, firstName, lastName, phone, email, serviceId, **templateFingerprint** }` (**`internalNote` yok**) | `{ applicationId, applicationNumber, customerFullName, serviceName, status, accessLink, accessTokenId, replayed }` (**`whatsappUrl` yok** — paylaşım ayrı action) | `APPLICATION_CREATED {serviceId}`, `ACCESS_LINK_CREATED {accessTokenId}` |
| `searchApplicationsAction` (okuma; arama metni URL'de değil) | `{ q, status, serviceId, page, pageSize }` | `{ items, total, page, pageSize, pageCount }` | — |
| `updateCustomerInfoAction` | `{ applicationId, expectedVersion, firstName, lastName, phone, email }` | `{ version, changed, contactChanged }` | `APPLICATION_UPDATED {changedFields}` |
| `revealAccessLinkAction` | `{ applicationId }` | `{ accessLink, accessTokenId } \| { accessLink: null, accessTokenId: null }` | `ACCESS_LINK_VIEWED {accessTokenId}` |
| `prepareWhatsAppShareAction` (**yeni**) | `{ applicationId }` | `{ whatsappUrl, message, accessTokenId, recipientName, recipientPhone }` | **`ACCESS_LINK_SHARE_PREPARED`** `{accessTokenId}` |
| `rotateAccessLinkAction` | `{ applicationId, **expectedActiveTokenId: uuid \| null** }` | `{ accessLink, accessTokenId, previousTokenId }` | `ACCESS_LINK_ROTATED` / `ACCESS_LINK_CREATED` |
| `revokeAccessLinkAction` | `{ applicationId, **expectedActiveTokenId** }` | `{ revokedTokenId }` | `ACCESS_LINK_REVOKED {accessTokenId}` |

Hata kodları: `VALIDATION` (+`fieldErrors`; telefon sunucuda `libphonenumber-js` ile), `NOT_FOUND` (yok/silme talepli), `CONFLICT` (eski version veya eski aktif token kimliği), **`STALE_PREVIEW`** (şablon önizlemeden sonra değişti), `INTERNAL` (token anahtarı yapılandırması dahil; ayrıntı yok). Liste filtreleri (`status`, `serviceId`, `page`, `pageSize`) URL'de; `createdFrom/createdTo` ve `sort` bu fazda uygulanmadı.

Aşağıdaki tablo ilk plandır (kalan satırlar sonraki fazlarda):

| Action | Input | Çıktı | Erişim | Audit |
|---|---|---|---|---|
| `createApplicationAction` | `{ idempotencyKey, firstName, lastName, phone, email, serviceId, internalNote? }` | `{ applicationId, applicationNumber, customerFullName, customerPhone, serviceName, accessLink, whatsappUrl }` | Personel | `APPLICATION_CREATED`, `ACCESS_LINK_CREATED` |
| `updateCustomerInfoAction` | `{ applicationId, expectedVersion, firstName, lastName, phone, email }` | `{ version }` | Personel | `APPLICATION_UPDATED` |
| `transitionApplicationAction` | `{ applicationId, expectedVersion, action: TransitionCode, reason?, revisionItems?: { requirementId, fileId, customerMessage }[] }` | `{ status, version }` | Personel (aksiyona göre) | `APPLICATION_STATUS_CHANGED` (+ T12'de `DOCUMENT_REVISION_REQUESTED`) |
| `submitOnBehalfAction` | `{ applicationId, expectedVersion }` | `{ status, version }` | Personel | `APPLICATION_SUBMITTED` / `RESUBMITTED` |
| `revealAccessLinkAction` | `{ applicationId }` | `{ accessLink, whatsappUrl, customerFullName, customerPhone } \| { accessLink: null }` | Personel | `ACCESS_LINK_VIEWED` |
| `rotateAccessLinkAction` | `{ applicationId, expectedVersion }` (yenileme ve iptal edilmişin yerine yeni oluşturma) | `{ accessLink, whatsappUrl }` | Personel | `ACCESS_LINK_ROTATED` / `ACCESS_LINK_CREATED` |
| `revokeAccessLinkAction` | `{ applicationId, expectedVersion }` | `void` | Personel | `ACCESS_LINK_REVOKED` |
| `addInternalNoteAction` | `{ applicationId, requirementId?, body }` | `{ noteId }` | Personel | `INTERNAL_NOTE_ADDED` |
| `deleteApplicationAction` (personel; idempotent — "Silmeyi tamamla" için de kullanılır) | `{ applicationId, confirmApplicationNumber }` | `{ status: 'DELETED' \| 'PENDING_RETRY' }` | Personel | `APPLICATION_DELETION_REQUESTED`, `APPLICATION_DELETED` |

`TransitionCode` (sunucudaki domain modülü doğrular): `REQUEST_REVISION`, `APPROVE_DOCUMENTS`, `START_PROCESSING`, `COMPLETE`, `CANCEL` (reason zorunlu), `REOPEN_CANCELLED`, `REOPEN_COMPLETED`, `REVERT_TO_DOCUMENTS_APPROVED`, `REVERT_TO_REVIEW`, `REVERT_FOR_REVISION` (reason + `revisionItems` zorunlu) — [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) T2–T12. `REOPEN_CANCELLED` hedef statü almaz; sunucu geçmişten belirler.

`whatsappUrl` sunucuda üretilir: `https://wa.me/<telefon rakamları>?text=<encodeURIComponent(BR-161 şablonu)>`. UI, açmadan önce onay penceresinde ad-soyad ve telefonu gösterir (BR-162).

Okuma (RSC'den çağrılan server-only fonksiyonlar): `listApplications(actor, filters)`, `getStaffApplicationDetail(actor, id)`, `getApplicationActivity(actor, id)`, `getDashboardStats(actor)`.

Liste filtreleri (`searchParams`, Zod): `q` (2–100), `status` (`ALL` \| 7 statü), `serviceId`, `createdFrom`, `createdTo` (Europe/Istanbul günü → UTC), `page`, `pageSize`, `sort` (`created_desc`). Arşiv filtresi yok.

### 2.2 Evraklar (`features/documents/actions.ts`)
| Action | Input | Çıktı | Erişim | Audit |
|---|---|---|---|---|
| `reviewDocumentAction` | `{ requirementId, fileId, expectedVersion, decision: 'APPROVED' \| 'REVISION_REQUIRED', customerMessage? }` | `{ status, version, reviewId }` | Personel | `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` |
| `addDocumentCommentAction` | `{ applicationId, requirementId?, body }` | `{ commentId }` | Personel | `DOCUMENT_COMMENT_ADDED` |
| `removeFileAction` | `{ fileId, expectedVersion }` | `{ requirementStatus }` | Personel | `DOCUMENT_DELETED` |
| `confirmUploadAction` (ortak) | `{ fileId }` | `{ fileId, status: 'VALIDATING' \| 'ACTIVE' \| 'REJECTED', message? }` | yüklemeyi başlatan aktör | `DOCUMENT_UPLOADED` / `DOCUMENT_REPLACED` / `DOCUMENT_VALIDATION_REJECTED` |
| `getUploadStatusAction` (ortak) | `{ fileId }` | `{ status, message? }` | yüklemeyi başlatan aktör | — |

`reviewDocumentAction`: `fileId` kilit altında aktif dosya değilse `CONFLICT` (BR-57).

### 2.3 Hizmetler (`features/services/actions.ts`) — personel — **PHASE 05'te uygulandı** (D-072…D-076)
Tüm action'lar nesne girdi alır, `requireStaff()` → Zod `.strict()` → servis (tek transaction: kilit → ilişki → `expectedVersion` → yazma → audit) sırasını izler ve `ActionResult<T>` döndürür. Hata kodları: `VALIDATION` (+`fieldErrors`), `NOT_FOUND` (yok veya başka hizmete ait evrak — IDOR), `CONFLICT` (eski version / kilit), `DUPLICATE` (aynı ad, büyük/küçük harf duyarsız), `INTERNAL`.

| Action | Input | Çıktı | Audit |
|---|---|---|---|
| `createServiceAction` | `{ name, description, isActive }` | `{ serviceId }` | `SERVICE_CREATED` |
| `updateServiceAction` | `{ serviceId, expectedVersion, name, description }` | `{ version, changed }` | `SERVICE_UPDATED` (değişiklik varsa) |
| `setServiceActiveAction` | `{ serviceId, isActive, expectedVersion }` | `{ version, activeRequirementCount }` | `SERVICE_ACTIVATED` / `SERVICE_DEACTIVATED` |
| `createRequirementAction` | `{ serviceId, title, description, instructions, isRequired }` | `{ requirementId }` | `DOCUMENT_TEMPLATE_CREATED` |
| `updateRequirementAction` | `{ serviceId, requirementId, expectedVersion, title, description, instructions, isRequired }` | `{ version, changed }` | `DOCUMENT_TEMPLATE_UPDATED` |
| `setRequirementActiveAction` | `{ serviceId, requirementId, isActive, expectedVersion }` | `{ version }` | `DOCUMENT_TEMPLATE_ACTIVATED` / `DEACTIVATED` |
| `moveRequirementAction` | `{ serviceId, requirementId, direction: "up" \| "down" }` | `{ moved }` | `DOCUMENT_TEMPLATE_UPDATED` (`changedFields: ["sortOrder"]`) |

`description`/`instructions` boş metin → `NULL`. Dosya boyutu/sayısı/tipi alanları yoktur; gönderilirse girdi reddedilir (OD-16). **Plandan çıkarılan:** `reorderServicesAction` (hizmetler ada göre sıralanır) ve `reorderDocumentTemplatesAction({orderedIds})` (yerine göreli `moveRequirementAction`) — D-072, D-075.

### 2.4 Kimlik doğrulama (`features/auth/actions.ts`) — çalışan yönetimi kaldırıldı (OD-24)
Uygulamada hesap yönetimi action'ı yoktur. Personel kimlik doğrulaması: `signInAction({ username, password })` ve `signOutAction()` (`features/auth/actions.ts`, PHASE 03). Hesap oluşturma ve şifre sıfırlama yalnızca yerel CLI'dır (`pnpm auth:bootstrap`, `pnpm auth:reset-password`).
### 2.5 Audit (okuma)
`listAuditLogs(actor, { action?, actorUserId?, resourceType?, applicationId?, from?, to?, page, pageSize })` — personel.

## 3. Server Actions — Müşteri (`features/portal/actions.ts`)

Kapsam her zaman müşteri oturumundan (`requireCustomerAccess(contextId)` — PHASE 07'de uygulandı); input'ta `applicationId` **yoktur**. **PHASE 08/09 sözleşmesi (D-095):** her müşteri action'ı ve dosya isteği `contextId` (URL bağlamı) alır; sunucu cookie bağlamıyla eşitliği, token aktifliğini ve başvurunun silinmediğini her istekte doğrular; uyuşmazlık → reddedilir, sayfa uyarı gösterir.

| Action | Input | Çıktı | Audit |
|---|---|---|---|
| `submitForReviewAction` | `{ expectedVersion }` | `{ status }` | `APPLICATION_SUBMITTED` / `RESUBMITTED` |
| `removeOwnFileAction` | `{ fileId, expectedVersion }` | `{ requirementStatus }` | `DOCUMENT_DELETED` |
| `confirmUploadAction` / `getUploadStatusAction` | §2.2 ile aynı | | |

Kaldırılan: `requestOtpAction`, `verifyOtpAction`, `exchangeFragmentTokenAction`, `customerLogoutAction`.

> **PHASE 07'de uygulanan okuma (D-091):** `getCustomerPortalView(db, access)` → `{ customer: { firstName, lastName }, application: { number, serviceName, createdAt, status }, documents: [{ title, description, instructions, isRequired, status, revisionMessage }] }`. İlerleme/tamamlanma sunucu bileşeninde saf fonksiyonlarla hesaplanır (D-092). Telefon/e-posta, kimlikler, dosya, yorum, `canSubmit` alanları **henüz yok** — aşağıdaki hedef DTO PHASE 08/09'da tamamlanır.

Hedef okuma: `getCustomerPortalView(portalSession)` → `CustomerPortalDTO`:
```ts
type CustomerPortalDTO = {
  customer: { firstName: string; lastName: string; phone: string; email: string };
  application: { number: string; serviceName: string; createdAt: string; status: ApplicationStatus; statusLabel: string; readOnly: boolean };
  progress: { activeStep: 1|2|3|4|5|null; revision: boolean };
  completion: { requiredTotal: number; requiredUploaded: number; requiredApproved: number; percent: number };
  documents: Array<{
    id: string; title: string; description: string | null; instructions: string | null;
    isRequired: boolean; status: DocumentStatus; statusLabel: string; version: number;
    canUpload: boolean; canRemove: boolean;
    latestRevisionMessage: string | null;
    comments: Array<{ body: string; createdAt: string }>;
    activeFile: { id: string; name: string; sizeBytes: number; uploadedAt: string } | null;
    pendingUpload: { id: string; status: 'UPLOAD_PENDING' | 'VALIDATING' } | null;
  }>;
  canSubmit: boolean; submitBlockers: string[];
  contact: { companyName: string; phone: string | null; whatsappUrl: string | null };
};
```
**İçermez:** iç notlar, personel adları, aktörler, gerekçeler, `rejection_reason` kodu (yalnızca Türkçe mesaj), eski versiyonlar, audit, token.

## 4. Route Handlers

### 4.1 `/api/auth/*` — **bağlanmaz** (D-060)
Better Auth HTTP route'u yoktur; tüm `/api/auth/*` istekleri 404 döner. Personel girişi ve çıkışı Server Action'lardır (`signInAction`, `signOutAction` — §2.4); oturum sunucuda `auth.api.getSession` ile okunur. Kayıt, e-posta ile giriş, şifre değiştirme/sıfırlama, e-posta değiştirme, kullanıcı güncelleme/silme, impersonation ve admin uç noktaları HTTP'den erişilemez.

### 4.2 `POST /api/uploads`
`handleUpload`:
- **Token isteği** (client): `clientPayload = { requirementId, fileName, size }`; `Origin === APP_URL` kontrolü; aktör (staff cookie veya portal cookie); BR-44; `size ≤ MAX_PDF_SIZE_BYTES`; transaction'da önceki pending'i `EXPIRED`, yeni `UPLOAD_PENDING`; yanıt: `{ allowedContentTypes: ['application/pdf'], maximumSizeInBytes: MAX_PDF_SIZE_BYTES, validUntil: now+15dk, addRandomSuffix: false, tokenPayload: { fileId } }` — pathname sunucuda.
- **Callback** (storage): `onUploadCompleted` → `completeUpload(fileId)` (idempotent: claim → doğrula → aktive et / reddet).
- Hatalar: 400 (kalıcı), 409 (`UPLOAD_IN_PROGRESS`), 429, 500.

### 4.3 `GET /api/files/[fileId]?disposition=inline|attachment`
[FILE_STORAGE.md](FILE_STORAGE.md) §3. `200` stream · `401` · `404` (yetkisiz/kapsam dışı/aktif değil — ayırt edilmez) · `429`.

### 4.4 `GET /b/[token]`
| Durum | Yanıt |
|---|---|
| Geçerli | `303 → APP_URL/portal/<bağlam>` + `Set-Cookie: __Host-cs_portal` (yerel http: `cs_portal`) |
| Geçersiz biçim / bilinmeyen / iptal / yenilenmiş / silinmekte | `303 → /link-invalid` (ayrım yok; mevcut oturuma dokunulmaz) |
| Yapılandırma / veritabanı hatası | `303 → /link-unavailable` |
| Rate limit | **Uygulanmadı** — TD-04 (PHASE 13); `429` yok (D-093) |
Her yanıt: `Cache-Control: private, no-store, max-age=0`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow, noarchive`. Hiçbir veri değiştirilmez, audit yazılmaz (BR-105). **PHASE 07'de uygulandı (D-087).**

### 4.4a Müşteri sayfaları (PHASE 07)
| Yol | Davranış |
|---|---|
| `/portal/<bağlam>` | `requireCustomerAccess`: geçerli → panel; cookie yok/geçersiz/iptal → "Bağlantınız kullanılamıyor"; süre doldu → "Oturumunuz sona erdi"; bağlam uyuşmazlığı → "Bu sayfa artık güncel değil"; geçici hata → "Şu anda erişilemiyor". Hiçbiri başka oturuma yönlendirmez; hatalı durumlarda kişisel veri dönmez. |
| `/portal` | Bağlamsız eski adres: oturum açmaz, "Oturumunuz sona erdi / bağlantıyı yeniden açın" bilgisi |
| `/link-invalid`, `/link-unavailable` | Genel bilgi + iletişim kartı; kişisel veri yok |

### 4.5 `GET /api/cron/cleanup`
`Authorization: Bearer ${CRON_SECRET}`. Görevler (teknik): süresi dolan `UPLOAD_PENDING` → `EXPIRED` + blob sil; takılı `VALIDATING` → `REJECTED`; reddedilmiş blob kalıntıları; orphan blob mutabakatı; yarım kalan başvuru silmelerini tamamlama; süresi dolmuş personel oturumları; süresi dolmuş rate limit anahtarları. Batch sınırlı; yanıt `{ tasks: { name, processed }[] }`; audit `TECHNICAL_CLEANUP_EXECUTED`. **Müşteri verisi saklama süresi işlemi içermez.**

## 5. Mutasyon Envanteri

| Alan | Sayı | Mekanizma |
|---|---|---|
| Başvuru (oluştur, müşteri bilgisi, geçiş, müşteri adına gönder, bağlantı göster/yenile/iptal, not, sil) | 9 | SA |
| Evrak/dosya (karar, yorum, kaldır, upload onayı, upload durumu) | 5 + upload RH | SA + RH |
| Hizmet/şablon (PHASE 05 — uygulandı) | 7 | SA |
| Personel kimlik doğrulama (giriş/çıkış) | 2 | SA |
| Müşteri (gönder, kaldır, upload onayı/durumu) | 4 | SA |
| Auth | Better Auth (giriş/çıkış) | RH |
| Teknik | 1 | RH (cron) |

Önceki sürüme göre kaldırılan: müşteri eşleştirme, arşiv/arşivden çıkarma, atama, ayarlar, OTP (2), fragment token, müşteri çıkışı, kendi şifresini değiştirme, kendi oturumlarını kapatma.
