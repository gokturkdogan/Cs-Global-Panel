import type { TransitionCode } from "@/config/statuses";

/** Statü geçmişi etiketleri (personel zaman çizelgesi). */
export const TRANSITION_HISTORY_LABELS: Record<TransitionCode, string> = {
  CREATE: "Başvuru oluşturuldu",
  SUBMIT: "İncelemeye gönderildi",
  RESUBMIT: "Yeniden incelemeye gönderildi",
  REQUEST_REVISION: "Düzeltme talep edildi",
  APPROVE_DOCUMENTS: "Evraklar onaylandı",
  START_PROCESSING: "Başvuru işleme alındı",
  COMPLETE: "Süreç tamamlandı",
  CANCEL: "Başvuru iptal edildi",
  REOPEN_CANCELLED: "İptal edilen başvuru yeniden açıldı",
  REOPEN_COMPLETED: "Tamamlanan başvuru yeniden açıldı",
  REVERT_TO_DOCUMENTS_APPROVED: "Evraklar onaylandı aşamasına geri alındı",
  REVERT_TO_REVIEW: "Yeniden incelemeye alındı",
  REVERT_FOR_REVISION: "Evrak düzeltmesi istendi (geri alma)",
};

/** Personel aksiyon butonları (keyfî statü seçimi yok — yalnızca matristeki aksiyonlar). */
export const TRANSITION_ACTION_LABELS: Record<Exclude<TransitionCode, "CREATE">, string> = {
  SUBMIT: "İncelemeye Gönder (müşteri adına)",
  RESUBMIT: "Yeniden İncelemeye Gönder (müşteri adına)",
  REQUEST_REVISION: "Düzeltmeye Gönder",
  APPROVE_DOCUMENTS: "Evrakları Onayla",
  START_PROCESSING: "Başvuruyu İşleme Al",
  COMPLETE: "Başvuruyu Tamamla",
  CANCEL: "Başvuruyu İptal Et",
  REOPEN_CANCELLED: "Başvuruyu Yeniden Aç",
  REOPEN_COMPLETED: "Başvuruyu Yeniden Aç",
  REVERT_TO_DOCUMENTS_APPROVED: "Evraklar Onaylandı Aşamasına Geri Al",
  REVERT_TO_REVIEW: "Yeniden İncelemeye Al",
  REVERT_FOR_REVISION: "Evrak Düzeltmesi İste",
};

/** Onay penceresi açıklamaları. */
export const TRANSITION_CONFIRM: Record<Exclude<TransitionCode, "CREATE">, string> = {
  SUBMIT:
    "Başvuru müşteri adına incelemeye gönderilir. Yüklenmiş evraklar inceleme bekler; müşteri inceleme süresince dosya değiştiremez.",
  RESUBMIT: "Düzeltilen evraklar müşteri adına yeniden incelemeye gönderilir.",
  REQUEST_REVISION:
    "Başvuru 'Düzeltme Bekleniyor' durumuna geçer; müşteri düzeltme istenen evrakları ve açıklamaları görür.",
  APPROVE_DOCUMENTS:
    "Tüm evraklar onaylı. Başvuru 'Evraklar Onaylandı' durumuna geçer; yükleme kapanır.",
  START_PROCESSING: "Başvuru 'Başvuru İşlemde' durumuna geçer.",
  COMPLETE: "Danışmanlık süreci tamamlandı olarak işaretlenir. Bu resmî vize sonucu değildir.",
  CANCEL:
    "Başvuru ve yüklenmiş evraklar silinmeyecektir. Müşteri bağlantısı açık kalır; panel salt okunur olur. Bu işlem başvuru geçmişine kaydedilecektir.",
  REOPEN_CANCELLED:
    "Başvuru iptal öncesindeki durumuna döner. Evraklar, versiyonlar ve kararlar korunur.",
  REOPEN_COMPLETED: "Başvuru 'Başvuru İşlemde' durumuna döner. Evraklar ve onaylar korunur.",
  REVERT_TO_DOCUMENTS_APPROVED: "Başvuru 'Evraklar Onaylandı' durumuna geri alınır.",
  REVERT_TO_REVIEW:
    "Başvuru 'İncelemede' durumuna döner; evrak kararları korunur ve değiştirilebilir.",
  REVERT_FOR_REVISION:
    "Seçilen onaylı evraklar için müşteriden düzeltme istenir; diğer onaylar korunur.",
};
