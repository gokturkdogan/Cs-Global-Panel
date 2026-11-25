/**
 * WhatsApp paylaşımı (OD-21, BR-160, BR-161). Sabit şablon; panelden düzenlenemez. Bağlantı resmî
 * "Tıkla ve sohbet et" biçimindedir: `https://wa.me/<uluslararası numara, + / sıfır / tire yok>?text=
 * <URL-encoded mesaj>` (faq.whatsapp.com — PHASE 06'da doğrulandı). Mesaj otomatik gönderilmez.
 */
export const WHATSAPP_BASE_URL = "https://wa.me/";

export type WhatsAppMessageInput = {
  readonly firstName: string;
  readonly lastName: string;
  /** Başvuru anındaki hizmet adı (`service_name_snapshot`). */
  readonly serviceName: string;
  readonly accessLink: string;
};

export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  return [
    `Sayın ${input.firstName} ${input.lastName},`,
    "",
    "CS Global'i tercih ettiğiniz için teşekkür ederiz.",
    "",
    `${input.serviceName} danışmanlık süreciniz için size özel başvuru paneliniz oluşturulmuştur.`,
    "",
    "Aşağıdaki bağlantı üzerinden gerekli evraklarınızı yükleyebilir ve başvuru sürecinizi takip edebilirsiniz.",
    "",
    input.accessLink,
    "",
    "Güvenliğiniz için bu bağlantıyı başka kişilerle paylaşmayınız.",
    "",
    "Saygılarımızla,",
    "CS Global",
  ].join("\n");
}

export function buildWhatsAppUrl(phoneE164: string, message: string): string {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phoneE164)) throw new Error("Geçersiz telefon numarası");
  return `${WHATSAPP_BASE_URL}${phoneE164.slice(1)}?text=${encodeURIComponent(message)}`;
}
