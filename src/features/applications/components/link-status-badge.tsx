import { Link2, Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Müşteri bağlantısı durumu — başvuru statüsünden bağımsızdır. */
export function LinkStatusBadge({ active }: { readonly active: boolean }) {
  return active ? (
    <Badge variant="success" data-link-status="active">
      <Link2 aria-hidden="true" />
      Bağlantı aktif
    </Badge>
  ) : (
    <Badge variant="neutral" data-link-status="none">
      <Link2Off aria-hidden="true" />
      Bağlantı yok
    </Badge>
  );
}
