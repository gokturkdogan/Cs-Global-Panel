/**
 * `pnpm storage:inspect` için saf yardımcılar (PHASE 12.1). Ağ çağrısı yapmaz; secret işlemez.
 *
 * Backblaze `b2_authorize_account` **v4** (resmî belge, 2026-11-27): anahtar kısıtları
 * `apiInfo.storageApi.allowed` altında — `buckets[] {id, name}`, `capabilities[]`, `namePrefix`;
 * `applicationKeyExpirationTimestamp` üst düzeydedir. v4 `b2_create_key` (`bucketIds`) ile oluşturulan
 * "Multi-Bucket Application Key"ler YALNIZCA v4 ile yetkilendirilebilir (v1–v3 hata döner).
 */

/** Uygulamanın kullandığı S3 işlemleri için asgari yetkiler (Backblaze "S3-Compatible App Key Capabilities"). */
export const REQUIRED_CAPABILITIES = [
  "listFiles",
  "readFiles",
  "writeFiles",
  "deleteFiles",
] as const;
/** Uygulama için gerekmeyen, yalnızca bu denetimin bucket kontrollerini açan okuma yetkileri. */
export const OPTIONAL_CAPABILITIES = [
  "listBuckets",
  "readBuckets",
  "readBucketEncryption",
  "readBucketLifecycleRules",
] as const;
/** Sızıntıda zararı büyüten yetkiler (bucket'ı public yapma, lifecycle/replikasyon, paylaşım, anahtar yönetimi). */
export const RISKY_CAPABILITIES = [
  "writeBuckets",
  "writeBucketLifecycleRules",
  "writeBucketReplications",
  "writeBucketEncryption",
  "writeBucketNotifications",
  "writeBucketLogging",
  "writeBucketRetentions",
  "bypassGovernance",
  "shareFiles",
  "writeKeys",
  "deleteKeys",
  "deleteBuckets",
] as const;

type AuthorizeV4 = {
  readonly applicationKeyExpirationTimestamp?: number | null;
  readonly apiInfo?: {
    readonly storageApi?: {
      readonly s3ApiUrl?: string;
      readonly allowed?: {
        readonly capabilities?: readonly string[];
        readonly buckets?:
          readonly { readonly id?: string; readonly name?: string | null }[] | null;
        readonly namePrefix?: string | null;
      };
    };
  };
};

export type KeyScope = {
  readonly capabilities: readonly string[];
  /** Kısıtlı bucket adları; `null` = bucket kısıtı yok (tüm bucket'lar). */
  readonly buckets: readonly string[] | null;
  readonly restrictedToExpectedBucket: boolean;
  readonly namePrefix: string | null;
  readonly expires: "var" | "yok";
  readonly s3EndpointMatches: boolean | null;
  readonly missingRequired: readonly string[];
  readonly excessRisky: readonly string[];
  readonly unexpected: readonly string[];
};

/** v4 yetkilendirme yanıtından anahtar kapsamı özeti (yalnızca adlar/sayılar; token okunmaz). */
export function summarizeKeyScope(
  body: unknown,
  expectedBucket: string,
  expectedS3Endpoint: string,
): KeyScope {
  const storage = (body as AuthorizeV4 | null)?.apiInfo?.storageApi;
  const allowed = storage?.allowed;
  const capabilities = [...(allowed?.capabilities ?? [])].sort();
  const rawBuckets = allowed?.buckets;
  const buckets =
    rawBuckets === undefined || rawBuckets === null
      ? null
      : rawBuckets.map((bucket) => bucket.name ?? `(adı yok: ${bucket.id ?? "?"})`);
  const known: readonly string[] = [
    ...REQUIRED_CAPABILITIES,
    ...OPTIONAL_CAPABILITIES,
    ...RISKY_CAPABILITIES,
  ];
  const expiration = (body as AuthorizeV4 | null)?.applicationKeyExpirationTimestamp;
  return {
    capabilities,
    buckets,
    restrictedToExpectedBucket:
      buckets !== null && buckets.length === 1 && buckets[0] === expectedBucket,
    namePrefix: allowed?.namePrefix ?? null,
    expires: typeof expiration === "number" ? "var" : "yok",
    s3EndpointMatches:
      typeof storage?.s3ApiUrl === "string"
        ? storage.s3ApiUrl.replace(/\/+$/, "") === expectedS3Endpoint.replace(/\/+$/, "")
        : null,
    missingRequired: REQUIRED_CAPABILITIES.filter((c) => !capabilities.includes(c)),
    excessRisky: RISKY_CAPABILITIES.filter((c) => capabilities.includes(c)),
    unexpected: capabilities.filter((c) => !known.includes(c)),
  };
}

/**
 * Bucket yapılandırması kontrolünün sonucu: anahtarda ilgili okuma yetkisi YOKSA 403 en az yetkinin
 * beklenen sonucudur (bağlantı hatası değildir); yetki varken 403 veya başka hata gerçek sorundur.
 */
export function classifyCheckFailure(
  status: number | undefined,
  name: string | undefined,
  capability: string,
  capabilities: readonly string[] | null,
): string {
  if (status === 403 && capabilities !== null && !capabilities.includes(capability)) {
    return `BEKLENEN 403 — anahtarda ${capability} yok (en az yetki; uygulama bu işlemi kullanmaz)`;
  }
  return ["HATA", status, name].filter((part) => part !== undefined && part !== "").join(" ");
}
