import { StorageError } from "./errors.ts";

/**
 * Sağlayıcı gövdesini beklenen bayt sayısıyla sınırlar (PHASE 11, D-135): fazla bayt gelirse veya akış
 * erken biterse yanıt hata ile kesilir (istemci eksik/yanlış veriyi tamamlanmış sanmaz). Çekme (pull)
 * tabanlıdır: istemci okumadıkça sağlayıcıdan okunmaz (geri basınç). İstemci iptal ederse sağlayıcı akışı
 * da iptal edilir (bağlantı/soket serbest kalır).
 */
export function exactLengthStream(
  source: ReadableStream<Uint8Array>,
  expected: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let received = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        controller.error(new StorageError("UNAVAILABLE", "stream"));
        return;
      }
      if (chunk.done) {
        if (received !== expected) controller.error(new StorageError("INTEGRITY", "short-body"));
        else controller.close();
        return;
      }
      received += chunk.value.byteLength;
      if (received > expected) {
        await reader.cancel().catch(() => undefined);
        controller.error(new StorageError("INTEGRITY", "long-body"));
        return;
      }
      controller.enqueue(chunk.value);
      if (received === expected) {
        // Fazla veri beklenmez; kaynak bitişini doğrulamadan kapatmak yerine bir okuma daha yapılır.
        const tail = await reader.read().catch(() => null);
        if (tail === null) {
          controller.error(new StorageError("UNAVAILABLE", "stream"));
        } else if (!tail.done && tail.value.byteLength > 0) {
          await reader.cancel().catch(() => undefined);
          controller.error(new StorageError("INTEGRITY", "long-body"));
        } else {
          if (!tail.done) await reader.cancel().catch(() => undefined);
          controller.close();
        }
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
