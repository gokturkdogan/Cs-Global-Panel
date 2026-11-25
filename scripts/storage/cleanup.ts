/**
 * pnpm storage:cleanup [--apply]
 *
 * Teknik temizlik (D-105; BR-47): süresi dolmuş yarım yüklemeler EXPIRED; EXPIRED/REJECTED kayıtların
 * fiziksel versiyonları ve kayıtlı dosyaların yinelenen versiyonları versiyona özgü silinir. Varsayılan
 * dry-run (yalnızca plan). ACTIVE/SUPERSEDED/REMOVED kayıtlı versiyonları ve sahipliği doğrulanmamış
 * nesneler ASLA silinmez. Ücretli cron/worker yoktur — elle veya PHASE 10/13 planlı bakımla çalıştırılır.
 */
import { runCli } from "../db/lib.ts";
import {
  connectRuntime,
  createAdapter,
  describeTarget,
  hasFlag,
  loadStorageConfig,
} from "./common.ts";
import { cleanupStorage } from "./maintenance.ts";

await runCli("storage:cleanup", async () => {
  const config = loadStorageConfig();
  const apply = hasFlag("--apply");
  console.log(
    `Hedef: ${describeTarget(config)} · mod: ${apply ? "UYGULA" : "dry-run (silme yok)"}`,
  );
  const client = await connectRuntime("cs-global-storage-cleanup");
  try {
    const report = await cleanupStorage(client, await createAdapter(config), { apply });
    console.log(JSON.stringify(report, null, 2));
    if (!apply)
      console.log("Dry-run: değişiklik yapılmadı. Uygulamak için: pnpm storage:cleanup --apply");
    if (report.truncated) console.log("Liste sayfa sınırında kesildi: silme yapılmadı.");
    if (report.deleteFailures > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
});
