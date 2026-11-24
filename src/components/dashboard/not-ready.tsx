import { Construction } from "lucide-react";

import { messages } from "@/lib/messages";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Henüz geliştirilmemiş modül sayfası: 404 veya sahte aksiyon yerine açık bilgilendirme. */
export function NotReadyPage({ title }: { readonly title: string }) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        breadcrumb={[{ label: "Panel", href: "/dashboard" }, { label: title }]}
      />
      <div className="rounded-xl border bg-card shadow-sm">
        <EmptyState
          icon={Construction}
          title={messages.dashboard.notReadyTitle}
          description={messages.dashboard.notReadyDescription}
        />
      </div>
    </div>
  );
}
