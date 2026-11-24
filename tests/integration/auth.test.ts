import { randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LOGIN_RATE_LIMIT_PER_USERNAME,
  LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES,
} from "@/config/constants";
import { createAuth, type Auth } from "@/server/auth/auth";
import {
  consumeLoginAttempt,
  LOGIN_UNKNOWN_USERNAMES_KEY,
  loginUsernameKey,
  resetLoginAttempts,
} from "@/server/auth/rate-limit";
import { createDatabase } from "@/server/db/client";
import {
  AccountError,
  bootstrapAccounts,
  listAccounts,
  resetAccountPassword,
  validateBootstrapInput,
  type BootstrapInput,
} from "../../scripts/auth/accounts";
import {
  connectOwner,
  connectRuntime,
  createRuntimePool,
  expectPgError,
  TEST_ID_PREFIX,
  testId,
  urls,
} from "./helpers";
import {
  deleteMintedSessions,
  mintStaffSession,
  SESSION_COOKIE_NAME,
  type MintedSession,
} from "../support/staff-session";

/**
 * Sabit iki hesap modeli, kimlik doğrulama ve rate limiting (OD-24, PHASE 03).
 *
 * Tek veritabanı (D-059) ve "en fazla iki hesap" kısıtı nedeniyle iki mod vardır (D-067):
 * - Hiç hesap yokken: `test-` önekli GEÇİCİ hesaplarla tam yaşam döngüsü (bootstrap, giriş,
 *   şifre sıfırlama) test edilir ve hesaplar sonunda silinir.
 * - Gerçek hesaplar varken: gerçek hesaplara YALNIZCA okuma / etkisiz (no-op, reddedilen) işlemler
 *   yapılır; oturum davranışı testin kendi oluşturduğu kısa ömürlü oturumlarla (`mintStaffSession`)
 *   doğrulanır ve bu oturumlar silinir. Kullanıcı adı, şifre, credential ve mevcut oturumlar
 *   değiştirilmez. Doğru şifreyle giriş ve şifre sıfırlamanın etkisi bu modda NOT VERIFIED.
 * Şifreler rastgele ve sentetiktir.
 */

async function countRealAccounts(): Promise<number> {
  const owner = await connectOwner();
  try {
    const result = await owner.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM users WHERE id NOT LIKE 'test-%'",
    );
    return result.rows[0]!.n;
  } finally {
    await owner.end();
  }
}

const hasRealAccounts = (await countRealAccounts()) > 0;
const SKIP_REASON =
  "gerçek hesaplar mevcut — hesap testleri gerçek hesaplara dokunmamak için atlandı";

const randomPassword = () => `Tst-${randomUUID()}`;
const shortId = () => randomUUID().slice(0, 6);

function credentialsSet(prefix: string): Required<BootstrapInput> {
  return {
    admin: { username: `${prefix}_adm_${shortId()}`, password: randomPassword() },
    employee: { username: `${prefix}_emp_${shortId()}`, password: randomPassword() },
  };
}

