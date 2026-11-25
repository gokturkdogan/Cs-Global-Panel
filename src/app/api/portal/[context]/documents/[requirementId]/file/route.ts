import type { NextRequest } from "next/server";

import { handleUpload } from "@/features/documents/handlers";

import { resolveCustomerActor } from "../../../customer-actor";

/**
 * Müşteri PDF yüklemesi (PHASE 08, D-095). Yalnızca `AWAITING_DOCUMENTS`/`REVISION_REQUIRED` ve izinli
 * evrak statülerinde (BR-44). Evrak oturum başvurusuna ait değilse 404. Bağlam uyuşmazlığında (aynı
 * tarayıcıda başka başvuru açıldı) yükleme reddedilir → yanlış başvuruya yükleme olmaz (TM-40).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ context: string; requirementId: string }> },
) {
  const { context, requirementId } = await params;
  const resolved = await resolveCustomerActor(context);
  if (!resolved.ok) return resolved.response;
  return handleUpload(request, resolved.actor, requirementId);
}
