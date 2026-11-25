"use client";

import { AccessMessage } from "@/features/customer-portal/components/access-message";

/** Beklenmeyen hata: genel "şu anda erişilemiyor" ekranı; ayrıntı/digest gösterilmez. */
export default function PortalError() {
  return <AccessMessage kind="unavailable" />;
}
