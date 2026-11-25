import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { CUSTOMER_SESSION_MAX_AGE_SECONDS } from "@/config/constants";

/**
 * Müşteri portal oturumu (PHASE 07, SECURITY §3.4, D-087…D-090). Veritabanı tablosu yoktur: imzalı
 * cookie + her istekte veritabanından token aktifliği (iptal/yenileme anında etkili — BR-104).
 *
 * Biçim: `base64url(JSON payload) "." base64url(HMAC-SHA256(CUSTOMER_SESSION_SECRET, payloadPart))`.
 * İmza, gelen payload metninin kendisi üzerinden hesaplanır (kanonik serileştirme gerekmez);
 * karşılaştırma `timingSafeEqual`. Payload şifrelenmez → kişisel veri, token, hash İÇERMEZ.
 *
 * payload = { v: 1, typ: "cs-portal", aid: applicationId, tid: accessTokenId, ctx: contextId,
 *             iat, exp }  (saniye; exp = iat + 7 gün, uzatılmaz)
 * `ctx`: sekme/bağlam kimliği (16 bayt rastgele). URL'deki `/portal/<ctx>` ile eşleşmeli (TM-40);
 * tek başına kimlik bilgisi değildir.
 */

export const CUSTOMER_COOKIE_BASE_NAME = "cs_portal";
/** https'te `__Host-` öneki: Secure + Path=/ + Domain yok zorunlu (alt alan adı paylaşımı yok). */
export function customerCookieName(secure: boolean): string {
  return secure ? `__Host-${CUSTOMER_COOKIE_BASE_NAME}` : CUSTOMER_COOKIE_BASE_NAME;
}

export function customerCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    // Lax: WhatsApp vb. dış uygulamadan gelen ilk üst düzey gezinmede cookie set edilir ve sonraki
    // aynı-site yönlendirmede gönderilir; Strict bu zincirde cookie'yi göndermez.
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

const CONTEXT_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SESSION_TYPE = "cs-portal";
const CLOCK_SKEW_SECONDS = 60;
const MAX_COOKIE_LENGTH = 512;

export function newContextId(): string {
  return randomBytes(16).toString("base64url");
}

export function isContextId(value: string): boolean {
  return (
    CONTEXT_PATTERN.test(value) && Buffer.from(value, "base64url").toString("base64url") === value
  );
}

const payloadSchema = z
  .object({
    v: z.literal(1),
    typ: z.literal(SESSION_TYPE),
    aid: z.uuid(),
    tid: z.uuid(),
    ctx: z.string().refine(isContextId),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();

export type CustomerSessionPayload = z.output<typeof payloadSchema>;

function sign(payloadPart: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payloadPart, "utf8").digest("base64url");
}

export function createSessionValue(
  input: { applicationId: string; tokenId: string; contextId: string },
  secret: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): { value: string; payload: CustomerSessionPayload } {
  const payload: CustomerSessionPayload = {
    v: 1,
    typ: SESSION_TYPE,
    aid: input.applicationId,
    tid: input.tokenId,
    ctx: input.contextId,
    iat: nowSeconds,
    exp: nowSeconds + CUSTOMER_SESSION_MAX_AGE_SECONDS,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { value: `${payloadPart}.${sign(payloadPart, secret)}`, payload };
}

export type SessionVerification =
  | { readonly ok: true; readonly payload: CustomerSessionPayload }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

/** İmza → biçim → süre. Değiştirilmiş/biçimsiz/yanlış anahtarlı/aşırı ömürlü → `invalid`. */
export function verifySessionValue(
  value: string | undefined,
  secret: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionVerification {
  if (!value || value.length > MAX_COOKIE_LENGTH) return { ok: false, reason: "invalid" };
  const parts = value.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [payloadPart, signaturePart] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]{43}$/.test(signaturePart)) {
    return { ok: false, reason: "invalid" };
  }
  const expected = Buffer.from(sign(payloadPart, secret), "base64url");
  const received = Buffer.from(signaturePart, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: "invalid" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const result = payloadSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "invalid" };
  const payload = result.data;
  // Sunucu tarafı süre kontrolü (cookie Max-Age'ine güvenilmez); en fazla 7 gün; gelecekte iat yok.
  if (
    payload.exp - payload.iat > CUSTOMER_SESSION_MAX_AGE_SECONDS ||
    payload.iat > nowSeconds + CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.exp <= nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/**
 * Bağlantı girişinde kullanılacak bağlam kimliği (D-090). Tarayıcıdaki geçerli oturum AYNI başvuru
 * ve AYNI token'a aitse bağlam korunur (aynı bağlantıyı ikinci kez açmak önceki sekmeyi
 * eskitmez); aksi hâlde (oturum yok/geçersiz/süresi dolmuş, başka başvuru veya başka token) yeni
 * bağlam üretilir ve önceki sekmeler bir sonraki istekte bağlam uyuşmazlığı gösterir.
 * Token'ın aktifliği bu fonksiyonda değil, çağıranda veritabanından doğrulanmış olmalıdır.
 */
export function entryContextId(
  existingValue: string | undefined,
  access: { applicationId: string; tokenId: string },
  secret: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const existing = verifySessionValue(existingValue, secret, nowSeconds);
  if (
    existing.ok &&
    existing.payload.aid === access.applicationId &&
    existing.payload.tid === access.tokenId
  ) {
    return existing.payload.ctx;
  }
  return newContextId();
}
