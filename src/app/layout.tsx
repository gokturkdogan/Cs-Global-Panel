import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: "CS Global | Vize Danışmanlık Paneli",
  description: "CS Global vize danışmanlık süreç ve evrak yönetim platformu.",
  // Özel amaçlı panel: arama motorları indekslemez. Bu bir erişim kontrolü değildir.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
