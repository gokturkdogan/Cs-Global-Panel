/**
 * pnpm storage:reconcile [--apply]
 *
 * Sağlayıcı ↔ DB mutabakatı (D-105): bucket'taki fiziksel versiyonları (sınırlı sayfa, Class C işlem)
 * DB kayıtlarıyla karşılaştırır; kayıt dışı kullanımı raporlar. Varsayılan dry-run. `--apply` yalnızca
 * kota durumuna kayıt dışı bayt toplamını yazar (hiçbir nesne SİLİNMEZ). Her sayfa açılışında değil,
 * yalnızca elle/planlı bakımda çalıştırılır.
 */
import { runCli } from "../db/lib.ts";
import {
  connectRuntime,
  createAdapter,
  describeTarget,
  hasFlag,
  loadStorageConfig,
} from "./common.ts";
import { reconcileStorage } from "./maintenance.ts";

await runCli("storage:reconcile", async () => {
  const config = loadStorageConfig();
  const apply = hasFlag("--apply");
  console.log(`Hedef: ${describeTarget(config)} · mod: ${apply ? "UYGULA" : "dry-run"}`);
  const client = await connectRuntime("cs-global-storage-reconcile");
  try {
    const report = await reconcileStorage(client, await createAdapter(config), { apply });
    console.log(JSON.stringify(report, null, 2));
    if (report.truncated) console.log("Liste sayfa sınırında kesildi: değer yazılmadı.");
    if (report.missingRecordedObjects > 0) {
      console.log(
        "UYARI: Kayıtlı bazı dosyaların fiziksel versiyonu bulunamadı (bütünlük incelemesi gerekli).",
      );
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
});
