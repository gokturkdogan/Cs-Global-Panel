/** Kullanıcıya gösterilen Türkçe mesajlar (tek kaynak). İç ayrıntı, token veya hata kodu içermez. */
export const messages = {
  auth: {
    invalidCredentials: "Kullanıcı adı veya şifre hatalı.",
    rateLimited: "Çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.",
    unavailable: "Giriş şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.",
  },
  dashboard: {
    loadFailedTitle: "Veriler yüklenemedi.",
    loadFailedDescription:
      "Bilgiler şu anda görüntülenemiyor. Lütfen biraz sonra tekrar deneyin; sorun sürerse sayfayı yenileyin.",
    notReadyTitle: "Henüz kullanıma hazır değil",
    notReadyDescription: "Bu bölüm sonraki geliştirme aşamasında kullanıma açılacak.",
    newApplicationUnavailable: "Başvuru oluşturma sonraki aşamada kullanıma açılacak.",
    notFoundTitle: "Sayfa bulunamadı",
    notFoundDescription: "Aradığınız sayfa mevcut değil veya taşınmış olabilir.",
  },
  common: {
    conflict:
      "Bu kayıt başka bir işlem tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyiniz.",
    notFound: "Kayıt bulunamadı. Silinmiş veya erişilemez olabilir.",
    validation: "Lütfen işaretli alanları kontrol edin.",
    internal: "İşlem şu anda tamamlanamadı. Lütfen biraz sonra tekrar deneyin.",
    unauthenticated: "Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.",
    saved: "Değişiklikler kaydedildi.",
    unsavedChanges: "Kaydedilmemiş değişiklikler var.",
  },
  services: {
    duplicateName: "Bu adla bir hizmet zaten var.",
    created: "Hizmet oluşturuldu. Şimdi evrak gereksinimlerini ekleyebilirsiniz.",
    activated: "Hizmet aktifleştirildi.",
    deactivated: "Hizmet pasifleştirildi.",
    requirementCreated: "Evrak gereksinimi eklendi.",
    requirementActivated: "Evrak gereksinimi aktifleştirildi.",
    requirementDeactivated: "Evrak gereksinimi pasifleştirildi.",
    requirementMoved: "Sıralama güncellendi.",
    snapshotNotice:
      "Bu hizmette yapılan değişiklikler yeni başvurular için geçerlidir. Mevcut başvuruların evrak listeleri değişmez.",
    noActiveRequirementWarning:
      "Bu hizmette aktif evrak gereksinimi yok. Aktif evrak gereksinimi olmayan hizmetle başvuru oluşturulamaz.",
    emptyTitle: "Henüz hizmet bulunmuyor.",
    emptyDescription: "Yeni bir hizmet oluşturarak başlayabilirsiniz.",
    noResults: "Aramanıza uygun hizmet bulunamadı.",
    requirementsEmpty: "Bu hizmette henüz evrak gereksinimi yok.",
  },
  applications: {
    created: "Başvuru başarıyla oluşturuldu!",
    stalePreview:
      "Seçilen hizmetin evrak listesi siz formu doldururken değişti. Güncel listeyi kontrol edip tekrar deneyin.",
    serviceUnavailable:
      "Seçilen hizmet aktif değil veya bulunamadı. Lütfen başka bir hizmet seçin.",
    noActiveRequirements:
      "Bu hizmette aktif evrak gereksinimi yok; başvuru oluşturulamaz. Önce hizmete evrak ekleyin.",
    tokenConfigMissing:
      "Müşteri bağlantısı şu anda oluşturulamıyor (sunucu yapılandırması eksik). İşlem yapılmadı.",
    linkUnavailable: "Bu başvurunun aktif müşteri bağlantısı yok.",
    linkRevoked: "Bağlantı iptal edildi. İptal edilen bağlantı tekrar kullanılamaz.",
    linkRotated: "Yeni bağlantı oluşturuldu. Eski bağlantı artık geçersiz.",
    linkCreated: "Yeni müşteri bağlantısı oluşturuldu.",
    linkCopied: "Bağlantı panoya kopyalandı.",
    messageCopied: "Mesaj panoya kopyalandı.",
    copyFailed: "Panoya kopyalanamadı. Metni seçip elle kopyalayın.",
    portalLimitedNotice:
      "Müşteri paneli geliştirme aşamasındadır. Platform gerçek müşteri kullanımına hazır değildir; gerçek müşterilerle paylaşmayın ve gerçek belge yükletmeyin.",
    contactChangedWarning:
      "İletişim bilgisi değişti. Mevcut bağlantı önceki alıcıda kalmış olabilir ve hâlâ geçerlidir; gerekirse bağlantıyı yenileyin.",
    emptyTitle: "Henüz başvuru bulunmuyor.",
    emptyDescription: "Yeni Başvuru ile ilk başvuruyu oluşturabilirsiniz.",
    noResults: "Aramanıza veya filtrelere uygun başvuru bulunamadı.",
    noActiveServices:
      "Aktif hizmet bulunmuyor. Başvuru oluşturmak için önce bir hizmeti aktifleştirin.",
    validation: {
      firstNameRequired: "Ad zorunludur.",
      lastNameRequired: "Soyad zorunludur.",
      nameLength: "En fazla 100 karakter olabilir.",
      nameInvalid: "Yalnızca harf, boşluk, kesme işareti, tire ve nokta kullanılabilir.",
      phoneRequired: "Telefon numarası zorunludur.",
      phoneInvalid: "Geçerli bir telefon numarası girin (ör. 0532 123 45 67 veya +49 …).",
      emailRequired: "E-posta adresi zorunludur.",
      emailInvalid: "Geçerli bir e-posta adresi girin.",
      serviceRequired: "Hizmet seçin.",
    },
  },
  portal: {
    invalidTitle: "Bağlantınız kullanılamıyor",
    invalidDescription:
      "Bu bağlantı geçersiz veya kullanım dışı olabilir. Lütfen CS Global ile iletişime geçiniz.",
    expiredTitle: "Oturumunuz sona erdi",
    expiredDescription: "Devam etmek için size gönderilen başvuru bağlantısını yeniden açınız.",
    contextTitle: "Bu sayfa artık güncel değil",
    contextDescription:
      "Bu tarayıcıda başka bir başvuru bağlantısı açıldı. Bu başvuruyu görüntülemek için size gönderilen bağlantıyı yeniden açınız.",
    unavailableTitle: "Şu anda erişilemiyor",
    unavailableDescription:
      "Başvuru paneliniz geçici olarak görüntülenemiyor. Lütfen biraz sonra tekrar deneyiniz veya size gönderilen bağlantıyı yeniden açınız.",
    contactSoon: "İletişim bilgisi yakında eklenecek.",
    privateLink: "Bu bağlantı size özeldir, başkalarıyla paylaşmayınız.",
    progressDisclaimer:
      "Bu gösterge danışmanlık sürecinin aşamasını gösterir; vize sonucu veya süre hakkında bilgi vermez.",
    completedNote: "Resmî vize sonucu değildir.",
  },
  files: {
    uploadButton: "PDF Yükle",
    uploadOnBehalf: "Müşteri Adına PDF Yükle",
    replaceButton: "Dosyayı Değiştir",
    view: "Dosyayı Görüntüle",
    download: "Dosyayı İndir",
    history: "Dosya Geçmişi",
    stateChecking: "Dosya kontrol ediliyor…",
    stateUploading: "Yükleniyor",
    stateProcessing: "Sunucuda doğrulanıyor ve kaydediliyor…",
    stateDone: "Yüklendi",
    stateFailed: "Yükleme başarısız",
    keptPrevious: "Önceki dosyanız korunuyor.",
    replaceConfirmTitle: "Dosya değiştirilsin mi?",
    replaceConfirmDescription:
      "Yeni dosya doğrulanıp kaydedildiğinde aktif dosya olur. Mevcut dosya silinmez; dosya geçmişinde önceki versiyon olarak korunur.",
    replaceConfirmApprovedNote:
      "Bu evrak onaylı. Yeni dosya yüklenirse önceki onay yeni dosyaya aktarılmaz ve evrak yeniden incelemeye düşer.",
    structuralNote: "Yapısal kontrol tamamlandı (antivirüs taraması değildir).",
    notPdf: "Yalnızca PDF dosyası yükleyebilirsiniz.",
    empty: "Dosya boş görünüyor. Lütfen geçerli bir PDF seçiniz.",
    tooLarge: "Dosya en fazla 10 MB olabilir.",
    activeContent:
      "Bu PDF etkileşimli/aktif içerik (ör. betik veya otomatik eylem) içerdiği için kabul edilemiyor. Lütfen belgeyi yeniden PDF olarak kaydedip tekrar deneyiniz.",
    embeddedFile: "Bu PDF içine gömülü dosya içerdiği için kabul edilemiyor.",
    encrypted: "Şifre korumalı PDF yüklenemez. Lütfen şifresiz bir kopya yükleyiniz.",
    malformed: "Dosya bozuk veya okunamıyor. Lütfen belgeyi yeniden kaydedip tekrar deneyiniz.",
    resourceLimit:
      "Dosya çok karmaşık olduğu için kontrol edilemedi. Lütfen daha sade bir PDF deneyiniz.",
    notAllowed: "Bu evrak için şu anda dosya yüklenemez.",
    conflict: "Bu evrak bu sırada güncellendi. Lütfen sayfayı yenileyiniz.",
    inProgress: "Bu evrak için devam eden bir yükleme var. Lütfen biraz sonra tekrar deneyiniz.",
    stateChanged: "Başvurunuzun durumu bu sırada değiştiği için dosya kaydedilemedi.",
    quotaFullTitle: "Depolama kapasitesi dolu.",
    quotaFull: "Şu anda yeni evrak yüklenemiyor. Lütfen CS Global ile iletişime geçiniz.",
    providerLimit: "Günlük dosya erişim sınırına ulaşıldı. Lütfen daha sonra tekrar deneyiniz.",
    unavailable: "Dosya şu anda işlenemiyor. Lütfen biraz sonra tekrar deneyiniz.",
    busy: "Sistem şu anda yoğun. Lütfen biraz sonra tekrar deneyiniz.",
    rateLimited: "Çok sayıda dosya isteği yapıldı. Lütfen bir süre sonra tekrar deneyiniz.",
    accessEnded:
      "Oturumunuz sona erdi veya bağlantınız artık geçerli değil. Lütfen size gönderilen bağlantıyı yeniden açınız.",
    contextChanged:
      "Bu sayfa artık güncel değil: bu tarayıcıda başka bir başvuru açıldı. Dosya yüklenmedi.",
    network:
      "Bağlantı kesildi. Dosya kaydedilmemiş olabilir; lütfen sayfayı yenileyip kontrol ediniz.",
    unauthenticated: "Oturumunuz sona erdi. Lütfen yeniden giriş yapınız.",
    noFile: "Henüz dosya yüklenmedi.",
    capacityTitle: "Dosya Depolama",
    capacityWarningTitle: "Depolama kapasitesi dolmak üzere.",
    capacityWarning:
      "Ücretsiz depolama sınırınıza yaklaşıyorsunuz. Yeni yüklemelerin durmaması için kapasiteyi kontrol ediniz.",
    capacityFull: "Şu anda yeni evrak yüklenemiyor (uygulama kapasite sınırı).",
    capacityNote: "Uygulama kayıtlarından hesaplanır (sağlayıcı faturalama verisi değildir).",
    capacityUnavailable: "Depolama kullanımı şu anda hesaplanamıyor.",
  },
  workflow: {
    stateChanged: "Başvurunun durumu değişmiş. Lütfen sayfayı yenileyip tekrar deneyiniz.",
    alreadyUnderReview: "Başvurunuz zaten incelemede.",
    notAllowed: "Bu işlem başvurunun mevcut durumunda yapılamaz.",
    staleFile:
      "Bu evrak inceleme sırasında değiştirilmiş. Lütfen güncel dosyayı açarak yeniden inceleyiniz.",
    accessEnded: "Oturumunuz sona erdi. Size gönderilen bağlantıyı yeniden açınız.",
    contextChanged:
      "Bu sayfa artık güncel değil: bu tarayıcıda başka bir başvuru açıldı. İşlem yapılmadı.",
    unavailable: "İşleminiz şu anda gerçekleştirilemiyor. Lütfen daha sonra tekrar deneyiniz.",
    reasonRequired: "Gerekçe zorunludur.",
    reasonTooLong: "Gerekçe en fazla 1000 karakter olabilir.",
    revisionMessageLength: "Düzeltme açıklaması 10–1000 karakter olmalıdır.",
    commentLength: "Yorum 1–2000 karakter olmalıdır.",
    controlCharacters: "Metin geçersiz karakter içeriyor.",
    blockers: {
      WRONG_STATUS: "Başvurunun mevcut durumu bu işleme izin vermiyor.",
      MISSING_REQUIRED: "İncelemeye göndermek için tüm zorunlu evrakları yüklemelisiniz.",
      UPLOAD_IN_PROGRESS: "Devam eden bir dosya yüklemesi var; tamamlanmasını bekleyiniz.",
      REVISION_PENDING: "Düzeltme istenen evraklar için yeni dosya yüklenmelidir.",
      PENDING_REVIEW: "İnceleme bekleyen evraklar var.",
      NO_REVISION: "Düzeltme istenen evrak yok.",
      NOT_ALL_APPROVED:
        "Zorunlu evrakların ve yüklenmiş isteğe bağlı evrakların tamamı onaylanmalıdır.",
    },
    submitButton: "İncelemeye Gönder",
    resubmitButton: "Yeniden İncelemeye Gönder",
    submitConfirmTitle: "Evraklarınızı incelemeye göndermek istiyor musunuz?",
    submitConfirmDescription:
      "İnceleme süresince evraklarınızı değiştiremezsiniz. Gerekli görülürse danışmanlarımız sizden düzeltme isteyecektir.",
    submitted: "Evraklarınız incelemeye gönderildi.",
    removeButton: "Dosyayı Kaldır",
    removeConfirmTitle: "Dosya kaldırılsın mı?",
    removeConfirmDescription:
      "Dosya bu evrakın güncel dosyası olmaktan çıkarılır. Yeni bir PDF yükleyebilirsiniz.",
    removeConfirmStaffDescription:
      "Dosya bu evrakın aktif dosyası olmaktan çıkarılır; dosya geçmişinde korunur (fiziksel olarak silinmez).",
    removed: "Dosya kaldırıldı.",
    approve: "Onayla",
    requestRevision: "Düzeltme İste",
    approveConfirmTitle: "Evrak onaylansın mı?",
    revisionDialogTitle: "Düzeltme iste",
    revisionMessageLabel: "Müşteriye görünecek düzeltme açıklaması",
    revisionMessageHint: "10–1000 karakter. Müşteri bu metni evrak kartında görür.",
    approved: "Evrak onaylandı.",
    revisionRequested: "Düzeltme istendi.",
    reasonLabel: "Gerekçe (personel içi, müşteriye gösterilmez)",
    commentLabel: "Müşteriye görünecek yorum",
    commentHint: "Müşteri bu metni başvuru panelinde görür. Düzenlenemez ve silinemez.",
    commentAdd: "Yorum Ekle",
    commentAdded: "Yorum eklendi.",
    idempotencyConflict:
      "Bu işlem başka bir istekle çakıştı. Lütfen sayfayı yenileyip yorumu yeniden gönderiniz.",
    commentsTitle: "Müşteriye görünen yorumlar",
    noComments: "Henüz yorum yok.",
    transitionDone: "Başvuru durumu güncellendi.",
  },
  validation: {
    nameRequired: "Hizmet adı zorunludur.",
    nameLength: "Hizmet adı 2–150 karakter olmalıdır.",
    titleRequired: "Evrak adı zorunludur.",
    titleLength: "Evrak adı 2–150 karakter olmalıdır.",
    invalidCharacters:
      "Yalnızca harf, rakam, boşluk ve - – — ( ) . , & / ' + : karakterleri kullanılabilir; ilk karakter harf veya rakam olmalıdır.",
    descriptionLength: "Açıklama en fazla 2000 karakter olabilir.",
    instructionsLength: "Talimat en fazla 4000 karakter olabilir.",
    controlCharacters: "Metin geçersiz karakter içeriyor.",
  },
} as const;
