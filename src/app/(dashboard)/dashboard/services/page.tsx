import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ServiceFilters } from "@/features/services/components/service-filters";
import { ServiceList } from "@/features/services/components/service-list";
import { listServices, type ServiceList as ServiceListData } from "@/features/services/queries";
import { serviceListFiltersSchema } from "@/features/services/schemas";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Hizmetler | CS Global" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Hizmet listesi — iki hesap için aynı (OD-24). Veritabanı hatası boş liste olarak gösterilmez. */
export default async function ServicesPage({ searchParams }: PageProps) {
  await requireStaff();
  const raw = await searchParams;
  const filters = serviceListFiltersSchema.parse({
    q: typeof raw.q === "string" ? raw.q : "",
    status: typeof raw.status === "string" ? raw.status : "all",
  });

  let data: ServiceListData | null = null;
  try {
    data = await listServices(getDb(), filters);
  } catch (error) {
    console.error("[services] Hizmet listesi okunamadı", { code: pgErrorCode(error) ?? "unknown" });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Hizmetler"
        description="Vize hizmetlerini ve evrak gereksinimlerini yönetin."
        breadcrumb={[{ label: "Panel", href: "/dashboard" }, { label: "Hizmetler" }]}
        actions={
          <Button asChild size="lg">
            <Link prefetch={false} href="/dashboard/services/new">
              <Plus aria-hidden="true" />
              Yeni Hizmet
            </Link>
          </Button>
        }
      />
      <ServiceFilters filters={filters} />
      {data === null ? (
        <ErrorState />
      ) : (
        <section
          aria-label="Hizmet listesi"
          className="min-w-0 rounded-xl border bg-card shadow-sm"
        >
          <ServiceList data={data} />
        </section>
      )}
    </div>
  );
}
