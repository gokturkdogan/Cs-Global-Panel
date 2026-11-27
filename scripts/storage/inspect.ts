/**
 * pnpm storage:inspect — Backblaze B2 SALT OKUNUR denetimi (PHASE 12, D-143).
 *
 * Yazma, silme, nesne içeriği indirme veya ayar değişikliği YAPMAZ. Secret, token, URL veya nesne adı
 * yazdırmaz; yalnızca yapılandırma sonuçları ve sayılar. Kullanım: anahtar yenileme sonrası doğrulama,
 * gerçek sağlayıcı Checkpoint A (docs/VERIFICATION_PLANS.md).
 *
 * Kontroller: anahtar kapsamı (b2_authorize_account — yetkiler, bucket/önek kısıtı, son kullanma), bucket
 * erişimi, versiyonlama, varsayılan şifreleme, CORS, lifecycle, nesne/versiyon/silme işareti sayıları (ilk
 * sayfa), kimliksiz erişimin reddi, uygulamanın ihtiyacı dışındaki yetkiler.
 */
import {
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { loadLocalEnv } from "../db/lib.ts";

/**
 * Uygulamanın gerçekten kullandığı yetkiler (S3 uyumlu API — Backblaze "S3-Compatible App Key Capabilities":
 * GetObject/HeadObject → readFiles, PutObject → writeFiles, versiyona özgü DeleteObject → deleteFiles,
 * ListObjectVersions → listFiles). PHASE 12.1: uygulama ListBuckets/HeadBucket çağırmaz → `listBuckets`
 * zorunlu DEĞİL; yalnızca bu denetimin HeadBucket kontrolü için isteğe bağlıdır.
 */
const REQUIRED = ["listFiles", "readFiles", "writeFiles", "deleteFiles"] as const;
const OPTIONAL = ["listBuckets"] as const;
/** Sızıntı durumunda zararı büyüten yetkiler (bucket'ı public yapma, lifecycle/replikasyon, paylaşım). */
const RISKY = [
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
];

loadLocalEnv();
const env = process.env;
const missing = [
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_BUCKET_NAME",
  "B2_ENDPOINT",
  "B2_REGION",
].filter((name) => !env[name]);
if (missing.length > 0) {
  console.error(`Eksik yapılandırma: ${missing.join(", ")} (değerler yazdırılmaz).`);
  process.exit(2);
}

const report: Record<string, unknown> = { bucket: env.B2_BUCKET_NAME, region: env.B2_REGION };

const auth = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: {
    Authorization: `Basic ${Buffer.from(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`).toString("base64")}`,
  },
});
if (auth.ok) {
  const body = (await auth.json()) as {
    applicationKeyExpirationTimestamp?: number | null;
    apiInfo?: {
      storageApi?: {
        capabilities?: string[];
        bucketName?: string | null;
        namePrefix?: string | null;
      };
    };
  };
  const storage = body.apiInfo?.storageApi ?? {};
  const capabilities = [...(storage.capabilities ?? [])].sort();
  report.key = {
    bucketRestriction: storage.bucketName ?? "YOK (tüm bucket'lar)",
    namePrefix: storage.namePrefix ?? null,
    expires: body.applicationKeyExpirationTimestamp ? "var" : "yok",
    capabilities,
    missingRequired: REQUIRED.filter((c) => !capabilities.includes(c)),
    excessRisky: RISKY.filter((c) => capabilities.includes(c)),
    unexpected: capabilities.filter(
      (c) =>
        !(REQUIRED as readonly string[]).includes(c) &&
        !(OPTIONAL as readonly string[]).includes(c) &&
        !RISKY.includes(c),
    ),
  };
} else {
  report.key = `yetkilendirme başarısız (HTTP ${auth.status})`;
}

const client = new S3Client({
  endpoint: env.B2_ENDPOINT,
  region: env.B2_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: env.B2_KEY_ID!, secretAccessKey: env.B2_APPLICATION_KEY! },
});
const Bucket = env.B2_BUCKET_NAME!;
async function check<T>(name: string, send: () => Promise<T>, pick: (r: T) => unknown) {
  try {
    report[name] = pick(await send());
  } catch (error) {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    report[name] = `HATA ${e.$metadata?.httpStatusCode ?? ""} ${e.name ?? ""}`.trim();
  }
}
await check(
  "headBucket",
  () => client.send(new HeadBucketCommand({ Bucket })),
  () => "OK",
);
await check(
  "versioning",
  () => client.send(new GetBucketVersioningCommand({ Bucket })),
  (r) => r.Status ?? "yok",
);
await check(
  "defaultEncryption",
  () => client.send(new GetBucketEncryptionCommand({ Bucket })),
  (r) =>
    r.ServerSideEncryptionConfiguration?.Rules?.map(
      (x) => x.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
    ) ?? [],
);
await check(
  "cors",
  () => client.send(new GetBucketCorsCommand({ Bucket })),
  (r) => `${(r.CORSRules ?? []).length} kural`,
);
await check(
  "lifecycle",
  () => client.send(new GetBucketLifecycleConfigurationCommand({ Bucket })),
  (r) => `${(r.Rules ?? []).length} kural`,
);
await check(
  "objects",
  () => client.send(new ListObjectVersionsCommand({ Bucket, MaxKeys: 1000 })),
  (r) => ({
    versions: (r.Versions ?? []).length,
    deleteMarkers: (r.DeleteMarkers ?? []).length,
    moreThanFirstPage: r.IsTruncated === true,
  }),
);
const anonymous = await fetch(`${env.B2_ENDPOINT}/${Bucket}`, { redirect: "manual" });
report.anonymousList = anonymous.status;
await anonymous.body?.cancel();

console.log(JSON.stringify(report, null, 2));
const key = report.key as
  { excessRisky?: string[]; missingRequired?: string[]; unexpected?: string[] } | string;
if (
  typeof key !== "string" &&
  (key.excessRisky?.length || key.missingRequired?.length || key.unexpected?.length)
) {
  console.log(
    "UYARI: anahtar yetkileri en az yetki ilkesine uymuyor (bkz. docs/OPERATIONS_RUNBOOK.md — B2 anahtar yenileme).",
  );
}
