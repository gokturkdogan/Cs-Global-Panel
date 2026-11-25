import type { NextRequest } from "next/server";

import { handleOpen } from "@/features/documents/handlers";

import { resolveCustomerActor } from "../../customer-actor";

/**
 * Müşteri dosya görüntüleme/indirme (D-095): yalnızca oturum başvurusunun ACTIVE dosyası; eski,
 * bekleyen, reddedilmiş veya başka başvuruya ait dosya → 404 (ayırt edilmez). Sayfa açılışında PDF
 * okunmaz; yalnızca kullanıcı "Görüntüle/İndir" dediğinde (önizleme botları dosya çekmez — oturum yok).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ context: string; fileId: string }> },
) {
  const { context, fileId } = await params;
  const resolved = await resolveCustomerActor(context);
  if (!resolved.ok) return resolved.response;
  return handleOpen(request, resolved.actor, fileId);
}
