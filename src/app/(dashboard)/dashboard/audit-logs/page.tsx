import type { Metadata } from "next";

import { NotReadyPage } from "@/components/dashboard/not-ready";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "İşlem Geçmişi | CS Global" };

/** Modül sonraki fazlarda gelir (DEVELOPMENT_ROADMAP); şimdilik bilgilendirme sayfası. */
export default async function AuditLogsPage() {
  await requireStaff();
  return <NotReadyPage title="İşlem Geçmişi" />;
}
