"use client";

import { ChevronLeft, ChevronRight, FileText, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEARCH_QUERY_MAX_LENGTH } from "@/config/constants";
import { messages } from "@/lib/messages";

import { searchApplicationsAction } from "../actions";
import { APPLICATION_STATUS_PRESENTATION } from "../domain/status-labels";
import type { ApplicationList, ServiceOption } from "../queries";
import {
  APPLICATION_PAGE_SIZES,
  APPLICATION_STATUS_FILTERS,
  type ApplicationListFilters,
} from "../schemas";
import { ApplicationTable } from "./application-table";

type Props = {
  readonly initial: ApplicationList;
  readonly filters: ApplicationListFilters;
  readonly services: readonly ServiceOption[];
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

/**
 * Başvuru listesi tarayıcısı. Kişisel veri içermeyen filtreler (durum, hizmet, sayfa, sayfa boyutu)
 * URL'de; ad/telefon/e-posta içerebilen ARAMA metni URL'ye yazılmaz — Server Action gövdesiyle
 * gönderilir (tarayıcı geçmişi ve erişim loglarına sızmaz). Arama sonucu sayfa yenilenince sıfırlanır.
 * Sayfa, URL filtreleri değişince bileşeni `key` ile yeniden kurar (geri/ileri gezinmesi tutarlı).
 */
export function ApplicationsBrowser({ initial, filters, services }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ApplicationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(filters);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);

  const result = activeQuery !== "" && searchResult !== null ? searchResult : initial;

  function urlFor(next: ApplicationListFilters) {
    const params = new URLSearchParams();
    if (next.status !== "ALL") params.set("status", next.status);
    if (next.serviceId !== "") params.set("serviceId", next.serviceId);
    if (next.page !== 1) params.set("page", String(next.page));
    if (next.pageSize !== 20) params.set("pageSize", String(next.pageSize));
    const value = params.toString();
    return value === "" ? "/dashboard/applications" : `/dashboard/applications?${value}`;
  }

  function load(next: ApplicationListFilters, q = activeQuery) {
    setCurrent(next);
    setError(null);
    if (q === "") {
      startTransition(() => router.push(urlFor(next)));
      return;
    }
    const id = ++request.current;
    startTransition(async () => {
      const response = await searchApplicationsAction({ q, ...next });
      if (id !== request.current) return; // daha yeni bir istek var
      if (response.ok) setSearchResult(response.data);
      else setError(response.error.message);
      // Arama modunda URL değiştirilmez (bileşen sıfırlanmasın; arama metni zaten URL'de değil).
    });
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    setActiveQuery(q);
    if (q === "") setSearchResult(null);
    load({ ...current, page: 1 }, q);
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery("");
    setSearchResult(null);
    load({ ...current, page: 1 }, "");
  }

  const filtered = activeQuery !== "" || current.status !== "ALL" || current.serviceId !== "";

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <form role="search" onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="application-search" className="sr-only">
            Başvuru ara
          </label>
          <Input
            id="application-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder="Başvuru no, ad soyad, telefon veya e-posta"
            autoComplete="off"
            aria-describedby="application-search-hint"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={pending}
              className="flex-1 sm:flex-none"
            >
              <Search aria-hidden="true" />
              Ara
            </Button>
            {activeQuery !== "" ? (
              <Button type="button" variant="ghost" onClick={clearSearch} disabled={pending}>
                <X aria-hidden="true" />
                Temizle
              </Button>
            ) : null}
          </div>
        </form>
        <p id="application-search-hint" className="text-xs text-muted-foreground">
          Arama metni adres çubuğuna yazılmaz; sayfa yenilenince arama sıfırlanır.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <label htmlFor="filter-status" className="text-sm font-medium">
              Durum
            </label>
            <select
              id="filter-status"
              className={selectClass}
              value={current.status}
              disabled={pending}
              onChange={(event) =>
                load({
                  ...current,
                  status: event.target.value as ApplicationListFilters["status"],
                  page: 1,
                })
              }
            >
              {APPLICATION_STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === "ALL"
                    ? "Tüm durumlar"
                    : APPLICATION_STATUS_PRESENTATION[status].label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="filter-service" className="text-sm font-medium">
              Hizmet
            </label>
            <select
              id="filter-service"
              className={selectClass}
              value={current.serviceId}
              disabled={pending}
              onChange={(event) => load({ ...current, serviceId: event.target.value, page: 1 })}
            >
              <option value="">Tüm hizmetler</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.isActive ? service.name : `${service.name} (pasif)`}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="filter-page-size" className="text-sm font-medium">
              Sayfa başına
            </label>
            <select
              id="filter-page-size"
              className={selectClass}
              value={current.pageSize}
              disabled={pending}
              onChange={(event) =>
                load({
                  ...current,
                  pageSize: Number(event.target.value) as ApplicationListFilters["pageSize"],
                  page: 1,
                })
              }
            >
              {APPLICATION_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section
        aria-label="Başvuru listesi"
        aria-busy={pending}
        className="min-w-0 rounded-xl border bg-card shadow-sm"
      >
        {error ? (
          <p role="alert" className="px-4 py-6 text-center text-sm text-destructive-strong">
            {error}
          </p>
        ) : result.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title={messages.applications.noResults} />
          ) : (
            <EmptyState
              icon={FileText}
              title={messages.applications.emptyTitle}
              description={messages.applications.emptyDescription}
              action={
                <Button asChild>
                  <Link href="/dashboard/applications/new">Yeni Başvuru</Link>
                </Button>
              }
            />
          )
        ) : (
          <ApplicationTable items={result.items} />
        )}
        <nav
          aria-label="Sayfalama"
          className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
        >
          <p className="text-muted-foreground tabular-nums" data-testid="pagination-summary">
            {result.total} kayıt · Sayfa {result.page} / {result.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={pending || result.page <= 1}
              onClick={() => load({ ...current, page: result.page - 1 })}
            >
              <ChevronLeft aria-hidden="true" />
              Önceki
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={pending || result.page >= result.pageCount}
              onClick={() => load({ ...current, page: result.page + 1 })}
            >
              Sonraki
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </section>
    </div>
  );
}
