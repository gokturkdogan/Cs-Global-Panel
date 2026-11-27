import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createB2Adapter } from "@/server/storage/b2";
import type { StorageAdapter } from "@/server/storage/types";

/**
 * PHASE 11 (D-135): B2 adapter'ının aralık okuması — yerel sahte S3 uç noktasıyla (127.0.0.1, gerçek
 * Backblaze yok). Sağlayıcıya `Range` + `versionId` iletildiği, tam nesnenin indirilmediği, 200/bozuk
 * yanıtların aktarılmadığı ve istemci iptalinin sağlayıcı bağlantısını kapattığı doğrulanır.
 */
const KEY =
  "applications/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f70/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f71/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f72.pdf";
const OBJECT = Buffer.alloc(4 * 1024 * 1024, 0x41);

type Seen = { method: string; versionId: string | null; range: string | null };
type Mode =
  | "honor"
  | "ignore-range"
  | "bad-content-range"
  | "wrong-version"
  | "invalid-range"
  | "cap"
  | "slow"
  | "missing-version"
  | "no-such-key"
  | "no-such-version"
  | "no-such-bucket"
  | "generic-404"
  | "auth";

let server: Server;
let endpoint: string;
let mode: Mode = "honor";
let seen: Seen[] = [];
let bytesSent = 0;
let closedEarly = 0;

function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  seen.push({
    method: req.method ?? "",
    versionId: url.searchParams.get("versionId"),
    range: (req.headers.range as string | undefined) ?? null,
  });
  res.on("close", () => {
    if (!res.writableFinished) closedEarly += 1;
  });
  const xmlError = (status: number, code: string, message: string) => {
    res.writeHead(status, { "content-type": "application/xml" });
    res.end(
      `<?xml version="1.0"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`,
    );
  };
  if (mode === "invalid-range") return xmlError(416, "InvalidRange", "range");
  if (mode === "no-such-key") return xmlError(404, "NoSuchKey", "key");
  if (mode === "no-such-version") return xmlError(404, "NoSuchVersion", "version");
  if (mode === "no-such-bucket") return xmlError(404, "NoSuchBucket", "bucket");
  if (mode === "auth") return xmlError(401, "InvalidAccessKeyId", "auth");
  if (mode === "generic-404") {
    // Yanlış uç nokta / ara katman hata sayfası: S3 hata kodu taşımayan 404.
    res.writeHead(404, { "content-type": "text/html" });
    return res.end("<html><body>Not Found</body></html>");
  }
  if (mode === "cap")
    return xmlError(
      403,
      "AccessDenied",
      "Cannot download file, download bandwidth or transaction (Class B) cap exceeded.",
    );
  const match = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
  if (mode === "ignore-range" || match === null) {
    res.writeHead(200, {
      "content-length": OBJECT.length,
      "x-amz-version-id": "v1",
      "content-type": "application/pdf",
    });
    bytesSent += OBJECT.length;
    return res.end(OBJECT);
  }
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]), OBJECT.length - 1);
  const body = OBJECT.subarray(start, end + 1);
  res.writeHead(206, {
    "content-length": body.length,
    "content-range":
      mode === "bad-content-range"
        ? `bytes 0-1/${OBJECT.length}`
        : `bytes ${start}-${end}/${OBJECT.length}`,
    ...(mode === "missing-version"
      ? {}
      : {
          "x-amz-version-id":
            mode === "wrong-version" ? "v2" : (url.searchParams.get("versionId") ?? "v1"),
        }),
    "content-type": "application/pdf",
  });
  if (mode === "slow") {
    // Yavaş akış: 64 KiB parçalar; istemci iptal ederse kalan gönderilmez.
    let offset = 0;
    const timer = setInterval(() => {
      if (res.destroyed) return clearInterval(timer);
      const part = body.subarray(offset, offset + 65_536);
      offset += part.length;
      bytesSent += part.length;
      if (offset >= body.length) {
        clearInterval(timer);
        res.end(part);
      } else res.write(part);
    }, 20);
    return;
  }
  bytesSent += body.length;
  res.end(body);
}

let adapter: StorageAdapter;

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  adapter = createB2Adapter({
    keyId: "test",
    applicationKey: "test",
    bucket: "test-bucket",
    endpoint,
    region: "eu-central-003",
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mode = "honor";
  seen = [];
  bytesSent = 0;
  closedEarly = 0;
});

async function drain(stream: ReadableStream<Uint8Array>) {
  return (await new Response(stream).arrayBuffer()).byteLength;
}

