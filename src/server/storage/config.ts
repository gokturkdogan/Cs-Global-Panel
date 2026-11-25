import {
  MAX_PDF_SIZE_BYTES,
  STORAGE_DEFAULT_WARNING_BYTES,
  STORAGE_HARD_MAX_TOTAL_BYTES,
} from "../../config/constants.ts";

/**
 * Depolama yapılandırması doğrulaması (PHASE 08, D-096…D-098). Saf modül: Next.js (`getStorageEnv`) ve
 * Node ile doğrudan çalışan bakım betikleri (`scripts/storage/*`) aynı kuralları kullanır. Hata yalnızca
 * değişken adlarını içerir, değerleri asla.
 *
 * - `STORAGE_PROVIDER=b2`: Backblaze B2 (S3 uyumlu API, private bucket, bucket'a kısıtlı Application Key).
 * - `STORAGE_PROVIDER=local`: yalnızca `APP_ENV=development` + mutlak `STORAGE_LOCAL_ROOT` (izole testler,
 *   açıkça yetkilendirilmiş yerel geliştirme); `public/` altında olamaz. Sessiz yedek sağlayıcı yoktur.
 * - İzole test ortamında (`ISOLATED_TEST_DB=1`) ve Vitest'te (`NODE_ENV=test`) B2 reddedilir: otomatik
 *   testler gerçek bucket'a bağlanamaz.
 * - `APP_ENV=production` geliştirme bucket'ını kullanamaz (ayrı bucket + bağımsız anahtar zorunlu).
 *   Next.js `NODE_ENV=production` (build/start) ile `APP_ENV=production` aynı şey değildir.
 * - Kota: `STORAGE_MAX_TOTAL_BYTES` ≤ 9 000 000 000 (kod sabiti); `STORAGE_WARNING_BYTES` < üst sınır.
 * - `MAX_PDF_SIZE_BYTES` sabittir (OD-16, dinamik limit yok); tanımlıysa koddaki değerle aynı olmalıdır.
 */

export type StorageQuota = { readonly maxTotalBytes: number; readonly warningBytes: number };
type AppEnv = "development" | "preview" | "production";

export type StorageEnv =
  | {
      readonly provider: "b2";
      readonly appEnv: AppEnv;
      readonly keyId: string;
      readonly applicationKey: string;
      readonly bucket: string;
      readonly endpoint: string;
      readonly region: string;
      readonly quota: StorageQuota;
    }
  | {
      readonly provider: "local";
      readonly appEnv: AppEnv;
      readonly root: string;
      readonly quota: StorageQuota;
    };

export class StorageConfigError extends Error {
  readonly variables: readonly string[];
  constructor(variables: readonly string[]) {
    super(`Geçersiz veya eksik depolama değişkenleri: ${variables.join(", ")}`);
    this.name = "StorageConfigError";
    this.variables = variables;
  }
}

/** Geliştirme kapsamındaki bucket'lar: production bu bucket'lara bağlanamaz (PHASE 08 §10). */
export const DEVELOPMENT_BUCKETS: readonly string[] = ["cs-global-documents"];

const B2_KEY_ID_PATTERN = /^[A-Za-z0-9]{10,64}$/;
const B2_APPLICATION_KEY_PATTERN = /^[A-Za-z0-9+/=_-]{20,128}$/;
const B2_BUCKET_PATTERN = /^[A-Za-z0-9-]{6,63}$/;
const B2_REGION_PATTERN = /^[a-z]{2}-[a-z]+-[0-9]{3}$/;

type Source = Readonly<Record<string, string | undefined>>;

