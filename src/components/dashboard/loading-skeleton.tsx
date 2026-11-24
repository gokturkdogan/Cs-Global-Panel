import { cn } from "@/lib/utils";

/** Yer tutucu blok; reduced-motion'da animasyon global kuralla kapanır. */
export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Sayfa yüklenirken iskelet; ekran okuyucuya "yükleniyor" bildirilir. */
export function LoadingSkeleton({ label = "Yükleniyor…" }: { readonly label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-6" data-state="loading">
      <span className="sr-only">{label}</span>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl xl:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