describe("B2 adapter — aralık okuması (sahte S3, 127.0.0.1)", () => {
  it("Range ve versionId sağlayıcıya iletilir; yalnızca aralık baytları aktarılır", async () => {
    const object = await adapter.getObject(KEY, "v1", { range: { start: 1000, end: 1999 } });
    expect(seen).toEqual([{ method: "GET", versionId: "v1", range: "bytes=1000-1999" }]);
    expect(object.contentLength).toBe(1000);
    expect(object.contentRange).toEqual({ start: 1000, end: 1999, total: OBJECT.length });
    expect(object.versionId).toBe("v1");
    expect(await drain(object.body)).toBe(1000);
    expect(bytesSent).toBe(1000);
  });

  it("tam okuma Range göndermez; contentRange null", async () => {
    const object = await adapter.getObject(KEY, "v1");
    expect(seen[0]!.range).toBeNull();
    expect(object.contentRange).toBeNull();
    expect(await drain(object.body)).toBe(OBJECT.length);
  });

  it("sağlayıcı aralığı yok sayıp 200 dönerse INTEGRITY; gövde iptal edilir", async () => {
    mode = "ignore-range";
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 0, end: 99 } }),
    ).rejects.toMatchObject({ kind: "INTEGRITY", code: "range-ignored" });
  });

  it("bozuk/farklı Content-Range ve beklenmeyen versiyon çağırana bildirilir (servis reddeder)", async () => {
    mode = "bad-content-range";
    const bad = await adapter.getObject(KEY, "v1", { range: { start: 10, end: 19 } });
    expect(bad.contentRange).toEqual({ start: 0, end: 1, total: OBJECT.length });
    await bad.body.cancel();
    // PHASE 12.1 (REVIEW-06): beklenmeyen versiyon artık adapter'da reddedilir (gövde aktarılmaz).
    mode = "wrong-version";
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 10, end: 19 } }),
    ).rejects.toMatchObject({ kind: "INTEGRITY", code: "version-mismatch" });
  });

  it("sağlayıcı hataları sınıflandırılır (416 → UNAVAILABLE, cap → LIMIT); gövde/mesaj sızmaz", async () => {
    mode = "invalid-range";
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 0, end: 9 } }),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    mode = "cap";
    const error = await adapter
      .getObject(KEY, "v1", { range: { start: 0, end: 9 } })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "LIMIT" });
    expect(String((error as Error).message)).not.toContain("bandwidth");
  });

  it("istemci iptali sağlayıcı bağlantısını kapatır; kalan baytlar gönderilmez", async () => {
    mode = "slow";
    const object = await adapter.getObject(KEY, "v1", {
      range: { start: 0, end: OBJECT.length - 1 },
    });
    const reader = object.body.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(closedEarly).toBe(1);
    expect(bytesSent).toBeLessThan(OBJECT.length / 4);
  });

  it("AbortSignal: yanıt başlamadan iptal → istek iptal edilir", async () => {
    mode = "slow";
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 0, end: 9 }, signal: controller.signal }),
    ).rejects.toBeDefined();
  });
});

describe("B2 adapter — yanıt kimliği ve yokluk sınıflandırması (REVIEW-06, sahte S3)", () => {
  it("P1/P3: versiyona özgü istekte yanıt versiyonu eksikse INTEGRITY (version-missing); gövde iptal edilir", async () => {
    mode = "missing-version";
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 0, end: 1023 } }),
    ).rejects.toMatchObject({ kind: "INTEGRITY", code: "version-missing" });
    mode = "honor";
    const ok = await adapter.getObject(KEY, "v1", { range: { start: 0, end: 1023 } });
    expect(ok.versionId).toBe("v1");
    await ok.body.cancel();
  });

  it("P2: farklı versiyon bildiren yanıt INTEGRITY (version-mismatch)", async () => {
    mode = "wrong-version";
    await expect(
      adapter.getObject(KEY, "v1", { range: { start: 0, end: 1023 } }),
    ).rejects.toMatchObject({ kind: "INTEGRITY", code: "version-mismatch" });
  });

  it("P8: yalnızca adlandırılmış S3 yanıtları yokluk; ad taşımayan 404 ve NoSuchBucket yokluk DEĞİL", async () => {
    for (const [m, kind] of [
      ["no-such-key", "NOT_FOUND"],
      ["no-such-version", "NOT_FOUND"],
      ["no-such-bucket", "NOT_CONFIGURED"],
      ["generic-404", "UNAVAILABLE"],
    ] as const) {
      mode = m;
      await expect(adapter.getObject(KEY, "v1"), m).rejects.toMatchObject({ kind });
    }
  });

  it("P9: kimlik/uç nokta hataları yokluk sayılmaz (FORBIDDEN); silme 'zaten yok' saymaz", async () => {
    mode = "auth";
    await expect(adapter.getObject(KEY, "v1")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    await expect(adapter.deleteObjectVersion(KEY, "v1")).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
    mode = "generic-404";
    await expect(adapter.deleteObjectVersion(KEY, "v1")).rejects.toMatchObject({
      kind: "UNAVAILABLE",
    });
  });
});
