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
} as const;
