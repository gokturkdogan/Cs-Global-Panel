/**
 * pnpm db:studio
 *
 * Drizzle Studio'yu yalnızca bu bilgisayardan erişilebilir şekilde (127.0.0.1) açar.
 * drizzle-kit'in varsayılanı 0.0.0.0'dır (yerel ağa açık) — kullanılmaz. Studio arayüzü
 * drizzle'ın web sayfasından yüklenir; veritabanında gerçek kişisel veri varken kullanmayın.
 */
import { spawn } from "node:child_process";

import { loadLocalEnv, resolveDatabaseUrls, runCli } from "./lib.ts";

await runCli("db:studio", async () => {
  loadLocalEnv();
  resolveDatabaseUrls();
  const child = spawn(
    "pnpm",
    ["exec", "drizzle-kit", "studio", "--host", "127.0.0.1", "--port", "4983"],
    { stdio: "inherit" },
  );
  await new Promise<void>((resolve) => child.on("exit", () => resolve()));
});
