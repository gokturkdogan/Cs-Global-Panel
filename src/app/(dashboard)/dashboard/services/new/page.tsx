import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { ServiceForm } from "@/features/services/components/service-form";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Yeni Hizmet | CS Global" };

export default async function NewServicePage() {
  await requireStaff();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Yeni Hizmet"
        description="Hizmeti oluşturduktan sonra evrak gereksinimlerini ekleyebilirsiniz."
        breadcrumb={[
          { label: "Panel", href: "/dashboard" },
          { label: "Hizmetler", href: "/dashboard/services" },
          { label: "Yeni Hizmet" },
        ]}
      />
      <section
        aria-label="Hizmet bilgileri"
        className="max-w-3xl rounded-xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <ServiceForm mode="create" />
      </section>
    </div>
  );
}
