import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_RANGE_CHUNK_BYTES } from "@/config/constants";
import { openFailureResponse, pdfResponse } from "@/features/documents/http";
import {
  fileEtag,
  openDocumentFile,
  uploadDocumentFile,
  type FileActor,
  type FileRequestClass,
  type OpenFileDeps,
} from "@/features/documents/service";
import * as schema from "@/server/db/schema";
import { validatePdfIsolated } from "@/server/pdf/validate";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";

import { instrumentStorage } from "../support/instrumented-storage";
import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { multiPagePdf } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, createRuntimePool, fileGet, testId } from "./helpers";

/**
 * PHASE 11 (D-135) — güvenli HTTP Range ile dosya teslimi. YALNIZCA izole veritabanı + geçici yerel
 * private depolama, ölçümlü sağlayıcı sarmalayıcısıyla (gerçek B2 yok). Sentetik PDF'ler.
 */
describe.runIf(isIsolatedTestDatabase())(`dosya teslimi (Range) — ${ISOLATION_SKIP_REASON}`, () => {
  const pool = createRuntimePool(8);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let root: string;
  let meter: ReturnType<typeof instrumentStorage>;
  let admin: string;
  const createdUsers: string[] = [];
  const quota = { maxTotalBytes: 9_000_000_000, warningBytes: 8_000_000_000 };
  // > MAX_RANGE_CHUNK_BYTES: uzun aralık sınıflandırması sınanabilsin.
  const pdfA = multiPagePdf(10, 2_000_000);
  const pdfB = multiPagePdf(5, 300_000);

  beforeAll(async () => {
    owner = await connectOwner();
    root = await mkdtemp(join(tmpdir(), "cs-delivery-test-"));
    meter = instrumentStorage(await createLocalPrivateAdapter(root));
    const existing = await owner.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
    if (existing.rows[0]) admin = existing.rows[0].id;
    else {
      admin = testId();
      await owner.query(
        "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Test', $1 || '@staff.invalid', $2, 'admin')",
        [admin, `t_${randomUUID().slice(0, 8)}`],
      );
      createdUsers.push(admin);
    }
  });
  afterAll(async () => {
    await owner.query("DELETE FROM applications WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM services WHERE created_by_user_id = ANY($1::text[])", [
      createdUsers,
    ]);
    await owner.query("DELETE FROM users WHERE id = ANY($1::text[])", [createdUsers]);
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });
  beforeEach(() => meter.reset());

  const staff: () => FileActor = () => ({ kind: "STAFF", userId: admin });
  const deps = (extra: Partial<OpenFileDeps> = {}): OpenFileDeps => ({
    db,
    storage: async () => meter.adapter,
    ...extra,
  });

  async function seedWithFiles() {
    const app = await seedApplication(owner, admin, {
      documents: [{ title: "Pasaport" }, { title: "Banka Dökümü" }],
    });
    const reqs = (
      await owner.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [app.applicationId],
      )
    ).rows;
    const customer: FileActor = {
      kind: "CUSTOMER",
      applicationId: app.applicationId,
      tokenId: app.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const upload = async (requirementId: string, bytes: Buffer) => {
      const { version } = (
        await owner.query<{ version: number }>(
          "SELECT version FROM application_document_requirements WHERE id = $1",
          [requirementId],
        )
      ).rows[0]!;
      const result = await uploadDocumentFile(
        { db, storage: meter.adapter, quota, validatePdf: (b) => validatePdfIsolated(b) },
        staff(),
        { requirementId, expectedVersion: version, filename: "sentetik.pdf", bytes },
      );
      if (!result.ok) throw new Error(`upload ${result.code}`);
      return result.fileId;
    };
    const first = await upload(reqs[0]!.id, pdfA);
    const other = await upload(reqs[1]!.id, pdfB);
    meter.reset();
    return { app, customer, reqs, first, other, upload };
  }

  async function bytesOf(stream: ReadableStream<Uint8Array> | null) {
    if (stream === null) return Buffer.alloc(0);
    return Buffer.from(await new Response(stream).arrayBuffer());
  }

  async function versionOf(fileId: string) {
    return (
      await owner.query<{ storage_version_id: string; sha256: string }>(
        "SELECT storage_version_id, sha256 FROM application_document_files WHERE id = $1",
        [fileId],
      )
    ).rows[0]!;
  }

  async function auditCount(fileId: string, action: string) {
    return (
      await owner.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM audit_logs WHERE resource_id = $1 AND action = $2",
        [fileId, action],
      )
    ).rows[0]!.n;
  }

  it("personel + müşteri: tam GET (200) ve aralık GET (206) — tam bayt sınırları, kayıtlı versiyon iletilir", async () => {
    const { customer, first } = await seedWithFiles();
    const { storage_version_id: versionId } = await versionOf(first);

    for (const actor of [staff(), customer]) {
      meter.reset();
      const whole = await openDocumentFile(deps(), actor, fileGet(first));
      expect(whole.ok && whole.file.status).toBe(200);
      if (!whole.ok) throw new Error("open");
      expect(whole.file.range).toBeNull();
      expect((await bytesOf(whole.file.stream)).equals(pdfA)).toBe(true);
      expect(meter.gets()).toEqual([{ op: "get", versionId, range: null }]);

      for (const [header, start, end] of [
        ["bytes=0-65535", 0, 65_535],
        ["bytes=500000-500099", 500_000, 500_099],
        [`bytes=${pdfA.length - 10}-`, pdfA.length - 10, pdfA.length - 1],
        ["bytes=-2048", pdfA.length - 2048, pdfA.length - 1],
        [`bytes=${pdfA.length - 5}-${pdfA.length + 1000}`, pdfA.length - 5, pdfA.length - 1],
      ] as const) {
        meter.reset();
        const part = await openDocumentFile(
          deps(),
          actor,
          fileGet(first, "inline", { rangeHeader: header }),
        );
        if (!part.ok) throw new Error(`range ${header}`);
        expect(part.file.status).toBe(206);
        expect(part.file.range).toEqual({ start, end });
        expect(part.file.contentLength).toBe(end - start + 1);
        const body = await bytesOf(part.file.stream);
        expect(body.equals(pdfA.subarray(start, end + 1))).toBe(true);
        // Sağlayıcıya YALNIZCA aralık iletilir (tam indirme + kesme yok), doğru versiyonla; HEAD yok.
        expect(meter.calls).toEqual([{ op: "get", versionId, range: { start, end } }]);
        expect(meter.counters.bytesRead).toBe(end - start + 1);
      }
    }
  });

  it("HEAD: aynı yetki, gövdesiz, sağlayıcıya hiç gidilmez; yetkisiz HEAD → 404", async () => {
    const { app, customer, first } = await seedWithFiles();
    const head = await openDocumentFile(
      deps(),
      customer,
      fileGet(first, "inline", { method: "HEAD" }),
    );
    expect(head.ok).toBe(true);
    if (!head.ok) throw new Error("head");
    expect(head.file).toMatchObject({ status: 200, stream: null, contentLength: pdfA.length });
    const other = await seedApplication(owner, admin);
    const stranger: FileActor = {
      kind: "CUSTOMER",
      applicationId: other.applicationId,
      tokenId: other.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    expect(
      await openDocumentFile(deps(), stranger, fileGet(first, "inline", { method: "HEAD" })),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(meter.calls).toEqual([]);
    expect(app.applicationId).not.toBe(other.applicationId);
  });

  it("kapsam: başka başvuru, eski bağlam, süresi dolmuş oturum, iptal/yenilenmiş token → 404 ve sağlayıcı isteği yok", async () => {
    const { app, customer, first } = await seedWithFiles();
    const other = await seedApplication(owner, admin);
    const range = { rangeHeader: "bytes=0-1023" };
    const denied: FileActor[] = [
      // Başka başvurunun oturumu (bağlam başka başvuruyu gösteriyor).
      { ...customer, applicationId: other.applicationId, tokenId: other.tokenId },
      // Oturum başvurusu doğru ama token başka başvurunun (eski/yanlış bağlam birleşimi).
      { ...customer, tokenId: other.tokenId },
      // Süresi dolmuş oturum.
      { ...customer, sessionExpiresAt: Math.floor(Date.now() / 1000) - 1 },
    ];
    for (const actor of denied) {
      expect(await openDocumentFile(deps(), actor, fileGet(first, "inline", range))).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    }
    // Bağlantı yenileme = eski token iptal + yeni token: eski oturum artık erişemez.
    await owner.query(
      "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'ROTATED', revoked_by_user_id = $1 WHERE id = $2",
      [admin, app.tokenId],
    );
    expect(await openDocumentFile(deps(), customer, fileGet(first, "inline", range))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(meter.calls).toEqual([]);
  });

  it("değiştirilen versiyon: müşteri eski dosyaya erişemez (Range dahil); personel eski versiyonun doğru baytlarını alır", async () => {
    const { customer, reqs, first, upload } = await seedWithFiles();
    const replacement = multiPagePdf(3, 200_000);
    const second = await upload(reqs[0]!.id, replacement);
    meter.reset();
    expect(
      await openDocumentFile(
        deps(),
        customer,
        fileGet(first, "inline", { rangeHeader: "bytes=0-99" }),
      ),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(meter.calls).toEqual([]);

    const oldVersion = await versionOf(first);
    const staffOld = await openDocumentFile(
      deps(),
      staff(),
      fileGet(first, "inline", { rangeHeader: "bytes=100-199" }),
    );
    if (!staffOld.ok) throw new Error("staff old");
    expect((await bytesOf(staffOld.file.stream)).equals(pdfA.subarray(100, 200))).toBe(true);
    expect(meter.gets()[0]!.versionId).toBe(oldVersion.storage_version_id);

    const current = await openDocumentFile(
      deps(),
      customer,
      fileGet(second, "inline", { rangeHeader: "bytes=100-199" }),
    );
    if (!current.ok) throw new Error("current");
    expect((await bytesOf(current.file.stream)).equals(replacement.subarray(100, 200))).toBe(true);
    // ETag dosyaya özgüdür: eski dosyanın ETag'i yeni dosyada If-Range'i tutmaz → tam yanıt.
    const crossEtag = await openDocumentFile(
      deps(),
      customer,
      fileGet(second, "inline", {
        rangeHeader: "bytes=0-9",
        ifRange: fileEtag(first, oldVersion.sha256),
      }),
    );
    if (!crossEtag.ok) throw new Error("if-range");
    expect(crossEtag.file.status).toBe(200);
    await crossEtag.file.stream?.cancel();
  });

  it("silme talep edilmiş başvuru: personel ve müşteri → 404, sağlayıcı isteği yok", async () => {
    const { app, customer, first } = await seedWithFiles();
    await owner.query(
      "UPDATE applications SET deletion_requested_at = now(), deletion_requested_by_user_id = $1 WHERE id = $2",
      [admin, app.applicationId],
    );
    for (const actor of [staff(), customer]) {
      expect(
        await openDocumentFile(
          deps(),
          actor,
          fileGet(first, "inline", { rangeHeader: "bytes=0-9" }),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
    }
    expect(meter.calls).toEqual([]);
  });

  it("416: karşılanamaz/çoklu/bozuk aralık sağlayıcıya gitmeden reddedilir; Content-Range bytes */boyut", async () => {
    const { first } = await seedWithFiles();
    for (const header of [`bytes=${pdfA.length}-`, "bytes=0-1,4-5", "bytes=9-3", "bytes=abc"]) {
      const result = await openDocumentFile(
        deps(),
        staff(),
        fileGet(first, "inline", { rangeHeader: header }),
      );
      expect(result).toEqual({ ok: false, code: "RANGE_NOT_SATISFIABLE", sizeBytes: pdfA.length });
    }
    expect(meter.calls).toEqual([]);
    const response = openFailureResponse("RANGE_NOT_SATISFIABLE", pdfA.length);
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${pdfA.length}`);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("If-Range: güçlü ETag eşleşirse 206; aksi (tarih/zayıf/farklı) tam 200", async () => {
    const { first } = await seedWithFiles();
    const { sha256 } = await versionOf(first);
    const etag = fileEtag(first, sha256);
    const match = await openDocumentFile(
      deps(),
      staff(),
      fileGet(first, "inline", { rangeHeader: "bytes=0-9", ifRange: etag }),
    );
    expect(match.ok && match.file.status).toBe(206);
    if (match.ok) await bytesOf(match.file.stream);
    for (const ifRange of [`W/${etag}`, '"baska"', "Wed, 21 Oct 2026 07:28:00 GMT"]) {
      const result = await openDocumentFile(
        deps(),
        staff(),
        fileGet(first, "inline", { rangeHeader: "bytes=0-9", ifRange }),
      );
      expect(result.ok && result.file.status).toBe(200);
      if (result.ok) await result.file.stream?.cancel();
    }
    // ETag storage anahtarını/versiyonunu veya içerik hash'ini açığa çıkarmaz.
    const version = await versionOf(first);
    expect(etag).not.toContain(version.storage_version_id);
    expect(etag).not.toContain(sha256.slice(0, 16));
  });

  it("200/206 yanıt başlıkları: Accept-Ranges, Content-Range, ETag, no-store, nosniff, CORP; CORS yok", async () => {
    const { first } = await seedWithFiles();
    const part = await openDocumentFile(
      deps(),
      staff(),
      fileGet(first, "inline", { rangeHeader: "bytes=10-19" }),
    );
    if (!part.ok) throw new Error("part");
    const response = pdfResponse(part.file, "inline");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 10-19/${pdfA.length}`);
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect((await response.arrayBuffer()).byteLength).toBe(10);
    const whole = await openDocumentFile(deps(), staff(), fileGet(first, "attachment"));
    if (!whole.ok) throw new Error("whole");
    const download = pdfResponse(whole.file, "attachment");
    expect(download.status).toBe(200);
    expect(download.headers.get("content-range")).toBeNull();
    expect(download.headers.get("content-security-policy")).toContain("sandbox");
    await download.body?.cancel();
  });

  it("sağlayıcı uyuşmazlığı (yanlış aralık / toplam boyut / versiyon / uzunluk) güvenle reddedilir; gövde iptal edilir", async () => {
    const { first } = await seedWithFiles();
    const tampers = [
      (o: Parameters<NonNullable<Parameters<typeof meter.setTamper>[0]>>[0]) => ({
        ...o,
        contentRange: o.contentRange && { ...o.contentRange, start: o.contentRange.start + 1 },
      }),
      (o: Parameters<NonNullable<Parameters<typeof meter.setTamper>[0]>>[0]) => ({
        ...o,
        contentRange: o.contentRange && { ...o.contentRange, total: o.contentRange.total + 1 },
      }),
      (o: Parameters<NonNullable<Parameters<typeof meter.setTamper>[0]>>[0]) => ({
        ...o,
        versionId: "beklenmeyen-versiyon",
      }),
      (o: Parameters<NonNullable<Parameters<typeof meter.setTamper>[0]>>[0]) => ({
        ...o,
        contentLength: o.contentLength + 1,
      }),
      (o: Parameters<NonNullable<Parameters<typeof meter.setTamper>[0]>>[0]) => ({
        ...o,
        contentRange: null,
      }),
    ];
    for (const tamper of tampers) {
      meter.reset();
      meter.setTamper(tamper);
      expect(
        await openDocumentFile(
          deps(),
          staff(),
          fileGet(first, "inline", { rangeHeader: "bytes=0-99" }),
        ),
      ).toEqual({ ok: false, code: "INTEGRITY" });
      expect(meter.counters.cancels).toBe(1);
    }
    // Tam okumada sağlayıcı aralık bildirirse de reddedilir.
    meter.reset();
    meter.setTamper((o) => ({ ...o, contentRange: { start: 0, end: 9, total: pdfA.length } }));
    expect(await openDocumentFile(deps(), staff(), fileGet(first))).toEqual({
      ok: false,
      code: "INTEGRITY",
    });
  });

  it("sağlayıcı gövdesi beyan edilenden kısa/uzunsa akış hata ile kesilir (eksik dosya tamamlanmış sayılmaz)", async () => {
    const { first } = await seedWithFiles();
    meter.setTamper((o) => {
      const reader = o.body.getReader();
      let sent = false;
      return {
        ...o,
        body: new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (sent) {
              await reader.cancel();
              controller.close();
              return;
            }
            const chunk = await reader.read();
            sent = true;
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value.subarray(0, 5));
          },
        }),
      };
    });
    const result = await openDocumentFile(
      deps(),
      staff(),
      fileGet(first, "inline", { rangeHeader: "bytes=0-99" }),
    );
    if (!result.ok) throw new Error("open");
    await expect(bytesOf(result.file.stream)).rejects.toBeInstanceOf(StorageError);
  });

  it("istemci iptali sağlayıcı gövdesini iptal eder (kaynak serbest kalır; kalan bayt okunmaz)", async () => {
    const { first } = await seedWithFiles();
    const result = await openDocumentFile(deps(), staff(), fileGet(first));
    if (!result.ok || result.file.stream === null) throw new Error("open");
    const reader = result.file.stream.getReader();
    await reader.read();
    await reader.cancel();
    expect(meter.counters.cancels).toBe(1);
    expect(meter.counters.bytesRead).toBeLessThan(pdfA.length);
  });

  it("AbortSignal sağlayıcı okumasına iletilir", async () => {
    const { first } = await seedWithFiles();
    const controller = new AbortController();
    const result = await openDocumentFile(deps(), staff(), {
      ...fileGet(first),
      signal: controller.signal,
    });
    if (!result.ok || result.file.stream === null) throw new Error("open");
    controller.abort();
    await expect(bytesOf(result.file.stream)).rejects.toBeDefined();
    expect(meter.counters.bytesRead).toBeLessThan(pdfA.length);
  });

  it("kota/cap ve geçici sağlayıcı hataları sınıflandırılır (STORAGE_LIMIT / STORAGE_UNAVAILABLE / INTEGRITY)", async () => {
    const { first } = await seedWithFiles();
    const cases: [StorageError, string][] = [
      [new StorageError("LIMIT", "403:AccessDenied"), "STORAGE_LIMIT"],
      [new StorageError("UNAVAILABLE", "503"), "STORAGE_UNAVAILABLE"],
      [new StorageError("NOT_FOUND"), "INTEGRITY"],
      [new StorageError("INTEGRITY", "range-ignored"), "INTEGRITY"],
    ];
    for (const [error, code] of cases) {
      meter.reset();
      meter.setFailure(error);
      expect(
        await openDocumentFile(
          deps(),
          staff(),
          fileGet(first, "inline", { rangeHeader: "bytes=0-9" }),
        ),
      ).toEqual({ ok: false, code });
    }
    expect(openFailureResponse("STORAGE_LIMIT").status).toBe(503);
    expect(openFailureResponse("INTEGRITY").status).toBe(502);
    expect(openFailureResponse("RATE_LIMITED").status).toBe(429);
  });

  it("rate limit sınıfları: tam/uzun = transfer, kısa aralık = chunk, HEAD/416/404 = meta; ret → sağlayıcıya gidilmez", async () => {
    const { first } = await seedWithFiles();
    const seen: FileRequestClass[] = [];
    const allow = async (c: FileRequestClass) => {
      seen.push(c);
      return true;
    };
    const run = async (extra: Parameters<typeof fileGet>[2], id = first) => {
      const result = await openDocumentFile(deps({ allow }), staff(), fileGet(id, "inline", extra));
      if (result.ok) await result.file.stream?.cancel();
    };
    await run({});
    await run({ rangeHeader: `bytes=0-${MAX_RANGE_CHUNK_BYTES - 1}` });
    await run({ rangeHeader: `bytes=0-${MAX_RANGE_CHUNK_BYTES}` });
    await run({ method: "HEAD" });
    await run({ rangeHeader: `bytes=${pdfA.length}-` });
    await run({}, randomUUID());
    expect(seen).toEqual(["transfer", "chunk", "transfer", "meta", "meta", "meta"]);

    meter.reset();
    const denied = await openDocumentFile(
      deps({ allow: async () => false }),
      staff(),
      fileGet(first, "inline", { rangeHeader: "bytes=0-9" }),
    );
    expect(denied).toEqual({ ok: false, code: "RATE_LIMITED" });
    expect(meter.calls).toEqual([]);
  });

  it("audit: parça istekleri pencere başına bir DOCUMENT_VIEWED; tam istekler her seferinde; HEAD/416 kaydedilmez", async () => {
    const { other } = await seedWithFiles();
    const viewedBefore = await auditCount(other, "DOCUMENT_VIEWED");
    for (const header of ["bytes=0-65535", "bytes=65536-131071", "bytes=-1024"]) {
      const result = await openDocumentFile(
        deps(),
        staff(),
        fileGet(other, "inline", { rangeHeader: header }),
      );
      if (result.ok) await bytesOf(result.file.stream);
    }
    expect((await auditCount(other, "DOCUMENT_VIEWED")) - viewedBefore).toBe(1);
    await openDocumentFile(deps(), staff(), fileGet(other, "inline", { method: "HEAD" }));
    await openDocumentFile(
      deps(),
      staff(),
      fileGet(other, "inline", { rangeHeader: "bytes=9999999-" }),
    );
    expect((await auditCount(other, "DOCUMENT_VIEWED")) - viewedBefore).toBe(1);
    for (let i = 0; i < 2; i += 1) {
      const result = await openDocumentFile(deps(), staff(), fileGet(other, "attachment"));
      if (result.ok) await result.file.stream?.cancel();
    }
    expect(await auditCount(other, "DOCUMENT_DOWNLOADED")).toBe(2);
  });

  // ---------------------------------------------------------------- PHASE 12 (D-135 koşulu)

  async function auditRows(fileId: string, action: string) {
    return (
      await owner.query<{ actor_user_id: string | null; actor_access_token_id: string | null }>(
        "SELECT actor_user_id, actor_access_token_id FROM audit_logs WHERE resource_id = $1 AND action = $2 ORDER BY id",
        [fileId, action],
      )
    ).rows;
  }

  it("audit tekilleştirme — deterministik kilit sırası: işaret satırı başka bağlantıda kilitliyken istek bekler (pg_stat_activity); sonuç tek kayıt", async () => {
    const { other } = await seedWithFiles();
    const key = `files:viewed:user:${admin}:${other}:inline`;
    const blocker = await connectOwner();
    try {
      // Bağımsız bağlantı: aynı işaret anahtarını commit etmeden ekler (uygulamanın upsert'i bu satırda bekler).
      await blocker.query("BEGIN");
      await blocker.query(
        "INSERT INTO rate_limit_buckets (key, window_started_at, count, expires_at) VALUES ($1, now(), 1, now() + interval '10 minutes')",
        [key],
      );
      const pending = openDocumentFile(
        deps(),
        staff(),
        fileGet(other, "inline", { rangeHeader: "bytes=0-1023" }),
      );
      // Gerçek kilit beklemesi kanıtı.
      await expect
        .poll(
          async () =>
            (
              await owner.query<{ n: number }>(
                "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%rate_limit_buckets%'",
              )
            ).rows[0]!.n,
          { timeout: 5_000 },
        )
        .toBeGreaterThan(0);
      // Diğer bağlantı işareti commit eder → uygulamanın isteği pencerenin İKİNCİ isteği olur → audit yazmaz.
      await blocker.query("COMMIT");
      const result = await pending;
      if (result.ok) await result.file.stream?.cancel();
      expect(await auditRows(other, "DOCUMENT_VIEWED")).toEqual([]);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await blocker.end();
    }
  });

  it("audit tekilleştirme — eşzamanlı parça istekleri (ayrı havuz bağlantıları) tek DOCUMENT_VIEWED üretir", async () => {
    const { other } = await seedWithFiles();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        openDocumentFile(
          deps(),
          staff(),
          fileGet(other, "inline", { rangeHeader: `bytes=${i * 1024}-${i * 1024 + 1023}` }),
        ),
      ),
    );
    for (const result of results) if (result.ok) await result.file.stream?.cancel();
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await auditRows(other, "DOCUMENT_VIEWED")).toHaveLength(1);
  });

  it("audit tekilleştirme aktörleri/dosyaları birleştirmez: ADMIN, EMPLOYEE ve müşteri ayrı kayıt; farklı dosya ayrı; indirme bastırılmaz", async () => {
    const { customer, first, other } = await seedWithFiles();
    const employee: FileActor = { kind: "STAFF", userId: testId() };
    const chunk = { rangeHeader: "bytes=0-1023" };
    for (const [actor, fileId] of [
      [staff(), other],
      [employee, other],
      [customer, other],
      [staff(), first],
      [staff(), other], // aynı aktör + dosya, pencere içinde → yeni kayıt yok
    ] as const) {
      const result = await openDocumentFile(deps(), actor, fileGet(fileId, "inline", chunk));
      if (result.ok) await result.file.stream?.cancel();
    }
    const viewed = await auditRows(other, "DOCUMENT_VIEWED");
    expect(viewed).toHaveLength(3);
    expect(viewed.map((r) => r.actor_user_id ?? `token:${r.actor_access_token_id}`)).toEqual([
      admin,
      employee.kind === "STAFF" ? employee.userId : "",
      `token:${customer.kind === "CUSTOMER" ? customer.tokenId : ""}`,
    ]);
    expect(await auditRows(first, "DOCUMENT_VIEWED")).toHaveLength(1);
    // İndirme (attachment) parça isteği ayrı biçim anahtarıdır: görüntüleme işareti onu bastırmaz.
    const download = await openDocumentFile(deps(), staff(), fileGet(other, "attachment", chunk));
    if (download.ok) await download.file.stream?.cancel();
    expect(await auditRows(other, "DOCUMENT_DOWNLOADED")).toHaveLength(1);
  });

  it("rate limit sınıfı: If-Range uyuşmazlığı tam yanıta düşer → transfer sınıfı; normalize uzunluk sınırı tam 1 MiB", async () => {
    const { first } = await seedWithFiles();
    const seen: FileRequestClass[] = [];
    const allow = async (c: FileRequestClass) => {
      seen.push(c);
      return true;
    };
    const run = async (extra: Parameters<typeof fileGet>[2]) => {
      const result = await openDocumentFile(
        deps({ allow }),
        staff(),
        fileGet(first, "inline", extra),
      );
      if (result.ok) await result.file.stream?.cancel();
      return result;
    };
    const mismatch = await run({ rangeHeader: "bytes=0-9", ifRange: '"baska-etiket"' });
    expect(mismatch.ok && mismatch.file.status).toBe(200);
    // Açık uçlu/sonek aralık normalize edilmiş uzunlukla sınıflanır.
    await run({ rangeHeader: `bytes=-${MAX_RANGE_CHUNK_BYTES}` });
    await run({ rangeHeader: `bytes=-${MAX_RANGE_CHUNK_BYTES + 1}` });
    await run({ rangeHeader: `bytes=${pdfA.length - 10}-` });
    expect(seen).toEqual(["transfer", "chunk", "transfer", "chunk"]);
  });
});
