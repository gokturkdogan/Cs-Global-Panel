"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { signOutAction } from "@/features/auth/actions";

import { UserAvatar } from "./user-avatar";

/** Header hesap menüsü: kullanıcı adı + Çıkış Yap. Hesap/ayar sayfası yok (OD-24). */
export function AccountMenu({ username }: { readonly username: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`Hesap menüsü: ${username}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:px-2"
      >
        <UserAvatar username={username} className="size-8" />
        <span className="hidden max-w-40 truncate sm:inline" data-testid="header-username">
          {username}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="menu-panel z-50 min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1.5">
            <span className="block text-xs text-muted-foreground">Oturum açık</span>
            <span className="block truncate text-sm font-medium">{username}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <form action={signOutAction}>
            {/* Menünün seçimde kapanması formu DOM'dan kaldırıp gönderimi iptal eder; açık kalır, sayfa yönlenir. */}
            <DropdownMenu.Item asChild onSelect={(event) => event.preventDefault()}>
              <button
                type="submit"
                className="flex min-h-11 w-full cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-muted"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Çıkış Yap
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
