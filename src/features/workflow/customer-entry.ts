import "server-only";

import { fail, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { requireCustomerAccess } from "@/server/customer-session/access";
import { getDb } from "@/server/db/client";

import * as workflow from "./service";

/**
 * Müşteri iş akışı giriş noktası (PHASE 09, D-095, D-111). Müşteri modülleri yalnızca bu dar API'yi
 * kullanır (personel kimlik doğrulaması, genel audit, token veya iç not modüllerine erişmez — ESLint).
 * Her çağrı `requireCustomerAccess(contextId)` ile başlar: imza, 7 gün sabit süre, URL bağlamı = cookie
 * bağlamı, token aktif, başvuru silinmiyor. Başvuru kimliği YALNIZCA oturumdan; istemci değeri kullanılmaz.
 * İstek başında doğrulanan bağlam işlem boyunca sabittir; servis kilit altında token ve süreyi yeniden
 * doğrular. Personel oturumu burada hiç okunmaz.
 */

async function customerActor(contextId: string) {
  const access = await requireCustomerAccess(contextId);
  if (access.ok) {
    return {
      ok: true as const,
      actor: {
        kind: "CUSTOMER" as const,
        applicationId: access.access.applicationId,
        tokenId: access.access.tokenId,
        sessionExpiresAt: access.expiresAt,
      },
    };
  }
  if (access.reason === "context_mismatch") {
    return {
      ok: false as const,
      failure: fail({ code: "CONFLICT", message: messages.workflow.contextChanged }),
    };
  }
  if (access.reason === "unavailable") {
    return {
      ok: false as const,
      failure: fail({ code: "INTERNAL", message: messages.workflow.unavailable }),
    };
  }
  return {
    ok: false as const,
    failure: fail({ code: "UNAUTHENTICATED", message: messages.workflow.accessEnded }),
  };
}

export async function submitAsCustomer(
  contextId: string,
  expectedVersion: number,
): Promise<ActionResult<workflow.TransitionResult>> {
  const resolved = await customerActor(contextId);
  if (!resolved.ok) return resolved.failure;
  return workflow.submitApplication(getDb(), resolved.actor, {
    applicationId: resolved.actor.applicationId,
    expectedVersion,
  });
}

export async function removeFileAsCustomer(
  contextId: string,
  fileId: string,
  expectedVersion: number,
) {
  const resolved = await customerActor(contextId);
  if (!resolved.ok) return resolved.failure;
  return workflow.removeDocumentFile(getDb(), resolved.actor, { fileId, expectedVersion });
}
