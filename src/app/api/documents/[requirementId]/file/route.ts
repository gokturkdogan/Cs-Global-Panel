import type { NextRequest } from "next/server";

import { handleUpload } from "@/features/documents/handlers";
import { errorJson } from "@/features/documents/http";
import { messages } from "@/lib/messages";
import { getCurrentStaff } from "@/server/auth/staff";

/**
 * Personel PDF yüklemesi — müşteri adına (PHASE 08, OD-17, OD-24). `POST`, gövde = ham PDF
 * (`Content-Type: application/pdf`), `?expectedVersion=<evrak sürümü>`, ad `X-Upload-Filename`
 * (URL kodlu; kişisel veri URL'ye yazılmaz). Oturum her istekte sunucuda doğrulanır; iki hesap eşittir.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requirementId: string }> },
) {
  const staff = await getCurrentStaff();
  if (staff === null) return errorJson(401, "UNAUTHENTICATED", messages.files.unauthenticated);
  const { requirementId } = await params;
  return handleUpload(request, { kind: "STAFF", userId: staff.userId }, requirementId);
}
