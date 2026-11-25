import { Skeleton } from "@/components/dashboard/loading-skeleton";

export default function PortalLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-5" data-portal-state="loading">
      <span className="sr-only">Başvurunuz yükleniyor…</span>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
