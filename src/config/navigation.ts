/**
 * Şirket paneli menüsü — iki hesap için aynı (OD-24); rol bazlı menü yok. Ayarlar, hesap ve
 * çalışan sayfaları yoktur. İkonlar istemci bileşeninde eşlenir (RSC sınırından fonksiyon geçmez).
 */
export const DASHBOARD_NAV_ITEMS = [
  { key: "overview", href: "/dashboard", label: "Genel Bakış" },
  { key: "applications", href: "/dashboard/applications", label: "Başvurular" },
  { key: "services", href: "/dashboard/services", label: "Hizmetler" },
  { key: "auditLogs", href: "/dashboard/audit-logs", label: "İşlem Geçmişi" },
] as const;

export type DashboardNavKey = (typeof DASHBOARD_NAV_ITEMS)[number]["key"];

/** `/dashboard` yalnızca tam eşleşmede aktiftir; diğerleri alt sayfalarıyla birlikte. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
