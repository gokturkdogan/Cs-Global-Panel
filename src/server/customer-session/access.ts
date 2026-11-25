import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

import { hashAccessToken, isCanonicalAccessToken } from "@/server/access-tokens/crypto";
import type { Database } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { applicationAccessTokens as tokens, applications } from "@/server/db/schema";
import { getCustomerSessionEnv, type CustomerSessionEnv } from "@/server/env";

import { customerCookieName, isContextId, verifySessionValue } from "./session";

/**
 * Müşteri erişim kontrolü (PHASE 07, D-087…D-091). Tek giriş noktası: her korumalı müşteri sayfası
 * ve gelecekteki müşteri mutasyonları (PHASE 08/09) `requireCustomerAccess(context)` ile başlar.
 * Proxy/layout/istemci kontrolü güvenlik sınırı değildir. Personel oturumu burada HİÇ kullanılmaz.
 *
 * Sıra: cookie imzası → süre → URL bağlamı = cookie bağlamı → veritabanında token aktif, başvuruya ait
 * ve başvuru silme sürecinde değil (önbellek yok; her istekte).
 */

type Reader = Pick<Database, "select">;

export type ActiveAccess = { readonly applicationId: string; readonly tokenId: string };

/** HMAC ile token kaydını bulur (şifreli kopya çözülmez). Biçim önce, veritabanı sonra. */
export async function resolveAccessToken(
  db: Reader,
  token: string,
  hmacKey: Buffer,
): Promise<ActiveAccess | null> {
  if (!isCanonicalAccessToken(token)) return null;
  const [row] = await db
    .select({ applicationId: tokens.applicationId, tokenId: tokens.id })
    .from(tokens)
    .innerJoin(applications, eq(applications.id, tokens.applicationId))
    .where(
      and(
        eq(tokens.tokenHash, hashAccessToken(token, hmacKey)),
        isNull(tokens.revokedAt),
        isNull(applications.deletionRequestedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Oturumdaki token hâlâ aktif mi ve bu başvuruya mı ait? (iptal/yenileme/silme anında etkili) */
export async function isAccessActive(db: Reader, access: ActiveAccess): Promise<boolean> {
  const [row] = await db
    .select({ id: tokens.id })
    .from(tokens)
    .innerJoin(applications, eq(applications.id, tokens.applicationId))
    .where(
      and(
        eq(tokens.id, access.tokenId),
        eq(tokens.applicationId, access.applicationId),
        isNull(tokens.revokedAt),
        isNull(applications.deletionRequestedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export type CustomerAccessFailure =
  /** Cookie yok veya bağlam biçimsiz. */
  | "missing"
  /** İmza/biçim geçersiz, token iptal/yenilenmiş, başvuru yok/silinmekte (ayrım gösterilmez). */
  | "invalid"
  | "expired"
  /** Bu tarayıcıda başka bir başvuru bağlantısı açıldı (TM-40). */
  | "context_mismatch"
  /** Geçici sistem hatası (veritabanı/yapılandırma) — geçersiz bağlantı olarak sınıflandırılmaz. */
  | "unavailable";

export type CustomerAccessResult =
  | {
      readonly ok: true;
      readonly access: ActiveAccess;
      readonly contextId: string;
      readonly expiresAt: number;
    }
  | { readonly ok: false; readonly reason: CustomerAccessFailure };

export async function checkCustomerAccess(
  context: string,
  cookieValue: string | undefined,
  env: CustomerSessionEnv,
  db: Reader,
): Promise<CustomerAccessResult> {
  if (!isContextId(context)) return { ok: false, reason: "missing" };
  if (!cookieValue) return { ok: false, reason: "missing" };
  const verified = verifySessionValue(cookieValue, env.secret);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  if (verified.payload.ctx !== context) return { ok: false, reason: "context_mismatch" };
  const access = { applicationId: verified.payload.aid, tokenId: verified.payload.tid };
  if (!(await isAccessActive(db, access))) return { ok: false, reason: "invalid" };
  return { ok: true, access, contextId: context, expiresAt: verified.payload.exp };
}

/** Sayfa/aksiyon girişinde kullanılır: cookie'yi okur; yapılandırma/veritabanı hatası → `unavailable`. */
export async function requireCustomerAccess(context: string): Promise<CustomerAccessResult> {
  let env: CustomerSessionEnv;
  try {
    env = getCustomerSessionEnv();
  } catch {
    console.error("[portal] Müşteri oturumu yapılandırması geçersiz", {
      variable: "CUSTOMER_SESSION_SECRET",
    });
    return { ok: false, reason: "unavailable" };
  }
  const store = await cookies();
  try {
    return await checkCustomerAccess(
      context,
      store.get(customerCookieName(env.secureCookies))?.value,
      env,
      getDb(),
    );
  } catch (error) {
    console.error("[portal] Erişim doğrulanamadı", { code: pgErrorCode(error) ?? "unknown" });
    return { ok: false, reason: "unavailable" };
  }
}
