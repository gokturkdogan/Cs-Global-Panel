import type { ReactNode } from "react";

import { DashboardHeader } from "./dashboard-header";
import { Sidebar } from "./sidebar";

/** Şirket paneli iskeleti — iki hesap için birebir aynı (OD-24). */
export function DashboardShell({
  username,
  children,
}: {
  readonly username: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
      >
        İçeriğe geç
      </a>
      <Sidebar username={username} />
      <div className="flex min-h-dvh flex-col lg:pl-62">
        <DashboardHeader username={username} />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
