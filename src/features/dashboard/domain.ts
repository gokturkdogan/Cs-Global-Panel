import type { ApplicationStatus } from "@/config/statuses";

/**
 * Genel Bakış sayaçlarının tanımları (D-070). Silme talebi verilmiş başvurular (BR-153: anında
 * erişilemez) hiçbir sayaca ve listeye girmez.
 */
export const DASHBOARD_STAT_STATUSES = {
  /** Müşteriden evrak beklenen başvurular: ilk yükleme + düzeltme bekleyenler. */
  awaitingDocuments: ["AWAITING_DOCUMENTS", "REVISION_REQUIRED"],
  underReview: ["UNDER_REVIEW"],
  completed: ["COMPLETED"],
} as const satisfies Record<string, readonly ApplicationStatus[]>;

export const DASHBOARD_RECENT_LIMIT = 5;
export const DASHBOARD_REVIEW_QUEUE_LIMIT = 5;

export type DashboardStats = {
  readonly total: number;
  readonly awaitingDocuments: number;
  readonly underReview: number;
  readonly completed: number;
};

/** İstemciye giden satır DTO'su: telefon, e-posta, token, iç not, kimlik YOK. */
export type DashboardApplicationRow = {
  readonly applicationNumber: string;
  readonly customerName: string;
  readonly serviceName: string;
  readonly status: ApplicationStatus;
  /** ISO 8601 (UTC). */
  readonly createdAt: string;
};

export type DashboardReviewRow = Omit<DashboardApplicationRow, "status" | "createdAt"> & {
  /** İncelemeye alındığı an (statü değişim zamanı), ISO 8601 (UTC). */
  readonly waitingSince: string;
};

export type DashboardOverview = {
  readonly stats: DashboardStats;
  readonly recentApplications: readonly DashboardApplicationRow[];
  readonly reviewQueue: readonly DashboardReviewRow[];
};
