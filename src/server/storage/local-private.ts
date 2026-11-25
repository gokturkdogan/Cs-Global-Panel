import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { Readable } from "node:stream";

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
 * Yerel private adapter (PHASE 08, D-097) — YALNIZCA izole otomatik testler ve açıkça yetkilendirilmiş
 * yerel geliştirme (`STORAGE_PROVIDER=local`, `APP_ENV=development`). Production'da kullanılamaz ve
 * B2'ye erişilemediğinde yedek olarak devreye girmez (env doğrulaması).
 *
 * B2 versiyon modelini taklit eder: her yazma `<root>/<key>/<versionId>` altında yeni fiziksel versiyon.
 * Güvenlik: anahtar yalnızca sunucu biçimi (UUID yolu); kök dizin dışına çıkış, sembolik bağlantı ve
 * üzerine yazma engellenir (`wx`); dizinler 0700, dosyalar 0600. `public/` altında olamaz (env).
 */

const VERSION_PATTERN = /^[0-9]{15}-[0-9a-f]{16}$/;

function newVersionId(): string {
  return `${Date.now().toString().padStart(15, "0")}-${randomBytes(8).toString("hex")}`;
}

export async function createLocalPrivateAdapter(rootDir: string): Promise<StorageAdapter> {
  await mkdir(/*turbopackIgnore: true*/ rootDir, { recursive: true, mode: 0o700 });
  const root = await realpath(/*turbopackIgnore: true*/ rootDir);
  const rootStat = await lstat(/*turbopackIgnore: true*/ root);
  if (!rootStat.isDirectory()) throw new StorageError("NOT_CONFIGURED", "local-root");

  /** Anahtar → kök içindeki mutlak yol; biçim + kök sınırı + sembolik bağlantı kontrolü. */
  async function objectDir(key: string): Promise<string> {
    if (!isAllowedObjectKey(key)) throw new StorageError("FORBIDDEN", "invalid-key");
    const path = join(root, ...key.split("/"));
    if (!path.startsWith(root + sep)) throw new StorageError("FORBIDDEN", "outside-root");
    // Var olan ara bileşenler sembolik bağlantı olamaz.
    let current = root;
    for (const part of key.split("/")) {
      current = join(current, part);
      const info = await lstat(/*turbopackIgnore: true*/ current).catch(() => null);
      if (info === null) break;
      if (info.isSymbolicLink()) throw new StorageError("FORBIDDEN", "symlink");
    }
    return path;
  }

  async function versionsOf(key: string): Promise<string[]> {
    const dir = await objectDir(key);
    const entries = await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
    return entries.filter((name) => VERSION_PATTERN.test(name)).sort();
  }

  async function versionPath(key: string, versionId: string | null): Promise<string | null> {
    const versions = await versionsOf(key);
    const chosen = versionId === null ? versions.at(-1) : versions.find((v) => v === versionId);
    if (chosen === undefined) return null;
    const path = join(await objectDir(key), chosen);
    const info = await lstat(/*turbopackIgnore: true*/ path);
    if (!info.isFile()) throw new StorageError("FORBIDDEN", "not-file");
    const real = await realpath(/*turbopackIgnore: true*/ path);
    if (!real.startsWith(root + sep)) throw new StorageError("FORBIDDEN", "outside-root");
    return real;
  }

  return {
    provider: "local",

    async putObject(input: PutObjectInput): Promise<PutObjectResult> {
      const dir = await objectDir(input.key);
      if (input.body.byteLength !== input.sizeBytes) {
        throw new StorageError("INTEGRITY", "size-mismatch");
      }
      if (createHash("md5").update(input.body).digest("hex") !== input.md5Hex) {
        throw new StorageError("INTEGRITY", "md5-mismatch");
      }
      await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o700 });
      const versionId = newVersionId();
      try {
        await writeFile(/*turbopackIgnore: true*/ join(dir, versionId), input.body, {
          flag: "wx",
          mode: 0o600,
        });
      } catch {
        throw new StorageError("UNAVAILABLE", "write");
      }
      return { versionId };
    },

    async getObject(key: string, versionId: string | null): Promise<ObjectStream> {
      const path = await versionPath(key, versionId);
      if (path === null) throw new StorageError("NOT_FOUND");
      const info = await stat(/*turbopackIgnore: true*/ path);
      return {
        body: Readable.toWeb(
          createReadStream(/*turbopackIgnore: true*/ path),
        ) as ReadableStream<Uint8Array>,
        contentLength: info.size,
      };
    },

    async headObject(key: string, versionId: string | null): Promise<ObjectHead | null> {
      const path = await versionPath(key, versionId);
      if (path === null) return null;
      const info = await stat(/*turbopackIgnore: true*/ path);
      return { versionId: path.split(sep).at(-1) ?? null, contentLength: info.size };
    },

    async listObjectVersions(prefix: string): Promise<ListVersionsResult> {
      const result: ObjectVersion[] = [];
      async function walk(dir: string, relative: string): Promise<void> {
        const entries = await readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).catch(
          () => [],
        );
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
          const childPath = join(dir, entry.name);
          if (entry.isDirectory() && isAllowedObjectKey(childRelative)) {
            if (!childRelative.startsWith(prefix)) continue;
            const versions = (await readdir(/*turbopackIgnore: true*/ childPath))
              .filter((name) => VERSION_PATTERN.test(name))
              .sort();
            for (const [index, versionId] of versions.entries()) {
              const info = await stat(/*turbopackIgnore: true*/ join(childPath, versionId));
              result.push({
                key: childRelative,
                versionId,
                sizeBytes: info.size,
                isDeleteMarker: false,
                isLatest: index === versions.length - 1,
              });
            }
          } else if (entry.isDirectory()) {
            await walk(childPath, childRelative);
          }
        }
      }
      await walk(root, "");
      return { versions: result, truncated: false };
    },

    async deleteObjectVersion(key: string, versionId: string): Promise<void> {
      if (!VERSION_PATTERN.test(versionId)) throw new StorageError("FORBIDDEN", "invalid-version");
      const path = await versionPath(key, versionId);
      if (path !== null) await rm(/*turbopackIgnore: true*/ path, { force: true });
    },
  };
}
