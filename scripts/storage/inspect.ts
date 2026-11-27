/**
 * pnpm storage:inspect — Backblaze B2 SALT OKUNUR denetimi (PHASE 12, D-143; PHASE 12.1 v4 uyumu).
 *
 * Yazma, silme, nesne içeriği indirme veya ayar değişikliği YAPMAZ. Secret, token, URL veya nesne adı
 * yazdırmaz; yalnızca yapılandırma sonuçları ve sayılar. Kullanım: anahtar yenileme sonrası doğrulama,
 * gerçek sağlayıcı Checkpoint A (docs/VERIFICATION_PLANS.md).
 *
 * Kontroller: anahtar kapsamı (`b2_authorize_account` **v4** — v4 `b2_create_key` ile oluşturulan anahtarlar
 * yalnızca v4 ile yetkilendirilebilir; yetkiler, bucket/önek kısıtı, son kullanma, S3 uç noktası), bucket
 * erişimi, versiyonlama, varsayılan şifreleme, CORS, lifecycle, nesne/versiyon/silme işareti sayıları (ilk
 * sayfa), kimliksiz erişimin reddi. En az yetkili anahtarda bucket yapılandırma okumaları için yetki
 * bulunmaz → bu 403'ler "beklenen" olarak raporlanır (gerçek bağlantı/yetki hatalarından ayrı).
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
import { classifyCheckFailure, summarizeKeyScope } from "./key-scope.ts";

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

const Bucket = env.B2_BUCKET_NAME!;
const report: Record<string, unknown> = { bucket: Bucket, region: env.B2_REGION };

// Yanıt gövdesi yalnızca bellekte ayrıştırılır; token ve hata mesajı yazdırılmaz (yalnızca HTTP durumu/kod).
const auth = await fetch("https://api.backblazeb2.com/b2api/v4/b2_authorize_account", {
  headers: {
    Authorization: `Basic ${Buffer.from(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`).toString("base64")}`,
  },
});
let capabilities: readonly string[] | null = null;
if (auth.ok) {
  const scope = summarizeKeyScope(await auth.json(), Bucket, env.B2_ENDPOINT!);
  capabilities = scope.capabilities;
  report.key = scope;
} else {
  const code = await auth
    .json()
    .then((body: { code?: unknown }) => (typeof body.code === "string" ? body.code : ""))
    .catch(() => "");
  report.key = `yetkilendirme başarısız (HTTP ${auth.status}${code ? ` ${code}` : ""})`;
}

const client = new S3Client({
  endpoint: env.B2_ENDPOINT,
  region: env.B2_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: env.B2_KEY_ID!, secretAccessKey: env.B2_APPLICATION_KEY! },
});
/** `capability`: Backblaze "S3-Compatible App Key Capabilities" tablosundaki ilgili okuma yetkisi. */
async function check<T>(
  name: string,
  capability: string,
  send: () => Promise<T>,
  pick: (r: T) => unknown,
) {
  try {
    report[name] = pick(await send());
  } catch (error) {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    report[name] = classifyCheckFailure(
      e.$metadata?.httpStatusCode,
      e.name,
      capability,
      capabilities,
    );
  }
}
await check(
  "headBucket",
  "listBuckets",
  () => client.send(new HeadBucketCommand({ Bucket })),
  () => "OK",
);
await check(
  "versioning",
  "readBuckets",
  () => client.send(new GetBucketVersioningCommand({ Bucket })),
  (r) => r.Status ?? "yok",
);
await check(
  "defaultEncryption",
  "readBucketEncryption",
  () => client.send(new GetBucketEncryptionCommand({ Bucket })),
  (r) =>
    r.ServerSideEncryptionConfiguration?.Rules?.map(
      (x) => x.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
    ) ?? [],
);
await check(
  "cors",
  "readBuckets",
  () => client.send(new GetBucketCorsCommand({ Bucket })),
  (r) => `${(r.CORSRules ?? []).length} kural`,
);
await check(
  "lifecycle",
  "readBucketLifecycleRules",
  () => client.send(new GetBucketLifecycleConfigurationCommand({ Bucket })),
  (r) => `${(r.Rules ?? []).length} kural`,
);
// Uygulamanın gerçekten kullandığı okuma yetkisi (listFiles): burada 403 her zaman gerçek sorundur.
await check(
  "objects",
  "listFiles",
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
  | {
      excessRisky?: readonly string[];
      missingRequired?: readonly string[];
      unexpected?: readonly string[];
      restrictedToExpectedBucket?: boolean;
      namePrefix?: string | null;
      s3EndpointMatches?: boolean | null;
    }
  | string;
if (typeof key === "string") {
  console.log("UYARI: anahtar yetkilendirilemedi (b2_authorize_account v4).");
  process.exitCode = 2;
} else if (
  key.excessRisky?.length ||
  key.missingRequired?.length ||
  key.unexpected?.length ||
  !key.restrictedToExpectedBucket ||
  key.namePrefix !== null ||
  key.s3EndpointMatches === false
) {
  console.log(
    "UYARI: anahtar kapsamı beklenenden farklı (en az yetki / tek bucket / önek / uç nokta — docs/OPERATIONS_RUNBOOK.md §3.1).",
  );
  process.exitCode = 2;
} else {
  console.log(
    "Anahtar kapsamı beklenen: yalnızca gerekli yetkiler, tek bucket, önek yok. (Salt okunur sonuç; gerçek dosya işlemleri ayrıca doğrulanır.)",
  );
}
