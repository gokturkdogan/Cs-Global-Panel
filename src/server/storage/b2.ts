import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import { StorageError } from "./errors.ts";
import {
  isAllowedObjectKey,
  type ListVersionsResult,
  type ObjectHead,
  type ObjectStream,
  type ObjectVersion,
  type PutObjectInput,
  type PutObjectResult,
  type StorageAdapter,
} from "./types.ts";

/**
 * Backblaze B2 adapter — S3 uyumlu API (PHASE 08, D-096). Yalnızca sunucuda; yalnızca mevcut private
 * bucket. Davranış notları (backblaze.com/apidocs, 2026-11-25 doğrulandı):
 * - Bucket'lar her zaman versiyonludur; aynı anahtara PutObject yeni fiziksel versiyon oluşturur ve
 *   `x-amz-version-id` döner. Anahtarlar her yüklemede benzersizdir (fileId), üzerine yazma yapılmaz.
 * - versionId'siz DeleteObject yalnızca silme işareti (delete marker) ekler, veri kalır; kalıcı silme
 *   yalnızca versionId'li DeleteObject ile yapılır → bu adapter yalnızca versiyona özgü siler.
 * - SSE-B2: `x-amz-server-side-encryption: AES256` istekte gönderilir ve yanıtta doğrulanır.
 * - AWS SDK'nin varsayılan CRC32 "flexible checksum" başlıkları B2 belgelerinde yer almadığından
 *   yalnızca gerektiğinde hesaplanır (`WHEN_REQUIRED`); içerik bütünlüğü SigV4 yük imzası
 *   (`x-amz-content-sha256`), ETag=MD5 karşılaştırması ve uygulamanın SHA-256 kaydıyla sağlanır.
 * - Path-style adresleme (`https://s3.<region>.backblazeb2.com/<bucket>/<key>`) — B2 her iki biçimi
 *   destekler; bucket adı DNS'e bağlı kalmaz.
 * - Zaman aşımları sınırlı, en fazla 1 yeniden deneme (kota/cap hatalarında yeniden deneme yok).
 */

export type B2Config = {
  readonly keyId: string;
  readonly applicationKey: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
};

const NOT_FOUND_NAMES = new Set(["NoSuchKey", "NoSuchVersion", "NotFound", "NoSuchBucket"]);

/** Sağlayıcı hatasını sınıflandırır; mesaj/gövde dışarı taşınmaz (yalnızca durum kodu / hata adı). */
export function classifyB2Error(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof S3ServiceException) {
    const status = error.$metadata.httpStatusCode ?? 0;
    const code = `${status}:${error.name}`.slice(0, 80);
    if (status === 404 || NOT_FOUND_NAMES.has(error.name))
      return new StorageError("NOT_FOUND", code);
    // B2 cap'leri 403 ile döner (native API belgesi: "reached a storage cap limit"); metin sınıflandırma
    // için okunur, dışarı aktarılmaz.
    if (status === 403 && /cap|limit|exceed/i.test(`${error.name} ${error.message}`)) {
      return new StorageError("LIMIT", code);
    }
    if (status === 401 || status === 403) return new StorageError("FORBIDDEN", code);
    if (status === 429) return new StorageError("LIMIT", code);
    if (status >= 500) return new StorageError("UNAVAILABLE", code);
    return new StorageError("UNAVAILABLE", code);
  }
  const name = error instanceof Error ? error.name : "unknown";
  return new StorageError("UNAVAILABLE", name.slice(0, 80));
}

function assertKey(key: string): void {
  if (!isAllowedObjectKey(key)) throw new StorageError("FORBIDDEN", "invalid-key");
}

function stripQuotes(value: string | undefined): string | null {
  return value ? value.replaceAll('"', "").toLowerCase() : null;
}

export function createB2Adapter(config: B2Config): StorageAdapter {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey },
    forcePathStyle: true,
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 60_000 },
  });
  const Bucket = config.bucket;

  return {
    provider: "b2",

    async putObject(input: PutObjectInput): Promise<PutObjectResult> {
      assertKey(input.key);
      let response;
      try {
        response = await client.send(
          new PutObjectCommand({
            Bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
            ContentLength: input.sizeBytes,
            ServerSideEncryption: "AES256",
          }),
        );
      } catch (error) {
        const classified = classifyB2Error(error);
        // Yanıt alınamadıysa yazma gerçekleşmiş olabilir → belirsiz (mutabakat gerekir).
        throw classified.kind === "UNAVAILABLE"
          ? new StorageError("AMBIGUOUS", classified.code)
          : classified;
      }
      if (response.ServerSideEncryption !== "AES256") {
        throw new StorageError("INTEGRITY", "sse-missing");
      }
      // Tek parçalı yüklemede ETag içerik MD5'idir; farklı biçimdeyse karşılaştırılmaz (SHA-256 değildir).
      const etag = stripQuotes(response.ETag);
      if (etag !== null && /^[0-9a-f]{32}$/.test(etag) && etag !== input.md5Hex) {
        throw new StorageError("INTEGRITY", "etag-mismatch");
      }
      return { versionId: response.VersionId ?? null };
    },

    async getObject(key: string, versionId: string | null): Promise<ObjectStream> {
      assertKey(key);
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket,
            Key: key,
            ...(versionId ? { VersionId: versionId } : {}),
          }),
        );
        if (response.Body === undefined || response.ContentLength === undefined) {
          throw new StorageError("INTEGRITY", "empty-body");
        }
        return {
          body: response.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          contentLength: response.ContentLength,
        };
      } catch (error) {
        throw classifyB2Error(error);
      }
    },

    async headObject(key: string, versionId: string | null): Promise<ObjectHead | null> {
      assertKey(key);
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket,
            Key: key,
            ...(versionId ? { VersionId: versionId } : {}),
          }),
        );
        return {
          versionId: response.VersionId ?? null,
          contentLength: response.ContentLength ?? 0,
        };
      } catch (error) {
        const classified = classifyB2Error(error);
        if (classified.kind === "NOT_FOUND") return null;
        throw classified;
      }
    },

    async listObjectVersions(prefix: string, maxPages: number): Promise<ListVersionsResult> {
      const versions: ObjectVersion[] = [];
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        let response;
        try {
          response = await client.send(
            new ListObjectVersionsCommand({
              Bucket,
              Prefix: prefix,
              MaxKeys: 1000,
              ...(keyMarker ? { KeyMarker: keyMarker } : {}),
              ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {}),
            }),
          );
        } catch (error) {
          throw classifyB2Error(error);
        }
        for (const item of response.Versions ?? []) {
          if (item.Key && item.VersionId) {
            versions.push({
              key: item.Key,
              versionId: item.VersionId,
              sizeBytes: item.Size ?? 0,
              isDeleteMarker: false,
              isLatest: item.IsLatest === true,
            });
          }
        }
        for (const item of response.DeleteMarkers ?? []) {
          if (item.Key && item.VersionId) {
            versions.push({
              key: item.Key,
              versionId: item.VersionId,
              sizeBytes: 0,
              isDeleteMarker: true,
              isLatest: item.IsLatest === true,
            });
          }
        }
        if (!response.IsTruncated) return { versions, truncated: false };
        keyMarker = response.NextKeyMarker;
        versionIdMarker = response.NextVersionIdMarker;
      }
      return { versions, truncated: true };
    },

    async deleteObjectVersion(key: string, versionId: string): Promise<void> {
      assertKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key, VersionId: versionId }));
      } catch (error) {
        const classified = classifyB2Error(error);
        if (classified.kind !== "NOT_FOUND") throw classified;
      }
    },
  };
}
