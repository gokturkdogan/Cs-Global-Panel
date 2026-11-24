import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
};

/** Boş durum: ikon (dekoratif) + başlık + açıklama + (varsa) aksiyon. Hata durumundan ayrıdır. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      data-state="empty"
      className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-1 inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-5" />
      </span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
