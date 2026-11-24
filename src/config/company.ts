/**
 * Şirketin sabit bilgileri (OD-14, OD-15, BR-170…BR-172).
 * Panelden değiştirilemez; değişiklik kod güncellemesiyle yapılır.
 *
 * Gerçek telefon ve WhatsApp numarası Product Owner tarafından henüz sağlanmadı.
 * Sağlanana kadar `null` kalır; uydurma veya örnek numara yazılmaz. `null` iken
 * arayüz arama/WhatsApp bağlantısı üretmez (BR-171).
 */
export type CompanyConfig = {
  /** Şirket adı; geçici metin logoda da kullanılır (OD-15). */
  readonly name: string;
  /** Logonun altındaki kısa açıklama. */
  readonly tagline: string;
  /** Uygulamanın ürün adı. */
  readonly productName: string;
  /** Şirket telefonu, E.164 biçiminde (ör. "+90…"); sağlanana kadar `null`. */
  readonly phoneE164: string | null;
  /** WhatsApp iletişim numarası, E.164 biçiminde; sağlanana kadar `null`. */
  readonly whatsappE164: string | null;
};

export const company: CompanyConfig = {
  name: "CS Global",
  tagline: "Vize Danışmanlık",
  productName: "Vize Danışmanlık Yönetim Platformu",
  phoneE164: null,
  whatsappE164: null,
};