describe.skipIf(hasRealAccounts)(
  `iki hesap modeli ve kimlik doğrulama (geçici hesaplar)${hasRealAccounts ? ` — ${SKIP_REASON}` : ""}`,
  () => {
    const database = createDatabase(urls.runtime.connectionString);
    const auth: Auth = createAuth({
      db: database.db,
      secret: `test-secret-${randomUUID()}`,
      baseURL: "http://localhost:3000",
      secureCookies: false,
      withNextCookies: false,
    });
    let owner: pg.Client;
    let credentials: Required<BootstrapInput>;

    beforeAll(async () => {
      owner = await connectOwner();
      const leftovers = await owner.query("SELECT 1 FROM users");
      expect(leftovers.rowCount, "başlangıçta hiç hesap olmamalı").toBe(0);
    });

    afterAll(async () => {
      await owner.query("DELETE FROM users WHERE id LIKE 'test-%'");
      await owner.end();
      await database.pool.end();
    });

    async function signIn(
      username: string,
      password: string,
      extraHeaders: Record<string, string> = {},
    ) {
      const response = await auth.api.signInUsername({
        body: { username, password },
        headers: new Headers(extraHeaders),
        asResponse: true,
      });
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0]!)
        .find((value) => value.startsWith("cs.session_token="));
      return {
        status: response.status,
        cookie,
        body: (await response.json()) as { user?: { id: string } },
      };
    }

    const sessionFor = (cookie: string) =>
      auth.api.getSession({ headers: new Headers({ cookie }) });

    describe("hesap modeli", () => {
      it("eşzamanlı iki bootstrap: tam olarak bir ADMIN + bir EMPLOYEE oluşur, karışık hesap oluşmaz", async () => {
        const pool = createRuntimePool(2);
        const [first, second] = [credentialsSet("ta"), credentialsSet("tb")];
        const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
        try {
          const results = await Promise.allSettled([
            bootstrapAccounts(c1, first, testId),
            bootstrapAccounts(c2, second, testId),
          ]);
          for (const result of results) {
            if (result.status === "rejected") expect(result.reason).toBeInstanceOf(AccountError);
          }
        } finally {
          c1.release();
          c2.release();
          await pool.end();
        }
        const accounts = await listAccounts(owner);
        expect(accounts.map((account) => account.role)).toEqual(["admin", "employee"]);
        expect(accounts.every((account) => account.userId.startsWith(TEST_ID_PREFIX))).toBe(true);
        // İki hesap aynı bootstrap çağrısından gelir (biri tamamen geri alınmıştır).
        credentials = accounts[0]!.username === first.admin.username ? first : second;
        expect(accounts[1]!.username).toBe(credentials.employee.username);
      });

      it("tekrar çalıştırma yeni hesap oluşturmaz ve mevcut hesapların üzerine yazmaz", async () => {
        const before = await owner.query(
          "SELECT u.id, u.updated_at, a.password FROM users u JOIN accounts a ON a.user_id = u.id ORDER BY u.id",
        );
        const result = await bootstrapAccounts(owner, credentialsSet("tc"), testId);
        expect(result).toEqual({ created: [], existing: ["admin", "employee"] });
        const after = await owner.query(
          "SELECT u.id, u.updated_at, a.password FROM users u JOIN accounts a ON a.user_id = u.id ORDER BY u.id",
        );
        expect(after.rows).toEqual(before.rows);
      });

      it("üçüncü şirket hesabı veritabanında reddedilir (sahip rol dahil)", async () => {
        const insert = (role: string) => {
          const id = testId();
          return owner.query(
            "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'X', $1 || '@staff.invalid', $2, $3)",
            [id, `t_${shortId()}`, role],
          );
        };
        await expectPgError(insert("admin"), "23505");
        await expectPgError(insert("employee"), "23505");
        await expectPgError(insert("manager"), "23514");
      });

      it("kullanıcı adı benzersiz ve küçük harf; e-posta değişmez iç kimlik (rollback ile)", async () => {
        const [admin, employee] = await listAccounts(owner);
        for (const [statement, params, code] of [
          [
            "UPDATE users SET username = $2 WHERE id = $1",
            [employee!.userId, admin!.username],
            "23505",
          ],
          ["UPDATE users SET username = 'BuyukHarf' WHERE id = $1", [employee!.userId], "23514"],
          [
            "UPDATE users SET email = 'gercek@example.com' WHERE id = $1",
            [employee!.userId],
            "23514",
          ],
          ["UPDATE users SET role = 'superadmin' WHERE id = $1", [employee!.userId], "23514"],
        ] as const) {
          await owner.query("BEGIN");
          await expectPgError(owner.query(statement, [...params]), code);
          await owner.query("ROLLBACK");
        }
      });

      it("şifreler Better Auth scrypt hash'i olarak saklanır, düz metin değil", async () => {
        const rows = await owner.query<{ role: string; password: string }>(
          "SELECT u.role, a.password FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.provider_id = 'credential' ORDER BY u.role",
        );
        expect(rows.rows).toHaveLength(2);
        for (const row of rows.rows) {
          const plain =
            row.role === "admin" ? credentials.admin.password : credentials.employee.password;
          expect(row.password).not.toContain(plain);
          expect(row.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
          expect(await verifyPassword({ hash: row.password, password: plain })).toBe(true);
        }
      });

      it("bootstrap girdi kuralları: farklı kullanıcı adı ve şifre, politika", () => {
        const same = { username: "ayni_kisi", password: "Gizli-Sifre-123" };
        expect(() =>
          validateBootstrapInput({
            admin: same,
            employee: { ...same, password: "Baska-Sifre-456" },
          }),
        ).toThrow(AccountError);
        expect(() =>
          validateBootstrapInput({
            admin: same,
            employee: { username: "diger_kisi", password: same.password },
          }),
        ).toThrow(AccountError);
        expect(() =>
          validateBootstrapInput({ admin: { username: "yonetici", password: "kisa" } }),
        ).toThrow(AccountError);
      });

      it("Better Auth üzerinden hesap oluşturulamaz (kayıt kapalı)", async () => {
        await expect(
          auth.api.signUpEmail({
            body: { email: "x@example.invalid", password: randomPassword(), name: "X" },
          }),
        ).rejects.toBeDefined();
        const count = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
        expect(count.rows[0]!.n).toBe(2);
      });
    });

    describe("giriş, oturum ve çıkış", () => {
      it("ADMIN ve EMPLOYEE giriş yapar; bağımsız oturumlar; IP/UA saklanmaz; süre 7 gün", async () => {
        const spoofed = { "user-agent": "Mozilla/5.0 (test)", "x-forwarded-for": "203.0.113.9" };
        const admin = await signIn(credentials.admin.username, credentials.admin.password, spoofed);
        const employee = await signIn(
          credentials.employee.username.toUpperCase(),
          credentials.employee.password,
          spoofed,
        );
        expect(admin.status).toBe(200);
        expect(employee.status).toBe(200);
        expect(admin.cookie).toBeDefined();
        expect(employee.cookie).toBeDefined();

        const sessions = await owner.query<{
          ip: string | null;
          ua: string | null;
          seconds: number;
        }>(
          "SELECT ip_address AS ip, user_agent AS ua, extract(epoch FROM expires_at - created_at)::int AS seconds FROM sessions",
        );
        expect(sessions.rows).toHaveLength(2);
        for (const row of sessions.rows) {
          expect(row.ip).toBeNull();
          expect(row.ua).toBeNull();
          expect(Math.abs(row.seconds - 7 * 24 * 60 * 60)).toBeLessThanOrEqual(5);
        }

        const adminSession = await sessionFor(admin.cookie!);
        const employeeSession = await sessionFor(employee.cookie!);
        expect(adminSession?.user.role).toBe("admin");
        expect(employeeSession?.user.role).toBe("employee");
        expect(adminSession?.session.id).not.toBe(employeeSession?.session.id);
      });

      it("yanlış şifre ve var olmayan kullanıcı aynı genel hatayı alır", async () => {
        const wrong = await signIn(credentials.admin.username, "Yanlis-Sifre-123");
        const missing = await signIn(`yok_${shortId()}`, "Yanlis-Sifre-123");
        expect(wrong.status).toBe(401);
        expect(missing.status).toBe(401);
        expect(wrong.body).toEqual(missing.body);
        expect(wrong.cookie).toBeUndefined();
      });

      it("oturum kullanımla uzamaz; değiştirilmiş, süresi dolmuş cookie reddedilir", async () => {
        const { cookie } = await signIn(credentials.admin.username, credentials.admin.password);
        const session = await sessionFor(cookie!);
        // Oturumu 2 gün önce oluşturulmuş gibi göster: sliding olsaydı süre yenilenirdi.
        await owner.query(
          "UPDATE sessions SET created_at = now() - interval '2 days', updated_at = now() - interval '2 days', expires_at = now() + interval '5 days' WHERE id = $1",
          [session!.session.id],
        );
        const before = await owner.query<{ e: Date }>(
          "SELECT expires_at AS e FROM sessions WHERE id = $1",
          [session!.session.id],
        );
        for (let i = 0; i < 3; i += 1) expect(await sessionFor(cookie!)).not.toBeNull();
        const after = await owner.query<{ e: Date }>(
          "SELECT expires_at AS e FROM sessions WHERE id = $1",
          [session!.session.id],
        );
        expect(after.rows[0]!.e.getTime()).toBe(before.rows[0]!.e.getTime());

        const tampered = `${cookie!.slice(0, -2)}${cookie!.endsWith("A") ? "BB" : "AA"}`;
        expect(await sessionFor(tampered)).toBeNull();

        await owner.query(
          "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1",
          [session!.session.id],
        );
        expect(await sessionFor(cookie!)).toBeNull();
      });

      it("çıkış yalnızca o oturumu sonlandırır; diğer hesabın oturumu açık kalır", async () => {
        const admin = await signIn(credentials.admin.username, credentials.admin.password);
        const employee = await signIn(credentials.employee.username, credentials.employee.password);
        await auth.api.signOut({ headers: new Headers({ cookie: admin.cookie! }) });
        expect(await sessionFor(admin.cookie!)).toBeNull();
        expect(await sessionFor(employee.cookie!)).not.toBeNull();
      });

      it("şifre sıfırlama yalnızca ilgili hesabın tüm oturumlarını iptal eder; eski şifre geçersiz; audit", async () => {
        const admin = await signIn(credentials.admin.username, credentials.admin.password);
        const employeeA = await signIn(
          credentials.employee.username,
          credentials.employee.password,
        );
        const employeeB = await signIn(
          credentials.employee.username,
          credentials.employee.password,
        );

        const runtime = await connectRuntime();
        const newPassword = randomPassword();
        try {
          await expect(
            resetAccountPassword(runtime, "employee", credentials.admin.password),
          ).rejects.toThrow(AccountError);
          const result = await resetAccountPassword(runtime, "employee", newPassword);
          expect(result.revokedSessions).toBeGreaterThanOrEqual(2);
        } finally {
          await runtime.end();
        }

        expect(await sessionFor(employeeA.cookie!)).toBeNull();
        expect(await sessionFor(employeeB.cookie!)).toBeNull();
        expect(await sessionFor(admin.cookie!)).not.toBeNull();
        expect(
          (await signIn(credentials.employee.username, credentials.employee.password)).status,
        ).toBe(401);
        expect((await signIn(credentials.employee.username, newPassword)).status).toBe(200);

        const employeeId = (await listAccounts(owner)).find(
          (account) => account.role === "employee",
        )!.userId;
        const audit = await owner.query<{ action: string; metadata: Record<string, unknown> }>(
          "SELECT action, metadata FROM audit_logs WHERE resource_id = $1 AND action IN ('USER_PASSWORD_SET','USER_SESSIONS_REVOKED') ORDER BY id",
          [employeeId],
        );
        expect(audit.rows.map((row) => row.action)).toEqual([
          "USER_PASSWORD_SET",
          "USER_SESSIONS_REVOKED",
        ]);
        expect(JSON.stringify(audit.rows)).not.toContain(newPassword);
        credentials = {
          ...credentials,
          employee: { ...credentials.employee, password: newPassword },
        };
      });
    });
  },
);

