import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

import { ACCESS_TOKEN_BYTES } from "@/config/constants";

/**
 * Müşteri erişim token'ı kriptografisi (SECURITY §3.2, OD-01, OD-19, D-080). Yalnızca Node.js
 * standart `crypto` API'leri; kendi algoritmamız yoktur. Hata durumunda fail-closed
 * (`AccessTokenCryptoError`, mesaj token/anahtar/şifreli metin içermez).
 *
 * - Token: `randomBytes(32)` (CSPRNG, 256 bit) → base64url, 43 karakter, kanonik.
 * - Doğrulama: `HMAC-SHA256(ACCESS_TOKEN_HMAC_KEY, token)` hex (DB `token_hash`, UNIQUE).
 * - Tekrar görüntüleme: AES-256-GCM, her şifrelemede 96-bit rastgele IV, 128-bit tag,
 *   AAD = `cs-access-token:v1:<applicationId>:<tokenId>` (şifreli kopya başka başvuru/token
 *   satırına taşınırsa çözülmez). Biçim: `v1:<keyId>:<iv>:<ciphertext>:<tag>` (base64url parçalar).
 */

const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = "v1";
export const ACCESS_TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PART_PATTERN = /^[A-Za-z0-9_-]+$/;

export class AccessTokenCryptoError extends Error {
  constructor(reason: string) {
    super(`Erişim token'ı işlenemedi (${reason})`);
    this.name = "AccessTokenCryptoError";
  }
}

export type TokenContext = { readonly applicationId: string; readonly tokenId: string };

export function generateAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
}

/** 43 karakter base64url ve kanonik (yeniden kodlandığında aynı) mı? */
export function isCanonicalAccessToken(token: string): boolean {
  if (!TOKEN_PATTERN.test(token)) return false;
  const bytes = Buffer.from(token, "base64url");
  return bytes.length === ACCESS_TOKEN_BYTES && bytes.toString("base64url") === token;
}

export function hashAccessToken(token: string, hmacKey: Buffer): string {
  if (!isCanonicalAccessToken(token)) throw new AccessTokenCryptoError("biçim");
  return createHmac("sha256", hmacKey).update(token, "utf8").digest("hex");
}

function associatedData({ applicationId, tokenId }: TokenContext): Buffer {
  return Buffer.from(`cs-access-token:${FORMAT_VERSION}:${applicationId}:${tokenId}`, "utf8");
}

export function encryptAccessToken(
  token: string,
  context: TokenContext,
  keyId: string,
  key: Buffer,
): string {
  if (!isCanonicalAccessToken(token)) throw new AccessTokenCryptoError("biçim");
  if (key.length !== 32) throw new AccessTokenCryptoError("anahtar");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, keyId, iv, ciphertext, tag]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
}

export function decryptAccessToken(
  value: string,
  context: TokenContext,
  keys: ReadonlyMap<string, Buffer>,
): string {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) throw new AccessTokenCryptoError("biçim");
  const [, keyId, ivPart, ctPart, tagPart] = parts as [string, string, string, string, string];
  const key = keys.get(keyId);
  if (key === undefined) throw new AccessTokenCryptoError("anahtar bulunamadı");
  if (![ivPart, ctPart, tagPart].every((part) => PART_PATTERN.test(part)))
    throw new AccessTokenCryptoError("biçim");
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new AccessTokenCryptoError("biçim");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(tag);
    const token = Buffer.concat([
      decipher.update(Buffer.from(ctPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    if (!isCanonicalAccessToken(token)) throw new Error("format");
    return token;
  } catch {
    // Yanlış anahtar, değiştirilmiş şifreli metin/tag veya bağlam uyuşmazlığı: ayrım yapılmaz.
    throw new AccessTokenCryptoError("doğrulama");
  }
}

/** Bağlantı yalnızca sunucu yapılandırmasındaki APP_URL ile üretilir (BR-107, OD-20). */
export function buildAccessLink(appUrl: string, token: string): string {
  if (!isCanonicalAccessToken(token)) throw new AccessTokenCryptoError("biçim");
  return `${new URL(appUrl).origin}/b/${token}`;
}
