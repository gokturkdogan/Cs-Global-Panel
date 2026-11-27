import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { STORAGE_DEFAULT_WARNING_BYTES, STORAGE_HARD_MAX_TOTAL_BYTES } from "@/config/constants";
import {
  precheckUpload,
  uploadDocumentFile,
  type FileActor,
  type UploadDeps,
} from "@/features/documents/service";
import * as schema from "@/server/db/schema";
import { validatePdfIsolated } from "@/server/pdf/validate";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { capacityOf, readStorageUsage } from "@/server/storage/quota";
import type { StorageAdapter } from "@/server/storage/types";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { fixtures } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { connectOwner, createRuntimePool, expectPgError, testId } from "./helpers";

/**
 * PHASE 11.1 (OD-26): hedef 100 GB sınır / 90 GB uyarı — YALNIZCA izole veritabanı + geçici yerel depolama.
 * 100 GB dosya oluşturulmaz: sınıra sentetik kayıt dışı kullanım (`untracked_bytes`) ile yaklaşılır; gerçek
 * yükleme hattı (rezervasyon → storage → aktivasyon) çalışır. Göreli kotalarla aynı mekanizmalar
 * (`documents.test.ts`, A–K, R1–R7) ayrıca test edilir.
 */
describe.runIf(isIsolatedTestDatabase())(
  `depolama kapasitesi 100 GB — ${ISOLATION_SKIP_REASON}`,
  () => {
    const pool = createRuntimePool(8);
    const db = drizzle({ client: pool, schema });
    const quota = {
      maxTotalBytes: STORAGE_HARD_MAX_TOTAL_BYTES,
      warningBytes: STORAGE_DEFAULT_WARNING_BYTES,
    };
    const pdf = fixtures.valid();
    let owner: pg.Client;
    let root: string;
    let local: StorageAdapter;
    let admin: string;
    const createdUsers: string[] = [];

    beforeAll(async () => {
      owner = await connectOwner();
      root = await mkdtemp(join(tmpdir(), "cs-capacity-test-"));
      local = await createLocalPrivateAdapter(root);
      const existing = await owner.query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'admin'",
      );
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
    afterEach(async () => {
      await owner.query("UPDATE storage_quota_state SET untracked_bytes = 0 WHERE id = 1");
    });
    afterAll(async () => {
      await owner.query("DELETE FROM applications WHERE created_by_user_id = ANY($1::text[])", [
        createdUsers,
      ]);
      await owner.query("DELETE FROM services WHERE created_by_user_id = ANY($1::text[])", [
        createdUsers,
      ]);
      await owner.query("DELETE FROM users WHERE id = ANY($1::text[])", [createdUsers]);
      await owner.query(
        "UPDATE storage_quota_state SET untracked_bytes = 0, reconciled_at = NULL WHERE id = 1",
      );
      await owner.end();
      await pool.end();
      await rm(root, { recursive: true, force: true });
    });

    const staff = (): FileActor => ({ kind: "STAFF", userId: admin });
    const deps = (storage: StorageAdapter = local): UploadDeps => ({
      db,
      storage,
      quota,
      validatePdf: (bytes) => validatePdfIsolated(bytes),
    });

    async function seedRequirement() {
      const app = await seedApplication(owner, admin, { documents: [{ title: "Pasaport" }] });
      const { rows } = await owner.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1",
        [app.applicationId],
      );
      return rows[0]!.id;
    }
    async function versionOf(requirementId: string) {
      const { rows } = await owner.query<{ version: number }>(
        "SELECT version FROM application_document_requirements WHERE id = $1",
        [requirementId],
      );
      return rows[0]!.version;
    }
    const upload = async (requirementId: string, storage: StorageAdapter = local) =>
      uploadDocumentFile(deps(storage), staff(), {
        requirementId,
        expectedVersion: await versionOf(requirementId),
        filename: "a.pdf",
        bytes: pdf,
      });
    /** Toplam kullanım = hedef değer olacak şekilde kayıt dışı kullanım ayarlanır (sentetik muhasebe). */
    async function setTotal(target: number) {
      await owner.query("UPDATE storage_quota_state SET untracked_bytes = 0 WHERE id = 1");
      const usage = await readStorageUsage(db);
      const untracked = target - usage.total;
      expect(untracked).toBeGreaterThanOrEqual(0);
      await owner.query("UPDATE storage_quota_state SET untracked_bytes = $1 WHERE id = 1", [
        untracked,
      ]);
    }

    it("yapılandırma sabitleri: 100 GB sınır, 90 GB uyarı (ondalık bayt)", () => {
      expect(quota).toEqual({ maxTotalBytes: 100_000_000_000, warningBytes: 90_000_000_000 });
    });

    it("90 GB uyarı sınırı DB muhasebesiyle: bir bayt altı ok, tam sınır warning", async () => {
      await setTotal(89_999_999_999);
      expect(capacityOf(await readStorageUsage(db), quota).state).toBe("ok");
      await setTotal(90_000_000_000);
      expect(capacityOf(await readStorageUsage(db), quota).state).toBe("warning");
    });

    it("100 GB sınır: tam sığan yükleme kabul edilir; sonraki yükleme ön kontrolde ve rezervasyonda reddedilir", async () => {
      const first = await seedRequirement();
      const second = await seedRequirement();
      await setTotal(100_000_000_000 - pdf.length);
      const ok = await upload(first);
      expect(ok.ok).toBe(true);
      const usage = await readStorageUsage(db);
      expect(usage.total).toBe(100_000_000_000);
      expect(capacityOf(usage, quota)).toMatchObject({ state: "full", remainingBytes: 0 });
      expect(
        await precheckUpload({ db, quota }, staff(), {
          requirementId: second,
          expectedVersion: await versionOf(second),
          sizeBytes: 1,
        }),
      ).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
      expect(await upload(second)).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    });

    it("eşzamanlı rezervasyon sınırda atomiktir: yalnızca sığan kadar kabul edilir", async () => {
      const requirements = [
        await seedRequirement(),
        await seedRequirement(),
        await seedRequirement(),
      ];
      await setTotal(100_000_000_000 - pdf.length * 2);
      const slow: StorageAdapter = {
        ...local,
        async putObject(input) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return local.putObject(input);
        },
      };
      const results = await Promise.all(requirements.map((id) => upload(id, slow)));
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: "QUOTA_EXCEEDED" }]);
      expect((await readStorageUsage(db)).total).toBe(100_000_000_000);
    });

    it("önceki versiyonlar, devam eden rezervasyon ve sonucu belirsiz yazım kotada kalır", async () => {
      const requirement = await seedRequirement();
      await upload(requirement);
      const before = await readStorageUsage(db);
      await upload(requirement); // v1 SUPERSEDED kotada kalır
      const afterReplace = await readStorageUsage(db);
      expect(afterReplace.total - before.total).toBe(pdf.length);
      expect(afterReplace.history - before.history).toBe(pdf.length);

      // Sonucu belirsiz PUT: nesne oluşmuş olabilir → kullanım serbest bırakılmaz.
      const ambiguous: StorageAdapter = {
        ...local,
        async putObject() {
          throw new StorageError("AMBIGUOUS", "timeout");
        },
      };
      const other = await seedRequirement();
      const failed = await upload(other, ambiguous);
      expect(failed.ok).toBe(false);
      const afterUnknown = await readStorageUsage(db);
      expect(afterUnknown.total - afterReplace.total).toBe(pdf.length);
      const { rows } = await owner.query<{ state: string }>(
        "SELECT w.state FROM storage_write_attempts w JOIN application_document_files f ON f.id = w.file_id WHERE f.requirement_id = $1",
        [other],
      );
      expect(rows.map((r) => r.state)).toEqual(["UNKNOWN"]);

      // Sınırda: belirsiz kullanım sayıldığı için yeni yükleme sığmaz.
      await setTotal(100_000_000_000);
      expect(await upload(await seedRequirement())).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    });

    it("kayıt dışı kullanım negatif olamaz (DB CHECK); kalan kapasite negatif gösterilmez", async () => {
      await expectPgError(
        owner.query("UPDATE storage_quota_state SET untracked_bytes = -1 WHERE id = 1"),
        "23514",
      );
      await owner.query(
        "UPDATE storage_quota_state SET untracked_bytes = $1 WHERE id = 1",
        [150_000_000_000],
      );
      const capacity = capacityOf(await readStorageUsage(db), quota);
      expect(capacity).toMatchObject({ state: "full", remainingBytes: 0 });
      expect(Number.isSafeInteger(capacity.total)).toBe(true);
    });
  },
);
