/**
 * Türkçe karakter duyarsız arama normalizasyonu (BR-80). Sorgu metni ve veritabanında aranan metin
 * aynı kurala göre katlanır: Türkçe küçük harf (`İ→i`, `I→ı`) + `ı→i, ğ→g, ü→u, ş→s, ö→o, ç→c`
 * (+ `â→a, î→i, û→u`). Saf fonksiyon (istemci ve sunucu ortak).
 */
const FOLD: Record<string, string> = {
  ı: "i",
  ğ: "g",
  ü: "u",
  ş: "s",
  ö: "o",
  ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/̇/g, "")
    .replace(/[ığüşöçâîû]/g, (char) => FOLD[char] ?? char)
    .replace(/\s+/g, " ")
    .trim();
}

/** LIKE desenindeki özel karakterleri kaçışlar (`\` kaçış karakteriyle kullanılır). */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
