import { HardDrive, TriangleAlert } from "lucide-react";

import { SectionCard } from "@/features/dashboard/components/section-card";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";
import type { StorageCapacity } from "@/server/storage/quota";

/**
 * Şirket paneli depolama kapasitesi (PHASE 08 §27, D-101). Yalnızca DB metadata'sından hesaplanır
 * (her render'da sağlayıcı çağrısı yok); sağlayıcı faturalama verisi değildir. 8 GB uyarı, 9 GB'da yeni
 * yükleme durur. Müşteri panelinde gösterilmez. İlerleme çubuğu SVG (satır içi stil yok — CSP).
 */
const gb = (bytes: number, digits = 2) =>
  `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(bytes / 1e9)} GB`;

export function StorageCapacityCard({ capacity }: { readonly capacity: StorageCapacity | null }) {
  if (capacity === null) {
    return (
      <SectionCard id="storage-title" title={messages.files.capacityTitle}>
        <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
          {messages.files.capacityUnavailable}
        </p>
      </SectionCard>
    );
  }
  const percent = Math.min(100, (capacity.total * 100) / capacity.maxTotalBytes);
  const percentLabel = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(percent);
  const tone =
    capacity.state === "full"
      ? "fill-destructive"
      : capacity.state === "warning"
        ? "fill-warning"
        : "fill-primary";
  return (
    <SectionCard
      id="storage-title"
      title={messages.files.capacityTitle}
      description={messages.files.capacityNote}
    >
      <div
        className="grid gap-3 px-4 py-4 sm:px-5"
        data-testid="storage-capacity"
        data-state={capacity.state}
      >
        <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
          <HardDrive aria-hidden="true" className="size-5 self-center text-primary" />
          {gb(capacity.total)}{" "}
          <span className="text-base font-normal text-muted-foreground">
            / {gb(capacity.maxTotalBytes, 0)}
          </span>
        </p>
        <div
          role="meter"
          aria-label="Depolama kullanımı"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={`%${percentLabel} kullanıldı`}
          className="h-3 overflow-hidden rounded-full bg-muted"
        >
          <svg aria-hidden="true" className="block h-full w-full">
            <rect width={`${percent}%`} height="100%" rx="6" className={tone} />
          </svg>
        </div>
        <p className="text-sm tabular-nums">
          %{percentLabel} kullanıldı · Kalan: {gb(capacity.remainingBytes)}
        </p>
        <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt>Aktif dosyalar</dt>
            <dd className="tabular-nums">{gb(capacity.active)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Önceki versiyonlar</dt>
            <dd className="tabular-nums">{gb(capacity.history)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Devam eden yüklemeler</dt>
            <dd className="tabular-nums">{gb(capacity.pending)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Temizlik bekleyen</dt>
            <dd className="tabular-nums">{gb(capacity.cleanup + capacity.untracked)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Sağlayıcı mutabakatı:{" "}
          {capacity.reconciledAt ? (
            <time dateTime={capacity.reconciledAt}>{formatDateTime(capacity.reconciledAt)}</time>
          ) : (
            "henüz yapılmadı (pnpm storage:reconcile)"
          )}
        </p>
        {capacity.state !== "ok" ? (
          <div
            role="alert"
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${capacity.state === "full" ? "border-destructive/40 bg-destructive-soft text-destructive-strong" : "border-warning/40 bg-warning-soft text-warning-strong"}`}
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {capacity.state === "full" ? (
                <>
                  <strong>{messages.files.quotaFullTitle}</strong> {messages.files.capacityFull}
                </>
              ) : (
                <>
                  <strong>{messages.files.capacityWarningTitle}</strong>{" "}
                  {messages.files.capacityWarning}
                </>
              )}
            </span>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
