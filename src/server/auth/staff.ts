import "server-only";

import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { STAFF_ROLES, type StaffRole } from "@/config/statuses";

import { getAuth } from "./auth";

/**
 * Ortak personel erişim kontrolü (OD-24). İki hesap (ADMIN, EMPLOYEE) aynı kontrolden geçer;
 * hesap türü hiçbir yetki kararında kullanılmaz. RBAC, `requireAdmin` veya izin kontrolü yoktur.
 *
 * Her korumalı Server Component / Server Action / Route Handler bu kontrolü kendi içinde çağırır;
 * proxy veya layout güvenlik sınırı değildir. Oturum her istekte veritabanından doğrulanır.
 */

export const SESSION_COOKIE_PREFIX = "cs";

export type Staff = {
  readonly userId: string;
  readonly username: string;
  /** Yalnızca tanımlama/görüntüleme içindir (OD-24). */
  readonly accountType: StaffRole;
  readonly sessionId: string;
};

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Geçerli personel oturumunu döndürür; yoksa `null`. İstek başına bir kez çalışır. */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const requestHeaders = await headers();
  // Oturum cookie'si yoksa veritabanına gidilmez (anonim istekler için gereksiz yük yok).
  if (getSessionCookie(requestHeaders, { cookiePrefix: SESSION_COOKIE_PREFIX }) === null)
    return null;

  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (session === null) return null;
  const { user } = session;
  if (!isStaffRole(user.role) || typeof user.username !== "string") return null;
  return {
    userId: user.id,
    username: user.username,
    accountType: user.role,
    sessionId: session.session.id,
  };
});

/** Personel oturumu zorunlu; yoksa giriş ekranına yönlendirir. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (staff === null) redirect("/login");
  return staff;
}
