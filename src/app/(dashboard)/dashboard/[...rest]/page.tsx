import { notFound } from "next/navigation";

import { requireStaff } from "@/server/auth/staff";

/** Panel içindeki tanımsız yollar: oturum kontrolünden sonra panel düzeninde 404 gösterilir. */
export default async function DashboardCatchAll() {
  await requireStaff();
  notFound();
}
