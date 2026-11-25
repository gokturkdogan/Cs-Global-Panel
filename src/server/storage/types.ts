/**
 * Depolama sağlayıcı sözleşmesi (PHASE 08, D-097). Domain kodu yalnızca bu arayüzü bilir; AWS SDK'ye
 * veya dosya sistemine doğrudan bağlı değildir. Sağlayıcıya özgü davranış adapter içinde kalır.
 * Bu dosya ve adapter'lar yalnızca göreli import kullanır: bakım betikleri (`scripts/storage/*`)
 * Next.js dışında da aynı kodu çalıştırır.
 */

export type PutObjectInput = {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: "application/pdf";
  readonly sizeBytes: number;
  /** Hex MD5 — sağlayıcı ETag'i ile karşılaştırma için (SHA-256'nın yerine geçmez). */
  readonly md5Hex: string;
};

export type PutObjectResult = {
  /** Fiziksel versiyon kimliği (B2 `x-amz-version-id`); yoksa yükleme aktifleştirilmez. */
  readonly versionId: string | null;
};

export type ObjectHead = {
  readonly versionId: string | null;
  readonly contentLength: number;
};

export type ObjectStream = {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentLength: number;
};

export type ObjectVersion = {
  readonly key: string;
  readonly versionId: string;
  readonly sizeBytes: number;
  readonly isDeleteMarker: boolean;
  readonly isLatest: boolean;
};

export type ListVersionsResult = {
  readonly versions: readonly ObjectVersion[];
  /** Sayfa sınırı nedeniyle liste eksikse true — çağıran taraf eksik listeyle silme yapmaz. */
  readonly truncated: boolean;
};

export interface StorageAdapter {
  readonly provider: "b2" | "local";
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** Belirli versiyonu okur (versiyon verilmezse en güncel). Yoksa `StorageError("NOT_FOUND")`. */
  getObject(key: string, versionId: string | null): Promise<ObjectStream>;
  /** Nesne yoksa `null`. */
  headObject(key: string, versionId: string | null): Promise<ObjectHead | null>;
  /** Önek altındaki tüm fiziksel versiyonlar (silme işaretleri dahil), sınırlı sayfa. */
  listObjectVersions(prefix: string, maxPages: number): Promise<ListVersionsResult>;
  /** Versiyona özgü kalıcı fiziksel silme (B2: versionId'li DeleteObject). Yoksa sessizce başarılı. */
  deleteObjectVersion(key: string, versionId: string): Promise<void>;
}

/**
 * Nesne anahtarı yalnızca sunucuda, yalnızca UUID'lerden üretilir (FILE_STORAGE §1): kişisel veri,
 * orijinal dosya adı, token veya istemci yolu içermez. DB CHECK aynı biçimi zorunlu kılar.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const OBJECT_KEY_PATTERN = new RegExp(`^applications/${UUID}/${UUID}/${UUID}\\.pdf$`);
export const VERIFICATION_KEY_PATTERN = /^_verification\/[0-9a-f]{32}\.pdf$/;

export function buildObjectKey(applicationId: string, requirementId: string, fileId: string) {
  const key = `applications/${applicationId}/${requirementId}/${fileId}.pdf`;
  if (!OBJECT_KEY_PATTERN.test(key)) throw new Error("Geçersiz nesne anahtarı bileşeni");
  return key;
}

export function isAllowedObjectKey(key: string): boolean {
  return OBJECT_KEY_PATTERN.test(key) || VERIFICATION_KEY_PATTERN.test(key);
}
