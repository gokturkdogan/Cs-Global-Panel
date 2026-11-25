import type { z } from "zod";

import { messages } from "./messages";

/**
 * Zod hatalarını alan → ilk Türkçe mesaj biçimine çevirir. Tanımsız alan veya tip hatası
 * (istemci manipülasyonu) genel doğrulama mesajı olarak `_form` altında döner.
 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code !== "custom") {
      const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
      // Bilinen alanlarda tip hatası (ör. hizmet seçilmedi) alan mesajı; aksi halde genel.
      if (key === "serviceId")
        result.serviceId ??= messages.applications.validation.serviceRequired;
      else result._form ??= messages.common.validation;
      continue;
    }
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    result[key] ??= issue.message;
  }
  return result;
}
