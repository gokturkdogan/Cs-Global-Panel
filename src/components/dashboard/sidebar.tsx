import { Logo } from "@/components/shared/logo";

import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { UserAvatar } from "./user-avatar";

type SidebarProps = { readonly username: string; readonly onNavigate?: () => void };

/** Sidebar içeriği: masaüstünde sabit kolon, mobilde drawer içinde aynı içerik. */
export function SidebarContent({ username, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-5">
        <Logo withTagline />
      </div>
      <nav aria-label="Ana menü" className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks onNavigate={onNavigate} />
      </nav>
      <div className="grid gap-3 border-t p-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar username={username} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Oturum açık</p>
            <p
              className="truncate text-sm font-medium text-foreground"
              data-testid="sidebar-username"
            >
              {username}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}

/** Masaüstü (≥1024px) sabit sidebar, 248px. */
export function Sidebar({ username }: { readonly username: string }) {
  return (
    <aside
      aria-label="Panel menüsü"
      className="fixed inset-y-0 left-0 z-30 hidden w-62 border-r bg-card lg:block"
    >
      <SidebarContent username={username} />
    </aside>
  );
}
