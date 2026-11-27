import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEARCH_QUERY_MAX_LENGTH } from "@/config/constants";
import { cn } from "@/lib/utils";

import type { ServiceListFilters, ServiceStatusFilter } from "../schemas";

const STATUS_LABELS: Record<ServiceStatusFilter, string> = {
  all: "Tümü",
  active: "Aktif",
  inactive: "Pasif",
};

function hrefFor(q: string, status: ServiceStatusFilter) {
  const params = new URLSearchParams();
  if (q !== "") params.set("q", q);
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query === "" ? "/dashboard/services" : `/dashboard/services?${query}`;
}

/** Arama (GET formu — JavaScript gerektirmez) + durum filtresi bağlantıları. */
export function ServiceFilters({ filters }: { readonly filters: ServiceListFilters }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <form role="search" action="/dashboard/services" className="flex w-full gap-2 md:max-w-md">
        {filters.status !== "all" ? (
          <input type="hidden" name="status" value={filters.status} />
        ) : null}
        <label htmlFor="service-search" className="sr-only">
          Hizmet adına göre ara
        </label>
        <Input
          id="service-search"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          placeholder="Hizmet adına göre ara"
          autoComplete="off"
        />
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" />
          Ara
        </Button>
      </form>
      <nav aria-label="Durum filtresi">
        <ul className="inline-flex rounded-lg border bg-card p-1">
          {(Object.keys(STATUS_LABELS) as ServiceStatusFilter[]).map((status) => {
            const active = filters.status === status;
            return (
              <li key={status}>
                <Link
                  prefetch={false}
                  href={hrefFor(filters.q, status)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                    active
                      ? "bg-primary-light text-primary-dark"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {STATUS_LABELS[status]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
