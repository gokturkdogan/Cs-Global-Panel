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
| `addInternalNoteAction` (PHASE 10 — `src/features/internal-notes/actions.ts`) | `{ applicationId, requirementId?, body (1–5000 düz metin), idempotencyKey (uuid) }` | `{ noteId, created }` (not metni dönmez; aynı anahtar + aynı içerik → `created:false`; farklı içerik/kapsam → `CONFLICT`) | Personel | `INTERNAL_NOTE_ADDED { id }` |
| `requestDeletionAction` (PHASE 10 — `src/features/deletion/actions.ts`; önceki taslak adı `deleteApplicationAction`) | `{ applicationId, expectedVersion, reason (1–1000), confirmationNumber }` (storage anahtarı/versiyon/onay bayrağı kabul edilmez) | `{ state: 'DELETED' } \| { state: 'IN_PROGRESS', error } \| { state: 'BLOCKED', error }` (PHASE 10.1: `SETTLING` kaldırıldı; belirsiz yazım → `IN_PROGRESS` + `UPLOAD_OUTCOME_UNKNOWN`, takipsiz kayıt → `BLOCKED` + `LEGACY_UNVERIFIED`) (talep kaydedilir; ilk sınırlı adım hemen denenir; tekrar talep idempotent) | Personel | `APPLICATION_DELETION_REQUESTED { fileCount }`, gerekirse `APPLICATION_DELETION_FAILED { reason, count }`, `APPLICATION_DELETED { fileCount, count }` |
| `resumeDeletionAction` (PHASE 10) | `{ applicationId }` | Aynı durum birleşimi; eşzamanlı adım → `CONFLICT` (meşgul); tamamlanmış silme → `DELETED` (yan etkisiz) | Personel | `APPLICATION_DELETION_FAILED` (kategori değişince), `APPLICATION_DELETED` |
| `listOlderInternalNotesAction` (PHASE 10.1) | `{ applicationId, before (not uuid) }` | `{ items, nextCursor }` (en fazla 50; keyset) | Personel | — (okuma) |
| `resolveAuditApplicationAction` (PHASE 10 — `src/features/audit-logs/actions.ts`) | `{ applicationNumber }` | `{ applicationId }` (yalnızca mevcut başvuru; numara URL'ye yazılmaz) | Personel | — (okuma audit'lenmez) |

`TransitionCode` (sunucudaki domain modülü doğrular): `REQUEST_REVISION`, `APPROVE_DOCUMENTS`, `START_PROCESSING`, `COMPLETE`, `CANCEL` (reason zorunlu), `REOPEN_CANCELLED`, `REOPEN_COMPLETED`, `REVERT_TO_DOCUMENTS_APPROVED`, `REVERT_TO_REVIEW`, `REVERT_FOR_REVISION` (reason + `revisionItems` zorunlu) — [STATE_TRANSITIONS.md](STATE_TRANSITIONS.md) T2–T12. `REOPEN_CANCELLED` hedef statü almaz; sunucu geçmişten belirler.

`whatsappUrl` sunucuda üretilir: `https://wa.me/<telefon rakamları>?text=<encodeURIComponent(BR-161 şablonu)>`. UI, açmadan önce onay penceresinde ad-soyad ve telefonu gösterir (BR-162).

