import {
  CircleCheck,
  CircleDashed,
  FileCheck2,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/config/statuses";

import { DOCUMENT_STATUS_PRESENTATION } from "../domain/document-status-labels";

const ICONS = {
  NOT_UPLOADED: CircleDashed,
  UPLOADED: FileCheck2,
  PENDING_REVIEW: Search,
  APPROVED: CircleCheck,
  REVISION_REQUIRED: TriangleAlert,
} as const satisfies Record<DocumentStatus, LucideIcon>;

export function DocumentStatusBadge({ status }: { readonly status: DocumentStatus }) {
  const { label, tone } = DOCUMENT_STATUS_PRESENTATION[status];
  const Icon = ICONS[status];
  return (
    <Badge variant={tone} data-document-status={status}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
