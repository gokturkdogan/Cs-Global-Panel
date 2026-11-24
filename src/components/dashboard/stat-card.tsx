import type { LucideIcon } from "lucide-react";

import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatCardProps = {
  readonly label: string;
  readonly value: number;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly iconClassName?: string;
};

/** Sayaç kartı: etiket + sayı + açıklama metin olarak; ikon dekoratif. */
export function StatCard({ label, value, description, icon: Icon, iconClassName }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-lg bg-primary-light text-primary",
            iconClassName,
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-2 text-3xl leading-9 font-bold text-foreground tabular-nums">
        {formatCount(value)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
