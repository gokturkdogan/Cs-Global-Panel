import { deflateSync } from "node:zlib";

/**
 * Sentetik PDF fixture üreticisi (PHASE 08). Repoya ikili dosya eklenmez; her test kendi PDF'ini
 * doğru xref ofsetleriyle üretir. Gerçek müşteri belgesi kullanılmaz.
 */

type PdfObject = string | { readonly dict: string; readonly stream: Uint8Array };

const encoder = (text: string) => Buffer.from(text, "latin1");

const CATALOG = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const PAGE = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>";
const CONTENT = "BT /F1 12 Tf 72 720 Td (Sentetik test belgesi) Tj ET";

function contentObject(text = CONTENT): PdfObject {
  return { dict: `<< /Length ${text.length} >>`, stream: encoder(text) };
}

/** Klasik xref tablolu PDF. `objects[0]` katalogdur (1 0 obj). */
export function buildPdf(
  objects: readonly PdfObject[],
  options: { trailerExtra?: string; version?: string } = {},
): Buffer {
  const parts: Buffer[] = [encoder(`%PDF-${options.version ?? "1.7"}\n%\xe2\xe3\xcf\xd3\n`)];
  let length = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk =
      typeof object === "string"
        ? encoder(`${index + 1} 0 obj\n${object}\nendobj\n`)
        : Buffer.concat([
            encoder(`${index + 1} 0 obj\n${object.dict}\nstream\n`),
            Buffer.from(object.stream),
            encoder("\nendstream\nendobj\n"),
          ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${options.trailerExtra ?? ""}>>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(encoder(xref));
  return Buffer.concat(parts);
}

/** Geçerli tek sayfalık PDF. */
export function validPdf(): Buffer {
  return buildPdf([CATALOG, PAGES, PAGE, contentObject()]);
}

/** Tam `size` bayt uzunluğunda geçerli PDF (dolgu, sıkıştırılmamış bir akış nesnesinde). */
export function validPdfOfSize(size: number): Buffer {
  const base = buildPdf([
    CATALOG,
    PAGES,
    PAGE,
    contentObject(),
    { dict: "<< /Length 0 >>", stream: new Uint8Array(0) },
  ]);
  // Dolgu akışının uzunluğu ve xref ofsetleri basamak sayısını etkiler → iki geçişte hassas ayar.
  let padding = Math.max(0, size - base.length);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pdf = buildPdf([
      CATALOG,
      PAGES,
      PAGE,
      contentObject(),
      { dict: `<< /Length ${padding} >>`, stream: Buffer.alloc(padding, 0x20) },
    ]);
    if (pdf.length === size) return pdf;
    padding += size - pdf.length;
  }
  throw new Error("İstenen boyutta PDF üretilemedi");
}

/** Xref stream + sıkıştırılmış nesne akışı (ObjStm) içeren PDF; `hidden` nesnesi ObjStm içindedir. */
export function objectStreamPdf(
  hidden: string,
  options: { flate?: boolean } = { flate: true },
): Buffer {
  // 1 katalog, 2 pages, 3 page, 4 içerik — 5 ObjStm (içinde nesne 6 = hidden), 7 xref stream.
  const first = "6 0 ".length;
  const objStmData = encoder(`6 0 ${hidden}`);
  const data = options.flate === false ? objStmData : deflateSync(objStmData);
  const head = encoder("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");
  const chunks: Buffer[] = [head];
  let length = head.length;
  const offsets: Record<number, number> = {};
  const add = (n: number, buffer: Buffer) => {
    offsets[n] = length;
    chunks.push(buffer);
    length += buffer.length;
  };
  const catalog =
    hidden.includes("/Type /Action") || hidden.includes("/S ")
      ? "<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>"
      : "<< /Type /Catalog /Pages 2 0 R /Names 6 0 R >>";
  add(1, encoder(`1 0 obj\n${catalog}\nendobj\n`));
  add(2, encoder(`2 0 obj\n${PAGES}\nendobj\n`));
  add(3, encoder(`3 0 obj\n${PAGE}\nendobj\n`));
  add(
    4,
    encoder(`4 0 obj\n<< /Length ${CONTENT.length} >>\nstream\n${CONTENT}\nendstream\nendobj\n`),
  );
  add(
    5,
    Buffer.concat([
      encoder(
        `5 0 obj\n<< /Type /ObjStm /N 1 /First ${first} /Length ${data.length}${options.flate === false ? "" : " /Filter /FlateDecode"} >>\nstream\n`,
      ),
      Buffer.from(data),
      encoder("\nendstream\nendobj\n"),
    ]),
  );
  // Xref stream (W [1 4 2], sıkıştırmasız): tip 1 = ofset, tip 2 = ObjStm içinde.
  const xrefOffset = length;
  const rows: Buffer[] = [];
  const row = (type: number, a: number, b: number) => {
    const buffer = Buffer.alloc(7);
    buffer.writeUInt8(type, 0);
    buffer.writeUInt32BE(a, 1);
    buffer.writeUInt16BE(b, 5);
    rows.push(buffer);
  };
  row(0, 0, 65535);
  for (const n of [1, 2, 3, 4, 5]) row(1, offsets[n]!, 0);
  row(2, 5, 0); // nesne 6 → ObjStm 5, indeks 0
  row(1, xrefOffset, 0); // nesne 7 (xref stream)
  const table = Buffer.concat(rows);
  chunks.push(
    Buffer.concat([
      encoder(
        `7 0 obj\n<< /Type /XRef /Size 8 /W [1 4 2] /Root 1 0 R /Length ${table.length} >>\nstream\n`,
      ),
      table,
      encoder(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`),
    ]),
  );
  return Buffer.concat(chunks);
}

export const fixtures = {
  valid: validPdf,
  javascriptOpenAction: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>",
      PAGES,
      PAGE,
      contentObject(),
      "<< /Type /Action /S /JavaScript /JS (app.alert\\(1\\)) >>",
    ]),
  hexEscapedJavascript: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>",
      PAGES,
      PAGE,
      contentObject(),
      "<< /Type /Action /S /J#61vaScript /J#53 (x) >>",
    ]),
  /** OpenAction yalnızca hedef (sayfa) → geçerli (yaygın ofis çıktısı). */
  openActionDestination: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] >>",
      PAGES,
      PAGE,
      contentObject(),
    ]),
  launchAction: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>",
      PAGES,
      PAGE,
      contentObject(),
      "<< /Type /Action /S /Launch /F (cmd.exe) >>",
    ]),
  embeddedFile: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 5 0 R >> >>",
      PAGES,
      PAGE,
      contentObject(),
      "<< /Names [(a.txt) 6 0 R] >>",
      "<< /Type /Filespec /F (a.txt) /EF << /F 7 0 R >> >>",
      { dict: "<< /Type /EmbeddedFile /Length 5 >>", stream: encoder("hello") },
    ]),
  encrypted: () =>
    buildPdf(
      [
        CATALOG,
        PAGES,
        PAGE,
        contentObject(),
        "<< /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >>",
      ],
      {
        trailerExtra:
          "/Encrypt 5 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] ",
      },
    ),
  xfaForm: () =>
    buildPdf([
      "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /XFA 5 0 R >> >>",
      PAGES,
      PAGE,
      contentObject(),
      { dict: "<< /Length 7 >>", stream: encoder("<xdp/>\n") },
    ]),
  /** Sıkıştırılmış nesne akışında gizlenmiş JavaScript eylemi. */
  compressedJavascript: () => objectStreamPdf("<< /Type /Action /S /JavaScript /JS (x) >>"),
  /** Sıkıştırılmış nesne akışında zararsız ad ağacı → geçerli. */
  compressedBenign: () => objectStreamPdf("<< /Dests << >> >>"),
  /** Dekompresyon bombası (nesne akışı açıldığında bütçeyi aşar). */
  decompressionBomb: () => {
    const zeros = Buffer.alloc(80 * 1024 * 1024, 0x20);
    const data = deflateSync(zeros, { level: 9 });
    return buildPdf([
      CATALOG,
      PAGES,
      PAGE,
      contentObject(),
      {
        dict: `<< /Type /ObjStm /N 1 /First 0 /Length ${data.length} /Filter /FlateDecode >>`,
        stream: data,
      },
    ]);
  },
  truncated: () => {
    const pdf = validPdf();
    return pdf.subarray(0, Math.floor(pdf.length * 0.6));
  },
  corruptedXref: () => {
    const pdf = validPdf().toString("latin1");
    // startxref ofsetini geçersiz bir konuma kaydır.
    return Buffer.from(
      pdf.replace(/startxref\n(\d+)/, (_, n: string) => `startxref\n${Number(n) - 7}`),
      "latin1",
    );
  },
  missingTrailerRoot: () =>
    Buffer.from(validPdf().toString("latin1").replace("/Root 1 0 R", "/Info 1 0 R"), "latin1"),
  jpegWithPdfExtension: () =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      encoder("JFIF\0"),
      Buffer.alloc(200, 1),
    ]),
  textFile: () => encoder("Bu bir PDF degildir.\n"),
  /** PDF başlığından önce başka içerik (polyglot girişimi). */
  polyglotPrefix: () => Buffer.concat([encoder("GIF89a"), validPdf()]),
  deepNesting: () =>
    buildPdf([CATALOG, PAGES, PAGE, contentObject(), `${"[".repeat(200)}${"]".repeat(200)}`]),
} as const;

export type FixtureName = keyof typeof fixtures;
