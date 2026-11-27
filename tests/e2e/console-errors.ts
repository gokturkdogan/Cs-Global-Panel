import type { Page } from "@playwright/test";

/**
 * Konsol/sayfa hatası toplayıcı (PHASE 10.2, D-131). Tüm `console.error` ve sayfa hataları toplanır;
 * TEK istisna, kanıtlanmış zararsız ortam durumudur:
 *   WebKit'in "Fetch API cannot load <url> due to access control checks." mesajı, YALNIZCA
 *   (a) URL aynı yerel kökende bir Next.js RSC önceden yükleme isteği (`?_rsc=`) ise ve
 *   (b) o istek HİÇ yanıt almadan ağ katmanında başarısız olduysa (Playwright `requestfailed`, öncesinde
 *       `response` yok).
 * Kanıt (D-131): bu geliştirme makinesindeki kurumsal içerik filtresi (Network Extension) WebKit
 * yüklemelerini zaman zaman ağ katmanında düşürür (aynı çalıştırmada "The URL was blocked by a content
 * filter"); sunucu yanıtı yoktur. Gerçek hatalar yakalanmaya devam eder: kökenler arası yönlendirme
 * (3xx yanıtı alınır → istisna dışı), 4xx/5xx ("Failed to load resource"), CSP ihlali ("Refused to …"),
 * sayfa hataları, RSC dışı istekler, diğer tarayıcılar.
 */
const WEBKIT_FETCH_BLOCKED = /^Fetch API cannot load (\S+) due to access control checks\.$/;

function isLocalRscPrefetch(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.searchParams.has("_rsc") &&
      url.pathname.startsWith("/")
    );
  } catch {
    return false;
  }
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  const responded = new Set<string>();
  const failedWithoutResponse = new Set<string>();
  const harmless = (text: string) => {
    if (!webkit) return false;
    const url = WEBKIT_FETCH_BLOCKED.exec(text)?.[1];
    return url !== undefined && isLocalRscPrefetch(url) && failedWithoutResponse.has(url);
  };

  page.on("response", (response) => responded.add(response.url()));
  page.on("requestfailed", (request) => {
    if (!webkit || responded.has(request.url()) || !isLocalRscPrefetch(request.url())) return;
    failedWithoutResponse.add(request.url());
    // Konsol mesajı istek olayından önce geldiyse geriye dönük olarak ayıkla.
    for (let i = errors.length - 1; i >= 0; i -= 1) if (harmless(errors[i]!)) errors.splice(i, 1);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !harmless(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
