import { constants as zlibConstants, inflateSync } from "node:zlib";

/**
 * Yapısal PDF doğrulaması (PHASE 08, D-099; FILE_STORAGE §6). Bu modül ayrı bir worker thread'de
 * (bellek/süre sınırlı, boş ortam değişkenleriyle) çalışır; Next.js paketine girmez ve yalnızca göreli
 * import kullanır. Üç katman — hepsi geçmelidir (fail-closed):
 *
 * 1. Başlık/sonlandırıcı: `%PDF-1.0…1.7 | 2.0` dosyanın ilk baytında; son 1024 baytta `%%EOF`;
 *    `startxref` ofseti dosya içinde ve bir xref tablosunu (+trailer, /Root) ya da xref stream nesnesini
 *    gösterir. Bozuk/kesik dosya → MALFORMED.
 * 2. Nesne düzeyi ad taraması: tüm dosya ve sıkıştırılmış nesne akışları (ObjStm, FlateDecode — çıktı
 *    bütçeli) PDF sözdizimine göre (yorum/dize/akış içerikleri atlanarak) taranır; adlardaki `#xx`
 *    kaçışları çözülür. Dolaylı referanslar dahil her nesne tarandığından konumdan bağımsızdır.
 *    Desteklenmeyen ObjStm kodlaması (dolaylı filtre, predictor, başka filtre) → MALFORMED.
 * 3. pdf.js (Mozilla, bakımı süren tam ayrıştırıcı): katalog, sayfa ağacı (her sayfa yüklenir),
 *    şifreleme, ekler, JavaScript eylemleri, açıklama (annotation) türleri, XFA.
 *
 * Bu kontroller ANTİVİRÜS DEĞİLDİR (OD-07): bilinen zararlı imzaları veya görüntüleyici açıklarını
 * tespit etmez; "güvenli/virüssüz" sonucu üretmez.
 */

export type PdfRejection =
  | "NOT_PDF"
  | "ACTIVE_CONTENT"
  | "EMBEDDED_FILE"
  | "ENCRYPTED"
  | "MALFORMED"
  | "TOO_LARGE"
  | "RESOURCE_LIMIT";

export type PdfCheck =
  | { readonly ok: true; readonly pageCount: number }
  | {
      readonly ok: false;
      readonly reason: PdfRejection;
      /** Beklenmeyen ayrıştırıcı hatasının yalnızca adı (teşhis logu için; içerik/dosya adı yok). */
      readonly internal?: string;
    };

export type PdfLimits = {
  readonly maxBytes: number;
  readonly maxPages: number;
  readonly maxObjects: number;
  readonly maxInflatedBytes: number;
  readonly maxNestingDepth: number;
};

class Rejection extends Error {
  readonly reason: PdfRejection;
  constructor(reason: PdfRejection) {
    super(reason);
    this.reason = reason;
  }
}

/** Yasaklı PDF adları (çözülmüş biçim) → ret gerekçesi. `/URI` bağlantıları ret sebebi değildir. */
const FORBIDDEN_NAMES: ReadonlyMap<string, PdfRejection> = new Map([
  ["Encrypt", "ENCRYPTED"],
  ["EmbeddedFile", "EMBEDDED_FILE"],
  ["EmbeddedFiles", "EMBEDDED_FILE"],
  ["FileAttachment", "EMBEDDED_FILE"],
  ["JavaScript", "ACTIVE_CONTENT"],
  ["JS", "ACTIVE_CONTENT"],
  ["Launch", "ACTIVE_CONTENT"],
  ["SubmitForm", "ACTIVE_CONTENT"],
  ["ImportData", "ACTIVE_CONTENT"],
  ["GoToR", "ACTIVE_CONTENT"],
  ["GoToE", "ACTIVE_CONTENT"],
  ["RichMedia", "ACTIVE_CONTENT"],
  ["RichMediaExecute", "ACTIVE_CONTENT"],
  ["XFA", "ACTIVE_CONTENT"],
  ["Rendition", "ACTIVE_CONTENT"],
  ["Movie", "ACTIVE_CONTENT"],
  ["Sound", "ACTIVE_CONTENT"],
]);

