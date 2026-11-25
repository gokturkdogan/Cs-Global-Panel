import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "@/features/dashboard/components/dashboard-stats";
import { RecentApplications } from "@/features/dashboard/components/recent-applications";
import { ReviewQueue } from "@/features/dashboard/components/review-queue";
import { getDashboardOverview } from "@/features/dashboard/queries";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Genel Bakış | CS Global" };

/** Genel Bakış — iki hesap için aynı içerik (OD-24). Veri yalnızca runtime rolüyle okunur. */
export default async function DashboardOverviewPage() {
  await requireStaff();
  const result = await getDashboardOverview(getDb());

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Genel Bakış"
        description="Başvuru süreçlerinizi tek bir yerden takip edin."
        breadcrumb={[{ label: "Panel" }, { label: "Genel Bakış" }]}
        actions={
          <Button asChild size="lg">
            <Link href="/dashboard/applications/new">
              <Plus aria-hidden="true" />
              Yeni Başvuru
            </Link>
          </Button>
        }
      />
      {result.ok ? (
        <>
          <DashboardStats stats={result.data.stats} />
          <div className="grid gap-6 xl:grid-cols-3">
            <RecentApplications rows={result.data.recentApplications} />
            <ReviewQueue rows={result.data.reviewQueue} />
          </div>
        </>
      ) : (
        <ErrorState />
      )}
    </div>
  );
}
