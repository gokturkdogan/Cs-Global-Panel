import { CircleCheck, Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { RequirementList } from "@/features/services/components/requirement-list";
import { ServiceForm } from "@/features/services/components/service-form";
import { ServiceStatusCard } from "@/features/services/components/service-status-card";
import { getServiceDetail, type ServiceDetail } from "@/features/services/queries";
import { formatDateTime } from "@/lib/format";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Hizmet Düzenle | CS Global" };

type PageProps = {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);

/** Hizmet detayı: genel bilgiler, durum, evrak gereksinimleri. Geçersiz/bilinmeyen kimlik → 404. */
export default async function ServiceDetailPage({ params, searchParams }: PageProps) {
  await requireStaff();
  const { serviceId } = await params;
  if (!z.uuid().safeParse(serviceId).success) notFound();
  const created = (await searchParams).created === "1";

  let service: ServiceDetail | null;
  try {
    service = await getServiceDetail(getDb(), serviceId);
  } catch (error) {
    console.error("[services] Hizmet detayı okunamadı", { code: pgErrorCode(error) ?? "unknown" });
    return (
      <div className="grid gap-6">
        <PageHeader
          title="Hizmet"
          breadcrumb={[
            { label: "Panel", href: "/dashboard" },
            { label: "Hizmetler", href: "/dashboard/services" },
            { label: "Hizmet" },
          ]}
        />
        <ErrorState />
      </div>
    );
  }
  if (service === null) notFound();

  const activeRequirementCount = service.requirements.filter((item) => item.isActive).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={service.name}
        description={`Son güncelleme: ${formatDateTime(service.updatedAt)}`}
        breadcrumb={[
          { label: "Panel", href: "/dashboard" },
          { label: "Hizmetler", href: "/dashboard/services" },
          { label: service.name },
        ]}
      />
      {created ? (
        <div role="status">
          <Alert variant="info" role="presentation">
            <CircleCheck aria-hidden="true" />
            <AlertDescription className="text-primary-dark">
              {messages.services.created}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <Alert variant="info" role="note">
        <Info aria-hidden="true" />
        <AlertDescription className="text-primary-dark">
          {messages.services.snapshotNotice}
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="service-general-title"
          className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
        >
          <h2
            id="service-general-title"
            className="text-lg leading-7 font-semibold text-foreground"
          >
            Genel bilgiler
          </h2>
          <ServiceForm
            mode="edit"
            serviceId={service.id}
            version={service.version}
            initial={{ name: service.name, description: service.description }}
          />
        </section>
        <div className="grid content-start gap-6">
          <ServiceStatusCard
            serviceId={service.id}
            serviceName={service.name}
            isActive={service.isActive}
            version={service.version}
            activeRequirementCount={activeRequirementCount}
          />
          <section
            aria-labelledby="file-policy-title"
            className="grid gap-2 rounded-xl border bg-card p-4 text-sm shadow-sm sm:p-5"
          >
            <h2 id="file-policy-title" className="text-base font-semibold text-foreground">
              Dosya kuralları (sabit)
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Yalnızca PDF</li>
              <li>Dosya başına en fazla {MAX_PDF_MB} MB</li>
              <li>Her evrak için tek aktif dosya</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Bu kurallar tüm hizmetler için geçerlidir ve panelden değiştirilemez.
            </p>
          </section>
        </div>
      </div>

      <RequirementList serviceId={service.id} requirements={service.requirements} />
    </div>
  );
}
