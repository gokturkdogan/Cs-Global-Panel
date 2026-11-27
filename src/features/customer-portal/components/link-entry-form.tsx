"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/**
 * D-141: bağlantıyı oturuma çeviren AÇIK kullanıcı eylemi. Yerel form POST'u (JavaScript olmadan da
 * çalışır); otomatik gönderim, `useEffect` ile oturum değişimi veya istemci depolaması yoktur. Bekleme
 * durumu gerçek gezinmeye bağlıdır; ikinci tıklama yeni istek göndermez. Geri tuşuyla önbellekten dönülürse
 * (bfcache) düğme yeniden etkinleşir — oturum değişimi yine yalnızca yeni bir tıklamayla olur.
 */
export function LinkEntryForm({ token }: { readonly token: string }) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      method="post"
      action="/b/enter"
      className="w-full sm:w-auto"
      onSubmit={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
    >
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" className="w-full sm:w-auto" aria-disabled={pending}>
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
        {pending ? messages.portal.entryPending : messages.portal.entryButton}
      </Button>
    </form>
  );
}
