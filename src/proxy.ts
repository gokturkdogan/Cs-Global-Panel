import { NextResponse, type NextRequest } from "next/server";

import { isTrustedRequestOrigin, resolveAppUrl } from "@/server/security/request-origin";

/**
 * 1) Durum değiştiren sayfa isteklerinde (Server Action'lar) köken kontrolü → kontrollü 403 (D-069).
 * 2) İstek başına nonce'lu Content-Security-Policy (D-064; Next.js 16 CSP rehberi).
 * Proxy kimlik doğrulama yapmaz; kimlik kontrolü her sayfa/action/route içinde `requireStaff()` ile.
 * `/api/*` Route Handler'ları kendi köken/kimlik kontrollerini yapar.
 *
 * Dosya yolları (`/api/documents/*`, `/api/portal/*`, `/api/files/*`) proxy kapsamı DIŞINDADIR (D-100):
 * proxy istek gövdesini belleğe alır ve varsayılan 10 MB sınırının üstünü sessizce keser
 * (`proxyClientMaxBodySize`) — PDF yüklemesi kesik dosyaya dönüşmemeli. Bu route'lar köken (Origin),
 * kimlik, gövde sınırı ve kendi CSP/no-store başlıklarını içeride uygular.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    // React development modunda hata yığınları için eval kullanır; production'da yoktur.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // http://localhost üzerinde istekleri https'e yükseltmek geliştirme/test sunucusunu bozar.
  if ((process.env.APP_URL ?? "").startsWith("https://"))
    directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  if (
    !request.nextUrl.pathname.startsWith("/api/") &&
    !isTrustedRequestOrigin({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      appUrl: resolveAppUrl(process.env),
    })
  ) {
    return new NextResponse("İstek reddedildi.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|api/documents/|api/portal/|api/files/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
