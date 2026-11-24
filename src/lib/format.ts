/** Gösterim biçimleri. Veritabanında tarih UTC'dir; gösterim Europe/Istanbul (CLAUDE.md). */
const DATE_TIME = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const NUMBER = new Intl.NumberFormat("tr-TR");

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatCount(value: number): string {
  return NUMBER.format(value);
}

/** Kullanıcı adının baş harfi (avatar). Türkçe büyük harf kuralı: "i" → "İ". */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?";
}
