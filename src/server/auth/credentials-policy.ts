/**
 * Personel kullanıcı adı ve şifre politikası (BR-131, OD-22). Saf modül: `server-only` içermez,
 * çünkü yerel CLI (`pnpm auth:bootstrap`, `auth:reset-password`) de aynı kuralları kullanır.
 */
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../config/constants.ts";

/** Better Auth username plugin'i ile aynı normalizasyon: kırp + küçük harf. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

/** Normalize edilmiş kullanıcı adını doğrular; hata varsa Türkçe mesaj döner. */
export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return "Kullanıcı adı 3–30 karakter olmalı ve yalnızca küçük harf (a-z), rakam, nokta ve alt çizgi içermelidir.";
  }
  return null;
}

/** Şifreyi doğrular; hata varsa Türkçe mesaj döner. */
export function validatePassword(password: string, username: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Şifre ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter olmalıdır.`;
  }
  if (password.trim() !== password) {
    return "Şifre başında veya sonunda boşluk içeremez.";
  }
  if (password.toLowerCase().includes(username.toLowerCase())) {
    return "Şifre kullanıcı adını içeremez.";
  }
  if (new Set(password).size < 4) {
    return "Şifre en az 4 farklı karakter içermelidir.";
  }
  return null;
}
