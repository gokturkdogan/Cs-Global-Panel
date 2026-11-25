import { Clock, Link2Off, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";

import { messages } from "@/lib/messages";

import { ContactCard } from "./contact-card";
import { ReloadButton } from "./reload-button";

export type AccessMessageKind = "invalid" | "expired" | "context_mismatch" | "unavailable";

const COPY: Record<AccessMessageKind, { title: string; description: string; icon: LucideIcon }> = {
  invalid: {
    title: messages.portal.invalidTitle,
    description: messages.portal.invalidDescription,
    icon: Link2Off,
  },
  expired: {
    title: messages.portal.expiredTitle,
    description: messages.portal.expiredDescription,
    icon: Clock,
  },
  context_mismatch: {
    title: messages.portal.contextTitle,
    description: messages.portal.contextDescription,
    icon: RefreshCw,
  },
  unavailable: {
    title: messages.portal.unavailableTitle,
    description: messages.portal.unavailableDescription,
    icon: TriangleAlert,
  },
};

/** Erişim yoksa gösterilen genel ekran: başvuru/müşteri bilgisi, token veya hata ayrıntısı içermez. */
export function AccessMessage({ kind }: { readonly kind: AccessMessageKind }) {
  const { title, description, icon: Icon } = COPY[kind];
  return (
    <div className="grid gap-5" data-portal-state={kind}>
      <section className="grid justify-items-center gap-3 rounded-xl border bg-card px-5 py-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="inline-flex size-12 items-center justify-center rounded-full bg-primary-light text-primary-dark"
        >
          <Icon className="size-6" />
        </span>
        <h1 className="text-2xl leading-8 font-semibold text-foreground">{title}</h1>
        <p className="max-w-md text-base text-muted-foreground">{description}</p>
        {kind === "unavailable" ? <ReloadButton /> : null}
      </section>
      <ContactCard />
    </div>
  );
}
