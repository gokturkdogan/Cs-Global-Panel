import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** `aria-describedby` değeri: yardım metni ve hata kimlikleri. */
export function describedBy(id: string, options: { hint?: boolean; error?: string }) {
  const ids = [options.hint ? `${id}-hint` : null, options.error ? `${id}-error` : null].filter(
    (value): value is string => value !== null,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type FormFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly counter?: { readonly length: number; readonly max: number };
  readonly children: ReactNode;
  readonly className?: string;
};

/** Etiket + alan + yardım + hata (hata `aria-describedby` ile bağlanır; renk tek başına değil). */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  counter,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required ? (
            <span className="text-destructive-strong" aria-hidden="true">
              {" "}
              *
            </span>
          ) : (
            <span className="font-normal text-muted-foreground"> (isteğe bağlı)</span>
          )}
        </label>
        {counter ? (
          <span className="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
            {counter.length}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
