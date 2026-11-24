"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { SidebarContent } from "./sidebar";

/**
 * Mobil/tablet (<1024px) menü drawer'ı. Radix Dialog: odak kapanı, Escape ile kapanma, overlay
 * tıklaması, arka plan kaydırma kilidi ve kapanınca odağın menü butonuna dönmesi.
 * Drawer hangi sayfada açıldıysa yalnızca o sayfada açık kalır → sayfa değişince kendiliğinden kapanır.
 */
export function MobileNavigation({ username }: { readonly username: string }) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const close = () => setOpenedOn(null);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpenedOn(next ? pathname : null)}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Menüyü aç">
          <Menu aria-hidden="true" className="size-6" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-40 bg-foreground/40 lg:hidden" />
        <Dialog.Content
          className="drawer-panel fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] bg-card shadow-md focus:outline-none lg:hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Menü</Dialog.Title>
          <SidebarContent username={username} onNavigate={close} />
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="absolute top-2.5 right-2"
              aria-label="Menüyü kapat"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
