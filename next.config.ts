import type { NextConfig } from "next";

/**
 * Güvenlik header'ları (SECURITY §5). Content-Security-Policy istek başına nonce ile
 * `src/proxy.ts` tarafından eklenir (D-064).
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // noindex bir erişim kontrolü değildir; yalnızca arama motoru indekslemesini engeller.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `next dev` kök dizine AGENTS.md yazmasın; ajan talimatlarının tek kaynağı CLAUDE.md'dir.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
