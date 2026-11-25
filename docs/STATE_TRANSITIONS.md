# State Machine'ler ve Geçiş Matrisleri

> Tüm geçişler **sunucu tarafında**, merkezi domain modüllerinde (`src/features/applications/domain/application-status.ts`, `src/features/documents/domain/document-status.ts`, `src/features/documents/domain/file-status.ts`) doğrulanır. Frontend yalnızca sunucunun döndürdüğü "izin verilen aksiyonlar" listesini gösterir.
> İki şirket hesabı (ADMIN, EMPLOYEE) eşit yetkilidir (OD-24); "Personel" ikisini birlikte ifade eder. Tam yetki keyfî statü değişikliği değildir: personel yalnızca bu matristeki geçişleri yapabilir (OD-05).
> Guard'lar [BUSINESS_RULES.md](BUSINESS_RULES.md) kurallarına referans verir.

## 1. Başvuru Statüleri

| Kod | Türkçe | Açıklama (müşteriye) | Terminal* |
|---|---|---|---|
| `AWAITING_DOCUMENTS` | Evrak Bekleniyor | Gerekli evraklarınızı yükleyip incelemeye gönderin. | Hayır |
| `UNDER_REVIEW` | İncelemede | Evraklarınız ekibimiz tarafından inceleniyor. | Hayır |
| `REVISION_REQUIRED` | Düzeltme Bekleniyor | Bazı evraklarınızın düzeltilmesi gerekiyor. | Hayır |
| `DOCUMENTS_APPROVED` | Evraklar Onaylandı | Evraklarınız onaylandı. Başvuru işlemlerine geçilecek. | Hayır |
| `IN_PROCESS` | Başvuru İşlemde | Başvuru işlemleriniz CS Global tarafından yürütülüyor. | Hayır |
| `COMPLETED` | Süreç Tamamlandı | CS Global danışmanlık süreciniz tamamlandı. *(Resmî vize sonucu değildir.)* | Evet* |
| `CANCELLED` | İptal Edildi | Bu başvuru iptal edilmiştir. | Evet* |

\* "Terminal": normal akışta çıkışı olmayan, müşteri paneli salt okunur statü. Personel yalnızca gerekçeli yeniden açma geçişleriyle (T8, T9) çıkarabilir.

