/**
 * Veritabanı CLI komutlarının ortak yardımcıları (Node 24 ile doğrudan çalışır, derleme yok).
 *
 * Tek veritabanı (D-059): ayrı development/test/production veritabanı ve ortam işareti yoktur.
 * Bağlantı adresleri, kullanıcı şifreleri ve sorgu parametreleri asla yazdırılmaz.
 */
import { existsSync } from "node:fs";
import { TLSSocket } from "node:tls";

import pg from "pg";

import {
  parseDatabaseUrl,
  RUNTIME_ROLE,
  type ParsedDatabaseUrl,
} from "../../src/server/db/settings.ts";

/** `.env.local` varsa yükler; mevcut ortam değişkenlerini ezmez. */
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export type DatabaseUrls = {
  /** Migration/yönetim: tablo sahibi rol, pooler olmayan uç nokta. */
  readonly owner: ParsedDatabaseUrl;
  /** Uygulama: en az yetkili `cs_app_runtime`, pooled uç nokta. */
  readonly runtime: ParsedDatabaseUrl;
};

export function resolveDatabaseUrls(): DatabaseUrls {
  const owner = parseDatabaseUrl(process.env.DATABASE_URL_UNPOOLED, "DATABASE_URL_UNPOOLED", {
    allowLocal: true,
  });
  const runtime = parseDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL", {
    allowLocal: true,
    expectedUser: RUNTIME_ROLE,
  });
  if (owner.user === RUNTIME_ROLE) {
    throw new Error(
      "DATABASE_URL_UNPOOLED, migration/yönetim rolüyle olmalı (cs_app_runtime değil).",
    );
  }
  if (owner.database !== runtime.database) {
    throw new Error("DATABASE_URL ve DATABASE_URL_UNPOOLED aynı veritabanını göstermeli.");
  }
  return { owner, runtime };
}

export async function connect(url: ParsedDatabaseUrl, applicationName: string): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString: url.connectionString,
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  return client;
}

/** Çalıştırır; hata mesajını secret içermeyecek şekilde yazdırıp çıkış kodunu ayarlar. */
export async function runCli(name: string, main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    const code = (error as { code?: unknown }).code;
    console.error(`[${name}] HATA: ${message}${typeof code === "string" ? ` (kod ${code})` : ""}`);
    process.exitCode = 1;
  }
}

export type TlsInfo = {
  readonly encrypted: boolean;
  readonly verified: boolean;
  readonly protocol: string | null;
};

/**
 * İstemci tarafı TLS durumu. Neon'da TLS proxy'de sonlandığı için sunucudaki `pg_stat_ssl`
 * bağlantıyı SSL'siz gösterebilir; bu nedenle doğrulama istemci soketinden yapılır.
 */
export function describeTls(client: pg.Client): TlsInfo {
  const stream = (client as unknown as { connection: { stream: unknown } }).connection.stream;
  if (!(stream instanceof TLSSocket)) return { encrypted: false, verified: false, protocol: null };
  return {
    encrypted: stream.encrypted,
    verified: stream.authorized,
    protocol: stream.getProtocol(),
  };
}
