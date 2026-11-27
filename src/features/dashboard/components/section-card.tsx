import Link from "next/link";
import type { ReactNode } from "react";

/** Başlıklı panel bölümü (`section` + `h2`). */
export function SectionCard({
  id,
  title,
  description,
  children,
  className,
  link,
}: {
  readonly link?: { readonly href: string; readonly label: string };
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`min-w-0 rounded-xl border bg-card shadow-sm ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-4 sm:px-5">
        <div className="grid gap-0.5">
          <h2 id={id} className="text-lg leading-7 font-semibold text-foreground">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {link ? (
          <Link
            prefetch={false}
            href={link.href}
            className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