describe.runIf(hasRealAccounts)(
  "gerçek hesaplar mevcutken: salt okunur / etkisiz doğrulamalar ve test oturumları (D-067)",
  () => {
    const database = createDatabase(urls.runtime.connectionString);
    const secret = `test-secret-${randomUUID()}`;
    const auth: Auth = createAuth({
      db: database.db,
      secret,
      baseURL: "http://localhost:3000",
      secureCookies: false,
      withNextCookies: false,
    });
    let owner: pg.Client;
    let runtime: pg.Client;
    const minted: MintedSession[] = [];
    // Hesap ve credential kayıtlarının parmak izi (hash değerinin kendisi belleğe alınmaz).
    const fingerprintSql = `SELECT u.id, u.username, u.role, u.updated_at, md5(a.password) AS pw, a.updated_at AS a_updated
      FROM users u JOIN accounts a ON a.user_id = u.id AND a.provider_id = 'credential' ORDER BY u.role`;
    const realSessionsSql = `SELECT id, expires_at, updated_at FROM sessions
      WHERE id NOT LIKE 'test-session-%' ORDER BY id`;
    let fingerprint: unknown[];
    let realSessions: unknown[];

    beforeAll(async () => {
      owner = await connectOwner();
      runtime = await connectRuntime();
      fingerprint = (await owner.query(fingerprintSql)).rows;
      realSessions = (await owner.query(realSessionsSql)).rows;
    });

    afterAll(async () => {
      try {
        await deleteMintedSessions(
          runtime,
          minted.map((session) => session.sessionId),
        );
        // Gerçek hesaplar ve gerçek oturumlar testlerden etkilenmedi.
        expect((await owner.query(fingerprintSql)).rows).toEqual(fingerprint);
        const sessionsAfter = (await owner.query<{ id: string }>(realSessionsSql)).rows;
        const before = new Set((realSessions as { id: string }[]).map((row) => row.id));
        // Test sırasında kullanıcı gerçek giriş yapmış olabilir: yalnızca önceki oturumların
        // silinmediği/değişmediği kontrol edilir.
        expect(sessionsAfter.filter((row) => before.has(row.id))).toEqual(realSessions);
      } finally {
        await runtime.end();
        await owner.end();
        await database.pool.end();
      }
    });

    const mint = async (role: "admin" | "employee") => {
      const session = await mintStaffSession(runtime, role, secret);
      minted.push(session);
      return session;
    };
    const cookieOf = (session: MintedSession) => `${SESSION_COOKIE_NAME}=${session.cookieValue}`;
    const sessionFor = (cookie: string) =>
      auth.api.getSession({ headers: new Headers({ cookie }) });

    it("tam olarak iki gerçek hesap: bir ADMIN + bir EMPLOYEE; e-posta iç kimlik", async () => {
      const accounts = await listAccounts(owner);
      expect(accounts.map((account) => account.role)).toEqual(["admin", "employee"]);
      expect(accounts.some((account) => account.userId.startsWith(TEST_ID_PREFIX))).toBe(false);
      const emails = await owner.query<{ ok: boolean }>(
        "SELECT bool_and(email = id || '@staff.invalid') AS ok FROM users",
      );
      expect(emails.rows[0]!.ok).toBe(true);
    });

    it("üçüncü hesap veritabanında reddedilir (rollback içinde)", async () => {
      for (const [role, code] of [
        ["admin", "23505"],
        ["employee", "23505"],
        ["manager", "23514"],
      ] as const) {
        await owner.query("BEGIN");
        await expectPgError(
          owner.query(
            "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'X', $1 || '@staff.invalid', $2, $3)",
            [testId(), `t_${shortId()}`, role],
          ),
          code,
        );
        await owner.query("ROLLBACK");
      }
    });

    it("bootstrap (eşzamanlı dahil) yeni hesap oluşturmaz, mevcutların üzerine yazmaz", async () => {
      const pool = createRuntimePool(2);
      const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        const results = await Promise.all([
          bootstrapAccounts(c1, credentialsSet("ta"), testId),
          bootstrapAccounts(c2, credentialsSet("tb"), testId),
        ]);
        for (const result of results) {
          expect(result).toEqual({ created: [], existing: ["admin", "employee"] });
        }
      } finally {
        c1.release();
        c2.release();
        await pool.end();
      }
      expect((await owner.query(fingerprintSql)).rows).toEqual(fingerprint);
    });

    it("politikaya aykırı şifre sıfırlama yazmadan reddedilir", async () => {
      await expect(resetAccountPassword(runtime, "employee", "kisa")).rejects.toThrow(AccountError);
      expect((await owner.query(fingerprintSql)).rows).toEqual(fingerprint);
    });

    it("kayıt kapalı; yanlış şifre ve var olmayan kullanıcı aynı genel hatayı alır", async () => {
      await expect(
        auth.api.signUpEmail({
          body: { email: "x@example.invalid", password: randomPassword(), name: "X" },
        }),
      ).rejects.toBeDefined();
      const [admin] = await listAccounts(owner);
      const attempt = async (username: string) => {
        const response = await auth.api.signInUsername({
          body: { username, password: randomPassword() },
          headers: new Headers(),
          asResponse: true,
        });
        return {
          status: response.status,
          cookie: response.headers.getSetCookie().join(";"),
          body: (await response.json()) as unknown,
        };
      };
      const wrong = await attempt(admin!.username);
      const missing = await attempt(`yok_${shortId()}`);
      expect(wrong.status).toBe(401);
      expect(missing.status).toBe(401);
      expect(wrong.body).toEqual(missing.body);
      expect(wrong.cookie).not.toContain(SESSION_COOKIE_NAME);
      const count = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
      expect(count.rows[0]!.n).toBe(2);
    });

    it("oturum yapılandırması: 7 gün, kayan süre yok, cookie cache kapalı", () => {
      expect(auth.options.session?.expiresIn).toBe(7 * 24 * 60 * 60);
      expect(auth.options.session?.disableSessionRefresh).toBe(true);
      expect(auth.options.session?.cookieCache?.enabled ?? false).toBe(false);
    });

    it("test oturumu iki hesap için doğrulanır; IP/UA yok; kullanımla uzamaz", async () => {
      const admin = await mint("admin");
      const employee = await mint("employee");
      const adminSession = await sessionFor(cookieOf(admin));
      const employeeSession = await sessionFor(cookieOf(employee));
      expect(adminSession?.user.role).toBe("admin");
      expect(employeeSession?.user.role).toBe("employee");
      expect(adminSession?.user.id).toBe(admin.userId);

      await runtime.query(
        "UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() + interval '5 days' WHERE id = $1",
        [admin.sessionId],
      );
      const read = () =>
        owner.query<{ e: Date; ip: string | null; ua: string | null }>(
          "SELECT expires_at AS e, ip_address AS ip, user_agent AS ua FROM sessions WHERE id = $1",
          [admin.sessionId],
        );
      const before = await read();
      for (let i = 0; i < 3; i += 1) expect(await sessionFor(cookieOf(admin))).not.toBeNull();
      const after = await read();
      expect(after.rows[0]!.e.getTime()).toBe(before.rows[0]!.e.getTime());
      expect(after.rows[0]!.ip).toBeNull();
      expect(after.rows[0]!.ua).toBeNull();
    });

    it("değiştirilmiş imza, başka secret ve süresi dolmuş oturum reddedilir", async () => {
      const session = await mint("employee");
      const cookie = cookieOf(session);
      const tampered = `${cookie.slice(0, -4)}${cookie.endsWith("A%3D") ? "B%3D" : "A%3D"}`;
      expect(await sessionFor(tampered)).toBeNull();

      const otherSecret = createAuth({
        db: database.db,
        secret: `other-${randomUUID()}`,
        baseURL: "http://localhost:3000",
        secureCookies: false,
        withNextCookies: false,
      });
      expect(await otherSecret.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();

      await runtime.query(
        "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [session.sessionId],
      );
      expect(await sessionFor(cookie)).toBeNull();
    });

    it("çıkış yalnızca o oturumu siler; diğer hesabın ve gerçek oturumlar korunur", async () => {
      const admin = await mint("admin");
      const employee = await mint("employee");
      await auth.api.signOut({ headers: new Headers({ cookie: cookieOf(admin) }) });
      expect(await sessionFor(cookieOf(admin))).toBeNull();
      expect(await sessionFor(cookieOf(employee))).not.toBeNull();
      const stillThere = await owner.query(realSessionsSql);
      const ids = new Set(stillThere.rows.map((row: { id: string }) => row.id));
      for (const row of realSessions as { id: string }[]) expect(ids.has(row.id)).toBe(true);
    });
  },
);

