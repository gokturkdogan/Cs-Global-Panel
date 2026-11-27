import "server-only";

import { createHash } from "node:crypto";

/**
 * Idempotent metin işlemlerinin içerik özeti (D-113, D-115): kapsam (başvuru, evrak, yazar) + metin.
 * Aynı işlem anahtarı farklı içerik veya kapsamla tekrar kullanılırsa çakışmayı yakalar. Özet tek
 * başına içerik saklamaz; kayıt kimliği/metin istemciye geri döndürülmez.
 */
export function textPayloadHash(input: {
  readonly applicationId: string;
  readonly requirementId: string | null;
  readonly authorUserId: string;
  readonly body: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([input.applicationId, input.requirementId, input.authorUserId, input.body]),
    )
    .digest("hex");
}
