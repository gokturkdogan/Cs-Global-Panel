/**
 * Durum değiştiren isteklerin köken kontrolü (P4-02, D-069). Saf modül: `proxy.ts` kullanır.
 *
 * Next.js Server Action'ları zaten Origin/Host kontrolü yapar, ancak ret yakalanmamış hata olarak
 * HTTP 500 üretir. Bu kontrol aynı kuralı daha önce ve daha sıkı uygular (Origin zorunlu) ve
 * kontrollü 403 döndürür. Next.js kontrolü devre dışı bırakılmaz (iki katman).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type OriginCheckInput = {
  readonly method: string;
  readonly origin: string | null;
  /** `x-forwarded-host` varsa o, yoksa `host` (Next.js ile aynı öncelik). */
  readonly host: string | null;
  /** Uygulamanın tek kök adresi (APP_URL); yoksa durum değiştiren istekler reddedilir. */
  readonly appUrl: string | null;
};

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Durum değiştiren istek APP_URL'den mi geliyor? Güvenli metotlar için her zaman `true`. */
export function isTrustedRequestOrigin(input: OriginCheckInput): boolean {
  if (isSafeMethod(input.method)) return true;
  if (input.appUrl === null || input.origin === null || input.host === null) return false;

  let app: URL;
  let origin: URL;
  try {
    app = new URL(input.appUrl);
    origin = new URL(input.origin);
  } catch {
    return false; // bozuk veya "null" Origin
  }
  return origin.origin === app.origin && input.host.toLowerCase() === app.host.toLowerCase();
}

/** APP_URL'i proxy ortamında çözer (env.ts ile aynı geliştirme varsayılanı). */
export function resolveAppUrl(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env.APP_URL?.trim();
  if (value) return value;
  return env.NODE_ENV === "production" ? null : "http://localhost:3000";
}
