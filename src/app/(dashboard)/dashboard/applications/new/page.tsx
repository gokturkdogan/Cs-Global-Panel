import type { Metadata } from "next";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ApplicationCreateForm } from "@/features/applications/components/application-create-form";
import { listServiceOptions, type ServiceOption } from "@/features/applications/queries";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

export const metadata: Metadata = { title: "Yeni Başvuru | CS Global" };

/** Yeni başvuru: yalnızca aktif hizmetler seçilebilir (sunucu ayrıca doğrular — BR-21). */
export default async function NewApplicationPage() {
  await requireStaff();
  let services: ServiceOption[] | null = null;
  try {
    services = (await listServiceOptions(getDb())).filter((service) => service.isActive);
  } catch (error) {
    console.error("[applications] Hizmet listesi okunamadı", {
      code: pgErrorCode(error) ?? "unknown",
    });
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Yeni Başvuru"
        description="Müşteri bilgilerini girin ve hizmeti seçin. Başvuru numarası ve müşteri bağlantısı otomatik oluşturulur."
        breadcrumb={[
          { label: "Panel", href: "/dashboard" },
          { label: "Başvurular", href: "/dashboard/applications" },
          { label: "Yeni Başvuru" },
        ]}
      />
      {services === null ? <ErrorState /> : <ApplicationCreateForm services={services} />}
    </div>
  );
}
