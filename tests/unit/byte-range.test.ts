import { describe, expect, it } from "vitest";

import {
  contentRangeHeader,
  ifRangeAllowsPartial,
  MAX_RANGE_HEADER_LENGTH,
  parseRangeHeader,
  rangeLength,
  unsatisfiedRangeHeader,
} from "@/features/documents/domain/byte-range";
import { StorageError } from "@/server/storage/errors";
import { exactLengthStream } from "@/server/storage/exact-length";
import { parseContentRange } from "@/server/storage/types";

/** PHASE 11 (D-135): HTTP Range çözümleme politikası — RFC 9110 §14; sınırlar kayıtlı boyuttan. */
const SIZE = 1000;
const partial = (start: number, end: number) => ({ kind: "partial", range: { start, end } });
const unsatisfiable = { kind: "unsatisfiable" };
const full = { kind: "full" };

describe("parseRangeHeader", () => {
  it.each([
    ["bytes=0-99", partial(0, 99)],
    ["bytes=100-199", partial(100, 199)],
    ["bytes=999-999", partial(999, 999)],
    ["bytes=0-0", partial(0, 0)],
  ])("kapalı aralık %s", (header, expected) => {
    expect(parseRangeHeader(header, SIZE)).toEqual(expected);
  });

  it("açık uçlu aralık son bayta kadar", () => {
    expect(parseRangeHeader("bytes=500-", SIZE)).toEqual(partial(500, 999));
    expect(parseRangeHeader("bytes=0-", SIZE)).toEqual(partial(0, 999));
  });

  it("sonek aralığı son N bayt; N boyutu aşarsa tüm dosya", () => {
    expect(parseRangeHeader("bytes=-100", SIZE)).toEqual(partial(900, 999));
    expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual(partial(0, 999));
    expect(parseRangeHeader("bytes=-0", SIZE)).toEqual(unsatisfiable);
  });

  it("bitiş dosya sonunu aşarsa kırpılır; başlangıç aşarsa 416", () => {
    expect(parseRangeHeader("bytes=900-5000", SIZE)).toEqual(partial(900, 999));
    expect(parseRangeHeader("bytes=1000-1000", SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader("bytes=1000-", SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader("bytes=5000-6000", SIZE)).toEqual(unsatisfiable);
  });

  it.each([
    "bytes=",
    "bytes=-",
    "bytes=abc",
    "bytes=1-a",
    "bytes=10-5",
    "bytes=+1-2",
    "bytes=-1-2",
    "bytes=1.5-2",
    "bytes=0x10-20",
    "bytes 0-1",
  ])("bozuk sözdizimi %s → 416", (header) => {
    expect(parseRangeHeader(header, SIZE)).toEqual(header === "bytes 0-1" ? full : unsatisfiable);
  });

  it("çoklu aralık desteklenmez → 416 (tam dosyaya düşülmez)", () => {
    expect(parseRangeHeader("bytes=0-1,5-6", SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader("bytes=0-1, 2-3", SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader(`bytes=${Array(50).fill("0-1").join(",")}`, SIZE)).toEqual(
      unsatisfiable,
    );
  });

  it("sayısal taşma ve aşırı uzun başlık → 416", () => {
    expect(parseRangeHeader("bytes=0-9999999999999999999999", SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader(`bytes=${"9".repeat(16)}-`, SIZE)).toEqual(unsatisfiable);
    expect(parseRangeHeader(`bytes=0-${"0".repeat(MAX_RANGE_HEADER_LENGTH)}1`, SIZE)).toEqual(
      unsatisfiable,
    );
  });

  it("Range yoksa veya bilinmeyen birimse tam yanıt (RFC 9110 §14.2)", () => {
    expect(parseRangeHeader(null, SIZE)).toEqual(full);
    expect(parseRangeHeader("", SIZE)).toEqual(full);
    expect(parseRangeHeader("items=0-5", SIZE)).toEqual(full);
    expect(parseRangeHeader("Bytes=0-5", SIZE)).toEqual(partial(0, 5));
  });

  it("boş dosya: her aralık karşılanamaz", () => {
    expect(parseRangeHeader("bytes=0-0", 0)).toEqual(unsatisfiable);
    expect(parseRangeHeader("bytes=-1", 0)).toEqual(unsatisfiable);
    expect(parseRangeHeader(null, 0)).toEqual(full);
  });

  it("yardımcılar: uzunluk ve Content-Range biçimleri", () => {
    expect(rangeLength({ start: 10, end: 19 })).toBe(10);
    expect(contentRangeHeader({ start: 0, end: 99 }, SIZE)).toBe("bytes 0-99/1000");
    expect(unsatisfiedRangeHeader(SIZE)).toBe("bytes */1000");
  });
});

describe("If-Range", () => {
  const etag = '"0123456789abcdef0123456789abcdef"';
  it("yalnızca güçlü ETag birebir eşleşirse aralık korunur", () => {
    expect(ifRangeAllowsPartial(null, etag)).toBe(true);
    expect(ifRangeAllowsPartial(etag, etag)).toBe(true);
    expect(ifRangeAllowsPartial(`W/${etag}`, etag)).toBe(false);
    expect(ifRangeAllowsPartial('"baska"', etag)).toBe(false);
    expect(ifRangeAllowsPartial("Wed, 21 Oct 2026 07:28:00 GMT", etag)).toBe(false);
  });
});

describe("sağlayıcı Content-Range doğrulaması", () => {
  it("yalnızca tam biçim kabul edilir", () => {
    expect(parseContentRange("bytes 0-99/1000")).toEqual({ start: 0, end: 99, total: 1000 });
    expect(parseContentRange("bytes 0-99/*")).toBeNull();
    expect(parseContentRange("bytes */1000")).toBeNull();
    expect(parseContentRange("bytes 100-99/1000")).toBeNull();
    expect(parseContentRange("bytes 0-1000/1000")).toBeNull();
    expect(parseContentRange("items 0-1/2")).toBeNull();
    expect(parseContentRange(undefined)).toBeNull();
    expect(parseContentRange(`bytes 0-1/${"1".repeat(80)}`)).toBeNull();
  });
});

function sourceOf(chunks: Uint8Array[], onCancel?: () => void, fail = false) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (fail && index === 1) {
        controller.error(new Error("ağ"));
        return;
      }
      const next = chunks[index++];
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
    cancel() {
      onCancel?.();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("exactLengthStream (sağlayıcı gövde uzunluğu koruması)", () => {
  const bytes = (n: number) => new Uint8Array(n).fill(7);

  it("tam uzunlukta gövde olduğu gibi aktarılır", async () => {
    const out = await drain(exactLengthStream(sourceOf([bytes(3), bytes(4)]), 7));
    expect(out.byteLength).toBe(7);
  });

  it("kısa gövde → hata (eksik veri tamamlanmış sayılmaz)", async () => {
    await expect(drain(exactLengthStream(sourceOf([bytes(3)]), 7))).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it("uzun gövde → hata ve kaynak iptal edilir", async () => {
    let cancelled = false;
    await expect(
      drain(
        exactLengthStream(
          sourceOf([bytes(5), bytes(5), bytes(5)], () => (cancelled = true)),
          7,
        ),
      ),
    ).rejects.toBeInstanceOf(StorageError);
    expect(cancelled).toBe(true);
    cancelled = false;
    await expect(
      drain(
        exactLengthStream(
          sourceOf([bytes(7), bytes(1), bytes(1)], () => (cancelled = true)),
          7,
        ),
      ),
    ).rejects.toBeInstanceOf(StorageError);
    expect(cancelled).toBe(true);
  });

  it("kaynak akış hatası → güvenli hata", async () => {
    await expect(
      drain(exactLengthStream(sourceOf([bytes(3), bytes(3)], undefined, true), 6)),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("istemci iptali kaynağa iletilir (kaynak serbest kalır)", async () => {
    let cancelled = false;
    const stream = exactLengthStream(
      sourceOf([bytes(1), bytes(1), bytes(1)], () => (cancelled = true)),
      3,
    );
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    expect(cancelled).toBe(true);
  });
});
