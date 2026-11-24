import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { bootstrapAccounts } from "../../scripts/auth/accounts";
import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { deleteAllTestSessions } from "../support/staff-session";

/**
 * E2E hesap/oturum modu (OD-24, D-065, D-067 — tek veritabanı).
 *
 * - Veritabanı yoksa (ör. CI): yalnızca veritabanı gerektirmeyen testler çalışır.
 * - Hiç hesap yoksa: `test-` önekli iki GEÇİCİ hesap rastgele şifrelerle oluşturulur (şifreyle giriş
 *   testleri) ve teardown'da silinir.
 * - Gerçek hesaplar varsa: şifreyle giriş testleri atlanır (gerçek şifreler bilinmez/istenmez);
 *   kimliği doğrulanmış testler her test için oluşturulan kısa ömürlü oturumlarla çalışır
 *   (`tests/e2e/fixtures.ts`). Gerçek hesaplara ve mevcut oturumlara dokunulmaz.
 * Her iki hesap modunda da test oturumları (`test-session-*`) teardown'da silinir.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
    process.env.E2E_ACCOUNTS = "unavailable:no-database";
    process.env.E2E_SESSIONS = "unavailable:no-database";
    return async () => undefined;
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.E2E_SESSIONS = "unavailable:no-auth-secret";
  }

  const { runtime, owner } = resolveDatabaseUrls();
  let createdTemporaryAccounts = false;
  const client = await connect(runtime, "cs-global-e2e-setup");
  try {
    await deleteAllTestSessions(client);
    const existing = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
    if (existing.rows[0]!.n > 0) {
      process.env.E2E_ACCOUNTS = "unavailable:real-accounts";
    } else {
      const suffix = randomUUID().slice(0, 6);
      const credentials = {
        admin: { username: `e2e_adm_${suffix}`, password: `E2e-${randomUUID()}` },
        employee: { username: `e2e_emp_${suffix}`, password: `E2e-${randomUUID()}` },
      };
      await bootstrapAccounts(client, credentials, () => `test-${randomUUID()}`);
      createdTemporaryAccounts = true;
      process.env.E2E_ACCOUNTS = "available";
      process.env.E2E_ADMIN_USERNAME = credentials.admin.username;
      process.env.E2E_ADMIN_PASSWORD = credentials.admin.password;
      process.env.E2E_EMPLOYEE_USERNAME = credentials.employee.username;
      process.env.E2E_EMPLOYEE_PASSWORD = credentials.employee.password;
    }
    process.env.E2E_SESSIONS ??= "available";
  } finally {
    await client.end();
  }

  return async () => {
    const runtimeCleanup = await connect(runtime, "cs-global-e2e-teardown");
    try {
      await deleteAllTestSessions(runtimeCleanup);
    } finally {
      await runtimeCleanup.end();
    }
    if (!createdTemporaryAccounts) return;
    const cleanup = await connect(owner, "cs-global-e2e-teardown");
    try {
      await cleanup.query("DELETE FROM users WHERE id LIKE 'test-%'");
    } finally {
      await cleanup.end();
    }
  };
}
