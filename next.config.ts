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

/** Müşteri yolları (PHASE 07, D-093): referrer gönderilmez, paylaşılan önbellek yok. */
const customerHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];
const CUSTOMER_PATHS = [
  "/b/:path*",
  "/portal",
  "/portal/:path*",
  "/link-invalid",
  "/link-unavailable",
  // Dosya route'ları (PHASE 08): route da aynı başlıkları kendisi ayarlar (proxy kapsamı dışında).
  "/api/documents/:path*",
  "/api/portal/:path*",
  "/api/files/:path*",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF doğrulayıcı (D-099) worker thread'de çalışır; pdf.js paketlenmez, node_modules'tan yüklenir
  // (kendi worker modülünü göreli yoldan çözer).
  serverExternalPackages: ["pdfjs-dist"],
  logging: {
    // Geliştirme sunucusu istek logları müşteri bağlantı token'ını (`/b/<token>`) yazmasın.
    incomingRequests: { ignore: [/^\/b\//] },
    // Geliştirmede Server Function argümanları (müşteri telefonu/e-postası vb.) terminale yazılmasın.
    serverFunctions: false,
  },
  // `next dev` kök dizine AGENTS.md yazmasın; ajan talimatlarının tek kaynağı CLAUDE.md'dir.
  agentRules: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Aynı anahtar için sonraki kayıt öncekini geçersiz kılar.
      ...CUSTOMER_PATHS.map((source) => ({ source, headers: customerHeaders })),
    ];
  },
};

export default nextConfig;