const SEVERITY: Record<PdfRejection, number> = {
  ENCRYPTED: 5,
  EMBEDDED_FILE: 4,
  ACTIVE_CONTENT: 3,
  RESOURCE_LIMIT: 2,
  MALFORMED: 1,
  NOT_PDF: 6,
  TOO_LARGE: 7,
};

const ANNOTATION_REJECTIONS: ReadonlyMap<string, PdfRejection> = new Map([
  ["FileAttachment", "EMBEDDED_FILE"],
  ["RichMedia", "ACTIVE_CONTENT"],
  ["Screen", "ACTIVE_CONTENT"],
  ["Movie", "ACTIVE_CONTENT"],
  ["Sound", "ACTIVE_CONTENT"],
]);

const latin1 = new TextDecoder("latin1");

function isWhitespace(byte: number): boolean {
  return (
    byte === 0x20 ||
    byte === 0x0a ||
    byte === 0x0d ||
    byte === 0x09 ||
    byte === 0x0c ||
    byte === 0x00
  );
}

function isDelimiter(byte: number): boolean {
  // ( ) < > [ ] { } / %
  return (
    byte === 0x28 ||
    byte === 0x29 ||
    byte === 0x3c ||
    byte === 0x3e ||
    byte === 0x5b ||
    byte === 0x5d ||
    byte === 0x7b ||
    byte === 0x7d ||
    byte === 0x2f ||
    byte === 0x25
  );
}

/** PDF adındaki `#xx` kaçışlarını çözer (ör. `/J#61vaScript` → `JavaScript`). */
export function decodePdfName(raw: string): string {
  return raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

// ------------------------------------------------------------------ 1. Başlık / xref / trailer

const HEADER = /^%PDF-(?:1\.[0-7]|2\.0)/;

export function checkEnvelope(bytes: Uint8Array, limits: PdfLimits): void {
  if (bytes.byteLength === 0) throw new Rejection("NOT_PDF");
  if (bytes.byteLength > limits.maxBytes) throw new Rejection("TOO_LARGE");
  if (!HEADER.test(latin1.decode(bytes.subarray(0, 16)))) throw new Rejection("NOT_PDF");

  const tailStart = Math.max(0, bytes.byteLength - 2048);
  const tail = latin1.decode(bytes.subarray(tailStart));
  if (!tail.slice(-1024).includes("%%EOF")) throw new Rejection("MALFORMED");
  const match = /startxref\s+(\d{1,10})\s+%%EOF\s*$/.exec(
    tail.slice(tail.lastIndexOf("startxref")),
  );
  if (match === null) throw new Rejection("MALFORMED");
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset < 8 || offset >= bytes.byteLength) {
    throw new Rejection("MALFORMED");
  }

  let start = offset;
  while (start < bytes.byteLength && isWhitespace(bytes[start]!)) start += 1;
  const head = latin1.decode(bytes.subarray(start, Math.min(bytes.byteLength, start + 4096)));
  if (head.startsWith("xref")) {
    checkXrefTable(latin1.decode(bytes.subarray(start)), limits);
    return;
  }
  // Xref stream: `N G obj << ... /Type /XRef ... >> stream`
  if (!/^\d{1,10}\s+\d{1,5}\s+obj\b/.test(head)) throw new Rejection("MALFORMED");
  const dict = head.slice(0, head.indexOf("stream") === -1 ? undefined : head.indexOf("stream"));
  const names = collectNames(dict);
  if (!names.includes("XRef") || !names.includes("Root")) throw new Rejection("MALFORMED");
}

