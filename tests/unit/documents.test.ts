import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, DOCUMENT_STATUSES } from "@/config/statuses";
import {
  contentDisposition,
  formatFileSize,
  sanitizeFilename,
} from "@/features/documents/domain/filename";
import {
  canUploadDocument,
  documentStatusAfterUpload,
  invalidatesApproval,
} from "@/features/documents/domain/upload-rules";
import { classifyB2Error } from "@/server/storage/b2";
import { parseStorageConfig, StorageConfigError } from "@/server/storage/config";
import { StorageError } from "@/server/storage/errors";
import { createLocalPrivateAdapter } from "@/server/storage/local-private";
import { capacityOf, fitsQuota } from "@/server/storage/quota";
import { buildObjectKey, isAllowedObjectKey } from "@/server/storage/types";

import { S3ServiceException } from "@aws-sdk/client-s3";

describe("yükleme izin matrisi (BR-44, D1/D7/D9)", () => {
  const customerAllowed: Record<string, string[]> = {
    AWAITING_DOCUMENTS: ["NOT_UPLOADED", "UPLOADED"],
    REVISION_REQUIRED: ["NOT_UPLOADED", "UPLOADED", "REVISION_REQUIRED"],
  };
  const staffAllowed: Record<string, string[]> = {
    ...customerAllowed,
    UNDER_REVIEW: [...DOCUMENT_STATUSES],
  };

  it.each(
    APPLICATION_STATUSES.flatMap((app) => DOCUMENT_STATUSES.map((doc) => [app, doc] as const)),
  )("%s / %s", (app, doc) => {
    expect(canUploadDocument("CUSTOMER", app, doc)).toBe(
      customerAllowed[app]?.includes(doc) ?? false,
    );
    expect(canUploadDocument("STAFF", app, doc)).toBe(staffAllowed[app]?.includes(doc) ?? false);
  });

  it("aktivasyon sonrası statü: UNDER_REVIEW → PENDING_REVIEW (onay devredilmez), diğerleri UPLOADED", () => {
    expect(documentStatusAfterUpload("STAFF", "UNDER_REVIEW", "APPROVED")).toBe("PENDING_REVIEW");
    expect(documentStatusAfterUpload("STAFF", "UNDER_REVIEW", "NOT_UPLOADED")).toBe(
      "PENDING_REVIEW",
    );
    expect(documentStatusAfterUpload("CUSTOMER", "REVISION_REQUIRED", "REVISION_REQUIRED")).toBe(
      "UPLOADED",
    );
    expect(documentStatusAfterUpload("CUSTOMER", "AWAITING_DOCUMENTS", "UPLOADED")).toBe(
      "UPLOADED",
    );
    expect(documentStatusAfterUpload("CUSTOMER", "UNDER_REVIEW", "UPLOADED")).toBeNull();
    expect(invalidatesApproval("APPROVED", "PENDING_REVIEW")).toBe(true);
    expect(invalidatesApproval("UPLOADED", "UPLOADED")).toBe(false);
  });
});

describe("dosya adı ve Content-Disposition", () => {
  it("sanitizasyon: NFC, kontrol/yön/ayırıcı karakterler, baştaki nokta, uzunluk, uzantı", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe("etcpasswd.pdf");
    expect(sanitizeFilename("a\r\nb\u0000c.pdf")).toBe("abc.pdf");
    expect(sanitizeFilename("‮fdp.exe.pdf")).toBe("fdp.exe.pdf");
    expect(sanitizeFilename("...gizli.PDF")).toBe("gizli.pdf");
    expect(sanitizeFilename(".pdf")).toBe("belge.pdf");
    expect(sanitizeFilename("rapor.docx")).toBeNull();
    expect(sanitizeFilename("resim.jpg")).toBeNull();
    expect(sanitizeFilename("Pasaport  Sayfası.pdf")).toBe("Pasaport Sayfası.pdf");
    const long = sanitizeFilename(`${"ş".repeat(400)}.pdf`)!;
    expect([...long].length).toBe(200);
    expect(long.endsWith(".pdf")).toBe(true);
    expect(sanitizeFilename("é.pdf")).toBe("é.pdf");
  });

  it("header enjeksiyonu yok; ASCII yedek + UTF-8 ad", () => {
    const header = contentDisposition("attachment", 'kötü"\r\nSet-Cookie: x=1;.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(contentDisposition("inline", "Pasaport Ö.pdf")).toBe(
      `inline; filename="Pasaport _.pdf"; filename*=UTF-8''Pasaport%20%C3%96.pdf`,
    );
  });

  it("boyut gösterimi", () => {
    expect(formatFileSize(512)).toBe("512 bayt");
    expect(formatFileSize(10_485_760)).toBe("10 MB");
  });
});

