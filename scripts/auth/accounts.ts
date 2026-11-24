/**
 * Sabit iki hesap modelinin çekirdek işlemleri (OD-24, D-062). CLI ve integration testleri kullanır.
 *
 * - Şifreler Better Auth'un kendi `hashPassword` (scrypt) fonksiyonuyla hash'lenir; giriş Better
 *   Auth'un `verify` mantığıyla aynı formatı doğrular. Düz şifre hiçbir yere yazılmaz/loglanmaz.
 * - Mevcut hesapların üzerine yazılmaz. Hesap türü başına tek hesap veritabanı kısıtıyla garanti
 *   edilir (`users_one_account_per_role`); eşzamanlı çalıştırmada kısıt ihlali tüm işlemi geri alır.
 * - Uygulamanın en az yetkili `cs_app_runtime` rolüyle çalışır (sahip rol gerekmez).
 */
import { generateId } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type pg from "pg";

import { STAFF_ROLES, type StaffRole } from "../../src/config/statuses.ts";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "../../src/server/auth/credentials-policy.ts";

export type AccountInput = { readonly username: string; readonly password: string };

export type ExistingAccount = {
  readonly role: StaffRole;
  readonly username: string;
  readonly userId: string;
};

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const ROLE_LABEL: Record<StaffRole, string> = { admin: "ADMIN", employee: "EMPLOYEE" };

export async function listAccounts(client: pg.ClientBase): Promise<ExistingAccount[]> {
  const result = await client.query<{ role: StaffRole; username: string; id: string }>(
    "SELECT role, username, id FROM users ORDER BY role",
  );
  return result.rows.map((row) => ({ role: row.role, username: row.username, userId: row.id }));
}

/** İki hesap modeli migration'ı uygulanmış mı? (0003) */
export async function assertAccountModelReady(client: pg.ClientBase): Promise<void> {
  const result = await client.query(
    "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_one_account_per_role'",
  );
  if (result.rowCount !== 1) {
    throw new AccountError("Veritabanı güncel değil. Önce `pnpm db:migrate` çalıştırın.");
  }
}

