import type { NextRequest } from "next/server";

import { handleOpen } from "@/features/documents/handlers";
import { errorJson } from "@/features/documents/http";
import { messages } from "@/lib/messages";
import { getCurrentStaff } from "@/server/auth/staff";

/**
 * Personel dosya görüntüleme/indirme (FILE_STORAGE §3): `?disposition=inline|attachment`. Aktif ve
 * önceki doğrulanmış versiyonlar (BR-72). Kalıcı/public URL yok; storage yalnızca yetki sonrası okunur.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const staff = await getCurrentStaff();
  if (staff === null) return errorJson(401, "UNAUTHENTICATED", messages.files.unauthenticated);
  const { fileId } = await params;
  return handleOpen(request, { kind: "STAFF", userId: staff.userId }, fileId);
}
