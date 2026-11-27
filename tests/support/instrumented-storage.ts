import type {
  GetObjectOptions,
  ObjectStream,
  ReadRange,
  StorageAdapter,
} from "../../src/server/storage/types";

/**
 * Ölçümlü depolama sağlayıcısı (PHASE 11, yalnızca testler). Gerçek adapter'ı sarar; her çağrıyı
 * (işlem, versiyon, aralık), sağlayıcıdan gerçekten okunan baytları ve gövde iptallerini kaydeder.
 * Anahtar değerleri kaydedilmez (yalnızca işlem türü). `tamper` ile sağlayıcı uyuşmazlıkları taklit edilir.
 */
export type StorageCall = {
  readonly op: "put" | "get" | "head" | "list" | "delete";
  readonly versionId: string | null;
  readonly range: ReadRange | null;
};

export type Tamper = (object: ObjectStream) => ObjectStream;

export function instrumentStorage(inner: StorageAdapter) {
  const calls: StorageCall[] = [];
  const counters = { bytesRead: 0, cancels: 0, bodies: 0, closed: 0 };
  let tamper: Tamper | null = null;
  let failWith: Error | null = null;

  function meter(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    counters.bodies += 1;
    const reader = body.getReader();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) {
          counters.closed += 1;
          controller.close();
          return;
        }
        counters.bytesRead += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      },
      async cancel(reason) {
        counters.cancels += 1;
        await reader.cancel(reason);
      },
    });
  }

  const adapter: StorageAdapter = {
    provider: inner.provider,
    async putObject(input) {
      calls.push({ op: "put", versionId: null, range: null });
      return inner.putObject(input);
    },
    async getObject(key: string, versionId: string | null, options: GetObjectOptions = {}) {
      calls.push({ op: "get", versionId, range: options.range ?? null });
      if (failWith) throw failWith;
      const object = await inner.getObject(key, versionId, options);
      const metered = { ...object, body: meter(object.body) };
      return tamper ? tamper(metered) : metered;
    },
    async headObject(key, versionId) {
      calls.push({ op: "head", versionId, range: null });
      return inner.headObject(key, versionId);
    },
    async listObjectVersions(prefix, maxPages) {
      calls.push({ op: "list", versionId: null, range: null });
      return inner.listObjectVersions(prefix, maxPages);
    },
    async deleteObjectVersion(key, versionId) {
      calls.push({ op: "delete", versionId, range: null });
      return inner.deleteObjectVersion(key, versionId);
    },
  };

  return {
    adapter,
    calls,
    counters,
    reset() {
      calls.length = 0;
      counters.bytesRead = 0;
      counters.cancels = 0;
      counters.bodies = 0;
      counters.closed = 0;
      tamper = null;
      failWith = null;
    },
    setTamper(next: Tamper | null) {
      tamper = next;
    },
    setFailure(error: Error | null) {
      failWith = error;
    },
    gets() {
      return calls.filter((call) => call.op === "get");
    },
  };
}
