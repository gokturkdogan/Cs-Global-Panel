import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PortalShell } from "@/features/customer-portal/components/portal-shell";

// Başlıkta kişisel veri veya başvuru numarası yoktur (link önizleme botları sekme başlığını görebilir).
export const metadata: Metadata = {
  title: "Başvurum | CS Global",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Müşteri paneli düzeni — personel panelinden bağımsız (sidebar/menü/oturum öğesi yok). */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
