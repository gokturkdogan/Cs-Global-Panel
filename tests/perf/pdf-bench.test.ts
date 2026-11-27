import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PDF_VIEWER_CHUNK_BYTES } from "@/config/constants";
import { openDocumentFile, uploadDocumentFile, type FileActor } from "@/features/documents/service";
import * as schema from "@/server/db/schema";
import { validatePdfIsolated } from "@/server/pdf/validate";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";

import { connectOwner, createRuntimePool, fileGet, testId } from "../integration/helpers";
import { instrumentStorage } from "../support/instrumented-storage";
import { isIsolatedTestDatabase } from "../support/isolation";
import { multiPagePdf } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";

/**
 * PHASE 11 sağlayıcı trafiği benchmark'ı B11–B16 (D-135) — YALNIZCA izole veritabanı + ölçümlü yerel
 * sağlayıcı (gerçek B2 yok). "Eski" sütun PHASE 10 davranışıdır (Range yok: her açılış/HEAD/aralık isteği
 * tam nesne GET'i — `Accept-Ranges: none`); "yeni" sütun ölçülen değerdir.
 */
describe.runIf(isIsolatedTestDatabase())("PHASE 11 PDF sağlayıcı trafiği (B11–B16)", () => {
  const pool = createRuntimePool(8);
  const db = drizzle({ client: pool, schema });
  let owner: pg.Client;
  let root: string;
  let meter: ReturnType<typeof instrumentStorage>;
  let admin: string;
  const results: Record<string, unknown> = {};
  const pdf = multiPagePdf(100, 10_000_000);

  beforeAll(async () => {
    owner = await connectOwner();
    root = await mkdtemp(join(tmpdir(), "cs-bench-"));
    meter = instrumentStorage(await createLocalPrivateAdapter(root));
    const existing = await owner.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
    if (existing.rows[0]) admin = existing.rows[0].id;
    else {
      admin = testId();
      await owner.query(
        "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Bench', $1 || '@staff.invalid', $2, 'admin')",
        [admin, `t_${randomUUID().slice(0, 8)}`],
      );
    }
  });
  afterAll(async () => {
    mkdirSync("perf-results", { recursive: true });
    writeFileSync("perf-results/pdf-bench.json", `${JSON.stringify(results, null, 2)}\n`);
    await owner.end();
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  it("B11–B16", async () => {
    const app = await seedApplication(owner, admin, { documents: [{ title: "Pasaport" }] });
    const other = await seedApplication(owner, admin);
    const requirementId = (
      await owner.query<{ id: string; version: number }>(
        "SELECT id, version FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      )
    ).rows[0]!;
    const staff: FileActor = { kind: "STAFF", userId: admin };
    const upload = async (bytes: Buffer) => {
      const { version } = (
        await owner.query<{ version: number }>(
          "SELECT version FROM application_document_requirements WHERE id = $1",
          [requirementId.id],
        )
      ).rows[0]!;
      const result = await uploadDocumentFile(
        {
          db,
          storage: meter.adapter,
          quota: { maxTotalBytes: 9e9, warningBytes: 8e9 },
          validatePdf: (b) => validatePdfIsolated(b),
        },
        staff,
        { requirementId: requirementId.id, expectedVersion: version, filename: "b.pdf", bytes },
      );
      if (!result.ok) throw new Error(result.code);
      return result.fileId;
    };
    const oldFile = await upload(pdf);
    const current = await upload(multiPagePdf(2, 100_000));
    const customer: FileActor = {
      kind: "CUSTOMER",
      applicationId: app.applicationId,
      tokenId: app.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const stranger: FileActor = {
      kind: "CUSTOMER",
      applicationId: other.applicationId,
      tokenId: other.tokenId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const deps = { db, storage: async () => meter.adapter };
    const measure = async (run: () => Promise<void>) => {
      meter.reset();
      await run();
      return {
        providerGets: meter.gets().length,
        providerHeads: meter.calls.filter((c) => c.op === "head").length,
        upstreamBytes: meter.counters.bytesRead,
      };
    };
    const drain = async (result: Awaited<ReturnType<typeof openDocumentFile>>) => {
      if (result.ok && result.file.stream) await new Response(result.file.stream).arrayBuffer();
    };

    results.B11_unauthorizedRange = {
      new: await measure(async () => {
        await drain(
          await openDocumentFile(
            deps,
            stranger,
            fileGet(current, "inline", { rangeHeader: "bytes=0-65535" }),
          ),
        );
      }),
      old: { providerGets: 0, upstreamBytes: 0, note: "PHASE 10'da da yetki storage'dan önceydi" },
    };
    results.B12_unsatisfiableRange = {
      new: await measure(async () => {
        await drain(
          await openDocumentFile(
            deps,
            staff,
            fileGet(oldFile, "inline", { rangeHeader: `bytes=${pdf.length}-` }),
          ),
        );
      }),
      old: { providerGets: 1, upstreamBytes: pdf.length, note: "Range yok sayılır → tam 200" },
    };
    results.B13_customerSupersededRange = {
      new: await measure(async () => {
        await drain(
          await openDocumentFile(
            deps,
            customer,
            fileGet(oldFile, "inline", { rangeHeader: "bytes=0-1023" }),
          ),
        );
      }),
      old: { providerGets: 0, upstreamBytes: 0 },
    };
    results.B14_cancelAfterFirstChunk = {
      new: await measure(async () => {
        const result = await openDocumentFile(deps, staff, fileGet(oldFile));
        if (!result.ok || result.file.stream === null) throw new Error("open");
        const reader = result.file.stream.getReader();
        await reader.read();
        await reader.cancel();
      }),
      cancels: meter.counters.cancels,
      fileBytes: pdf.length,
    };
    results.B15_head = {
      new: await measure(async () => {
        await openDocumentFile(deps, staff, fileGet(oldFile, "inline", { method: "HEAD" }));
      }),
      old: {
        providerGets: 1,
        upstreamBytes: "≥ ilk akış parçası (Next.js HEAD → GET işleyicisi, gövde atılır)",
      },
    };
    // B16: 5 eşzamanlı görüntüleyici, her biri ilk parça + dosya sonu (xref) parçası ister.
    const viewers = 5;
    results.B16_concurrentViewers = {
      viewers,
      new: await measure(async () => {
        await Promise.all(
          Array.from({ length: viewers }, async () => {
            await drain(
              await openDocumentFile(
                deps,
                staff,
                fileGet(oldFile, "inline", {
                  rangeHeader: `bytes=0-${PDF_VIEWER_CHUNK_BYTES - 1}`,
                }),
              ),
            );
            await drain(
              await openDocumentFile(
                deps,
                staff,
                fileGet(oldFile, "inline", { rangeHeader: `bytes=-${PDF_VIEWER_CHUNK_BYTES}` }),
              ),
            );
          }),
        );
      }),
      old: { providerGets: viewers, upstreamBytes: viewers * pdf.length },
    };
    const b16 = results.B16_concurrentViewers as { new: { upstreamBytes: number } };
    expect(b16.new.upstreamBytes).toBe(viewers * 2 * PDF_VIEWER_CHUNK_BYTES);
    expect(
      (results.B11_unauthorizedRange as { new: { providerGets: number } }).new.providerGets,
    ).toBe(0);
  }, 120_000);
});