async function insertAudit(
  client: pg.ClientBase,
  action: string,
  userId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (action, actor_type, resource_type, resource_id, metadata)
     VALUES ($1, 'SYSTEM', 'user', $2, $3::jsonb)`,
    [action, userId, JSON.stringify(metadata)],
  );
}

async function isSamePasswordAsOtherAccount(
  client: pg.ClientBase,
  role: StaffRole,
  password: string,
): Promise<boolean> {
  const other = await client.query<{ password: string | null }>(
    `SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id
      WHERE u.role <> $1 AND a.provider_id = 'credential'`,
    [role],
  );
  for (const row of other.rows) {
    if (row.password !== null && (await verifyPassword({ hash: row.password, password })))
      return true;
  }
  return false;
}

export type BootstrapInput = Partial<Record<StaffRole, AccountInput>>;
export type BootstrapResult = { readonly created: StaffRole[]; readonly existing: StaffRole[] };

/** Girdiyi doğrular ve kullanıcı adlarını normalize eder (veritabanına dokunmaz). */
export function validateBootstrapInput(input: BootstrapInput): BootstrapInput {
  const normalized: BootstrapInput = {};
  for (const role of STAFF_ROLES) {
    const account = input[role];
    if (account === undefined) continue;
    const username = normalizeUsername(account.username);
    const usernameError = validateUsername(username);
    if (usernameError) throw new AccountError(`${ROLE_LABEL[role]}: ${usernameError}`);
    const passwordError = validatePassword(account.password, username);
    if (passwordError) throw new AccountError(`${ROLE_LABEL[role]}: ${passwordError}`);
    normalized[role] = { username, password: account.password };
  }
  if (normalized.admin && normalized.employee) {
    if (normalized.admin.username === normalized.employee.username) {
      throw new AccountError("ADMIN ve EMPLOYEE kullanıcı adları farklı olmalıdır.");
    }
    if (normalized.admin.password === normalized.employee.password) {
      throw new AccountError("ADMIN ve EMPLOYEE için farklı şifreler kullanılmalıdır.");
    }
  }
  return normalized;
}

/**
 * Eksik hesapları tek transaction'da oluşturur. Var olan hesap türleri atlanır (üzerine yazılmaz).
 * `generateUserId` yalnızca testlerde sentetik kimlik vermek için kullanılır.
 */
export async function bootstrapAccounts(
  client: pg.ClientBase,
  rawInput: BootstrapInput,
  generateUserId: () => string = () => generateId(),
): Promise<BootstrapResult> {
  const input = validateBootstrapInput(rawInput);
  // CPU yoğun hash işlemi transaction dışında yapılır.
  const prepared: { role: StaffRole; username: string; passwordHash: string; password: string }[] =
    [];
  for (const role of STAFF_ROLES) {
    const account = input[role];
    if (account) {
      prepared.push({
        role,
        username: account.username,
        password: account.password,
        passwordHash: await hashPassword(account.password),
      });
    }
  }

  await client.query("BEGIN");
  try {
    const existing = new Set((await listAccounts(client)).map((account) => account.role));
    const created: StaffRole[] = [];
    for (const account of prepared) {
      if (existing.has(account.role)) continue;
      if (await isSamePasswordAsOtherAccount(client, account.role, account.password)) {
        throw new AccountError(
          `${ROLE_LABEL[account.role]}: diğer hesapla aynı şifre kullanılamaz.`,
        );
      }
      const userId = generateUserId();
      await client.query(
        `INSERT INTO users (id, name, email, username, display_username, role)
         VALUES ($1, $2, $1 || '@staff.invalid', $2, $2, $3)`,
        [userId, account.username, account.role],
      );
      await client.query(
        `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
         VALUES ($1, $2, 'credential', $2, $3)`,
        [generateUserId(), userId, account.passwordHash],
      );
      await insertAudit(client, "USER_CREATED", userId);
      created.push(account.role);
    }
    await client.query("COMMIT");
    return { created, existing: STAFF_ROLES.filter((role) => existing.has(role)) };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new AccountError(
        "Hesap oluşturulamadı: kullanıcı adı kullanımda veya hesap başka bir işlemle oluşturuldu. Hiçbir değişiklik yapılmadı.",
      );
    }
    throw error;
  }
}

export type ResetResult = { readonly username: string; readonly revokedSessions: number };

/** Bir hesabın şifresini sıfırlar ve yalnızca o hesabın tüm oturumlarını iptal eder (BR-135). */
export async function resetAccountPassword(
  client: pg.ClientBase,
  role: StaffRole,
  newPassword: string,
): Promise<ResetResult> {
  const account = (await listAccounts(client)).find((item) => item.role === role);
  if (account === undefined) throw new AccountError(`${ROLE_LABEL[role]} hesabı bulunamadı.`);
  const passwordError = validatePassword(newPassword, account.username);
  if (passwordError) throw new AccountError(passwordError);
  const passwordHash = await hashPassword(newPassword);

  await client.query("BEGIN");
  try {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [account.userId]);
    if (await isSamePasswordAsOtherAccount(client, role, newPassword)) {
      throw new AccountError("Diğer hesapla aynı şifre kullanılamaz.");
    }
    const updated = await client.query(
      "UPDATE accounts SET password = $2 WHERE user_id = $1 AND provider_id = 'credential'",
      [account.userId, passwordHash],
    );
    if (updated.rowCount !== 1) throw new AccountError("Hesabın şifre kaydı bulunamadı.");
    const revoked = await client.query("DELETE FROM sessions WHERE user_id = $1", [account.userId]);
    const revokedSessions = revoked.rowCount ?? 0;
    await insertAudit(client, "USER_PASSWORD_SET", account.userId);
    await insertAudit(client, "USER_SESSIONS_REVOKED", account.userId, { count: revokedSessions });
    await client.query("COMMIT");
    return { username: account.username, revokedSessions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
