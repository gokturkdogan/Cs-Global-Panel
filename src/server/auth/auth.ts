import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { STAFF_SESSION_MAX_AGE_SECONDS } from "@/config/constants";
import { getDb, type Database } from "@/server/db/client";
import { accounts, sessions, users, verifications } from "@/server/db/schema";
import { getAuthEnv } from "@/server/env";

/**
 * Better Auth yapılandırması (D-060). Personel kimlik doğrulaması YALNIZCA sunucu tarafında,
 * Server Action'lar içinden `auth.api` ile kullanılır; Better Auth HTTP route'u (`/api/auth/*`)
 * bağlanmaz. Bu nedenle kayıt, e-posta girişi, şifre değiştirme/sıfırlama, kullanıcı güncelleme ve
 * admin uç noktaları HTTP'den erişilemez.
 */

type CreateAuthInput = {
  readonly db: Database;
  readonly secret: string;
  readonly baseURL: string;
  readonly secureCookies: boolean;
  /** Server Action'larda cookie yazmak için; testlerde istek bağlamı olmadığından kapatılır. */
  readonly withNextCookies: boolean;
};

export function createAuth(input: CreateAuthInput) {
  return betterAuth({
    appName: "CS Global",
    baseURL: input.baseURL,
    secret: input.secret,
    trustedOrigins: [input.baseURL],
    database: drizzleAdapter(input.db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    // E-posta/şifre girişi ve kayıt kapalı; giriş yalnızca kullanıcı adı ile (username plugin).
    emailAndPassword: { enabled: false, disableSignUp: true },
    user: {
      additionalFields: {
        // Hesap türü yalnızca tanımlama içindir; hiçbir yetki kararında kullanılmaz (OD-24).
        role: { type: "string", required: false, input: false },
      },
    },
    session: {
      // OD-22: 7 gün, sabit; kullanımla uzatılmaz. Cookie cache kapalı: her istekte veritabanı
      // doğrulaması (iptal edilen oturum anında geçersiz).
      expiresIn: STAFF_SESSION_MAX_AGE_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      // OD-09: IP saklanmaz (user-agent aşağıdaki hook ile boşaltılır; DB CHECK son savunma).
      ipAddress: { disableIpTracking: true },
      useSecureCookies: input.secureCookies,
      cookiePrefix: "cs",
    },
    // Better Auth'un yerleşik limiter'ı HTTP istekleri içindir; giriş limiti uygulamada (D-063).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    databaseHooks: {
      // Hesaplar yalnızca yerel CLI ile oluşturulur (OD-24); Better Auth üzerinden oluşturma yok.
      user: { create: { before: async () => false } },
      account: { create: { before: async () => false } },
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      // nextCookies en sonda olmalıdır (Better Auth dokümanı).
      ...(input.withNextCookies ? [nextCookies()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let authInstance: Auth | undefined;

/** Uygulamanın Better Auth örneği (lazy; env ve veritabanı ilk kullanımda doğrulanır). */
export function getAuth(): Auth {
  if (authInstance === undefined) {
    const env = getAuthEnv();
    authInstance = createAuth({
      db: getDb(),
      secret: env.authSecret,
      baseURL: env.appUrl,
      secureCookies: env.secureCookies,
      withNextCookies: true,
    });
  }
  return authInstance;
}
