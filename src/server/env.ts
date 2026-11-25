import "server-only";

import { z } from "zod";

import { parseDatabaseUrl, RUNTIME_ROLE } from "@/server/db/settings";

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

export type DatabaseEnv = {
  /** Runtime bağlantısı: pooled uç nokta, `cs_app_runtime` rolü, `sslmode=verify-full`. */
  readonly databaseUrl: string;
};

/**
 * Veritabanı ortamını doğrular (D-055). Yalnızca veritabanına erişildiğinde çağrılır; bu yüzden
 * veritabanı kullanmayan sayfalar ve `next build` DATABASE_URL olmadan çalışır.
 * Hata mesajı adres değerini içermez.
 */
export function parseDatabaseEnv(source: EnvSource): DatabaseEnv {
  const { appEnv } = parseServerEnv(source);
  const parsed = parseDatabaseUrl(source.DATABASE_URL, "DATABASE_URL", {
    expectedUser: RUNTIME_ROLE,
    allowLocal: appEnv === "development",
  });
  return { databaseUrl: parsed.connectionString };
}

let cachedDatabaseEnv: DatabaseEnv | undefined;

export function getDatabaseEnv(): DatabaseEnv {
  cachedDatabaseEnv ??= parseDatabaseEnv(process.env);
  return cachedDatabaseEnv;
}

export type AuthEnv = {
  readonly appEnv: AppEnv;
  /** Better Auth base URL ve güvenilen origin — tek kaynak APP_URL (OD-20). */
  readonly appUrl: string;
  /** Oturum cookie'si imzası ve Better Auth iç şifrelemesi. */
  readonly authSecret: string;
  /** Giriş rate limit anahtarlarının HMAC'i (kullanıcı adı düz metin saklanmaz). */
  readonly rateLimitKeySecret: string;
  /** https APP_URL'de Secure cookie zorunlu. */
  readonly secureCookies: boolean;
};

const MIN_SECRET_LENGTH = 32;

/**
 * Kimlik doğrulama ortamını doğrular (D-066). Yalnızca giriş/oturum işlemlerinde çağrılır;
 * secret eksik veya kısa ise işlem fail-closed reddedilir. Hata mesajı değer içermez.
 */
export function parseAuthEnv(source: EnvSource): AuthEnv {
  const { appEnv, appUrl } = parseServerEnv(source);
  const missing = (["BETTER_AUTH_SECRET", "RATE_LIMIT_KEY_SECRET"] as const).filter(
    (name) => (source[name]?.length ?? 0) < MIN_SECRET_LENGTH,
  );
  if (missing.length > 0) throw new EnvValidationError(missing);
  if (source.BETTER_AUTH_SECRET === source.RATE_LIMIT_KEY_SECRET) {
    throw new EnvValidationError(["RATE_LIMIT_KEY_SECRET"]);
  }
  return {
    appEnv,
    appUrl,
    authSecret: source.BETTER_AUTH_SECRET as string,
    rateLimitKeySecret: source.RATE_LIMIT_KEY_SECRET as string,
    secureCookies: appUrl.startsWith("https://"),
  };
}

let cachedAuthEnv: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cachedAuthEnv ??= parseAuthEnv(process.env);
  return cachedAuthEnv;
}

/**
 * Müşteri bağlantı token'ı anahtarları (PHASE 06, SECURITY §3.2, D-080). Yalnızca token işlemlerinde
 * (oluşturma, görüntüleme, yenileme) çağrılır: eksik/hatalı anahtar bu işlemleri fail-closed reddeder;
 * giriş ve diğer modüller etkilenmez. Hata mesajı değer içermez.
 *
 * - ACCESS_TOKEN_HMAC_KEY: base64, çözülmüş 32 bayt — token doğrulama hash'i.
 * - ACCESS_TOKEN_ENCRYPTION_KEYS: JSON `{"k1":"<base64 32 bayt>"}` — AES-256-GCM anahtarları (rotasyon).
 * - ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: yeni şifrelemede kullanılan anahtar kimliği.
 * Tüm anahtarlar birbirinden ve auth secret'larından farklı olmalıdır.
 */
export type AccessTokenEnv = {
  readonly appUrl: string;
  readonly hmacKey: Buffer;
  readonly encryptionKeys: ReadonlyMap<string, Buffer>;
  readonly activeKeyId: string;
};

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const TOKEN_KEY_BYTES = 32;

function decodeKey(value: unknown): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value.trim())) return null;
  const buffer = Buffer.from(value.trim(), "base64");
  return buffer.length === TOKEN_KEY_BYTES ? buffer : null;
}

export function parseAccessTokenEnv(source: EnvSource): AccessTokenEnv {
  const { appUrl } = parseServerEnv(source);
  const invalid: string[] = [];

  const hmacKey = decodeKey(source.ACCESS_TOKEN_HMAC_KEY);
  if (hmacKey === null) invalid.push("ACCESS_TOKEN_HMAC_KEY");

  const encryptionKeys = new Map<string, Buffer>();
  try {
    const parsed: unknown = JSON.parse(source.ACCESS_TOKEN_ENCRYPTION_KEYS ?? "");
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    for (const [id, value] of Object.entries(parsed)) {
      const key = decodeKey(value);
      if (!KEY_ID_PATTERN.test(id) || key === null) throw new Error();
      encryptionKeys.set(id, key);
    }
    if (encryptionKeys.size === 0) throw new Error();
  } catch {
    invalid.push("ACCESS_TOKEN_ENCRYPTION_KEYS");
  }

  const activeKeyId = source.ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID?.trim() ?? "";
  if (!encryptionKeys.has(activeKeyId)) invalid.push("ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID");
  if (invalid.length > 0) throw new EnvValidationError(invalid);

  // Anahtar ayrımı: HMAC anahtarı, şifreleme anahtarları ve auth secret'ları birbirinden farklı.
  const all = [hmacKey!, ...encryptionKeys.values()].map((key) => key.toString("hex"));
  const authSecrets = [source.BETTER_AUTH_SECRET, source.RATE_LIMIT_KEY_SECRET].filter(Boolean);
  const reused =
    new Set(all).size !== all.length ||
    authSecrets.some((value) =>
      [hmacKey!, ...encryptionKeys.values()].some(
        (key) => value === key.toString("base64") || value === key.toString("hex"),
      ),
    );
  if (reused)
    throw new EnvValidationError(["ACCESS_TOKEN_HMAC_KEY", "ACCESS_TOKEN_ENCRYPTION_KEYS"]);

  return { appUrl, hmacKey: hmacKey!, encryptionKeys, activeKeyId };
}

let cachedAccessTokenEnv: AccessTokenEnv | undefined;

export function getAccessTokenEnv(): AccessTokenEnv {
  cachedAccessTokenEnv ??= parseAccessTokenEnv(process.env);
  return cachedAccessTokenEnv;
}