describe("giriş rate limiting (D-063, D-068)", () => {
  const database = createDatabase(urls.runtime.connectionString);
  const secret = `test-rl-${randomUUID()}`;
  const usernames: string[] = [];
  const newUsername = () => {
    const name = `rl_${randomUUID().slice(0, 8)}`;
    usernames.push(name);
    return name;
  };

  const clearUnknownBucket = async () => {
    const owner = await connectOwner();
    try {
      await owner.query("DELETE FROM rate_limit_buckets WHERE key = $1", [
        LOGIN_UNKNOWN_USERNAMES_KEY,
      ]);
    } finally {
      await owner.end();
    }
  };

  /**
   * Bilinen bir kullanıcı adı: varsa gerçek/geçici hesaplardan biri (yalnızca okunur; sayaç bu
   * testin secret'ı ile HMAC'lenir → uygulamanın gerçek sayacından bağımsızdır). Hesap yoksa null.
   */
  const knownUsername = async (): Promise<string | null> => {
    const owner = await connectOwner();
    try {
      const result = await owner.query<{ username: string }>(
        "SELECT username FROM users ORDER BY role LIMIT 1",
      );
      return result.rows[0]?.username ?? null;
    } finally {
      await owner.end();
    }
  };

  beforeAll(clearUnknownBucket);

  afterAll(async () => {
    const owner = await connectOwner();
    try {
      const known = await knownUsername();
      await owner.query("DELETE FROM rate_limit_buckets WHERE key = ANY($1::text[])", [
        [...usernames, ...(known === null ? [] : [known])].map((name) =>
          loginUsernameKey(secret, name),
        ),
      ]);
      // Testlerin bilinmeyen ad sayacına eklediği denemeler gerçek girişleri etkilemesin.
      await owner.query("DELETE FROM rate_limit_buckets WHERE key = $1", [
        LOGIN_UNKNOWN_USERNAMES_KEY,
      ]);
    } finally {
      await owner.end();
    }
    await database.pool.end();
  });

  it("kullanıcı adı başına 10 deneme; 11. reddedilir; başarılı giriş sayacı sıfırlar", async () => {
    await clearUnknownBucket();
    const username = newUsername();
    for (let i = 0; i < LOGIN_RATE_LIMIT_PER_USERNAME.max; i += 1) {
      expect(await consumeLoginAttempt(database.db, secret, username)).toBe("allowed");
    }
    expect(await consumeLoginAttempt(database.db, secret, username)).toBe("username_limited");
    await resetLoginAttempts(database.db, secret, username);
    expect(await consumeLoginAttempt(database.db, secret, username)).toBe("allowed");
  });

  it("eşzamanlı 20 denemede en fazla 10'u kabul edilir", async () => {
    await clearUnknownBucket();
    const username = newUsername();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeLoginAttempt(database.db, secret, username)),
    );
    expect(results.filter((result) => result === "allowed")).toHaveLength(
      LOGIN_RATE_LIMIT_PER_USERNAME.max,
    );
  });

  it("pencere dolunca sayaç sıfırlanır; anahtar kullanıcı adını düz metin içermez", async () => {
    await clearUnknownBucket();
    const username = newUsername();
    for (let i = 0; i <= LOGIN_RATE_LIMIT_PER_USERNAME.max; i += 1) {
      await consumeLoginAttempt(database.db, secret, username);
    }
    const key = loginUsernameKey(secret, username);
    expect(key).not.toContain(username);
    const owner = await connectOwner();
    try {
      await owner.query(
        "UPDATE rate_limit_buckets SET expires_at = now() - interval '1 second' WHERE key = $1",
        [key],
      );
    } finally {
      await owner.end();
    }
    expect(await consumeLoginAttempt(database.db, secret, username)).toBe("allowed");
  });

  it("bilinmeyen adların ortak limiti (50) eşzamanlı denemede aşılamaz; aşımda satır oluşmaz", async () => {
    await clearUnknownBucket();
    // 10'arlık eşzamanlı gruplar (Pool en fazla 5 bağlantı; daha büyük ani yükte istekler
    // bağlantı beklerken zaman aşımına düşer ve giriş fail-closed reddedilir).
    const results: string[] = [];
    for (let batch = 0; batch < 6; batch += 1) {
      results.push(
        ...(await Promise.all(
          Array.from({ length: 10 }, () => consumeLoginAttempt(database.db, secret, newUsername())),
        )),
      );
    }
    expect(results.filter((result) => result === "allowed")).toHaveLength(
      LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES.max,
    );
    expect(results.filter((result) => result === "unknown_usernames_limited")).toHaveLength(
      60 - LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES.max,
    );
    const owner = await connectOwner();
    try {
      const rows = await owner.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM rate_limit_buckets WHERE key = ANY($1::text[])",
        [usernames.slice(-60).map((name) => loginUsernameKey(secret, name))],
      );
      expect(rows.rows[0]!.n).toBe(LOGIN_RATE_LIMIT_UNKNOWN_USERNAMES.max);
    } finally {
      await owner.end();
    }
  });

  it("bilinmeyen ad limiti dolu olsa bile var olan hesabın girişi engellenmez (DoS azaltımı)", async ({
    skip,
  }) => {
    const known = await knownUsername();
    if (known === null) skip("veritabanında hesap yok");
    // Önceki test ortak sayacı doldurdu; bilinen hesap yalnızca kendi sayacına tabidir.
    expect(await consumeLoginAttempt(database.db, secret, newUsername())).toBe(
      "unknown_usernames_limited",
    );
    expect(await consumeLoginAttempt(database.db, secret, known!)).toBe("allowed");
  });

  it("veritabanı erişilemezse hata fırlatır (çağıran girişi reddeder — fail-closed)", async () => {
    const broken = createDatabase(
      urls.runtime.connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:wrong-password@"),
    );
    try {
      await expect(consumeLoginAttempt(broken.db, secret, newUsername())).rejects.toBeDefined();
    } finally {
      await broken.pool.end();
    }
  });
});

describe("Secure cookie yapılandırması (P4-04 — yapılandırma düzeyi)", () => {
  // Gerçek HTTPS tarayıcı doğrulaması deployment/HTTPS ortamı gerektirir (PB, PHASE 13).
  it("https APP_URL'de oturum cookie'si __Secure- önekli ve Secure; http'de değil", async () => {
    const database = createDatabase(urls.runtime.connectionString);
    try {
      const cookieOf = async (secureCookies: boolean) => {
        const auth = createAuth({
          db: database.db,
          secret: `test-secret-${randomUUID()}`,
          baseURL: secureCookies ? "https://panel.example.com" : "http://localhost:3000",
          secureCookies,
          withNextCookies: false,
        });
        return (await auth.$context).authCookies.sessionToken;
      };
      const secure = await cookieOf(true);
      expect(secure.name).toBe("__Secure-cs.session_token");
      expect(secure.attributes).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      const plain = await cookieOf(false);
      expect(plain.name).toBe("cs.session_token");
      expect(plain.attributes.secure).toBe(false);
    } finally {
      await database.pool.end();
    }
  });
});
