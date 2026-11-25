import "server-only";

import { createHash } from "node:crypto";

/**
 * Hizmet şablonu parmak izi (D-079): önizleme ile oluşturma anındaki şablonun aynı olduğunu sunucuda
 * doğrular. Hizmet `version`'ı yalnızca hizmet alanlarında artar; evrak içerik/aktiflik değişikliği
 * evrak `version`'ını artırır; sıra değişikliği `sort_order`'a yansır; pasifleştirilen evrak aktif
 * listeden düşer. Bu yüzden parmak izi = hizmet (id, version) + aktif evrakların (id, version,
 * sort_order) belirleyici sıradaki listesi. Gizli değildir; yalnızca tutarlılık kontrolüdür.
 */
export function templateFingerprint(
  service: { readonly id: string; readonly version: number },
  requirements: readonly {
    readonly id: string;
    readonly version: number;
    readonly sortOrder: number;
  }[],
): string {
  const payload = JSON.stringify([
    service.id,
    service.version,
    requirements.map((item) => [item.id, item.version, item.sortOrder]),
  ]);
  return createHash("sha256").update(payload).digest("hex");
}
