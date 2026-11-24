import type { Metadata } from "next";

import { NotReadyPage } from "@/components/dashboard/not-ready";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Hizmetler | CS Global" };

/** Modül sonraki fazlarda gelir (DEVELOPMENT_ROADMAP); şimdilik bilgilendirme sayfası. */
export default async function ServicesPage() {
  await requireStaff();
  return <NotReadyPage title="Hizmetler" />;
}
