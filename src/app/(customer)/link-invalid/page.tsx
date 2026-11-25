import { AccessMessage } from "@/features/customer-portal/components/access-message";

/** Genel geçersiz bağlantı ekranı: geçersiz/bilinmeyen/iptal/yenilenmiş/silinmekte ayrımı yapılmaz. */
export default function LinkInvalidPage() {
  return <AccessMessage kind="invalid" />;
}
