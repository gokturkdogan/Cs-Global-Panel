import { NextResponse, type NextRequest } from "next/server";

import { CUSTOMER_SESSION_MAX_AGE_SECONDS } from "@/config/constants";
import { ACCESS_TOKEN_LENGTH } from "@/server/access-tokens/crypto";
import { resolveAccessToken } from "@/server/customer-session/access";
import {
  createSessionValue,
  customerCookieName,
  customerCookieOptions,
  entryContextId,
} from "@/server/customer-session/session";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { getAccessTokenEnv, getCustomerSessionEnv, getServerEnv } from "@/server/env";

/**
 * Müşteri bağlantısı girişi `GET /b/[token]` (BR-102…BR-105, D-087). Sayfa render etmez:
 * doğrula → imzalı müşteri oturumu cookie'si → 303 ile token'sız `/portal/<bağlam>`.
 * - GET hiçbir veriyi değiştirmez, audit yazmaz, token'ı tüketmez (link önizleme botları için güvenli).
 * - Token log'a, hata mesajına, yönlendirme hedefine yazılmaz. Yönlendirme yalnızca APP_URL'den.
 * - Geçersiz/iptal/yenilenmiş/silinmekte → `/link-invalid` (ayrım yok); mevcut oturuma dokunulmaz,
 *   başka bir müşteri oturumuna yönlendirilmez. Geçici hata → `/link-unavailable`.
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

function redirectTo(appUrl: string, path: string) {
  const response = NextResponse.redirect(new URL(path, new URL(appUrl).origin), 303);
  for (const [key, value] of Object.entries(HEADERS)) response.headers.set(key, value);
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const appUrl = getServerEnv().appUrl;
  const { token } = await params;
  // Biçim kontrolü veritabanından önce: aşırı uzun/bozuk girdiler sorgu üretmez.
  if (typeof token !== "string" || token.length !== ACCESS_TOKEN_LENGTH) {
    return redirectTo(appUrl, "/link-invalid");
  }
  try {
    const tokenEnv = getAccessTokenEnv();
    const sessionEnv = getCustomerSessionEnv();
    const access = await resolveAccessToken(getDb(), token, tokenEnv.hmacKey);
    if (access === null) return redirectTo(appUrl, "/link-invalid");

    const cookieName = customerCookieName(sessionEnv.secureCookies);
    // Aynı başvuru + aynı token → bağlam korunur; başka başvuru/token → yeni bağlam (D-090).
    const contextId = entryContextId(
      request.cookies.get(cookieName)?.value,
      access,
      sessionEnv.secret,
    );
    // Yeni 7 günlük oturum yalnızca geçerli bağlantı yeniden açıldığında (BR-103; kayan süre değil).
    const { value } = createSessionValue({ ...access, contextId }, sessionEnv.secret);
    const response = redirectTo(appUrl, `/portal/${contextId}`);
    response.cookies.set(
      cookieName,
      value,
      customerCookieOptions(sessionEnv.secureCookies, CUSTOMER_SESSION_MAX_AGE_SECONDS),
    );
    return response;
  } catch (error) {
    // Yalnızca hata kodu/türü; token ve URL loglanmaz.
    console.error("[portal] Bağlantı doğrulanamadı", {
      code: pgErrorCode(error) ?? (error instanceof Error ? error.name : "unknown"),
    });
    return redirectTo(appUrl, "/link-unavailable");
  }
}
