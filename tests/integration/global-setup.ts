import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { dataFingerprint, fingerprintDiff } from "../support/data-fingerprint";
import { assertIsolationTargetConsistent, isIsolatedTestDatabase } from "../support/isolation";
import { removeTemporaryTestData } from "../support/temporary-test-data";
import { readFileSync } from "node:fs";

import {
  countAppliedMigrations,
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
} from "../../scripts/db/migrations";

/**
 * Integration testleri projenin tek veritabanında çalışır (D-059); testler yalnızca kendi oluşturdukları
 * sentetik kayıtları siler. PHASE 12.1: bekleyen migration'lar YALNIZCA izole geçici veritabanına
 * uygulanır. Ortak veritabanına (Neon) migration test komutuyla kendiliğinden uygulanmaz — bekleyen
 * migration varsa hiçbir test başlamadan durulur (uygulama `pnpm db:migrate` ile ve ayrı onayla; ör.
 * yetki daraltan 0011 — D-144).
 */
export default async function setup(): Promise<() => Promise<void>> {
  // D-129: izolasyon işareti var ama hedef izole değilse hiçbir test başlamadan dur (fail-closed).
  assertIsolationTargetConsistent();
  const { owner } = resolveDatabaseUrls();
  const client = await connect(owner, "cs-global-test-setup");
  let before: Record<string, unknown> | null = null;
  try {
    if (isIsolatedTestDatabase()) {
      await migrate(drizzle({ client }), {
        migrationsFolder: MIGRATIONS_FOLDER,
        migrationsSchema: MIGRATIONS_SCHEMA,
        migrationsTable: MIGRATIONS_TABLE,
      });
    } else {
      const journal = JSON.parse(
        readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
      ) as { entries: unknown[] };
      const pending = journal.entries.length - (await countAppliedMigrations(client));
      if (pending !== 0) {
        throw new Error(
          `Ortak veritabanında ${pending} bekleyen migration var; testler migration uygulamaz. ` +
            "Uygulama ayrı onayla `pnpm db:migrate` ile yapılır (izole: `pnpm test:integration:isolated`).",
        );
      }
    }
    // Ortak veritabanı: test öncesi veri parmak izi (yalnızca sayılar/özetler).
    if (!isIsolatedTestDatabase()) before = await dataFingerprint(client);
  } finally {
    await client.end();
  }
  return async () => {
    let changed: string[] = [];
    if (before !== null) {
      const { owner: ownerUrl } = resolveDatabaseUrls();
      const check = await connect(ownerUrl, "cs-global-test-fingerprint");
      try {
        changed = fingerprintDiff(before, await dataFingerprint(check));
      } finally {
        await check.end();
      }
    }
    await teardown();
    if (changed.length > 0) {
      throw new Error(
        `Ortak veritabanında test sonrası veri değişti (D-129): ${changed.join(", ")}. Test izolasyonu ihlali.`,
      );
    }
  };
}

/**
 * Güvenlik ağı: yarıda kalan testlerden geriye geçici (`test-` önekli) hesap ve bunlara bağlı
 * kayıt kalmasın. Gerçek hesaplara ve onların kayıtlarına dokunulmaz. Audit kayıtları silinmez.
 */
async function teardown(): Promise<void> {
  const { owner } = resolveDatabaseUrls();
  const client = await connect(owner, "cs-global-test-teardown");
  try {
    await removeTemporaryTestData(client);
  } finally {
    await client.end();
  }
}
