import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clock,
  Loader,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/config/statuses";

import { presentApplicationStatus } from "../domain/status-labels";

const ICONS = {
  AWAITING_DOCUMENTS: Clock,
  UNDER_REVIEW: Search,
  REVISION_REQUIRED: TriangleAlert,
  DOCUMENTS_APPROVED: CircleCheck,
  IN_PROCESS: Loader,
  COMPLETED: BadgeCheck,
  CANCELLED: CircleX,
} as const satisfies Record<ApplicationStatus, LucideIcon>;

/** Statü rozeti: metin + ikon + renk (renk tek başına anlam taşımaz — WCAG 1.4.1). */
export function ApplicationStatusBadge({ status }: { readonly status: ApplicationStatus }) {
  const { label, tone } = presentApplicationStatus(status);
  const Icon = ICONS[status];
  return (
    <Badge variant={tone} data-status={status}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