describe("depolama yapılandırması (fail-closed)", () => {
  const b2 = {
    APP_ENV: "development",
    STORAGE_PROVIDER: "b2",
    B2_KEY_ID: "0031234567890abcdef000001",
    B2_APPLICATION_KEY: "K003abcdefghijklmnopqrstuvwxyz012",
    B2_BUCKET_NAME: "cs-global-documents",
    B2_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
    B2_REGION: "eu-central-003",
  };
  const invalid = (source: Record<string, string | undefined>) => {
    try {
      parseStorageConfig(source, "/app");
      return [];
    } catch (error) {
      if (error instanceof StorageConfigError) return [...error.variables];
      throw error;
    }
  };

  it("geçerli B2 yapılandırması + varsayılan kota (9 GB / 8 GB)", () => {
    const config = parseStorageConfig(b2, "/app");
    expect(config).toMatchObject({
      provider: "b2",
      bucket: "cs-global-documents",
      quota: { maxTotalBytes: 9e9, warningBytes: 8e9 },
    });
  });

  it("hata mesajı değer içermez", () => {
    try {
      parseStorageConfig({ ...b2, B2_APPLICATION_KEY: "kisa" }, "/app");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("kisa");
      expect((error as StorageConfigError).variables).toEqual(["B2_APPLICATION_KEY"]);
    }
  });

  it("sağlayıcı eksik/bilinmiyor; uç nokta bölgeyle eşleşmeli ve HTTPS olmalı", () => {
    expect(invalid({ APP_ENV: "development" })).toContain("STORAGE_PROVIDER");
    expect(invalid({ ...b2, STORAGE_PROVIDER: "vercel" })).toContain("STORAGE_PROVIDER");
    expect(invalid({ ...b2, B2_ENDPOINT: "http://s3.eu-central-003.backblazeb2.com" })).toContain(
      "B2_ENDPOINT",
    );
    expect(invalid({ ...b2, B2_ENDPOINT: "https://evil.example/s3" })).toContain("B2_ENDPOINT");
    expect(invalid({ ...b2, B2_REGION: "us-west-004" })).toContain("B2_ENDPOINT");
  });

  it("testlerde ve izole ortamda B2 reddedilir; production geliştirme bucket'ına bağlanamaz", () => {
    expect(invalid({ ...b2, NODE_ENV: "test" })).toContain("STORAGE_PROVIDER");
    expect(invalid({ ...b2, ISOLATED_TEST_DB: "1" })).toContain("STORAGE_PROVIDER");
    expect(invalid({ ...b2, APP_ENV: "production" })).toContain("B2_BUCKET_NAME");
    expect(
      invalid({ ...b2, APP_ENV: "production", B2_BUCKET_NAME: "cs-global-prod-documents" }),
    ).toEqual([]);
    expect(invalid({ ...b2, APP_ENV: undefined, NODE_ENV: "production" })).toEqual(["APP_ENV"]);
  });

  it("yerel adapter yalnızca development + mutlak, public dışı kök", () => {
    const local = {
      APP_ENV: "development",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT: "/tmp/cs-store",
    };
    expect(invalid(local)).toEqual([]);
    expect(invalid({ ...local, APP_ENV: "production" })).toContain("STORAGE_LOCAL_ROOT");
    expect(invalid({ ...local, STORAGE_LOCAL_ROOT: "relative/dir" })).toContain(
      "STORAGE_LOCAL_ROOT",
    );
    expect(invalid({ ...local, STORAGE_LOCAL_ROOT: "/app/public/uploads" })).toContain(
      "STORAGE_LOCAL_ROOT",
    );
    expect(invalid({ ...local, STORAGE_LOCAL_ROOT: "/tmp/../app" })).toContain(
      "STORAGE_LOCAL_ROOT",
    );
  });

  it("kota: üst sınır kodda 9 GB; uyarı < üst sınır; PDF limiti dinamik değil", () => {
    expect(invalid({ ...b2, STORAGE_MAX_TOTAL_BYTES: "9000000001" })).toContain(
      "STORAGE_MAX_TOTAL_BYTES",
    );
    expect(
      invalid({ ...b2, STORAGE_MAX_TOTAL_BYTES: "1000", STORAGE_WARNING_BYTES: "1000" }),
    ).toContain("STORAGE_WARNING_BYTES");
    expect(invalid({ ...b2, STORAGE_MAX_TOTAL_BYTES: "1e9" })).toContain("STORAGE_MAX_TOTAL_BYTES");
    expect(invalid({ ...b2, MAX_PDF_SIZE_BYTES: "20971520" })).toContain("MAX_PDF_SIZE_BYTES");
    expect(invalid({ ...b2, MAX_PDF_SIZE_BYTES: "10485760" })).toEqual([]);
  });
});

