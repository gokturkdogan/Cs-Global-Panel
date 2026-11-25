"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";
import { getAccessTokenEnv, type AccessTokenEnv } from "@/server/env";

import { normalizePhone } from "./domain/phone";
import {
  getServicePreview,
  listApplications,
  type ApplicationList,
  type ServicePreview,
} from "./queries";
import {
  accessLinkMutationSchema,
  applicationRefSchema,
  applicationSearchSchema,
  createApplicationSchema,
  servicePreviewSchema,
  updateCustomerSchema,
} from "./schemas";
import * as service from "./service";

/**
 * Başvuru ve müşteri bağlantısı Server Action'ları (API_CONTRACTS §2.1, PHASE 06). Her biri
 * `requireStaff()` ile başlar (oturum yoksa giriş ekranına), Zod `.strict()` ile doğrular; aktör
 * yalnızca oturumdan. İki hesap eşittir (OD-24). Köken kontrolü: proxy (403) + Next.js.
 * Düz bağlantı yalnızca bu yanıtlarda döner; log'a/URL'ye yazılmaz.
 */

const validationFailure = (fieldErrors: Record<string, string>) =>
  fail({ code: "VALIDATION", message: messages.common.validation, fieldErrors });

/** Token anahtarları yoksa token gerektiren işlem fail-closed reddedilir (diğer modüller etkilenmez). */
function tokenEnv(): AccessTokenEnv | null {
  try {
    return getAccessTokenEnv();
  } catch (error) {
    console.error("[applications] Token yapılandırması geçersiz", {
      variables: (error as { variables?: unknown }).variables ?? "unknown",
    });
    return null;
  }
}
const tokenConfigFailure = () =>
  fail({ code: "INTERNAL", message: messages.applications.tokenConfigMissing });

function revalidateApplication(applicationId: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/applications");
  if (applicationId !== null) revalidatePath(`/dashboard/applications/${applicationId}`);
}

export async function getServicePreviewAction(
  input: unknown,
): Promise<ActionResult<ServicePreview>> {
  await requireStaff();
  const parsed = servicePreviewSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  try {
    const preview = await getServicePreview(getDb(), parsed.data.serviceId);
    if (preview === null) {
      return fail({ code: "NOT_FOUND", message: messages.applications.serviceUnavailable });
    }
    return ok(preview);
  } catch (error) {
    console.error("[applications] Hizmet önizlemesi okunamadı", {
      code: pgErrorCode(error) ?? "unknown",
    });
    return fail({ code: "INTERNAL", message: messages.common.internal });
  }
}

/** Kişisel veri içerebilen arama POST gövdesinde gelir (URL, geçmiş ve erişim loglarına yazılmaz). */
export async function searchApplicationsAction(
  input: unknown,
): Promise<ActionResult<ApplicationList>> {
  await requireStaff();
  const parsed = applicationSearchSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  try {
    return ok(await listApplications(getDb(), parsed.data));
  } catch (error) {
    console.error("[applications] Arama başarısız", { code: pgErrorCode(error) ?? "unknown" });
    return fail({ code: "INTERNAL", message: messages.common.internal });
  }
}

export async function createApplicationAction(
  input: unknown,
): Promise<ActionResult<service.CreatedApplication>> {
  const staff = await requireStaff();
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const phone = normalizePhone(parsed.data.phone);
  if (phone === null) {
    return validationFailure({ phone: messages.applications.validation.phoneInvalid });
  }
  const env = tokenEnv();
  if (env === null) return tokenConfigFailure();
  const result = await service.createApplication(
    getDb(),
    { userId: staff.userId },
    { ...parsed.data, phone },
    env,
  );
  if (result.ok) revalidateApplication(result.data.applicationId);
  return result;
}

export async function updateCustomerInfoAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const phone = normalizePhone(parsed.data.phone);
  if (phone === null) {
    return validationFailure({ phone: messages.applications.validation.phoneInvalid });
  }
  const result = await service.updateCustomerInfo(
    getDb(),
    { userId: staff.userId },
    { ...parsed.data, phone },
  );
  if (result.ok) revalidateApplication(parsed.data.applicationId);
  return result;
}

export async function revealAccessLinkAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = applicationRefSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const env = tokenEnv();
  if (env === null) return tokenConfigFailure();
  return service.revealAccessLink(
    getDb(),
    { userId: staff.userId },
    parsed.data.applicationId,
    env,
  );
}

export async function prepareWhatsAppShareAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = applicationRefSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const env = tokenEnv();
  if (env === null) return tokenConfigFailure();
  return service.prepareWhatsAppShare(
    getDb(),
    { userId: staff.userId },
    parsed.data.applicationId,
    env,
  );
}

export async function revokeAccessLinkAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = accessLinkMutationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const result = await service.revokeAccessLink(getDb(), { userId: staff.userId }, parsed.data);
  if (result.ok) revalidateApplication(parsed.data.applicationId);
  return result;
}

export async function rotateAccessLinkAction(input: unknown) {
  const staff = await requireStaff();
  const parsed = accessLinkMutationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsOf(parsed.error));
  const env = tokenEnv();
  if (env === null) return tokenConfigFailure();
  const result = await service.rotateAccessLink(
    getDb(),
    { userId: staff.userId },
    parsed.data,
    env,
  );
  if (result.ok) revalidateApplication(parsed.data.applicationId);
  return result;
}
