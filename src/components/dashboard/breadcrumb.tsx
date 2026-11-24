import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export type BreadcrumbItem = { readonly label: string; readonly href?: string };

/** Konum yolu: son öğe geçerli sayfadır (`aria-current="page"`, bağlantı değil). */
export function Breadcrumb({ items }: { readonly items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Konum" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="min-w-0">
                {last || item.href === undefined ? (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "font-medium text-foreground" : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true">
                  <ChevronRight className="size-4" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
