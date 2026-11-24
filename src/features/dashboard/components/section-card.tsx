import type { ReactNode } from "react";

/** Başlıklı panel bölümü (`section` + `h2`). */
export function SectionCard({
  id,
  title,
  description,
  children,
  className,
}: {
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
      <div className="border-b px-4 py-4 sm:px-5">
        <h2 id={id} className="text-lg leading-7 font-semibold text-foreground">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