/** Klasik xref tablosu: alt bölüm başlıkları + 20 baytlık girdiler + `trailer << … /Root … >>`. */
function checkXrefTable(text: string, limits: PdfLimits): void {
  let position = 4; // "xref"
  let entries = 0;
  const lineAt = () => {
    while (position < text.length && /[\r\n ]/.test(text[position]!)) position += 1;
    const end = text.slice(position).search(/[\r\n]/);
    const line = end === -1 ? text.slice(position) : text.slice(position, position + end);
    return line;
  };
  for (;;) {
    const line = lineAt();
    if (line.startsWith("trailer")) break;
    const header = /^(\d{1,10}) (\d{1,10})\s*$/.exec(line);
    if (header === null) throw new Rejection("MALFORMED");
    const count = Number(header[2]);
    entries += count;
    if (entries > limits.maxObjects * 2) throw new Rejection("RESOURCE_LIMIT");
    position += line.length;
    for (let i = 0; i < count; i += 1) {
      while (position < text.length && /[\r\n]/.test(text[position]!)) position += 1;
      if (!/^\d{10} \d{5} [nf]/.test(text.slice(position, position + 18))) {
        throw new Rejection("MALFORMED");
      }
      position += 18;
      while (position < text.length && /[ \r\n]/.test(text[position]!)) position += 1;
    }
  }
  const trailer = text.slice(position, position + 4096);
  const dictEnd = trailer.indexOf(">>");
  if (!trailer.includes("<<") || dictEnd === -1) throw new Rejection("MALFORMED");
  if (!collectNames(trailer.slice(0, dictEnd)).includes("Root")) throw new Rejection("MALFORMED");
}

/** Kısa bir metin parçasındaki adlar (zarf kontrolü için; dize içerikleri hariç). */
function collectNames(text: string): string[] {
  const names: string[] = [];
  scanTokens(new Uint8Array(Buffer.from(text, "latin1")), {
    onName: (name) => names.push(name),
    budget: { inflated: 0, objects: 0 },
    limits: {
      maxBytes: 0,
      maxPages: 0,
      maxObjects: Number.MAX_SAFE_INTEGER,
      maxInflatedBytes: 0,
      maxNestingDepth: 1_000,
    },
    handleStreams: false,
  });
  return names;
}

// ------------------------------------------------------------------ 2. Nesne düzeyi ad taraması

type ScanContext = {
  readonly onName: (name: string) => void;
  readonly budget: { inflated: number; objects: number };
  readonly limits: PdfLimits;
  /** Ham dosyada true; çözülmüş ObjStm içeriğinde false (ObjStm akış içermez). */
  readonly handleStreams: boolean;
};

const FLATE_NAMES = new Set(["FlateDecode", "Fl"]);
const OTHER_FILTERS = new Set([
  "LZWDecode",
  "LZW",
  "ASCII85Decode",
  "A85",
  "ASCIIHexDecode",
  "AHx",
  "RunLengthDecode",
  "RL",
  "Crypt",
  "DCTDecode",
  "JPXDecode",
  "JBIG2Decode",
  "CCITTFaxDecode",
]);

