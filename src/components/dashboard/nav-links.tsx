"use client";

import {
  BriefcaseBusiness,
  FileText,
  History,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV_ITEMS, isNavItemActive, type DashboardNavKey } from "@/config/navigation";
import { cn } from "@/lib/utils";

const ICONS = {
  overview: LayoutDashboard,
  applications: FileText,
  services: BriefcaseBusiness,
  auditLogs: History,
} as const satisfies Record<DashboardNavKey, LucideIcon>;

type NavLinksProps = { readonly onNavigate?: () => void };

/** Ana menü bağlantıları; aktif sayfa açık mavi zemin + `aria-current="page"`. */
export function NavLinks({ onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {DASHBOARD_NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.key];
        const active = isNavItemActive(item.href, pathname);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                active
                  ? "bg-primary-light text-primary-dark"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
