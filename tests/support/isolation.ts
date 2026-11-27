import { resolveDatabaseUrls } from "../../scripts/db/lib";

/**
 * İzole geçici test veritabanında mı çalışıyoruz? (D-077) Commit eden mutasyon testleri (eşzamanlılık,
 * tarayıcıdan hizmet oluşturma) YALNIZCA burada çalışır: işaret + yerel adres + geçici veritabanı adı
 * birlikte doğrulanır. Ortak `neondb`'de bu testler atlanır.
 */
export function isIsolatedTestDatabase(): boolean {
  if (process.env.ISOLATED_TEST_DB !== "1") return false;
  try {
    const { owner, runtime } = resolveDatabaseUrls();
    return owner.isLocal && runtime.isLocal && owner.database === "cs_isolated_test";
  } catch {
    return false;
  }
}

export const ISOLATION_SKIP_REASON =
  "commit eden mutasyon testi — yalnızca izole geçici veritabanında (pnpm test:*:isolated)";

/**
 * Fail-closed hedef kontrolü (PHASE 10.2, D-129): izolasyon işareti (`ISOLATED_TEST_DB=1`) verilmiş ama
 * bağlantılar izole geçici veritabanını göstermiyorsa (yanlış/uzak veritabanı), commit eden testler
 * başlamadan çalıştırma durdurulur. (İşaret yoksa yalnızca Neon-güvenli dosyalar çalışır.)
 */
export function assertIsolationTargetConsistent(): void {
  if (process.env.ISOLATED_TEST_DB === "1" && !isIsolatedTestDatabase()) {
    throw new Error(
      "ISOLATED_TEST_DB=1 ancak bağlantılar izole geçici veritabanını (yerel cs_isolated_test) göstermiyor — mutasyon testleri başlatılmadı.",
    );
  }
}
