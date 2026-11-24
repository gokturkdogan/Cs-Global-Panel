/**
 * pnpm auth:bootstrap
 *
 * İki sabit şirket hesabını (ADMIN ve EMPLOYEE) oluşturur (OD-24). Etkileşimlidir: kullanıcı adı ve
 * gizli şifre (iki kez) terminalden alınır. Var olan hesaplara dokunmaz; ikisi de varsa hiçbir şey
 * yapmaz. Varsayılan/hardcoded şifre yoktur. Bu komutu işletmeci kendi terminalinde çalıştırır.
 */
import { connect, loadLocalEnv, resolveDatabaseUrls, runCli } from "../db/lib.ts";
import { STAFF_ROLES, type StaffRole } from "../../src/config/statuses.ts";
import {
  assertAccountModelReady,
  bootstrapAccounts,
  listAccounts,
  validateBootstrapInput,
  type BootstrapInput,
} from "./accounts.ts";
import { askNewPassword, askVisible, assertInteractiveTerminal } from "./prompt.ts";

const LABEL: Record<StaffRole, string> = { admin: "ADMIN", employee: "EMPLOYEE" };

await runCli("auth:bootstrap", async () => {
  assertInteractiveTerminal();
  loadLocalEnv();
  const { runtime } = resolveDatabaseUrls();
  const client = await connect(runtime, "cs-global-auth-bootstrap");
  try {
    await assertAccountModelReady(client);
    const existing = await listAccounts(client);
    for (const account of existing) {
      console.log(
        `${LABEL[account.role]} hesabı zaten mevcut (${account.username}) — değiştirilmeyecek.`,
      );
    }
    const missing = STAFF_ROLES.filter(
      (role) => !existing.some((account) => account.role === role),
    );
    if (missing.length === 0) {
      console.log("İki hesap da mevcut. Yeni hesap oluşturulmadı.");
      return;
    }

    console.log("Şifre en az 8 karakter olmalı; 12+ karakterlik rastgele bir şifre önerilir.");
    const input: BootstrapInput = {};
    for (const role of missing) {
      const username = await askVisible(`${LABEL[role]} kullanıcı adı: `);
      const password = await askNewPassword(LABEL[role]);
      input[role] = { username, password };
      // Hatalı girişi hash ve veritabanından önce bildir.
      validateBootstrapInput(input);
    }

    const result = await bootstrapAccounts(client, input);
    for (const role of result.created) console.log(`${LABEL[role]} hesabı oluşturuldu.`);
    console.log("Tamamlandı. Giriş: /login");
  } finally {
    await client.end();
  }
});
