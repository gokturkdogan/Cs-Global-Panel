import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { CspNonce } from "@/components/csp-nonce";
import { PortalShell } from "@/features/customer-portal/components/portal-shell";

// Başlıkta kişisel veri veya başvuru numarası yoktur (link önizleme botları sekme başlığını görebilir).
export const metadata: Metadata = {
  title: "Başvurum | CS Global",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Müşteri paneli düzeni — personel panelinden bağımsız (sidebar/menü/oturum öğesi yok). PHASE 11: PDF
 * görüntüleyici penceresi (Radix Dialog) kaydırma kilidi stili için belge nonce'u verilir (D-071 deseni;
 * CSP gevşetilmez).
 */
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <>
      <CspNonce nonce={nonce} />
      <PortalShell>{children}</PortalShell>
    </>
  );
}
