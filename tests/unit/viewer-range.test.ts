import { describe, expect, it } from "vitest";

import {
  createRangeFetcher,
  createWindowedReader,
  RangeFetchError,
  readRange,
} from "@/features/documents/components/pdf-viewer/range-fetch";

/** PHASE 11 (D-136): görüntüleyicinin aralık istemcisi — yanıt doğrulaması, tek teslim, uyarlamalı büyütme. */
const SIZE = 1000;

function fakeFetch(
  respond: (start: number, end: number) => { status: number; range?: string; length?: number },
) {
  const seen: { range: string | null; cache: RequestCache | undefined }[] = [];
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    seen.push({ range, cache: init?.cache });
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range ?? "") ?? [];
    const start = Number(a);
    const end = Number(b);
    const reply = respond(start, end);
    const body = new Uint8Array(reply.length ?? end - start + 1).fill(start % 256);
    return new Response(body, {
      status: reply.status,
      headers: reply.range ? { "content-range": reply.range } : {},
    });
  }) as typeof fetch;
  return { impl, seen };
}

describe("createRangeFetcher", () => {
  const signal = new AbortController().signal;

  it("tek aralık ister (no-store); 206 + birebir Content-Range + uzunluk kabul edilir", async () => {
    const { impl, seen } = fakeFetch((s, e) => ({ status: 206, range: `bytes ${s}-${e}/${SIZE}` }));
    const bytes = await createRangeFetcher(
      "/api/files/x?disposition=inline",
      SIZE,
      signal,
      impl,
    )(10, 19);
    expect(bytes.byteLength).toBe(10);
    expect(seen).toEqual([{ range: "bytes=10-19", cache: "no-store" }]);
  });

  it.each([
    ["200 (aralık uygulanmadı)", { status: 200 }, 200],
    ["404", { status: 404 }, 404],
    ["429", { status: 429 }, 429],
    ["farklı Content-Range", { status: 206, range: "bytes 0-9/1000" }, 502],
    ["farklı toplam boyut", { status: 206, range: "bytes 10-19/999" }, 502],
    ["kısa gövde", { status: 206, range: "bytes 10-19/1000", length: 5 }, 502],
  ])("%s → RangeFetchError(%j)", async (_name, reply, status) => {
    const { impl } = fakeFetch(() => reply);
    const error = await createRangeFetcher(
      "/f",
      SIZE,
      signal,
      impl,
    )(10, 19).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RangeFetchError);
    expect((error as RangeFetchError).status).toBe(status);
  });
});

describe("readRange (tek teslim)", () => {
  it("büyük aralığı sunucu parça sınırında böler ve TEK tampon olarak birleştirir", async () => {
    const calls: [number, number][] = [];
    const out = await readRange(
      async (s, e) => {
        calls.push([s, e]);
        return new Uint8Array(e - s + 1).fill(s / 100);
      },
      0,
      250,
      100,
    );
    expect(calls).toEqual([
      [0, 99],
      [100, 199],
      [200, 249],
    ]);
    expect(out.byteLength).toBe(250);
    expect([out[0], out[150], out[249]]).toEqual([0, 1, 2]);
  });
});

describe("createWindowedReader (uyarlamalı pencere)", () => {
  function counting() {
    const calls: [number, number][] = [];
    const fetchRange = async (s: number, e: number) => {
      calls.push([s, e]);
      return Uint8Array.from({ length: e - s + 1 }, (_, i) => (s + i) % 251);
    };
    return { calls, fetchRange };
  }
  const expectBytes = (out: Uint8Array, begin: number) => {
    out.forEach((value, i) => expect(value).toBe((begin + i) % 251));
  };

  it("eşiğe kadar istenen aralık aynen; sonra hizalı bloklar, paralel isteklerde blok paylaşılır", async () => {
    const { calls, fetchRange } = counting();
    const reader = createWindowedReader(fetchRange, 10_000, {
      threshold: 2,
      window: 1024,
      maxChunk: 1024,
    });
    expectBytes(await reader.read(0, 256), 0);
    expectBytes(await reader.read(9_728, 10_000), 9_728);
    expect(calls).toEqual([
      [0, 255],
      [9_728, 9_999],
    ]);
    // Eşik sonrası: geriye doğru paralel istekler aynı bloğu paylaşır.
    const [a, b] = await Promise.all([reader.read(3_072, 3_328), reader.read(3_328, 3_584)]);
    expectBytes(a, 3_072);
    expectBytes(b, 3_328);
    expect(calls.slice(2)).toEqual([[3_072, 4_095]]);
    // Blok sınırını aşan istek iki bloktan birleştirilir; dosya sonu kırpılır.
    expectBytes(await reader.read(3_840, 4_352), 3_840);
    expectBytes(await reader.read(9_216, 10_000), 9_216);
    expect(calls.slice(3)).toEqual([
      [4_096, 5_119],
      [9_216, 9_999],
    ]);
  });

  it("hatalı blok bellekten çıkarılır (yeniden denenebilir); clear() belleği bırakır", async () => {
    let fail = true;
    const reader = createWindowedReader(
      async (s, e) => {
        if (fail) throw new Error("ağ");
        return new Uint8Array(e - s + 1);
      },
      4_096,
      { threshold: 0, window: 1024, maxChunk: 1024 },
    );
    await expect(reader.read(0, 512)).rejects.toThrow();
    fail = false;
    expect((await reader.read(0, 512)).byteLength).toBe(512);
    reader.clear();
  });
});
