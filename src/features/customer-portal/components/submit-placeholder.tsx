import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/** "İncelemeye Gönder" PHASE 09'a kadar pasif: statü değiştirmez, eksik evrakı yüklenmiş saymaz. */
export function SubmitPlaceholder() {
  return (
    <section
      aria-labelledby="submit-title"
      className="grid gap-2 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 id="submit-title" className="text-lg leading-7 font-semibold">
        İncelemeye gönder
      </h2>
      <p className="text-base text-muted-foreground">
        Evraklarınızı tamamladıktan sonra incelemeye gönderebileceksiniz.
      </p>
      <Button size="lg" disabled aria-describedby="submit-soon" className="w-full">
        <Send aria-hidden="true" />
        İncelemeye Gönder
      </Button>
      <p id="submit-soon" className="text-sm text-muted-foreground">
        {messages.portal.submitSoon}
      </p>
    </section>
  );
}
