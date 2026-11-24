import type { Metadata } from "next";

import { NotReadyPage } from "@/components/dashboard/not-ready";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Başvurular | CS Global" };

/** Modül sonraki fazlarda gelir (DEVELOPMENT_ROADMAP); şimdilik bilgilendirme sayfası. */
export default async function ApplicationsPage() {
  await requireStaff();
  return <NotReadyPage title="Başvurular" />;
}
