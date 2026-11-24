"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { fail, type ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";
import { requireStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

import {
  createRequirementSchema,
  createServiceSchema,
  fieldErrorsOf,
  moveRequirementSchema,
  setRequirementActiveSchema,
  setServiceActiveSchema,
  updateRequirementSchema,
  updateServiceSchema,
} from "./schemas";
import * as service from "./service";

/**
 * Hizmet / evrak şablonu Server Action'ları (API_CONTRACTS §2.3). Akış: `requireStaff()` (oturum yoksa
 * giriş ekranına yönlendirir) → Zod `.strict()` → servis katmanı (kilit + version + audit tek
 * transaction) → yeniden doğrulama. Aktör yalnızca doğrulanmış oturumdan alınır; iki hesap eşittir
 * (OD-24). Köken kontrolü proxy (403) + Next.js tarafından yapılır.
 */

async function run<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  mutate: (actor: service.Actor, data: z.output<S>) => Promise<ActionResult<T>>,
  serviceIdOf: (data: z.output<S>, result: T) => string | null,
): Promise<ActionResult<T>> {
  const staff = await requireStaff();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail({
      code: "VALIDATION",
      message: messages.common.validation,
      fieldErrors: fieldErrorsOf(parsed.error),
    });
  }
  const result = await mutate({ userId: staff.userId }, parsed.data);
  if (result.ok) {
    revalidatePath("/dashboard/services");
    const serviceId = serviceIdOf(parsed.data, result.data);
    if (serviceId !== null) revalidatePath(`/dashboard/services/${serviceId}`);
  }
  return result;
}

export async function createServiceAction(input: unknown) {
  return run(
    createServiceSchema,
    input,
    (actor, data) => service.createService(getDb(), actor, data),
    (_data, result) => result.serviceId,
  );
}

export async function updateServiceAction(input: unknown) {
  return run(
    updateServiceSchema,
    input,
    (actor, data) => service.updateService(getDb(), actor, data),
    (data) => data.serviceId,
  );
}

export async function setServiceActiveAction(input: unknown) {
  return run(
    setServiceActiveSchema,
    input,
    (actor, data) => service.setServiceActive(getDb(), actor, data),
    (data) => data.serviceId,
  );
}

export async function createRequirementAction(input: unknown) {
  return run(
    createRequirementSchema,
    input,
    (actor, data) => service.createRequirement(getDb(), actor, data),
    (data) => data.serviceId,
  );
}

export async function updateRequirementAction(input: unknown) {
  return run(
    updateRequirementSchema,
    input,
    (actor, data) => service.updateRequirement(getDb(), actor, data),
    (data) => data.serviceId,
  );
}

export async function setRequirementActiveAction(input: unknown) {
  return run(
    setRequirementActiveSchema,
    input,
    (actor, data) => service.setRequirementActive(getDb(), actor, data),
    (data) => data.serviceId,
  );
}

export async function moveRequirementAction(input: unknown) {
  return run(
    moveRequirementSchema,
    input,
    (actor, data) => service.moveRequirement(getDb(), actor, data),
    (data) => data.serviceId,
  );
}
