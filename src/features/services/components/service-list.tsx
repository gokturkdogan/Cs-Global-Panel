import { Briefcase, SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { SERVICE_LIST_LIMIT } from "@/config/constants";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";

import type { ServiceList as ServiceListData } from "../queries";
import { ActiveStatusBadge } from "./status-badges";

/** Hizmet listesi: ≥768px tablo, altında kart listesi. Boş katalog ve "sonuç yok" ayrıdır. */
export function ServiceList({ data }: { readonly data: ServiceListData }) {
  if (data.items.length === 0) {
    return data.catalogEmpty ? (
      <EmptyState
        icon={Briefcase}
        title={messages.services.emptyTitle}
        description={messages.services.emptyDescription}
        action={
          <Button asChild>
            <Link prefetch={false} href="/dashboard/services/new">
              Yeni Hizmet
            </Link>
          </Button>
        }
      />
    ) : (
      <EmptyState icon={SearchX} title={messages.services.noResults} />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm" data-testid="services-table">
          <caption className="sr-only">Hizmetler</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">
                Hizmet
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Aktif evrak
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Zorunlu evrak
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Durum
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Son güncelleme
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                <span className="sr-only">İşlem</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="max-w-md px-5 py-3">
                  <span className="block font-medium wrap-anywhere text-foreground">
                    {item.name}
                  </span>
                  {item.description ? (
                    <span className="line-clamp-1 text-muted-foreground">{item.description}</span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{item.activeRequirementCount}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {item.requiredRequirementCount}
                </td>
                <td className="px-5 py-3">
                  <ActiveStatusBadge isActive={item.isActive} />
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                  <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
                </td>
                <td className="px-5 py-3 text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      prefetch={false}
                      href={`/dashboard/services/${item.id}`}
                      aria-label={`${item.name} hizmetini düzenle`}
                    >
                      Düzenle
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden" data-testid="services-list">
        {data.items.map((item) => (
          <li key={item.id} className="grid gap-2 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium wrap-anywhere text-foreground">{item.name}</span>
              <ActiveStatusBadge isActive={item.isActive} />
            </div>
            {item.description ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground tabular-nums">
              {item.activeRequirementCount} aktif evrak · {item.requiredRequirementCount} zorunlu
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Son güncelleme:{" "}
              <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
            </p>
            <Button asChild variant="outline" className="mt-1 h-11 w-full">
              <Link
                prefetch={false}
                href={`/dashboard/services/${item.id}`}
                aria-label={`${item.name} hizmetini düzenle`}
              >
                Düzenle
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      {data.truncated ? (
        <p className="border-t px-5 py-3 text-sm text-muted-foreground" role="note">
          İlk {SERVICE_LIST_LIMIT} hizmet gösteriliyor. Daha fazlası için aramayı daraltın.
        </p>
      ) : null}
    </>
  );
}