function indexOfBytes(haystack: Uint8Array, needle: string, from: number): number {
  const first = needle.charCodeAt(0);
  for (let i = from; i <= haystack.byteLength - needle.length; i += 1) {
    if (haystack[i] !== first) continue;
    let matched = true;
    for (let j = 1; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

function decodeObjectStream(
  data: Uint8Array,
  objectNames: readonly string[],
  context: ScanContext,
) {
  const filters = objectNames.filter((name) => FLATE_NAMES.has(name) || OTHER_FILTERS.has(name));
  // Predictor'lı, dolaylı filtreli veya Flate dışı kodlanmış nesne akışı desteklenmez (fail-closed).
  if (objectNames.includes("DecodeParms") || objectNames.includes("DP")) {
    throw new Rejection("MALFORMED");
  }
  if (filters.some((name) => !FLATE_NAMES.has(name)) || filters.length > 1) {
    throw new Rejection("MALFORMED");
  }
  if (filters.length === 0) {
    if (objectNames.includes("Filter") || objectNames.includes("F"))
      throw new Rejection("MALFORMED");
    return data;
  }
  const remaining = context.limits.maxInflatedBytes - context.budget.inflated;
  if (remaining <= 0) throw new Rejection("RESOURCE_LIMIT");
  let inflated: Buffer;
  try {
    inflated = inflateSync(data, {
      maxOutputLength: remaining,
      finishFlush: zlibConstants.Z_SYNC_FLUSH,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      throw new Rejection("RESOURCE_LIMIT");
    }
    throw new Rejection("MALFORMED");
  }
  context.budget.inflated += inflated.byteLength;
  return new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
}

export function scanTokens(bytes: Uint8Array, context: ScanContext): void {
  let depth = 0;
  let objectNames: string[] = [];
  let i = 0;
  const length = bytes.byteLength;

  while (i < length) {
    const c = bytes[i]!;
    if (isWhitespace(c)) {
      i += 1;
    } else if (c === 0x25) {
      // % yorum → satır sonu
      while (i < length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
    } else if (c === 0x28) {
      // ( literal dize ) — iç içe parantez ve ters eğik çizgi kaçışları
      let nesting = 1;
      i += 1;
      while (i < length && nesting > 0) {
        const b = bytes[i]!;
        if (b === 0x5c) i += 2;
        else {
          if (b === 0x28) nesting += 1;
          else if (b === 0x29) nesting -= 1;
          i += 1;
        }
      }
    } else if (c === 0x3c && bytes[i + 1] === 0x3c) {
      depth += 1;
      if (depth > context.limits.maxNestingDepth) throw new Rejection("RESOURCE_LIMIT");
      i += 2;
    } else if (c === 0x3e && bytes[i + 1] === 0x3e) {
      depth = Math.max(0, depth - 1);
      i += 2;
    } else if (c === 0x3c) {
      // <hex dize>
      while (i < length && bytes[i] !== 0x3e) i += 1;
      i += 1;
    } else if (c === 0x5b) {
      depth += 1;
      if (depth > context.limits.maxNestingDepth) throw new Rejection("RESOURCE_LIMIT");
      i += 1;
    } else if (c === 0x5d) {
      depth = Math.max(0, depth - 1);
      i += 1;
    } else if (c === 0x2f) {
      // /Ad
      let end = i + 1;
      while (end < length && !isWhitespace(bytes[end]!) && !isDelimiter(bytes[end]!)) end += 1;
      const name = decodePdfName(latin1.decode(bytes.subarray(i + 1, end)));
      objectNames.push(name);
      context.onName(name);
      i = end;
    } else {
      // Anahtar kelime / sayı
      let end = i;
      while (end < length && !isWhitespace(bytes[end]!) && !isDelimiter(bytes[end]!)) end += 1;
      if (end === i) end = i + 1;
      const word = latin1.decode(bytes.subarray(i, end));
      i = end;
      if (word === "obj") {
        context.budget.objects += 1;
        if (context.budget.objects > context.limits.maxObjects)
          throw new Rejection("RESOURCE_LIMIT");
        objectNames = [];
      } else if (word === "endobj") {
        objectNames = [];
      } else if (word === "stream" && context.handleStreams) {
        let dataStart = i;
        if (bytes[dataStart] === 0x0d) dataStart += 1;
        if (bytes[dataStart] === 0x0a) dataStart += 1;
        const dataEnd = indexOfBytes(bytes, "endstream", dataStart);
        if (dataEnd === -1) throw new Rejection("MALFORMED");
        if (objectNames.includes("ObjStm")) {
          let trimmedEnd = dataEnd;
          while (
            trimmedEnd > dataStart &&
            (bytes[trimmedEnd - 1] === 0x0a || bytes[trimmedEnd - 1] === 0x0d)
          ) {
            trimmedEnd -= 1;
          }
          const decoded = decodeObjectStream(
            bytes.subarray(dataStart, trimmedEnd),
            objectNames,
            context,
          );
          scanTokens(decoded, { ...context, handleStreams: false });
        }
        // Diğer akışların (içerik, görsel, font, xref) baytları nesne değildir; atlanır.
        i = dataEnd + "endstream".length;
        objectNames = [];
      }
    }
  }
}

export function scanForbiddenStructures(bytes: Uint8Array, limits: PdfLimits): void {
  let worst: PdfRejection | null = null;
  scanTokens(bytes, {
    onName: (name) => {
      const reason = FORBIDDEN_NAMES.get(name);
      if (reason !== undefined && (worst === null || SEVERITY[reason] > SEVERITY[worst])) {
        worst = reason;
      }
    },
    budget: { inflated: 0, objects: 0 },
    limits,
    handleStreams: true,
  });
  if (worst !== null) throw new Rejection(worst);
}

// ------------------------------------------------------------------ 3. pdf.js tam ayrıştırma

type PdfjsAnnotation = { subtype?: string; actions?: Record<string, unknown> | null };
type PdfjsPage = {
  getAnnotations(params?: { intent?: string }): Promise<PdfjsAnnotation[]>;
  getJSActions(): Promise<Record<string, unknown> | null>;
  cleanup(): boolean | void;
};
type PdfjsDocument = {
  numPages: number;
  isPureXfa: boolean;
  getPage(n: number): Promise<PdfjsPage>;
  getAttachments(): Promise<Record<string, unknown> | null>;
  getJSActions(): Promise<Record<string, unknown> | null>;
};
export type PdfjsModule = {
  getDocument(params: Record<string, unknown>): {
    promise: Promise<PdfjsDocument>;
    destroy(): Promise<void>;
  };
};

const hasEntries = (value: Record<string, unknown> | null | undefined) =>
  value !== null && value !== undefined && Object.keys(value).length > 0;

export async function inspectWithPdfjs(
  bytes: Uint8Array,
  limits: PdfLimits,
  pdfjs: PdfjsModule,
): Promise<number> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // Ağ, eval, sistem fontu, font yüzü, XFA ve akış/aralık yükleme kapalı: yalnızca bellekteki baytlar.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    isOffscreenCanvasSupported: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    let document: PdfjsDocument;
    try {
      document = await task.promise;
    } catch (error) {
      throw new Rejection(
        (error as { name?: string }).name === "PasswordException" ? "ENCRYPTED" : "MALFORMED",
      );
    }
    if (document.numPages < 1) throw new Rejection("MALFORMED");
    if (document.numPages > limits.maxPages) throw new Rejection("RESOURCE_LIMIT");
    if (document.isPureXfa) throw new Rejection("ACTIVE_CONTENT");
    if (hasEntries(await document.getAttachments())) throw new Rejection("EMBEDDED_FILE");
    if (hasEntries(await document.getJSActions())) throw new Rejection("ACTIVE_CONTENT");
    for (let number = 1; number <= document.numPages; number += 1) {
      let page: PdfjsPage;
      try {
        page = await document.getPage(number);
      } catch {
        throw new Rejection("MALFORMED");
      }
      for (const annotation of await page.getAnnotations({ intent: "display" })) {
        const reason = ANNOTATION_REJECTIONS.get(annotation.subtype ?? "");
        if (reason !== undefined) throw new Rejection(reason);
        if (hasEntries(annotation.actions ?? null)) throw new Rejection("ACTIVE_CONTENT");
      }
      if (hasEntries(await page.getJSActions())) throw new Rejection("ACTIVE_CONTENT");
      page.cleanup();
    }
    return document.numPages;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/** Tüm katmanlar. Beklenmeyen ayrıştırıcı hataları MALFORMED olarak reddedilir (fail-closed). */
export async function validatePdf(
  bytes: Uint8Array,
  limits: PdfLimits,
  loadPdfjs: () => Promise<PdfjsModule>,
): Promise<PdfCheck> {
  try {
    checkEnvelope(bytes, limits);
    scanForbiddenStructures(bytes, limits);
    const pageCount = await inspectWithPdfjs(bytes, limits, await loadPdfjs());
    return { ok: true, pageCount };
  } catch (error) {
    if (error instanceof Rejection) return { ok: false, reason: error.reason };
    if (error instanceof RangeError) return { ok: false, reason: "RESOURCE_LIMIT" };
    const name =
      error instanceof Error
        ? `${error.name}:${(error as { code?: string }).code ?? ""}`
        : "unknown";
    return { ok: false, reason: "MALFORMED", internal: name.slice(0, 80) };
  }
}
