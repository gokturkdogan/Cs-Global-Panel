/**
 * pnpm auth:reset-password
 *
 * Mevcut iki hesaptan birinin şifresini sıfırlar (OD-24, BR-133, BR-135). Etkileşimlidir; yeni
 * şifre gizli olarak iki kez alınır. Yalnızca seçilen hesabın tüm oturumları iptal edilir; diğer
 * hesap etkilenmez. Yeni hesap oluşturmaz. Public HTTP karşılığı yoktur.
 */
import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "../db/lib.ts";
import type { StaffRole } from "../../src/config/statuses.ts";
import { assertAccountModelReady, listAccounts, resetAccountPassword } from "./accounts.ts";
import { askNewPassword, askVisible, assertInteractiveTerminal } from "./prompt.ts";

await runCli("auth:reset-password", async () => {
  assertInteractiveTerminal();
  loadLocalEnv();
  const { runtime } = resolveDatabaseUrls();
  const client = await connect(runtime, "cs-global-auth-reset-password");
  try {
    await assertAccountModelReady(client);
    const accounts = await listAccounts(client);
    if (accounts.length === 0) {
      console.log("Hesap yok. Önce `pnpm auth:bootstrap` çalıştırın.");
      return;
    }
    accounts.forEach((account, index) =>
      console.log(
        `${index + 1}) ${account.role === "admin" ? "ADMIN" : "EMPLOYEE"} — ${account.username}`,
      ),
    );
    const choice = Number.parseInt((await askVisible("Hesap seçin (numara): ")).trim(), 10);
    const selected = accounts[choice - 1];
    if (selected === undefined) throw new Error("Geçersiz seçim.");

    const role: StaffRole = selected.role;
    const password = await askNewPassword(`${selected.username} için yeni`);
    const result = await resetAccountPassword(client, role, password);
    console.log(
      `Şifre güncellendi (${result.username}). Bu hesabın ${result.revokedSessions} oturumu sonlandırıldı.`,
    );
  } finally {
    await client.end();
  }
});
