import "server-only";

import { getStorageEnv, type StorageEnv, type StorageQuota } from "@/server/env";

import { createB2Adapter } from "./b2";
import { StorageError } from "./errors";
import { createLocalPrivateAdapter } from "./local-private";
import type { StorageAdapter } from "./types";

/**
 * Uygulamanın depolama adapter'ı (PHASE 08, D-097). Lazy: yalnızca dosya işleminde kurulur; yapılandırma
 * eksik/hatalıysa `StorageError("NOT_CONFIGURED")` → yalnızca dosya işlemi fail-closed reddedilir.
 * Sağlayıcılar arasında otomatik geçiş (fallback) yoktur.
 */

type StorageState = { readonly adapter: Promise<StorageAdapter>; readonly quota: StorageQuota };

const globalForStorage = globalThis as typeof globalThis & { __csGlobalStorage?: StorageState };

function build(env: StorageEnv): StorageState {
  const adapter =
    env.provider === "b2"
      ? Promise.resolve(createB2Adapter(env))
      : createLocalPrivateAdapter(env.root);
  return { adapter, quota: env.quota };
}

function state(): StorageState {
  if (globalForStorage.__csGlobalStorage === undefined) {
    let env: StorageEnv;
    try {
      env = getStorageEnv();
    } catch (error) {
      console.error("[storage] Depolama yapılandırması geçersiz", {
        variables: (error as { variables?: unknown }).variables ?? "unknown",
      });
      throw new StorageError("NOT_CONFIGURED");
    }
    globalForStorage.__csGlobalStorage = build(env);
  }
  return globalForStorage.__csGlobalStorage;
}

export async function getStorage(): Promise<StorageAdapter> {
  try {
    return await state().adapter;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("NOT_CONFIGURED");
  }
}

/** Kota sınırları (yapılandırma geçersizse `StorageError("NOT_CONFIGURED")`). */
export function getStorageQuota(): StorageQuota {
  return state().quota;
}