describe("kota hesabı", () => {
  const quota = { maxTotalBytes: 9_000_000_000, warningBytes: 8_000_000_000 };
  it("sınırın bir bayt altı/üstü", () => {
    expect(fitsQuota(8_999_999_000, 1_000, quota)).toBe(true);
    expect(fitsQuota(8_999_999_000, 1_001, quota)).toBe(false);
  });
  it("8 GB uyarı, 9 GB dolu", () => {
    const usage = (total: number) => ({
      active: total,
      history: 0,
      pending: 0,
      cleanup: 0,
      untracked: 0,
      total,
      reconciledAt: null,
    });
    expect(capacityOf(usage(7_999_999_999), quota).state).toBe("ok");
    expect(capacityOf(usage(8_000_000_000), quota).state).toBe("warning");
    expect(capacityOf(usage(9_000_000_000), quota)).toMatchObject({
      state: "full",
      remainingBytes: 0,
    });
  });
});

describe("nesne anahtarı", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("yalnızca UUID'lerden; kişisel veri/yol enjeksiyonu kabul edilmez", () => {
    expect(buildObjectKey(id, id, id)).toBe(`applications/${id}/${id}/${id}.pdf`);
    expect(() => buildObjectKey("../x", id, id)).toThrow();
    expect(isAllowedObjectKey("applications/../../etc/passwd")).toBe(false);
    expect(isAllowedObjectKey("_verification/0123456789abcdef0123456789abcdef.pdf")).toBe(true);
  });
});

describe("yerel private adapter — kök sınırı", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cs-local-unit-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("geçersiz anahtar ve sembolik bağlantı ile kök dışına çıkılamaz; üzerine yazılmaz (yeni versiyon)", async () => {
    const adapter = await createLocalPrivateAdapter(root);
    await expect(adapter.headObject("../../etc/passwd", null)).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
    const id = "00000000-0000-4000-8000-000000000002";
    await symlink(tmpdir(), join(root, "applications"));
    await expect(
      adapter.headObject(`applications/${id}/${id}/${id}.pdf`, null),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
  });
});

describe("B2 hata sınıflandırması", () => {
  const s3Error = (status: number, name: string, message = "x") =>
    new S3ServiceException({
      name,
      $fault: "client",
      $metadata: { httpStatusCode: status },
      message,
    });
  it("cap/limit, yetki, bulunamadı, geçici", () => {
    expect(classifyB2Error(s3Error(403, "AccessDenied", "Transaction cap exceeded"))).toMatchObject(
      { kind: "LIMIT" },
    );
    expect(classifyB2Error(s3Error(403, "AccessDenied", "not entitled"))).toMatchObject({
      kind: "FORBIDDEN",
    });
    expect(classifyB2Error(s3Error(429, "TooManyRequests"))).toMatchObject({ kind: "LIMIT" });
    expect(classifyB2Error(s3Error(404, "NoSuchKey"))).toMatchObject({ kind: "NOT_FOUND" });
    expect(classifyB2Error(s3Error(503, "ServiceUnavailable"))).toMatchObject({
      kind: "UNAVAILABLE",
    });
    const classified = classifyB2Error(s3Error(403, "AccessDenied", "secret-ish detail"));
    expect(classified.message).not.toContain("secret-ish");
    expect(classifyB2Error(new StorageError("INTEGRITY"))).toMatchObject({ kind: "INTEGRITY" });
  });
});

describe("yükleme eşzamanlılık slotu (sınırlı kuyruk)", () => {
  it("en fazla 4 eşzamanlı; sonraki bekler, bırakılınca devralır; kuyruk/süre sınırı → null", async () => {
    const { acquireUploadSlot } = await import("@/features/documents/http");
    const held = await Promise.all([1, 2, 3, 4].map(() => acquireUploadSlot()));
    expect(held.every((release) => release !== null)).toBe(true);
    expect(await acquireUploadSlot({ maxWaiting: 0 })).toBeNull();
    expect(await acquireUploadSlot({ waitMs: 20 })).toBeNull();
    const waiting = acquireUploadSlot({ waitMs: 1_000 });
    held[0]!();
    const granted = await waiting;
    expect(granted).not.toBeNull();
    granted!();
    for (const release of held.slice(1)) release!();
    const again = await acquireUploadSlot({ maxWaiting: 0 });
    expect(again).not.toBeNull();
    again!();
  });
});
