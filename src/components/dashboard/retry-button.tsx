"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/** Sunucu bileşenlerini yeniden çalıştırır (`router.refresh`); hata sınırında `reset` de verilebilir. */
export function RetryButton({ onRetry }: { readonly onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          onRetry?.();
        })
      }
    >
      <RefreshCw aria-hidden="true" />
      {pending ? "Yükleniyor…" : "Tekrar dene"}
    </Button>
  );
}
