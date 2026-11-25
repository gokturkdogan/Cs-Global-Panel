import { normalizeSearchText } from "@/lib/search";

/**
 * `applications.search_text` (BR-80): Türkçe katlanmış ad + soyad + e-posta + telefon biçimleri.
 * Yazma ve sorgu tarafı aynı `normalizeSearchText`'i kullanır.
 */
export function buildApplicationSearchText(input: {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phoneSearchForms: readonly string[];
}): string {
  return normalizeSearchText(
    [input.firstName, input.lastName, input.email, ...input.phoneSearchForms].join(" "),
  );
}

/** Başvuru numarası sorgusu mu? (`CS-2026-000001`, küçük harf/boşluk toleranslı) */
export function asApplicationNumber(query: string): string | null {
  const candidate = query.trim().toUpperCase();
  return /^CS-[0-9]{4}-[0-9]{6,}$/.test(candidate) ? candidate : null;
}

/** Telefon araması için yalnızca rakamlar (en az 4 hane), yoksa null. */
export function phoneDigitsQuery(query: string): string | null {
  if (!/^[0-9+()\-.\s]+$/.test(query)) return null;
  const digits = query.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits : null;
}
