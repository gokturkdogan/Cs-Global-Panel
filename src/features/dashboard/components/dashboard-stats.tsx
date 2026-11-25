import { CircleCheck, FileText, Hourglass, Search } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";

import type { DashboardStats as Stats } from "../domain";

/** Dört sayaç (D-070 tanımları). */
export function DashboardStats({ stats }: { readonly stats: Stats }) {
  return (
    <section aria-label="Başvuru özetleri">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-stats">
        <StatCard
          label="Toplam Başvuru"
          value={stats.total}
          description="Tüm başvurular"
          icon={FileText}
          href="/dashboard/applications"
        />
        <StatCard
          label="Evrak Bekleyen"
          value={stats.awaitingDocuments}
          description="Evrak veya düzeltme bekleniyor"
          icon={Hourglass}
          iconClassName="bg-warning-soft text-warning-strong"
        />
        <StatCard
          label="İncelemede"
          value={stats.underReview}
          description="Ekip incelemesinde"
          icon={Search}
          href="/dashboard/applications?status=UNDER_REVIEW"
        />
        <StatCard
          label="Tamamlanan"
          value={stats.completed}
          description="Süreci tamamlanan"
          icon={CircleCheck}
          href="/dashboard/applications?status=COMPLETED"
          iconClassName="bg-success-soft text-success-strong"
        />
      </div>
    </section>
  );
}
