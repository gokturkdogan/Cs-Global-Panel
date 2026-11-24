import { CircleCheck, CircleMinus, CircleDot, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Aktif/Pasif rozeti (metin + ikon + renk). Hizmet ve evrak şablonu ortak. */
export function ActiveStatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" />
      Aktif
    </Badge>
  ) : (
    <Badge variant="neutral">
      <CircleMinus aria-hidden="true" />
      Pasif
    </Badge>
  );
}

/** Zorunlu / İsteğe bağlı rozeti. */
export function RequiredBadge({ isRequired }: { readonly isRequired: boolean }) {
  return isRequired ? (
    <Badge variant="info">
      <CircleDot aria-hidden="true" />
      Zorunlu
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleDashed aria-hidden="true" />
      İsteğe bağlı
    </Badge>
  );
}
