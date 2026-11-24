/**
 * pnpm db:seed
 *
 * Demo hizmet ve evrak şablonlarını ekler (idempotent; mevcut kayıtlara dokunmaz). Runtime rolüyle
 * (DATABASE_URL) çalışır. Personel hesabı, müşteri veya başvuru verisi oluşturmaz.
 * Tek veritabanı (D-059): veritabanında gerçek veri varken çalıştırmadan önce dikkat edin.
 */
import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "./lib.ts";
import { seedDemoServices } from "./seed-data.ts";

await runCli("db:seed", async () => {
  loadLocalEnv();
  const { runtime } = resolveDatabaseUrls();

  const client = await connect(runtime, "cs-global-db-seed");
  try {
    const result = await seedDemoServices(client);
    console.log(
      `Seed tamamlandı: ${result.servicesCreated} hizmet oluşturuldu, ${result.servicesSkipped} hizmet zaten vardı (dokunulmadı), ${result.requirementsCreated} evrak şablonu oluşturuldu.`,
    );
  } finally {
    await client.end();
  }
});
