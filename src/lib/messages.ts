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
    portalNotReady:
      "Müşteri paneli henüz kullanıma açılmadı (PHASE 07). Bu bağlantı şu an müşteri sayfası açmaz; gerçek müşterilerle paylaşmayın.",
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
