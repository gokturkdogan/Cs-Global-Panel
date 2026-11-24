import { redirect } from "next/navigation";

import { getCurrentStaff } from "@/server/auth/staff";

/** Kök adres: personel oturumu varsa panele, yoksa giriş ekranına (ARCHITECTURE §8). */
export default async function HomePage() {
  redirect((await getCurrentStaff()) !== null ? "/dashboard" : "/login");
}
