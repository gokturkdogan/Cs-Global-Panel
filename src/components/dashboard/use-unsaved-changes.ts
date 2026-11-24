"use client";

import { useEffect } from "react";

/**
 * Kaydedilmemiş değişiklik varken sayfadan ayrılma/yenileme öncesi tarayıcı uyarısı.
 * Not: uygulama içi bağlantı gezinmesinde (Next.js Link) tarayıcı uyarısı tetiklenmez; formlar
 * bunun için görünür "Kaydedilmemiş değişiklikler var." göstergesi de içerir.
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
