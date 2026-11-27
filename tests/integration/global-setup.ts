import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { dataFingerprint, fingerprintDiff } from "../support/data-fingerprint";
import { assertIsolationTargetConsistent, isIsolatedTestDatabase } from "../support/isolation";
import { removeTemporaryTestData } from "../support/temporary-test-data";
import {
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
} from "../../scripts/db/migrations";

/**
 * Integration testleri projenin tek veritabanında çalışır (D-059). Bekleyen migration'lar uygulanır;
 * testler yalnızca kendi oluşturdukları sentetik kayıtları siler.
 */
export default async function setup(): Promise<() => Promise<void>> {
  // D-129: izolasyon işareti var ama hedef izole değilse hiçbir test başlamadan dur (fail-closed).
  assertIsolationTargetConsistent();
  const { owner } = resolveDatabaseUrls();
  const client = await connect(owner, "cs-global-test-setup");
  let before: Record<string, unknown> | null = null;
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
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
