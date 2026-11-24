"use server";

import { APIError } from "better-auth/api";
import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { messages } from "@/lib/messages";
import { writeAuditLog } from "@/server/audit/log";
import { getAuth } from "@/server/auth/auth";
import { normalizeUsername } from "@/server/auth/credentials-policy";
import {
  consumeLoginAttempt,
  resetLoginAttempts,
  type LoginAttemptDecision,
} from "@/server/auth/rate-limit";
import { getCurrentStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { getAuthEnv } from "@/server/env";

import { signInSchema, type SignInState } from "./schemas";

/** Başarılı girişten sonra gidilen tek adres; istemciden yönlendirme adresi kabul edilmez. */
const AFTER_SIGN_IN_PATH = "/dashboard";

/**
 * Personel girişi (Server Action — Next.js Origin/Host kontrolüyle CSRF korumalı).
 * Hata mesajları geneldir (kullanıcı adının var olup olmadığı belli edilmez).
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: messages.auth.invalidCredentials };

  const username = normalizeUsername(parsed.data.username);
  const db = getDb();

  let secret: string;
  let decision: LoginAttemptDecision;
  try {
    secret = getAuthEnv().rateLimitKeySecret;
    decision = await consumeLoginAttempt(db, secret, username);
  } catch (error) {
    // Rate limit veya yapılandırma hatası: girişe izin verilmez (fail-closed).
    console.error("[auth] Giriş ön kontrolü başarısız", { code: errorCode(error) });
    return { error: messages.auth.unavailable };
  }

  if (decision !== "allowed") {
    await writeAuditLog(db, {
      action: "USER_LOGIN_FAILED",
      actorType: "ANONYMOUS",
      resourceType: "session",
      metadata: { reason: "RATE_LIMITED" },
    });
    if (decision === "unknown_usernames_limited") {
      // Kullanıcı adı tespitini engelle: gerçek şifre kontrolüyle aynı maliyette sahte hash ve
      // genel "hatalı" mesajı (D-068).
      await hashPassword(parsed.data.password);
      return { error: messages.auth.invalidCredentials };
    }
    return { error: messages.auth.rateLimited };
  }

  let userId: string;
  try {
    const result = await getAuth().api.signInUsername({
      body: { username, password: parsed.data.password },
      headers: await headers(),
    });
    if (result === null) throw new Error("Oturum oluşturulamadı");
    userId = result.user.id;
  } catch (error) {
    if (
      error instanceof APIError &&
      (error.status === "UNAUTHORIZED" || error.status === "BAD_REQUEST")
    ) {
      await writeAuditLog(db, {
        action: "USER_LOGIN_FAILED",
        actorType: "ANONYMOUS",
        resourceType: "session",
        metadata: { reason: "INVALID_CREDENTIALS" },
      });
      return { error: messages.auth.invalidCredentials };
    }
    console.error("[auth] Giriş başarısız", { code: errorCode(error) });
    return { error: messages.auth.unavailable };
  }

  await resetLoginAttempts(db, secret, username);
  await writeAuditLog(db, {
    action: "USER_LOGIN",
    actorType: "USER",
    actorUserId: userId,
    resourceType: "session",
    resourceId: userId,
  });
  redirect(AFTER_SIGN_IN_PATH);
}

/** Personel çıkışı: yalnızca bu oturum sonlanır; diğer hesabın oturumları etkilenmez. */
export async function signOutAction(): Promise<void> {
  const staff = await getCurrentStaff();
  if (staff !== null) {
    await getAuth().api.signOut({ headers: await headers() });
    await writeAuditLog(getDb(), {
      action: "USER_LOGOUT",
      actorType: "USER",
      actorUserId: staff.userId,
      resourceType: "session",
      resourceId: staff.userId,
    });
  }
  redirect("/login");
}

function errorCode(error: unknown): string {
  if (error instanceof APIError) return String(error.status);
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}
