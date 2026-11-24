"use client";

import { setNonce } from "get-nonce";

/**
 * Radix Dialog'un kaydırma kilidi (react-remove-scroll) çalışma anında `<style>` etiketi ekler.
 * CSP `style-src` yalnızca nonce'lu stillere izin verdiği için (`unsafe-inline` yok — D-064), istek
 * nonce'u `get-nonce`'a verilir; etiket bu nonce ile oluşturulur. Nonce istek başına üretilir ve
 * HTML'deki script etiketlerinde zaten bulunur; ek bir sır açığa çıkmaz.
 */
export function CspNonce({ nonce }: { readonly nonce: string | null }) {
  if (nonce) setNonce(nonce);
  return null;
}
