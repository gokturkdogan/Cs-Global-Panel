import { Logo } from "@/components/shared/logo";

import { AccountMenu } from "./account-menu";
import { MobileNavigation } from "./mobile-navigation";

/** Üst bar: mobilde menü butonu + logo; her genişlikte sağda hesap menüsü. */
export function DashboardHeader({ username }: { readonly username: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur-sm sm:px-6 lg:px-8">
      <MobileNavigation username={username} />
      <Logo className="lg:hidden" />
      <div className="ml-auto">
        <AccountMenu username={username} />
      </div>
    </header>
  );
}
