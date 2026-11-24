"use client";

import { ErrorState } from "@/components/dashboard/error-state";

/** Beklenmeyen render hatası: Türkçe genel mesaj; hata ayrıntısı/digest gösterilmez. */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
