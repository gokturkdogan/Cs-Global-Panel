"use client";

import { setNonce } from "get-nonce";

let applied = false;

/**
 * Radix Dialog/AlertDialog kaydırma kilidi (react-remove-scroll) çalışma anında `<style>` etiketi
 * ekler. CSP `style-src` yalnızca nonce'lu stillere izin verdiği için (`unsafe-inline` yok — D-064),
 * belgenin nonce'u `get-nonce`'a verilir (D-071).
 *
 * Nonce belgeye özeldir: belgenin CSP'si ilk yüklemede sabitlenir. Server Action / yenileme sonrası
 * layout yeni isteğin nonce'uyla yeniden render edilse de değer DEĞİŞTİRİLMEZ; mümkünse belgedeki
 * script etiketinin gerçek nonce'u okunur (PHASE 05 düzeltmesi).
 */
export function CspNonce({ nonce }: { readonly nonce: string | null }) {
  if (applied || typeof document === "undefined") return null;
  const documentNonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  const value = documentNonce || nonce;
  if (value) {
    setNonce(value);
    applied = true;
  }
  return null;
}
