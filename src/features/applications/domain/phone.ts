import "server-only";

import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Telefon normalizasyonu (BR-07): `libphonenumber-js` (tam metadata), varsayılan bölge TR,
 * E.164 çıktı. Uluslararası numaralar (`+` ile) kabul edilir. Ham girdi saklanmaz. Biçim doğrulaması
 * numaranın sahipliğini doğrulamaz (SMS/OTP yok — OD-08). Yalnızca sunucuda çalışır.
 */
export type NormalizedPhone = {
  readonly e164: string;
  /** Arama metni için ek biçimler (BR-80): rakamlar, ulusal numara ve `0`'lı yerel biçim. */
  readonly searchForms: readonly string[];
};

export function normalizePhone(input: string): NormalizedPhone | null {
  const phone = parsePhoneNumberFromString(input.trim(), "TR");
  if (phone === undefined || !phone.isValid()) return null;
  const e164 = phone.number;
  if (!/^\+[1-9][0-9]{7,14}$/.test(e164)) return null;
  const national = String(phone.nationalNumber);
  return { e164, searchForms: [e164.slice(1), national, `0${national}`] };
}

/** Görüntüleme: E.164 → uluslararası biçim (ör. "+90 532 111 22 33"); çözülemezse E.164. */
export function formatPhoneForDisplay(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
