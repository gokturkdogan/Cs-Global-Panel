"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Geçici hatada güvenli tekrar deneme: aynı sayfayı sunucudan yeniden ister. */
export function ReloadButton() {
  return (
    <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
      <RefreshCw aria-hidden="true" />
      Tekrar dene
    </Button>
  );
}
