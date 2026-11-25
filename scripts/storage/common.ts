/**
 * Depolama betiklerinin ortak kurulumu: `.env.local` (varsa), aynı doğrulama kuralları
 * (`src/server/storage/config.ts`), runtime rolüyle DB bağlantısı (en az yetki). Değer yazdırılmaz.
 */
import { createB2Adapter } from "../../src/server/storage/b2.ts";
import { parseStorageConfig, type StorageEnv } from "../../src/server/storage/config.ts";
import { createLocalPrivateAdapter } from "../../src/server/storage/local-private.ts";
import type { StorageAdapter } from "../../src/server/storage/types.ts";
import { connect, loadLocalEnv, resolveDatabaseUrls } from "../db/lib.ts";

export function loadStorageConfig(): StorageEnv {
  loadLocalEnv();
  return parseStorageConfig(process.env);
}

export async function createAdapter(config: StorageEnv): Promise<StorageAdapter> {
  return config.provider === "b2"
    ? createB2Adapter(config)
    : createLocalPrivateAdapter(config.root);
}

export async function connectRuntime(name: string) {
  return connect(resolveDatabaseUrls().runtime, name);
}

export function describeTarget(config: StorageEnv): string {
  return config.provider === "b2"
    ? `Backblaze B2 · bucket ${config.bucket} · bölge ${config.region}`
    : "yerel private depolama (yalnızca geliştirme/test)";
}

export const hasFlag = (flag: string) => process.argv.slice(2).includes(flag);
