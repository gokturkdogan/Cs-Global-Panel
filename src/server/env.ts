import "server-only";

import { z } from "zod";

/**
 * Sunucu tarafı ortam değişkenleri (ARCHITECTURE §11.3, DEPLOYMENT §3).
 *
 * - Doğrulama ilk kullanımda yapılır (lazy). Henüz kullanılmayan servis değişkenleri
 *   bu şemada yoktur; her biri ilgili fazda, o özelliği kullanan kodla birlikte
 *   eklenir ve production'da zorunlu tutulur (fail-closed).
 * - Hata mesajları yalnızca değişken adlarını içerir, değerleri asla içermez.
 * - `NEXT_PUBLIC_*` değişken kullanılmaz; bu modül client bundle'a giremez.
 */

export const APP_ENVS = ["development", "preview", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export type ServerEnv = {
  readonly appEnv: AppEnv;
  /** Uygulamanın kök adresi (yalnızca origin). Bağlantılar yalnızca buradan üretilir (OD-20). */
  readonly appUrl: string;
};

export class EnvValidationError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Geçersiz veya eksik ortam değişkenleri: ${variables.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

const DEVELOPMENT_APP_URL = "http://localhost:3000";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const rawEnvSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndefined, z.string().optional()),
  APP_ENV: z.preprocess(emptyToUndefined, z.enum(APP_ENVS).optional()),
  APP_URL: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

type EnvSource = Readonly<Record<string, string | undefined>>;

/** URL'yi doğrular ve origin'e indirger; geçersizse `null` döner. */
function toOrigin(value: string, requireHttps: boolean): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const allowedProtocols = requireHttps ? ["https:"] : ["https:", "http:"];
  const isOriginOnly =
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === "";

  return allowedProtocols.includes(url.protocol) && isOriginOnly ? url.origin : null;
}

/** Saf ayrıştırıcı: verilen kaynaktan sunucu ortamını üretir veya hata fırlatır. */
export function parseServerEnv(source: EnvSource): ServerEnv {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(variables);
  }

  const { NODE_ENV, APP_ENV, APP_URL } = parsed.data;

  // Production çalışma zamanında ortam türü açıkça belirtilmelidir; varsayılana düşülmez.
  if (APP_ENV === undefined && NODE_ENV === "production") {
    throw new EnvValidationError(["APP_ENV"]);
  }
  const appEnv: AppEnv = APP_ENV ?? "development";

  // Yalnızca development'ta varsayılan yerel adres ve http kabul edilir.
  if (APP_URL === undefined) {
    if (appEnv !== "development") throw new EnvValidationError(["APP_URL"]);
    return { appEnv, appUrl: DEVELOPMENT_APP_URL };
  }

  const appUrl = toOrigin(APP_URL, appEnv !== "development");
  if (appUrl === null) throw new EnvValidationError(["APP_URL"]);

  return { appEnv, appUrl };
}

let cachedEnv: ServerEnv | undefined;

/** Çalışma zamanı ortamını döndürür; ilk çağrıda `process.env` doğrulanır. */
export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
