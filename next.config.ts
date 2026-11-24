import type { NextConfig } from "next";

/**
 * Temel güvenlik header'ları (SECURITY §5).
 *
 * Bu CSP yalnızca script çalıştırmayı etkilemeyen direktifleri içerir; development
 * ve production'da güvenle çalışır. Nonce'lu `script-src`/`style-src` içeren tam CSP,
 * `src/proxy.ts` ile kimlik doğrulama, müşteri paneli ve storage fazlarında eklenir.
 */
const baselineContentSecurityPolicy = [
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: baselineContentSecurityPolicy },
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
