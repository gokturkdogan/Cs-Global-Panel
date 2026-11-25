import { Info } from "lucide-react";

import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import { CUSTOMER_STATUS_MESSAGE } from "../domain/progress";
import type { CustomerPortalView } from "../queries";

/** Karşılama + başvuru özeti (salt okunur). Hizmet adı başvuru anındaki snapshot'tır. */
export function WelcomeCard({ view }: { readonly view: CustomerPortalView }) {
  const { application, customer } = view;
  return (
    <section
      aria-labelledby="welcome-title"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="grid gap-1">
        <h1
          id="welcome-title"
          className="text-2xl leading-8 font-semibold wrap-anywhere text-foreground"
        >
          Merhaba, {customer.firstName} {customer.lastName}
        </h1>
        <p className="text-base text-muted-foreground">Başvuru takip panelinize hoş geldiniz.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2" data-testid="portal-summary">
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">Başvuru No</dt>
          <dd className="text-base font-semibold tabular-nums">{application.number}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">Durum</dt>
          <dd>
            <ApplicationStatusBadge status={application.status} />
          </dd>
        </div>
        <div className="grid gap-0.5 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">Hizmet</dt>
          <dd className="text-base font-medium wrap-anywhere">{application.serviceName}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-sm text-muted-foreground">Oluşturulma tarihi</dt>
          <dd className="text-base tabular-nums">
            <time dateTime={application.createdAt}>{formatDateTime(application.createdAt)}</time>
          </dd>
        </div>
      </dl>
      <p
        role="note"
        className="flex items-start gap-2 rounded-lg bg-primary-light p-3 text-base text-primary-dark"
        data-testid="portal-status-message"
      >
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          {CUSTOMER_STATUS_MESSAGE[application.status]}
          {application.status === "COMPLETED" ? ` (${messages.portal.completedNote})` : null}
        </span>
      </p>
    </section>
  );
}
