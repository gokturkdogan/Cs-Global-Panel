import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";

type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly breadcrumb: readonly BreadcrumbItem[];
  readonly actions?: ReactNode;
};

/** Sayfa üst bölümü: konum yolu + tek `h1` + açıklama + (varsa) aksiyonlar. */
export function PageHeader({ title, description, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="grid gap-4">
      <Breadcrumb items={breadcrumb} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl leading-8 font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
