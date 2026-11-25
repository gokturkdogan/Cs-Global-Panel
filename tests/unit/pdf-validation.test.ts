import { describe, expect, it } from "vitest";

import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { checkEnvelope, decodePdfName, scanForbiddenStructures } from "@/server/pdf/pdf-checks";
import { PDF_LIMITS, validatePdfIsolated } from "@/server/pdf/validate";

import { fixtures, validPdfOfSize, type FixtureName } from "../support/pdf-fixtures";

/**
 * Yapısal PDF doğrulaması (PHASE 08, D-099; FILE_STORAGE §6.4). Gerçek worker thread + gerçek pdf.js
 * ile çalışır. Bu kontroller antivirüs değildir; "güvenli" sonucu üretmez.
 */
const expectations: [FixtureName, string][] = [
  ["valid", "OK"],
  ["openActionDestination", "OK"],
  ["compressedBenign", "OK"],
  ["javascriptOpenAction", "ACTIVE_CONTENT"],
  ["hexEscapedJavascript", "ACTIVE_CONTENT"],
  ["compressedJavascript", "ACTIVE_CONTENT"],
  ["launchAction", "ACTIVE_CONTENT"],
  ["xfaForm", "ACTIVE_CONTENT"],
  ["embeddedFile", "EMBEDDED_FILE"],
  ["encrypted", "ENCRYPTED"],
  ["truncated", "MALFORMED"],
  ["corruptedXref", "MALFORMED"],
  ["missingTrailerRoot", "MALFORMED"],
  ["jpegWithPdfExtension", "NOT_PDF"],
  ["textFile", "NOT_PDF"],
  ["polyglotPrefix", "NOT_PDF"],
  ["decompressionBomb", "RESOURCE_LIMIT"],
  ["deepNesting", "RESOURCE_LIMIT"],
];

describe("PDF yapısal doğrulama (worker + pdf.js)", () => {
  it.each(expectations)(
    "%s → %s",
    async (name, expected) => {
      const result = await validatePdfIsolated(fixtures[name]());
      expect(result.ok ? "OK" : result.reason).toBe(expected);
    },
    30_000,
  );

  it("boş dosya reddedilir", async () => {
    expect(await validatePdfIsolated(new Uint8Array(0))).toEqual({ ok: false, reason: "NOT_PDF" });
  });

  it("tam 10 MiB (10 485 760 bayt) geçerli PDF kabul edilir; +1 bayt TOO_LARGE", async () => {
    const atLimit = validPdfOfSize(MAX_PDF_SIZE_BYTES);
    expect(atLimit.length).toBe(10_485_760);
    expect(await validatePdfIsolated(atLimit)).toEqual({ ok: true, pageCount: 1 });
    const over = validPdfOfSize(MAX_PDF_SIZE_BYTES + 1);
    expect(over.length).toBe(10_485_761);
    expect(await validatePdfIsolated(over)).toEqual({ ok: false, reason: "TOO_LARGE" });
  }, 60_000);

  it("süre sınırı aşılırsa worker sonlandırılır → RESOURCE_LIMIT", async () => {
    const result = await validatePdfIsolated(fixtures.valid(), { timeoutMs: 1 });
    expect(result).toEqual({ ok: false, reason: "RESOURCE_LIMIT" });
  });
});

describe("ad çözme ve tarama (saf)", () => {
  it("#xx kaçışları çözülür", () => {
    expect(decodePdfName("J#61vaScript")).toBe("JavaScript");
    expect(decodePdfName("Embedded#46ile")).toBe("EmbeddedFile");
    expect(decodePdfName("A#zz")).toBe("A#zz");
  });

  it("dize içindeki ad benzeri metin aktif içerik sayılmaz", () => {
    const pdf = Buffer.from(
      "%PDF-1.7\n1 0 obj\n<< /Title (/JavaScript /Launch) >>\nendobj\n",
      "latin1",
    );
    expect(() => scanForbiddenStructures(pdf, PDF_LIMITS)).not.toThrow();
  });

  it("yorum satırındaki ad aktif içerik sayılmaz", () => {
    const pdf = Buffer.from("%PDF-1.7\n% /JavaScript\n1 0 obj\n<< /A 1 >>\nendobj\n", "latin1");
    expect(() => scanForbiddenStructures(pdf, PDF_LIMITS)).not.toThrow();
  });

  it("geçerli dosyanın zarfı kabul edilir", () => {
    expect(() => checkEnvelope(fixtures.valid(), PDF_LIMITS)).not.toThrow();
  });
});
