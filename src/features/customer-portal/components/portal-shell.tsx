import type { ReactNode } from "react";

import { Logo } from "@/components/shared/logo";
import { messages } from "@/lib/messages";

/** Müşteri paneli iskeleti: yalnızca logo; personel menüsü, giriş/çıkış öğesi yok (DESIGN_SYSTEM §7). */
export function PortalShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center px-4 sm:px-6">
          <Logo withTagline />
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8"
      >
        {children}
      </main>
      <footer className="border-t bg-card">
        <p className="mx-auto w-full max-w-2xl px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
          {messages.portal.privateLink}
        </p>
      </footer>
    </div>
  );
}
