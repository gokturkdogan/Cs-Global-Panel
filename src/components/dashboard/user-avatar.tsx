import { initialOf } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Kullanıcı adının baş harfiyle avatar (dekoratif; ad yanında metin olarak da gösterilir). */
export function UserAvatar({ username, className }: { username: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary-dark",
        className,
      )}
    >
      {initialOf(username)}
    </span>
  );
}
