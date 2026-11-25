import "server-only";

import { errorJson } from "@/features/documents/http";
import type { FileActor } from "@/features/documents/service";
import { messages } from "@/lib/messages";
import { requireCustomerAccess } from "@/server/customer-session/access";

/**
 * Müşteri dosya isteklerinin aktörü (D-095): imza, 7 gün sabit süre, URL bağlamı = cookie bağlamı,
 * token aktif ve başvuru silinmiyor — her istekte. Başvuru kimliği YALNIZCA oturumdan gelir; personel
 * oturumu burada hiç okunmaz (aynı tarayıcıda iki cookie olsa da yetki yükselmez).
 * İstek başında doğrulanan bağlam istek boyunca sabittir; başka sekmenin yeni cookie'si hedefi değiştirmez.
 */
export async function resolveCustomerActor(
  context: string,
): Promise<{ ok: true; actor: FileActor } | { ok: false; response: Response }> {
  const access = await requireCustomerAccess(context);
  if (access.ok) {
    return {
      ok: true,
      actor: {
        kind: "CUSTOMER",
        applicationId: access.access.applicationId,
        tokenId: access.access.tokenId,
        sessionExpiresAt: access.expiresAt,
      },
    };
  }
  if (access.reason === "context_mismatch") {
    return {
      ok: false,
      response: errorJson(409, "CONTEXT_MISMATCH", messages.files.contextChanged),
    };
  }
  if (access.reason === "unavailable") {
    return { ok: false, response: errorJson(503, "UNAVAILABLE", messages.files.unavailable) };
  }
  return { ok: false, response: errorJson(401, "ACCESS_ENDED", messages.files.accessEnded) };
}
