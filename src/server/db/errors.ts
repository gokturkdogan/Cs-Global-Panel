import "server-only";

/** PostgreSQL hata kodu (yalnızca kod; mesaj/parametre loglanmaz — DATABASE_SCHEMA §9.3). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  // Drizzle hataları pg hatasını `cause` içinde taşıyabilir.
  for (let depth = 0; depth < 3 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function constraintName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== null && typeof current === "object"; depth += 1) {
    const name = (current as { constraint?: unknown }).constraint;
    if (typeof name === "string") return name;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Kilit/serileştirme kaynaklı, kullanıcıya "tekrar deneyin" olarak gösterilecek hatalar. */
export const CONCURRENCY_ERROR_CODES = new Set(["40001", "40P01", "55P03"]);