function parseByteCount(value: string | undefined): number | null | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (!/^[0-9]{1,16}$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function appEnvOf(source: Source): AppEnv {
  const value = source.APP_ENV?.trim();
  if (value === "development" || value === "preview" || value === "production") return value;
  if (value === undefined || value === "") {
    if (source.NODE_ENV === "production") throw new StorageConfigError(["APP_ENV"]);
    return "development";
  }
  throw new StorageConfigError(["APP_ENV"]);
}

export function parseStorageConfig(source: Source, cwd: string = process.cwd()): StorageEnv {
  const appEnv = appEnvOf(source);
  const invalid: string[] = [];

  const declaredPdfLimit = parseByteCount(source.MAX_PDF_SIZE_BYTES);
  if (declaredPdfLimit !== undefined && declaredPdfLimit !== MAX_PDF_SIZE_BYTES) {
    invalid.push("MAX_PDF_SIZE_BYTES");
  }

  const max = parseByteCount(source.STORAGE_MAX_TOTAL_BYTES);
  const maxTotalBytes = max === undefined ? STORAGE_HARD_MAX_TOTAL_BYTES : max;
  if (maxTotalBytes === null || maxTotalBytes < 1 || maxTotalBytes > STORAGE_HARD_MAX_TOTAL_BYTES) {
    invalid.push("STORAGE_MAX_TOTAL_BYTES");
  }
  const warning = parseByteCount(source.STORAGE_WARNING_BYTES);
  const warningBytes =
    warning === undefined
      ? Math.min(STORAGE_DEFAULT_WARNING_BYTES, Math.floor(((maxTotalBytes ?? 0) * 8) / 9))
      : warning;
  if (warningBytes === null || warningBytes < 1 || warningBytes >= (maxTotalBytes ?? 0)) {
    invalid.push("STORAGE_WARNING_BYTES");
  }

  const provider = source.STORAGE_PROVIDER?.trim();
  const testRun = source.ISOLATED_TEST_DB === "1" || source.NODE_ENV === "test";
  if (provider !== "b2" && provider !== "local") invalid.push("STORAGE_PROVIDER");
  if (provider === "b2" && testRun) invalid.push("STORAGE_PROVIDER");

  const quota = (): StorageQuota => ({
    maxTotalBytes: maxTotalBytes!,
    warningBytes: warningBytes!,
  });

  if (provider === "local") {
    const root = (source.STORAGE_LOCAL_ROOT?.trim() ?? "").replace(/\/+$/, "");
    const publicDir = `${cwd}/public`;
    if (
      appEnv !== "development" ||
      !root.startsWith("/") ||
      root.split("/").includes("..") ||
      root === publicDir ||
      root.startsWith(`${publicDir}/`)
    ) {
      invalid.push("STORAGE_LOCAL_ROOT");
    }
    if (invalid.length > 0) throw new StorageConfigError([...new Set(invalid)]);
    return { provider, appEnv, root, quota: quota() };
  }

  const keyId = source.B2_KEY_ID?.trim() ?? "";
  const applicationKey = source.B2_APPLICATION_KEY?.trim() ?? "";
  const bucket = source.B2_BUCKET_NAME?.trim() ?? "";
  const region = source.B2_REGION?.trim() ?? "";
  const endpoint = source.B2_ENDPOINT?.trim().replace(/\/+$/, "") ?? "";
  if (!B2_KEY_ID_PATTERN.test(keyId)) invalid.push("B2_KEY_ID");
  if (!B2_APPLICATION_KEY_PATTERN.test(applicationKey) || applicationKey === keyId) {
    invalid.push("B2_APPLICATION_KEY");
  }
  if (!B2_BUCKET_PATTERN.test(bucket) || bucket.toLowerCase().startsWith("b2-")) {
    invalid.push("B2_BUCKET_NAME");
  }
  if (appEnv === "production" && DEVELOPMENT_BUCKETS.includes(bucket)) {
    invalid.push("B2_BUCKET_NAME");
  }
  if (!B2_REGION_PATTERN.test(region)) invalid.push("B2_REGION");
  // Uç nokta yalnızca güvenilir yapılandırmadan; HTTPS ve bölgeyle birebir eşleşme zorunlu.
  if (endpoint !== `https://s3.${region}.backblazeb2.com`) invalid.push("B2_ENDPOINT");
  if (invalid.length > 0) throw new StorageConfigError([...new Set(invalid)]);

  return {
    provider: "b2",
    appEnv,
    keyId,
    applicationKey,
    bucket,
    endpoint,
    region,
    quota: quota(),
  };
}
