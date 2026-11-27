import { test as base, type BrowserContext } from "@playwright/test";
import type pg from "pg";

import type { StaffRole } from "../../src/config/statuses";
import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { guardSharedDatabaseClient } from "../support/db-guard";
import { isIsolatedTestDatabase } from "../support/isolation";
import {
  deleteMintedSessions,
  mintStaffSession,
  SESSION_COOKIE_NAME,
  type MintedSession,
} from "../support/staff-session";

/**
 * Kimliği doğrulanmış E2E fixture'ı (D-067). Her test kendi kısa ömürlü (30 dk) oturumunu alır;
 * cookie yalnızca tarayıcı bağlamına ve belleğe yazılır (trace kapalı — playwright.config.ts);
 * test bitince oturum satırı silinir. Uygulamada bypass, özel header veya test endpoint'i yoktur.
 */
export const sessionsAvailable = process.env.E2E_SESSIONS === "available";
export const sessionsSkipReason = `oturum gerektiren testler atlandı: ${process.env.E2E_SESSIONS ?? "bilinmiyor"}`;

type Fixtures = {
  /** Runtime rolüyle bağlantı (yalnızca test oturumu ve sentetik veri işlemleri). */
  runtimeDb: pg.Client;
  signInAs: (role: StaffRole, context?: BrowserContext) => Promise<MintedSession>;
};

export const test = base.extend<Fixtures>({
  runtimeDb: async ({}, provide) => {
    const raw = await connect(resolveDatabaseUrls().runtime, "cs-global-e2e-test");
    // D-129: ortak veritabanında kalıcı yazım yok (yalnızca D-067 test oturumları).
    const client = isIsolatedTestDatabase() ? raw : guardSharedDatabaseClient(raw);
    try {
      await provide(client);
    } finally {
      await client.end();
    }
  },
  signInAs: async ({ context, baseURL, runtimeDb }, provide) => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET yok");
    const minted: string[] = [];
    try {
      await provide(async (role, target = context) => {
        const session = await mintStaffSession(runtimeDb, role, secret);
        minted.push(session.sessionId);
        await target.addCookies([
          {
            name: SESSION_COOKIE_NAME,
            value: session.cookieValue,
            url: baseURL!,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        return session;
      });
    } finally {
      await deleteMintedSessions(runtimeDb, minted);
    }
  },
});

export { expect } from "@playwright/test";
