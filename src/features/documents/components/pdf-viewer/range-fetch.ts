/**
 * Görüntüleyici aralık istemcisi (PHASE 11, D-136). Yalnızca aynı kökenli dosya uç noktasına tek aralıklı
 * `Range` isteği gönderir ve yanıtı doğrular (206, birebir `Content-Range`, beklenen toplam boyut, beklenen
 * uzunluk). Önbellek kullanılmaz (`no-store`); kalıcı depolama (IndexedDB, localStorage, Service Worker) yok.
 */

export class RangeFetchError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Aralık okunamadı (${status})`);
    this.name = "RangeFetchError";
    this.status = status;
  }
}

export type RangeFetcher = (start: number, end: number) => Promise<Uint8Array>;

/** `[start, end]` (her iki uç dahil) aralığını okur; toplam boyut `size` ile birebir eşleşmelidir. */
export function createRangeFetcher(
  url: string,
  size: number,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): RangeFetcher {
  return async (start, end) => {
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=${start}-${end}` },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined);
      throw new RangeFetchError(response.status);
    }
    if (response.headers.get("content-range") !== `bytes ${start}-${end}/${size}`) {
      await response.body?.cancel().catch(() => undefined);
      throw new RangeFetchError(502);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== end - start + 1) throw new RangeFetchError(502);
    return bytes;
  };
}

/**
 * pdf.js'in istediği `[begin, end)` aralığını sunucunun parça sınırına (`maxChunk`) bölerek sırayla okur ve
 * TEK tampon olarak döndürür: pdf.js her aralık isteği için tek teslim bekler (`onDataRange(begin, …)`),
 * parça parça teslim edilemez.
 */
export async function readRange(
  fetchRange: RangeFetcher,
  begin: number,
  endExclusive: number,
  maxChunk: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(endExclusive - begin);
  for (let offset = begin; offset < endExclusive; offset += maxChunk) {
    const last = Math.min(offset + maxChunk, endExclusive) - 1;
    out.set(await fetchRange(offset, last), offset - begin);
  }
  return out;
}

/**
 * Uyarlamalı pencereli okuyucu (PHASE 11, D-136). İlk `threshold` istek tam olarak pdf.js'in istediği kadardır
 * (iyi yapılandırılmış PDF'lerde ilk sayfa birkaç küçük istekle gelir). Daha fazla istek gerekiyorsa belge
 * dağınık yapılıdır (pdf.js sayfa ağacını sondan başa ve paralel yürür): sonraki istekler hizalı `window`
 * bloklarına yuvarlanır, aynı blok için uçuştaki istek paylaşılır → sağlayıcı işlem (Class B) sayısı azalır.
 * Bloklar YALNIZCA bu görüntüleyici oturumunun belleğinde tutulur (kalıcı depolama yok; kapanınca bırakılır).
 */
export function createWindowedReader(
  fetchRange: RangeFetcher,
  size: number,
  options: { readonly threshold: number; readonly window: number; readonly maxChunk: number },
) {
  const blocks = new Map<number, Promise<Uint8Array>>();
  let requests = 0;

  const block = (index: number) => {
    let pending = blocks.get(index);
    if (pending === undefined) {
      const start = index * options.window;
      pending = readRange(
        fetchRange,
        start,
        Math.min(size, start + options.window),
        options.maxChunk,
      );
      // Hata durumunda blok yeniden denenebilsin.
      pending.catch(() => blocks.delete(index));
      blocks.set(index, pending);
    }
    return pending;
  };

  return {
    async read(begin: number, endExclusive: number): Promise<Uint8Array> {
      requests += 1;
      if (requests <= options.threshold) {
        return readRange(fetchRange, begin, endExclusive, options.maxChunk);
      }
      const first = Math.floor(begin / options.window);
      const last = Math.floor((endExclusive - 1) / options.window);
      const parts = await Promise.all(
        Array.from({ length: last - first + 1 }, (_, i) => block(first + i)),
      );
      const out = new Uint8Array(endExclusive - begin);
      parts.forEach((part, i) => {
        const partStart = (first + i) * options.window;
        const from = Math.max(begin, partStart);
        const to = Math.min(endExclusive, partStart + part.byteLength);
        out.set(part.subarray(from - partStart, to - partStart), from - begin);
      });
      return out;
    },
    /** Görüntüleyici kapanınca bellek bırakılır. */
    clear() {
      blocks.clear();
    },
  };
}
