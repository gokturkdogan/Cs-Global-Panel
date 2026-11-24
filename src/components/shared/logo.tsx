import { company } from "@/config/company";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** Logonun altında "Vize Danışmanlık" açıklamasını gösterir. */
  withTagline?: boolean;
  className?: string;
};

/**
 * Geçici metin logo (OD-15, BR-172). Gerçek kurumsal logo sağlandığında yalnızca
 * bu bileşen değişir. Metin "CS Global" olarak kalır; büyük harf görünümü CSS ile
 * verilir, böylece ekran okuyucular adı doğru okur.
 */
export function Logo({ withTagline = false, className }: LogoProps) {
  return (
    <div className={cn("inline-flex flex-col leading-none", className)}>
      <span className="text-xl font-semibold tracking-wide text-primary-dark uppercase">
        {company.name}
      </span>
      {withTagline ? (
        <span className="mt-1 text-xs font-medium tracking-wide text-muted-foreground">
          {company.tagline}
        </span>
      ) : null}
    </div>
  );
}
