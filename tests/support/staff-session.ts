/**
 * Test oturumu yardımcıları (D-067 — tek veritabanı, P4-01).
 *
 * Gerçek şirket hesapları için KISA ÖMÜRLÜ (30 dk) bir oturum satırı oluşturur ve Better Auth'un
 * doğruladığı imzalı cookie değerini üretir (better-call: `token.base64(HMAC-SHA256(secret, token))`,
 * URL-encode). Uygulama koduna bypass, endpoint veya özel header EKLENMEZ: oturum, uygulamanın her
 * istekte veritabanından doğruladığı normal bir oturumdur.
 *
 * Kurallar: hesapların kullanıcı adı/şifre/credential/rol kayıtlarına dokunulmaz; mevcut gerçek
 * oturumlar silinmez; token yalnızca bellekte tutulur, dosyaya/log'a yazılmaz; test sonunda yalnızca
 * bu yardımcının oluşturduğu oturumlar silinir.
 */
import { createHmac, randomBytes } from "node:crypto";

import type pg from "pg";

import type { StaffRole } from "../../src/config/statuses";

export const SESSION_COOKIE_NAME = "cs.session_token";
const TEST_SESSION_MINUTES = 30;

export type MintedSession = {
  readonly sessionId: string;
  readonly userId: string;
  readonly username: string;
  readonly role: StaffRole;
  /** Cookie değeri (imzalı, URL-encoded). Yalnızca bellekte. */
  readonly cookieValue: string;
};

const randomToken = () => randomBytes(24).toString("base64url");

export function signSessionToken(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/** Runtime rolüyle (yalnızca INSERT yetkisi) kısa ömürlü oturum satırı oluşturur. */
export async function mintStaffSession(
  client: pg.ClientBase,
  role: StaffRole,
  secret: string,
): Promise<MintedSession> {
  const account = await client.query<{ id: string; username: string }>(
    "SELECT id, username FROM users WHERE role = $1",
    [role],
  );
  const user = account.rows[0];
  if (user === undefined) throw new Error(`${role} hesabı bulunamadı`);
  const sessionId = `test-session-${randomToken()}`;
  const token = randomToken();
  await client.query(
    `INSERT INTO sessions (id, token, user_id, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [sessionId, token, user.id, TEST_SESSION_MINUTES],
  );
  return {
    sessionId,
    userId: user.id,
    username: user.username,
    role,
    cookieValue: signSessionToken(token, secret),
  };
}

/** Yalnızca test yardımcısının oluşturduğu oturumları siler. */
export async function deleteMintedSessions(
  client: pg.ClientBase,
  sessionIds: readonly string[],
): Promise<void> {
  if (sessionIds.length === 0) return;
  await client.query(
    "DELETE FROM sessions WHERE id = ANY($1::text[]) AND id LIKE 'test-session-%'",
    [[...sessionIds]],
  );
}

/** Güvenlik ağı: yarıda kalmış test oturumlarını siler (gerçek oturumlara dokunmaz). */
export async function deleteAllTestSessions(client: pg.ClientBase): Promise<void> {
  await client.query("DELETE FROM sessions WHERE id LIKE 'test-session-%'");
}