Başlangıç statüsü: `AWAITING_DOCUMENTS` (`application_status_history`'ye `from_status = NULL`). **PHASE 06'da uygulandı:** başvuru oluşturma transaction'ında `NULL → AWAITING_DOCUMENTS` (`CREATE`, aktör personel) yazılır; snapshot evrakları `NOT_UPLOADED` başlar. T1–T12 geçişleri **PHASE 09'da uygulandı** (D-108…D-110). Arşiv statüsü **yoktur** (OD-23). **PHASE 07:** müşteri paneli yukarıdaki müşteri açıklamalarını birebir gösterir (`CUSTOMER_STATUS_MESSAGE`, unit testli); hiçbir statü geçişi yapmaz; yükleme yer tutucusu yalnızca `AWAITING_DOCUMENTS`/`REVISION_REQUIRED`'da görünür, diğer statüler salt okunurdur (D-092).

### 1.1 Diyagram

```mermaid
stateDiagram-v2
    [*] --> AWAITING_DOCUMENTS: Başvuru oluşturuldu
    AWAITING_DOCUMENTS --> UNDER_REVIEW: T1 Gönder
    UNDER_REVIEW --> REVISION_REQUIRED: T2 Düzeltmeye gönder
    UNDER_REVIEW --> DOCUMENTS_APPROVED: T3 Evrakları onayla
    REVISION_REQUIRED --> UNDER_REVIEW: T4 Yeniden gönder
    DOCUMENTS_APPROVED --> IN_PROCESS: T5 İşleme al
    IN_PROCESS --> COMPLETED: T6 Tamamla
    AWAITING_DOCUMENTS --> CANCELLED: T7 İptal
    UNDER_REVIEW --> CANCELLED: T7 İptal
    REVISION_REQUIRED --> CANCELLED: T7 İptal
    DOCUMENTS_APPROVED --> CANCELLED: T7 İptal
    IN_PROCESS --> CANCELLED: T7 İptal
    CANCELLED --> AWAITING_DOCUMENTS: T8 Yeniden aç (gerekçeli, iptal öncesi statüye)
    CANCELLED --> UNDER_REVIEW: T8
    CANCELLED --> REVISION_REQUIRED: T8
    CANCELLED --> DOCUMENTS_APPROVED: T8
    CANCELLED --> IN_PROCESS: T8
    COMPLETED --> IN_PROCESS: T9 Yeniden aç (gerekçeli)
    IN_PROCESS --> DOCUMENTS_APPROVED: T10 Geri al (gerekçeli)
    DOCUMENTS_APPROVED --> UNDER_REVIEW: T11 Yeniden incele (gerekçeli)
    DOCUMENTS_APPROVED --> REVISION_REQUIRED: T12 Evrak düzeltmesi iste (gerekçeli)
    IN_PROCESS --> REVISION_REQUIRED: T12
```

### 1.2 Geçiş Matrisi

| # | From → To | Aksiyon kodu | Roller | Gerekçe | Guard | Yan etkiler | Audit event |
|---|---|---|---|---|---|---|---|
| T1 | `AWAITING_DOCUMENTS → UNDER_REVIEW` | `SUBMIT` | CUSTOMER; Personel (müşteri adına) | — | BR-50 | `UPLOADED` → `PENDING_REVIEW` (BR-52); `submitted_at` | `APPLICATION_SUBMITTED` |
| T2 | `UNDER_REVIEW → REVISION_REQUIRED` | `REQUEST_REVISION` | Personel | — | BR-59 | Müşteri panelinde düzeltme rozetleri | `APPLICATION_STATUS_CHANGED` |
| T3 | `UNDER_REVIEW → DOCUMENTS_APPROVED` | `APPROVE_DOCUMENTS` | Personel | — | BR-60 | Yükleme kapanır | `APPLICATION_STATUS_CHANGED` |
| T4 | `REVISION_REQUIRED → UNDER_REVIEW` | `RESUBMIT` | CUSTOMER; Personel (müşteri adına) | — | BR-50 | `UPLOADED` → `PENDING_REVIEW` | `APPLICATION_RESUBMITTED` |
| T5 | `DOCUMENTS_APPROVED → IN_PROCESS` | `START_PROCESSING` | Personel | — | — | — | `APPLICATION_STATUS_CHANGED` |
| T6 | `IN_PROCESS → COMPLETED` | `COMPLETE` | Personel | — | — | Panel salt okunur (bağlantı açık kalır) | `APPLICATION_STATUS_CHANGED` |
| T7 | `{AWAITING_DOCUMENTS, UNDER_REVIEW, REVISION_REQUIRED, DOCUMENTS_APPROVED, IN_PROCESS} → CANCELLED` | `CANCEL` | Personel | **Zorunlu** | — | Panel salt okunur; devam eden yüklemeler iptal (`EXPIRED`); evrak statüleri **değişmez**; bağlantı açık kalır | `APPLICATION_STATUS_CHANGED` |
| T8 | `CANCELLED → <iptal öncesi statü>` | `REOPEN_CANCELLED` | Personel | **Zorunlu** | Hedef = son `→ CANCELLED` geçmiş kaydının `from_status`'u (sunucu belirler; istemci hedef seçemez) | Evrak statüleri iptal öncesindeki gibi olduğundan tutarlılık korunur | `APPLICATION_STATUS_CHANGED` (`metadata.action = REOPEN_CANCELLED`) |
| T9 | `COMPLETED → IN_PROCESS` | `REOPEN_COMPLETED` | Personel | **Zorunlu** | — | Evraklar/onaylar korunur | `APPLICATION_STATUS_CHANGED` |
| T10 | `IN_PROCESS → DOCUMENTS_APPROVED` | `REVERT_TO_DOCUMENTS_APPROVED` | Personel | **Zorunlu** | — | — | `APPLICATION_STATUS_CHANGED` |
| T11 | `DOCUMENTS_APPROVED → UNDER_REVIEW` | `REVERT_TO_REVIEW` | Personel | **Zorunlu** | — | Evrak kararları korunur; personel D6 ile kararları değiştirebilir, D9 ile dosya değiştirebilir | `APPLICATION_STATUS_CHANGED` |
| T12 | `{DOCUMENTS_APPROVED, IN_PROCESS} → REVISION_REQUIRED` | `REVERT_FOR_REVISION` | Personel | **Zorunlu** (iç) + seçilen her evrak için **müşteri açıklaması** (BR-56) | ≥1 evrak seçilmiş; seçilenler `APPROVED` | Seçilen evraklar `APPROVED → REVISION_REQUIRED` (D10; aktif dosyaya bağlı yeni review kaydı); diğer onaylar korunur; müşteri yeniden yükleyebilir | `APPLICATION_STATUS_CHANGED` + `DOCUMENT_REVISION_REQUESTED` (her evrak) |

**Matriste olmayan her geçiş reddedilir** (`INVALID_STATUS_TRANSITION`). Yeniden açma ve geri alma geçişlerinde evraklar, dosya versiyonları, önceki onaylar ve geçmiş kayıtları **silinmez**.

### 1.3 Statüye özel davranışlar

| Statü | Müşteri yükleme | Personel yükleme | Gönderim | Personel inceleme | Müşteri paneli |
|---|---|---|---|---|---|
| `AWAITING_DOCUMENTS` | Evet (BR-44) | Evet (BR-44) | Evet (guard'lı) | Hayır | Düzenlenebilir |
| `UNDER_REVIEW` | **Hayır** | **Yükle/değiştir** (D9) | Hayır | Evet | Salt okunur + "İnceleniyor" |
| `REVISION_REQUIRED` | İzinli evraklar | İzinli evraklar | Evet (guard'lı) | Hayır | Düzeltme rozetleri |
| `DOCUMENTS_APPROVED` | Hayır | Hayır | Hayır | Hayır | Salt okunur |
| `IN_PROCESS` | Hayır | Hayır | Hayır | Hayır | Salt okunur |
| `COMPLETED` | Hayır | Hayır | Hayır | Hayır | Salt okunur |
| `CANCELLED` | Hayır | Hayır | Hayır | Hayır | Salt okunur, minimal bilgi |

Personel bir başvuruyu yeniden açtığında/geri aldığında (T8–T12), hedef statünün satırındaki işlemler otomatik olarak yeniden açılır.

### 1.4 Statü geçmişi
Her geçiş `application_status_history`'ye yazılır: `from_status`, `to_status`, `actor_type`, `actor_user_id`, `actor_access_token_id`, `on_behalf_of_customer`, `reason` (T7–T12'de zorunlu), `created_at`. Kayıtlar değiştirilemez (başvuru silinmesi hariç). Müşteri paneli geçmişten yalnızca statü + tarih gösterir; gerekçe ve aktör gösterilmez.

## 2. Evrak (Başvuru Evrak Gereksinimi) Statüleri

| Kod | Türkçe | Anlamı |
|---|---|---|
| `NOT_UPLOADED` | Yüklenmedi | Aktif dosya yok. |
| `UPLOADED` | Yüklendi | Aktif dosya var; henüz incelemeye gönderilmedi. |
| `PENDING_REVIEW` | İnceleme Bekliyor | Personel kararı bekleniyor. |
| `APPROVED` | Onaylandı | Aktif dosya onaylandı; kilitli. |
| `REVISION_REQUIRED` | Düzeltme Gerekli | Personel düzeltme istedi (gerekçeli). |

> Evrak statüsü iş süreci statüsüdür; dosyanın teknik durumu (§3) ayrı bir eksendir.

### 2.1 Diyagram

```mermaid
stateDiagram-v2
    [*] --> NOT_UPLOADED
    NOT_UPLOADED --> UPLOADED: D1 Dosya aktif oldu
    UPLOADED --> NOT_UPLOADED: D2 Aktif dosya kaldırıldı
    UPLOADED --> PENDING_REVIEW: D3 Gönderim
    PENDING_REVIEW --> APPROVED: D4 Onay
    PENDING_REVIEW --> REVISION_REQUIRED: D5 Düzeltme iste
    APPROVED --> REVISION_REQUIRED: D6 Karar değişikliği
    REVISION_REQUIRED --> APPROVED: D6 Karar değişikliği
    REVISION_REQUIRED --> UPLOADED: D7 Yeni dosya aktif
    REVISION_REQUIRED --> NOT_UPLOADED: D8 İsteğe bağlı evrağın dosyası kaldırıldı
    NOT_UPLOADED --> PENDING_REVIEW: D9 Personel yükledi (UNDER_REVIEW)
    APPROVED --> PENDING_REVIEW: D9
    REVISION_REQUIRED --> PENDING_REVIEW: D9
    APPROVED --> REVISION_REQUIRED: D10 T12 içinde
```

### 2.2 Geçiş Matrisi

| # | From → To | Tetikleyen | Başvuru statüsü | Guard / not |
|---|---|---|---|---|
| D1 | `NOT_UPLOADED → UPLOADED` | Dosya aktifleşmesi (müşteri/personel yüklemesi) | `AWAITING_DOCUMENTS`, `REVISION_REQUIRED` | BR-44, BR-45 |
| — | `UPLOADED → UPLOADED` | Değiştirme: yeni dosya aktif, eskisi `SUPERSEDED` | Aynı | Statü değişmez, `version` artar |
| D2 | `UPLOADED → NOT_UPLOADED` | Aktif dosyanın kaldırılması (`REMOVED`) | Aynı | BR-44 |
| D3 | `UPLOADED → PENDING_REVIEW` | T1/T4 transaction'ı | — | BR-52 |
| D4 | `PENDING_REVIEW → APPROVED` | Personel | `UNDER_REVIEW` | BR-57: `fileId` = aktif dosya |
| D5 | `PENDING_REVIEW → REVISION_REQUIRED` | Personel | `UNDER_REVIEW` | BR-56, BR-57 |
| D6 | `APPROVED ↔ REVISION_REQUIRED` | Personel | Yalnızca `UNDER_REVIEW` | BR-57, BR-58 |
| D7 | `REVISION_REQUIRED → UPLOADED` | Yeni dosya aktif (müşteri/personel) | `REVISION_REQUIRED` | Eski dosya `SUPERSEDED` |
| D8 | `REVISION_REQUIRED → NOT_UPLOADED` | Aktif dosyanın kaldırılması | `REVISION_REQUIRED` | Yalnızca `is_required = false`. Zorunlu evrakta kaldırma yapılırsa statü `REVISION_REQUIRED` kalır |
| D9 | `{NOT_UPLOADED, PENDING_REVIEW, APPROVED, REVISION_REQUIRED} → PENDING_REVIEW` | **Personel** yeni dosya yükledi/değiştirdi | Yalnızca `UNDER_REVIEW` (OD-17) | BR-48: önceki onay aktarılmaz; `PENDING_REVIEW → PENDING_REVIEW` için yalnızca `version` artar |
| D10 | `APPROVED → REVISION_REQUIRED` | Personel, T12 içinde | `DOCUMENTS_APPROVED`, `IN_PROCESS` | Müşteri açıklaması zorunlu; review kaydı aktif dosyaya bağlı |

Not: `UNDER_REVIEW` sırasında personel yükleme yaparsa, aynı anda o evrağı inceleyen başka bir personelin kararı BR-57 gereği `CONFLICT` ile reddedilir.

## 3. Dosya Statüleri (teknik, tek eksen)

| Kod | Anlamı | Görüntülenebilir | Blob |
|---|---|---|---|
| `UPLOAD_PENDING` | Upload token üretildi; blob bekleniyor | Hayır | Henüz yok / doğrulanmadı |
| `VALIDATING` | Blob alındı; yapısal doğrulama sürüyor | Hayır | Var |
| `ACTIVE` | Doğrulamayı geçti; evrağın **tek** aktif dosyası | Evet (yetkiliye) | Var |
| `SUPERSEDED` | Doğrulamayı geçmiş, yerine yenisi aktif olmuş eski versiyon | Personel | Var (manuel silmeye kadar) |
| `REMOVED` | Doğrulamayı geçmiş, kullanıcı tarafından yerine yenisi konmadan kaldırılmış | Personel | Var (manuel silmeye kadar) |
| `REJECTED` | Doğrulamayı geçemedi (`rejection_reason`) | **Asla** | Hemen silinir |
| `EXPIRED` | Yükleme tamamlanmadı / iptal edildi | Hayır | Varsa silinir |

```mermaid
stateDiagram-v2
    [*] --> UPLOAD_PENDING: Token üretildi
    UPLOAD_PENDING --> VALIDATING: Blob doğrulandı (callback / confirm)
    UPLOAD_PENDING --> EXPIRED: Süre doldu / yeni yükleme başladı / başvuru iptal
    VALIDATING --> ACTIVE: Doğrulama geçti (eski ACTIVE → SUPERSEDED)
    VALIDATING --> REJECTED: Doğrulama başarısız / durum değişti
    VALIDATING --> REJECTED: 10 dk'dan uzun takılı (VALIDATION_ERROR)
    ACTIVE --> SUPERSEDED: Yeni versiyon aktif
    ACTIVE --> REMOVED: Kullanıcı kaldırdı
```

Kurallar:
- `ACTIVE` dosya evrak başına en fazla bir tane (DB partial unique index).
- `UPLOAD_PENDING` + `VALIDATING` evrak başına en fazla bir tane (DB partial unique index); yeni token isteği önceki `UPLOAD_PENDING`'i `EXPIRED` yapar, 10 dakikadan eski `VALIDATING`'i `REJECTED (VALIDATION_ERROR)` yapar; güncel `VALIDATING` varsa yeni istek "Devam eden bir yükleme var" ile reddedilir.
- Statüler "virüssüz" anlamı taşımaz; `ACTIVE`, yalnızca yapısal doğrulamanın geçildiğini ifade eder (OD-07).

Ayrıntı: [FILE_STORAGE.md](FILE_STORAGE.md).

**PHASE 08 uygulama notu (D-103):** Sunucu üzerinden yüklemede dosya kaydı, doğrulama geçtikten **sonra** rezervasyonla `UPLOAD_PENDING` olarak açılır ve storage yazımı + aktivasyonla doğrudan `ACTIVE` olur (`UPLOAD_PENDING → ACTIVE`); `VALIDATING` bu akışta kullanılmaz (enum'da kalır). `UPLOAD_PENDING → EXPIRED`: storage hatası/belirsiz yazma, aktivasyon hatası veya rezervasyon süresinin dolması (teknik temizlik). `UPLOAD_PENDING → REJECTED (STATE_CHANGED)`: aktivasyonda başvuru/evrak durumu, sürüm, müşteri bağlantısı veya silme talebi değişmiş. Yapısal doğrulamayı geçmeyen dosya için kayıt oluşturulmaz. Evrak geçişleri D1, D7, D9 ve değiştirme (`UPLOADED → UPLOADED`) uygulandı; D2/D8 (kaldırma) PHASE 09.

## 4. İzin verilen aksiyonlar

Domain modülü `(actor, application, requirements)` için izin verilen aksiyon listesini döndüren saf bir fonksiyon sağlar (`getAllowedApplicationActions`, `getAllowedDocumentActions`). UI butonları bu listeye göre gösterilir; Server Action aynı fonksiyonu kilit altında **yeniden** çağırarak doğrular. Matrisin her hücresi unit test ile kapsanır.

## 5. PHASE 09 Uygulama Notları (D-108…D-112)
- Tablolar `src/features/applications/domain/application-status.ts` (T1–T12, BR-50/59/60 guard'ları, `staffActions`) ve `src/features/documents/domain/document-status.ts` (D4–D6 karar, D2/D8 kaldırma) içindedir; mutasyonlar `src/features/workflow/service.ts`'te aynı fonksiyonları kilit altında yeniden çağırır. Her satır unit testle kapsanır.
- **Otomatik geçiş yok (BR-61):** tüm zorunlu evraklar onaylansa da başvuru `UNDER_REVIEW`'da kalır; personel T3 ile ilerletir. Düzeltme kararı evrak statüsünü değiştirir; başvuru T2 ile `REVISION_REQUIRED` olur.
- İstemci hedef statü göndermez; aksiyon kodu gönderir. T8 hedefi statü geçmişinden.
- Evrak kararı (D4–D6) yalnızca ekranda görünen `fileId` hâlâ aktifse (BR-57) ve evrak sürümü güncelse.
- Kaldırma: dosya `ACTIVE → REMOVED` (fiziksel silme yok); D2/D8 statü kuralları; `UNDER_REVIEW` ve sonrasında kaldırma yok.
- T7 iptal: `UPLOAD_PENDING`/`VALIDATING` → `EXPIRED`; evrak statüleri, dosyalar, kararlar, bağlantı değişmez.
- No-op geçiş yok: her geçiş statü değiştirir ve tek geçmiş kaydı yazar; tekrar istekleri sürüm/statü kontrolünde reddedilir.
