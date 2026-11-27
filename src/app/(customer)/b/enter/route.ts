import { NextResponse, type NextRequest } from "next/server";

import {
  CUSTOMER_LINK_EXCHANGE_RATE_LIMIT,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
} from "@/config/constants";
import { isAccessTokenShape, resolveAccessToken } from "@/server/customer-session/access";
import {
  createSessionValue,
  customerCookieName,
  customerCookieOptions,
  entryContextId,
} from "@/server/customer-session/session";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { getAccessTokenEnv, getCustomerSessionEnv, getServerEnv } from "@/server/env";
import { isSameOriginRequest } from "@/features/documents/http";
import { hitRateLimitCounter } from "@/server/security/rate-limit-counter";

/**
 * Müşteri bağlantısını oturuma çeviren TEK giriş `POST /b/enter` (PHASE 12.1, D-141; BR-102…BR-105,
 * D-087, D-090). Ara sayfadaki açık kullanıcı eylemiyle gelir; token istek GÖVDESİNDEDİR (URL'de/log
 * satırında değil). Akış: köken (CSRF/oturum sabitleme) → gövde biçimi → HMAC arama + iptal/silme
 * kontrolleri → geçerli token başına rate limit → imzalı müşteri oturumu cookie'si → 303 token'sız
 * `/portal/<bağlam>` (POST/Redirect/GET). Yönlendirme hedefi yalnızca APP_URL + sunucunun bağlamı.
 * - Geçersiz/iptal/yenilenmiş/silinmekte → `/link-invalid` (ayrım yok); mevcut oturuma dokunulmaz.
 * - Rate limit aşımı veya geçici hata → `/link-unavailable`.
 * - Token log'a, hata mesajına, yönlendirme hedefine yazılmaz. GET/HEAD tanımlı değildir (405).
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;
/** Form gövdesi yalnızca `token=<43 karakter>` içerir; sınırın üstü okunmadan reddedilir. */
const MAX_BODY_BYTES = 512;

function redirectTo(appUrl: string, path: string) {
  const response = NextResponse.redirect(new URL(path, new URL(appUrl).origin), 303);
  for (const [key, value] of Object.entries(HEADERS)) response.headers.set(key, value);
  return response;
}

/** Yalnızca `application/x-www-form-urlencoded`, küçük gövde ve tek `token` alanı kabul edilir. */
async function readToken(request: NextRequest): Promise<string | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return null;
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared < 1 || declared > MAX_BODY_BYTES) return null;
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return null;
  const fields = [...new URLSearchParams(body)];
  if (fields.length !== 1 || fields[0]![0] !== "token") return null;
  const token = fields[0]![1];
  return isAccessTokenShape(token) ? token : null;
}

export async function POST(request: NextRequest) {
  const appUrl = getServerEnv().appUrl;
  // Proxy de aynı kuralı uygular; giriş noktası kendi içinde yeniden doğrular (iki katman, D-069).
  if (!isSameOriginRequest(request)) {
    return new NextResponse("İstek reddedildi.", {
      status: 403,
      headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" },
    });
  }
  try {
    const token = await readToken(request);
    if (token === null) return redirectTo(appUrl, "/link-invalid");
    const tokenEnv = getAccessTokenEnv();
    const sessionEnv = getCustomerSessionEnv();
    const db = getDb();
    const access = await resolveAccessToken(db, token, tokenEnv.hmacKey);
    if (access === null) return redirectTo(appUrl, "/link-invalid");

    // Sayaç anahtarı iç token kimliği (gizli değil, kişisel veri değil); yalnızca geçerli token'da oluşur.
    const attempts = await hitRateLimitCounter(
      db,
      `link:exchange:${access.tokenId}`,
      CUSTOMER_LINK_EXCHANGE_RATE_LIMIT.windowSeconds,
    );
    if (attempts > CUSTOMER_LINK_EXCHANGE_RATE_LIMIT.max) {
      return redirectTo(appUrl, "/link-unavailable");
    }

    const cookieName = customerCookieName(sessionEnv.secureCookies);
    // Aynı başvuru + aynı token → bağlam korunur; başka başvuru/token → yeni bağlam (D-090).
    const contextId = entryContextId(
      request.cookies.get(cookieName)?.value,
      access,
      sessionEnv.secret,
    );
    // Yeni 7 günlük oturum yalnızca geçerli bağlantıyla açık giriş yapıldığında (BR-103; kayan süre değil).
    const { value } = createSessionValue({ ...access, contextId }, sessionEnv.secret);
    const response = redirectTo(appUrl, `/portal/${contextId}`);
    response.cookies.set(
      cookieName,
      value,
      customerCookieOptions(sessionEnv.secureCookies, CUSTOMER_SESSION_MAX_AGE_SECONDS),
    );
    return response;
  } catch (error) {
    // Yalnızca hata kodu/türü; token, gövde ve URL loglanmaz.
    console.error("[portal] Bağlantı doğrulanamadı", {
      code: pgErrorCode(error) ?? (error instanceof Error ? error.name : "unknown"),
    });
    return redirectTo(appUrl, "/link-unavailable");
  }
}
