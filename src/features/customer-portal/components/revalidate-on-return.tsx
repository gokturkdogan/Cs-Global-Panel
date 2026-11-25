"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Sekmeye geri dönüldüğünde ve geri/ileri önbelleğinden (bfcache) geri yüklendiğinde sayfayı
 * sunucuda yeniden doğrular (TM-40, D-090): bu arada aynı tarayıcıda başka bir başvuru açıldıysa
 * veya bağlantı iptal edildiyse eski içerik yerine uygun uyarı gösterilir.
 */
export function RevalidateOnReturn() {
  const router = useRouter();
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  return null;
}
