import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ApplicationsBrowser } from "@/features/applications/components/applications-browser";
import { listApplications, listServiceOptions } from "@/features/applications/queries";
import { applicationListFiltersSchema } from "@/features/applications/schemas";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Başvurular | CS Global" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** Başvuru listesi — iki hesap için aynı (OD-24). Arama metni URL'de değil (bkz. ApplicationsBrowser). */
export default async function ApplicationsPage({ searchParams }: PageProps) {
  await requireStaff();
  const raw = await searchParams;
  const filters = applicationListFiltersSchema.parse({
    status: single(raw.status),
    serviceId: single(raw.serviceId),
    page: single(raw.page),
    pageSize: single(raw.pageSize),
  });

  let data: Awaited<ReturnType<typeof listApplications>> | null = null;
  let services: Awaited<ReturnType<typeof listServiceOptions>> = [];
  try {
    const db = getDb();
    [data, services] = [
      await listApplications(db, { ...filters, q: "" }),
      await listServiceOptions(db),
    ];
  } catch (error) {
    console.error("[applications] Liste okunamadı", { code: pgErrorCode(error) ?? "unknown" });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Başvurular"
        description="Tüm müşteri başvurularınızı yönetin."
        breadcrumb={[{ label: "Panel", href: "/dashboard" }, { label: "Başvurular" }]}
        actions={
          <Button asChild size="lg">
            <Link href="/dashboard/applications/new">
              <Plus aria-hidden="true" />
              Yeni Başvuru
            </Link>
          </Button>
        }
      />
      {data === null ? (
        <ErrorState />
      ) : (
        <ApplicationsBrowser
          key={JSON.stringify(filters)}
          initial={data}
          filters={filters}
          services={services}
        />
      )}
    </div>
  );
}
