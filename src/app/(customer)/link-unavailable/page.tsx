import { AccessMessage } from "@/features/customer-portal/components/access-message";

/** Geçici sistem hatası (veritabanı/yapılandırma) — geçersiz bağlantı olarak gösterilmez. */
export default function LinkUnavailablePage() {
  return <AccessMessage kind="unavailable" />;
}
