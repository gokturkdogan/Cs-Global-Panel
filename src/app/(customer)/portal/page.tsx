import { AccessMessage } from "@/features/customer-portal/components/access-message";

/** Bağlamsız `/portal`: hiçbir oturuma otomatik yönlendirmez; bağlantının yeniden açılmasını ister. */
export default function PortalWithoutContext() {
  return <AccessMessage kind="expired" />;
}
