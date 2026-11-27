import { headers } from "next/headers";
import type { ReactNode } from "react";

import { CspNonce } from "@/components/csp-nonce";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireStaff } from "@/server/auth/staff";

/**
 * Şirket paneli düzeni — iki hesap için aynı (OD-24). Layout kimlik kontrolü yalnızca iskelet içindir;
 * her sayfa ayrıca kendi `requireStaff()` çağrısını yapar (layout'lar her gezinmede yeniden çalışmaz).
 * Yükleme iskeleti yalnızca `(overview)` grubunda: böylece tanımsız yollar gerçek HTTP 404 döner
 * (akış başlamadan `notFound()`).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const nonce = (await headers()).get("x-nonce");
  return (
    <>
      <CspNonce nonce={nonce} />
      <DashboardShell username={staff.username}>{children}</DashboardShell>
    </>
  );
}