Okuma (RSC'den çağrılan server-only fonksiyonlar): `listApplications(actor, filters)`, `getStaffApplicationDetail(actor, id)`, `getApplicationActivity(actor, id)`, `getDashboardStats(actor)`. **PHASE 10:** `listInternalNotes(db, applicationId)` (en yeni 50 + toplam), `listAuditLogs(db, filters)`, `getDeletionProgress(db, applicationId)`, `listDeletionQueue(db)`.

**`/dashboard/audit-logs` (PHASE 10, D-119):** `searchParams` (geçersiz değerler yok sayılır): `from`, `to` (`YYYY-MM-DD`, Europe/Istanbul günü, bitiş dahil), `action` (bilinen event kodu), `actorType` (`USER`/`CUSTOMER`/`SYSTEM`/`ANONYMOUS`), `staffId`, `resourceType`, `applicationId` (UUID), `after`/`before` (audit kimliği imleci — `(occurred_at, id)` keyset), `pageSize` (10/20/50; varsayılan 20). DTO: tarih, Türkçe işlem etiketi, aktör türü, personel kullanıcı adı + hesap türü, kayıt türü, başvuru numarası (silinmişse "Başvuru artık mevcut değil"), allowlist ayrıntılar. Ham metadata, kimlikler ve serbest metin dönmez. Değiştirme/silme/dışa aktarma uç noktası yoktur.

Liste filtreleri (`searchParams`, Zod): `q` (2–100), `status` (`ALL` \| 7 statü), `serviceId`, `createdFrom`, `createdTo` (Europe/Istanbul günü → UTC), `page`, `pageSize`, `sort` (`created_desc`). Arşiv filtresi yok.

### 2.2 Evraklar (`features/documents/actions.ts`)
| Action | Input | Çıktı | Erişim | Audit |
|---|---|---|---|---|
| `reviewDocumentAction` | `{ requirementId, fileId, expectedVersion, decision: 'APPROVED' \| 'REVISION_REQUIRED', customerMessage? }` | `{ status, version, reviewId }` | Personel | `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` |
| `addDocumentCommentAction` | `{ applicationId, requirementId?, body }` | `{ commentId }` | Personel | `DOCUMENT_COMMENT_ADDED` |
| `removeFileAction` | `{ fileId, expectedVersion }` | `{ requirementStatus }` | Personel | `DOCUMENT_DELETED` |
| ~~`confirmUploadAction`~~ / ~~`getUploadStatusAction`~~ | — | — | — | **Superseded** (PHASE 08, D-100): yükleme tek Route Handler isteğinde senkron tamamlanır (§4.2) |

`reviewDocumentAction`: `fileId` kilit altında aktif dosya değilse `CONFLICT` (BR-57).

> **PHASE 09'da uygulandı (D-108…D-112) — `src/features/workflow/actions.ts` (personel):**
> | Action | Input (Zod `.strict()`) | Çıktı | Audit |
> |---|---|---|---|
> | `submitOnBehalfAction` | `{ applicationId, expectedVersion }` | `{ status, version }` | `APPLICATION_SUBMITTED` / `APPLICATION_RESUBMITTED` (`onBehalfOfCustomer`) |
> | `reviewDocumentAction` | `{ decision: 'APPROVED', requirementId, fileId, expectedVersion }` \| `{ decision: 'REVISION_REQUIRED', …, customerMessage (10–1000) }` | `{ status, version, reviewId }` | `DOCUMENT_APPROVED` / `DOCUMENT_REVISION_REQUESTED` |
> | `transitionApplicationAction` | `{ applicationId, expectedVersion, code: REQUEST_REVISION \| APPROVE_DOCUMENTS \| START_PROCESSING \| COMPLETE \| CANCEL \| REOPEN_CANCELLED \| REOPEN_COMPLETED \| REVERT_TO_DOCUMENTS_APPROVED \| REVERT_TO_REVIEW, reason? (T7–T11 zorunlu, ≤1000) }` | `{ status, version }` | `APPLICATION_STATUS_CHANGED {from, to, transitionCode}` |
> | `revertForRevisionAction` (T12) | `{ applicationId, expectedVersion, reason, documents: [{ requirementId, fileId, customerMessage }] }` | `{ status, version }` | `APPLICATION_STATUS_CHANGED` + her evrak `DOCUMENT_REVISION_REQUESTED` |
> | `removeFileAction` | `{ fileId, expectedVersion (evrak sürümü) }` | `{ status, version }` | `DOCUMENT_DELETED` |
> | `addCommentAction` | `{ applicationId, requirementId?, body (1–2000), idempotencyKey (UUID — PHASE 09.1, D-113) }` | `{ commentId, created }` (aynı anahtar + aynı içerik → mevcut sonuç; farklı içerik/kapsam → `CONFLICT`) | `DOCUMENT_COMMENT_ADDED {id}` (yalnızca gerçek eklemede) |
> Hata kodları: `VALIDATION`, `NOT_FOUND` (yok / başka başvuru / silinmekte), `CONFLICT` (eski sürüm, eski dosya versiyonu, eşzamanlı işlem, bağlam uyuşmazlığı), `NOT_ALLOWED` (matris dışı geçiş veya guard — Türkçe neden), `UNAUTHENTICATED` (müşteri oturumu/bağlantısı bitti), `INTERNAL`. Hedef statü, aktör, rol, evrak/dosya statüsü istemciden alınmaz.

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
| `submitForReviewAction` | `{ contextId, expectedVersion }` | `{ status, version }` | `APPLICATION_SUBMITTED` / `RESUBMITTED` — **PHASE 09'da uygulandı** |
| `removeOwnFileAction` | `{ contextId, fileId, expectedVersion }` | `{ status, version }` | `DOCUMENT_DELETED` — **PHASE 09'da uygulandı** |
| ~~`confirmUploadAction` / `getUploadStatusAction`~~ | Superseded — §4.2 (müşteri yükleme route'u) | | |

Kaldırılan: `requestOtpAction`, `verifyOtpAction`, `exchangeFragmentTokenAction`, `customerLogoutAction`.

> **PHASE 09 güncellemesi:** DTO ayrıca `application.version`, `comments: [{ body, createdAt, documentTitle }]` (yazar yok), `timeline: [{ status, at }]` (gerekçe/aktör yok) ve `pendingUploadRequirementIds` içerir; `canSubmit`/engeller ve `canRemove` sunucu bileşeninde aynı domain kurallarıyla hesaplanır.
>
> **PHASE 08 güncellemesi (D-091):** `documents[]` ayrıca `requirementId`, `version` (yükleme `expectedVersion`'ı) ve `activeFile: { id, name, sizeBytes, uploadedAt } | null` (yalnızca ACTIVE; storage anahtarı/versiyonu/SHA-256/yükleyen yok) içerir; `canUpload` sunucu bileşeninde `canUploadDocument("CUSTOMER", …)` ile hesaplanır.
>
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

### 4.2 PDF yükleme — `POST /api/documents/[requirementId]/file` (personel) · `POST /api/portal/[context]/documents/[requirementId]/file` (müşteri) — **PHASE 08'de uygulandı (D-100, D-103)**
- **İstek:** gövde = ham PDF; `Content-Type: application/pdf`; `Content-Length` zorunlu (1…10 485 760); `X-Upload-Filename: <encodeURIComponent(ad)>`; `?expectedVersion=<evrak sürümü>` (Zod `.strict()`); `Origin` = APP_URL zorunlu. `applicationId` yoktur (personel: evraktan; müşteri: yalnızca oturumdan).
- **Başarı `200`:** `{ ok: true, message: "Yüklendi", fileId, versionNumber, documentStatus }` — yalnızca aktivasyon commit'inden sonra.
- **Hatalar** (gövde: `{ ok: false, code, message }`, Türkçe; iç ayrıntı yok): `401 UNAUTHENTICATED`/`ACCESS_ENDED` · `403 FORBIDDEN` (köken) · `404 NOT_FOUND` (yok / başka başvuru / silinmekte — ayırt edilmez) · `409 CONTEXT_MISMATCH` (müşteri; başka başvuru açıldı) · `409 NOT_ALLOWED` (BR-44) · `409 CONFLICT` (sürüm) · `409 UPLOAD_IN_PROGRESS` · `409 STATE_CHANGED` · `411 LENGTH_REQUIRED` · `413 TOO_LARGE` · `415 NOT_PDF` · `400 EMPTY`/`LENGTH_MISMATCH`/`ABORTED`/`TIMEOUT` · `422 <PDF ret kodu>` (`NOT_PDF`, `ACTIVE_CONTENT`, `EMBEDDED_FILE`, `ENCRYPTED`, `MALFORMED`, `TOO_LARGE`, `RESOURCE_LIMIT`) · `429 RATE_LIMITED` · `503 BUSY`/`STORAGE_LIMIT`/`STORAGE_UNAVAILABLE`/`STORAGE_NOT_CONFIGURED` · `507 QUOTA_EXCEEDED` · `500 INTERNAL`. Hata mesajları "Önceki dosyanız korunuyor" bilgisini içerir (uygun olanlarda).
- Başlıklar: `no-store`, `no-referrer`, `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`.
- **Superseded:** önceki `POST /api/uploads` (Vercel Blob `handleUpload` token + callback) — OD-25.

### 4.3 PDF görüntüleme/indirme — `GET|HEAD /api/files/[fileId]` (personel) · `GET|HEAD /api/portal/[context]/files/[fileId]` (müşteri) — **PHASE 08'de uygulandı (D-104); PHASE 11'de Range (D-135)**
`?disposition=inline|attachment` (varsayılan attachment). İstek başlıkları: isteğe bağlı `Range: bytes=a-b | a- | -n` (tek aralık), `If-Range: "<etag>"`. [FILE_STORAGE.md](FILE_STORAGE.md) §3.
- `200` tam akış (Range yok, bilinmeyen birim veya If-Range uyuşmazlığı) · `206` aralık (`Content-Range: bytes a-b/boyut`) · `416 RANGE_NOT_SATISFIABLE` (`Content-Range: bytes */boyut`; çoklu/bozuk/karşılanamaz aralık) · `401` · `404` (yetkisiz/kapsam dışı/aktif değil/eski versiyon (müşteri) — ayırt edilmez) · `409 CONTEXT_MISMATCH` (müşteri) · `429 RATE_LIMITED` · `502 INTEGRITY` (sağlayıcı yanıtı kayıtla eşleşmedi) · `503 STORAGE_LIMIT | STORAGE_UNAVAILABLE`.
- Yanıt başlıkları: `Accept-Ranges: bytes`, `ETag` (opak güçlü doğrulayıcı), `Content-Length`, `Cache-Control: private, no-store, max-age=0`, `nosniff`, `no-referrer`, CORP `same-origin`; CORS başlığı yok.
- `HEAD`: aynı yetki ve başlıklar, gövde yok; sağlayıcıya istek ve audit yok.

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

### 4.5 `GET /api/cron/cleanup` — **uygulanmadı** (PHASE 08: teknik temizlik CLI — `pnpm storage:cleanup`, D-105; zamanlama PHASE 13. PHASE 10: yarım kalan başvuru silmeleri cron ile değil personelin "Silme İşlemini Sürdür" isteğiyle tamamlanır — D-116, D-120)
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
