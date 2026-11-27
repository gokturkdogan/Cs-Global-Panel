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

/** Okunacak bayt aralığı (her iki uç dahil). Yalnızca sunucu, kayıtlı boyuta göre hesaplar (D-135). */
export type ReadRange = { readonly start: number; readonly end: number };

export type ContentRange = {
  readonly start: number;
  readonly end: number;
  readonly total: number;
};

export type ObjectStream = {
  readonly body: ReadableStream<Uint8Array>;
  /** Yanıt gövdesinin bayt sayısı (aralık isteğinde aralık uzunluğu). */
  readonly contentLength: number;
  /** Sağlayıcının bildirdiği fiziksel versiyon (yoksa null) — çağıran kayıtla karşılaştırır. */
  readonly versionId: string | null;
  /** Aralık isteğinde sağlayıcının `Content-Range` bildirimi; tam okumada null. */
  readonly contentRange: ContentRange | null;
};

export type GetObjectOptions = {
  /** Verilirse yalnızca bu aralık okunur (sağlayıcıya `Range` iletilir; tam nesne indirilip kesilmez). */
  readonly range?: ReadRange;
  /** İstemci bağlantısı kapanınca sağlayıcı isteği iptal edilir. */
  readonly signal?: AbortSignal;
};

/** `bytes <start>-<end>/<total>` biçimini çözer; başka her biçim → null. */
export function parseContentRange(value: string | null | undefined): ContentRange | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = /^bytes (\d{1,15})-(\d{1,15})\/(\d{1,15})$/.exec(value.trim());
  if (match === null) return null;
  const [start, end, total] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (end < start || end >= total) return null;
  return { start, end, total };
}

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
  /**
   * Belirli versiyonu okur (versiyon verilmezse en güncel). Yoksa `StorageError("NOT_FOUND")`.
   * `options.range` verilirse sağlayıcıdan yalnızca o aralık istenir; sağlayıcı aralığı uygulamazsa
   * (tam gövde dönerse) gövde iptal edilir ve `StorageError("INTEGRITY")` atılır.
   */
  getObject(
    key: string,
    versionId: string | null,
    options?: GetObjectOptions,
  ): Promise<ObjectStream>;
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
