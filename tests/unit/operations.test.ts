import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { S3ServiceException } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { DASHBOARD_NAV_ITEMS } from "@/config/navigation";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  describeAuditMetadata,
  KNOWN_AUDIT_ACTIONS,
} from "@/features/audit-logs/domain/labels";
import { auditUrl } from "@/features/audit-logs/domain/url";
import { applicationNumberLookupSchema, parseAuditFilters } from "@/features/audit-logs/schemas";
import { deletionRequestSchema, deletionStepSchema } from "@/features/deletion/schemas";
import { internalNoteSchema } from "@/features/internal-notes/schemas";
import { messages } from "@/lib/messages";
import { classifyB2Error } from "@/server/storage/b2";

/** PHASE 10 — iç notlar, işlem geçmişi, kalıcı silme (D-115…D-120): saf kurallar ve statik sınırlar. */

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(path);
    }
  };
  walk(dir);
  return out;
}

const uuid = "4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f70";

describe("audit event etiketleri (D-119)", () => {
  it("koddaki her audit event'inin merkezi Türkçe etiketi vardır", () => {
    const actions = new Set<string>();
    for (const file of [...filesUnder("src"), ...filesUnder("scripts")]) {
      const text = readFileSync(file, "utf8");
      if (!/writeAuditLog|insertAudit|INSERT INTO audit_logs/.test(text)) continue;
      for (const match of text.matchAll(
        /"((?:USER|APPLICATION|ACCESS_LINK|DOCUMENT|SERVICE|INTERNAL_NOTE)_[A-Z_]+)"/g,
      )) {
        actions.add(match[1]!);
      }
      for (const match of text.matchAll(/VALUES \('([A-Z][A-Z_]+)'/g)) actions.add(match[1]!);
    }
    // Audit event olmayan sabitler (bağlantı iptal gerekçesi).
    actions.delete("APPLICATION_DELETION");
    expect(actions.size).toBeGreaterThan(30);
    const missing = [...actions].filter((action) => !Object.hasOwn(AUDIT_ACTION_LABELS, action));
    expect(missing).toEqual([]);
  });

  it("bilinmeyen/eski event güvenli genel etiket alır", () => {
    expect(auditActionLabel("LEGACY_EVENT")).toBe("Diğer işlem");
    expect(auditActionLabel("DOCUMENT_APPROVED")).toBe("Evrak Onaylandı");
    expect(KNOWN_AUDIT_ACTIONS).toContain("INTERNAL_NOTE_ADDED");
    expect(KNOWN_AUDIT_ACTIONS).toContain("APPLICATION_DELETED");
  });

  it("metadata yalnızca izinli alanlardan biçimlendirilir; PII/serbest metin/kimlik gösterilmez", () => {
    const details = describeAuditMetadata({
      from: "UNDER_REVIEW",
      to: "REVISION_REQUIRED",
      transitionCode: "REQUEST_REVISION",
      fileId: uuid,
      requirementId: uuid,
      reason: "Müşteri Ahmet Yılmaz 05551234567 aradı",
      email: "kisi@example.com",
      body: "INTERNAL_NOTE_PRIVATE_SENTINEL",
      token: "abc",
      count: 2,
      changedFields: ["email", "<script>", "phone"],
      counts: { orphanKeys: 1, "bad key": 5, nested: { x: 1 } },
    });
    const text = JSON.stringify(details);
    for (const forbidden of [
      uuid,
      "Ahmet",
      "0555",
      "kisi@example.com",
      "SENTINEL",
      "abc",
      "<script>",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(details).toEqual([
      { label: "Durum", value: "İncelemede → Düzeltme Bekleniyor" },
      { label: "Geçiş", value: "Düzeltme talep edildi" },
      { label: "Adet", value: "2" },
      { label: "Değişen alanlar", value: "E-posta, Telefon" },
      { label: "Sayılar", value: "orphanKeys: 1" },
    ]);
    expect(describeAuditMetadata({ reason: "STORAGE_FORBIDDEN" })).toEqual([
      { label: "Neden", value: "Depolama yetki/politika reddi" },
    ]);
    expect(describeAuditMetadata(null)).toEqual([]);
    expect(describeAuditMetadata(["x"])).toEqual([]);
  });
});

describe("işlem geçmişi filtreleri (D-119)", () => {
  it("geçerli filtreler; geçersizler güvenli varsayılana düşer", () => {
    const { filters, error } = parseAuditFilters({
      from: "2026-11-01",
      to: "2026-11-25",
      action: "DOCUMENT_APPROVED",
      actorType: "USER",
      staffId: "abc_DEF-1",
      resourceType: "file",
      applicationId: uuid,
      after: "42",
      pageSize: "50",
    });
    expect(error).toBeNull();
    expect(filters).toEqual({
      from: "2026-11-01",
      to: "2026-11-25",
      action: "DOCUMENT_APPROVED",
      actorType: "USER",
      staffId: "abc_DEF-1",
      resourceType: "file",
      applicationId: uuid,
      after: 42,
      before: null,
      pageSize: 50,
    });
    const bad = parseAuditFilters({
      action: "DROP TABLE",
      actorType: "ROOT",
      staffId: "x'; --",
      resourceType: "secret",
      applicationId: "not-a-uuid",
      after: "-1",
      before: "1e9",
      pageSize: "1000",
    }).filters;
    expect(bad).toMatchObject({
      action: null,
      actorType: null,
      staffId: null,
      resourceType: null,
      applicationId: null,
      after: null,
      before: null,
      pageSize: 20,
    });
  });

  it("tarih doğrulaması: gerçek takvim günü ve sıralı aralık", () => {
    expect(parseAuditFilters({ from: "2026-02-30" })).toMatchObject({
      filters: { from: null },
      error: messages.auditLogs.invalidDate,
    });
    expect(parseAuditFilters({ from: "2026-11-25", to: "2026-11-01" })).toMatchObject({
      filters: { from: null, to: null },
      error: messages.auditLogs.invalidRange,
    });
    expect(parseAuditFilters({ from: ["2026-01-01", "x"] }).filters.from).toBe("2026-01-01");
  });

  it("URL yalnızca kişisel veri içermeyen değerleri taşır; başvuru numarası Server Action ile çözülür", () => {
    expect(auditUrl({ action: "USER_LOGIN", pageSize: 20, from: null })).toBe(
      "/dashboard/audit-logs?action=USER_LOGIN",
    );
    expect(
      applicationNumberLookupSchema.safeParse({ applicationNumber: " cs-2026-000001 " }),
    ).toMatchObject({ success: true, data: { applicationNumber: "CS-2026-000001" } });
    expect(applicationNumberLookupSchema.safeParse({ applicationNumber: "Ahmet" }).success).toBe(
      false,
    );
    const filterSource = readFileSync(
      "src/features/audit-logs/components/audit-filters.tsx",
      "utf8",
    );
    expect(filterSource).not.toMatch(/applicationNumber[^\n]*params\.set|set\("applicationNumber"/);
  });

  it("İşlem Geçmişi menüsü iki hesap için tektir (rol bazlı menü yok)", () => {
    expect(DASHBOARD_NAV_ITEMS.find((item) => item.key === "auditLogs")).toMatchObject({
      href: "/dashboard/audit-logs",
      label: "İşlem Geçmişi",
    });
  });
});

describe("iç not ve silme girdileri", () => {
  const note = { applicationId: uuid, body: "Not", idempotencyKey: uuid };
  it("iç not: boş/boşluk/uzun/kontrol karakteri reddedilir; anahtar zorunlu; görünürlük alanı kabul edilmez", () => {
    expect(internalNoteSchema.safeParse(note).success).toBe(true);
    expect(internalNoteSchema.safeParse({ ...note, body: "   \n " }).success).toBe(false);
    expect(internalNoteSchema.safeParse({ ...note, body: "a".repeat(5001) }).success).toBe(false);
    expect(internalNoteSchema.safeParse({ ...note, body: "a\u0000b" }).success).toBe(false);
    expect(
      internalNoteSchema.safeParse({ ...note, body: "Satır 1\r\nSatır 2 — ğüşiöç 🙂" }),
    ).toMatchObject({
      success: true,
      data: { body: "Satır 1\nSatır 2 — ğüşiöç 🙂" },
    });
    expect(internalNoteSchema.safeParse({ applicationId: uuid, body: "x" }).success).toBe(false);
    expect(internalNoteSchema.safeParse({ ...note, visibleToCustomer: true }).success).toBe(false);
    expect(internalNoteSchema.safeParse({ ...note, authorUserId: "x" }).success).toBe(false);
  });

  it("silme: storage anahtarı/versiyon/onay bayrağı istemciden alınmaz; gerekçe zorunlu", () => {
    const base = {
      applicationId: uuid,
      expectedVersion: 3,
      reason: "Saklama süresi doldu",
      confirmationNumber: "CS-2026-000001",
    };
    expect(deletionRequestSchema.safeParse(base).success).toBe(true);
    for (const extra of [
      { objectKey: "applications/x" },
      { versionId: "v1" },
      { confirmed: true },
      { prefix: "applications/" },
    ]) {
      expect(deletionRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
    expect(deletionRequestSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
    expect(deletionStepSchema.safeParse({ applicationId: uuid, objectKey: "x" }).success).toBe(
      false,
    );
  });
});

describe("modül sınırları ve güvenlik (statik)", () => {
  it("müşteri modülleri iç not/işlem geçmişi/silme modüllerini içe aktarmaz", () => {
    const customerFiles = [
      ...filesUnder("src/features/customer-portal"),
      ...filesUnder("src/app/(customer)"),
      ...filesUnder("src/app/api/portal"),
    ];
    for (const file of customerFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /@\/features\/(internal-notes|audit-logs|deletion)|applicationInternalNotes|applicationDeletion/,
      );
    }
  });

  it("yalnızca silme modülü storage'a erişir; iç not ve işlem geçmişi storage/AWS SDK kullanmaz", () => {
    for (const file of [
      ...filesUnder("src/features/internal-notes"),
      ...filesUnder("src/features/audit-logs"),
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/@\/server\/storage|@aws-sdk/);
    }
    const deletion = readFileSync("src/features/deletion/service.ts", "utf8");
    // Fiziksel silme yalnızca versiyona özgü ve sunucu envanterinden (istemci anahtarı yok).
    expect(deletion).toContain("deleteObjectVersion(version.key, version.versionId)");
    expect(deletion).not.toMatch(/getObject\(/);
    expect(deletion).toContain("applications/${applicationId}/");
  });

  it("audit ekranı salt okunurdur: değiştirme/silme/dışa aktarma aksiyonu yok", () => {
    const sources = filesUnder("src/features/audit-logs")
      .concat("src/app/(dashboard)/dashboard/audit-logs/page.tsx")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/\.(update|delete)\(auditLogs\)|insert\(auditLogs\)|writeAuditLog/);
    expect(sources).not.toMatch(/text\/csv|\.csv\b|Content-Disposition/i);
  });

  it("requireAdmin/rol bazlı yetki yok; her yeni aksiyon requireStaff ile başlar", () => {
    for (const file of [
      "src/features/internal-notes/actions.ts",
      "src/features/deletion/actions.ts",
      "src/features/audit-logs/actions.ts",
    ]) {
      const text = readFileSync(file, "utf8");
      const exported = [...text.matchAll(/export async function (\w+)\([^)]*\) \{\n\s+(.+)\n/g)];
      expect(exported.length, file).toBeGreaterThan(0);
      for (const [, name, firstLine] of exported) {
        expect(firstLine, `${file}:${name}`).toMatch(/await requireStaff\(\)/);
      }
      expect(text).not.toMatch(/requireAdmin\(|accountType ===|role ===/);
    }
  });

  it("B2: NoSuchBucket nesne yokluğu sayılmaz (silme doğrulamasını yanıltmaz)", () => {
    const error = new S3ServiceException({
      name: "NoSuchBucket",
      $fault: "client",
      $metadata: { httpStatusCode: 404 },
      message: "x",
    });
    expect(classifyB2Error(error)).toMatchObject({ kind: "NOT_CONFIGURED" });
  });

  it("migration 0007: koruma trigger'ı + DELETE yetkisi olmayan GRANT'lar; yıkıcı ifade yok", () => {
    const sql = readFileSync(
      "src/server/db/migrations/0007_deletion_and_internal_notes.sql",
      "utf8",
    );
    expect(sql).toContain("CREATE TRIGGER applications_guard_delete BEFORE DELETE ON applications");
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE ON application_deletions TO cs_app_runtime",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE ON application_deletion_objects TO cs_app_runtime",
    );
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/);
    expect(sql).toContain('"app_internal_notes_idempotency_key_unique" UNIQUE("idempotency_key")');
  });
});

describe("PHASE 10.1 — yazım girişimi güvenliği (statik + adapter)", () => {
  it("B2 PUT tek fiziksel girişimdir (SDK yeniden denemesi kapalı); diğer işlemler 2 deneme", () => {
    const source = readFileSync("src/server/storage/b2.ts", "utf8");
    const putClient = source.slice(
      source.indexOf("const putClient"),
      source.indexOf("const Bucket"),
    );
    expect(putClient).toContain("maxAttempts: 1");
    expect(source).toContain("await putClient.send(\n          new PutObjectCommand");
    expect(source.match(/new PutObjectCommand/g)).toHaveLength(1);
  });

  it("bağlantı kurulamayan PUT → NOT_SENT (kesin başarısızlık); bağlantı sonrası hata belirsiz", async () => {
    const { createB2Adapter } = await import("@/server/storage/b2");
    const adapter = createB2Adapter({
      keyId: "test",
      applicationKey: "test",
      bucket: "test-bucket",
      endpoint: "http://127.0.0.1:1",
      region: "eu-central-003",
    });
    await expect(
      adapter.putObject({
        key: "applications/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f70/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f71/4f1c7c2e-8a0b-4f7e-9a51-2d3c4b5a6f72.pdf",
        body: new Uint8Array([1]),
        contentType: "application/pdf",
        sizeBytes: 1,
        md5Hex: "55a54008ad1ba589aa210d2629c1df41",
      }),
    ).rejects.toMatchObject({ kind: "NOT_SENT", code: "ECONNREFUSED" });
  });

  it("yükleme servisi: PUT yalnızca kalıcı çitten (beginStorageWrite) sonra; belirsiz hata FAILED sayılmaz", () => {
    const source = readFileSync("src/features/documents/service.ts", "utf8");
    const flow = source.slice(source.indexOf("export async function uploadDocumentFile"));
    expect(flow.indexOf("beginStorageWrite(")).toBeGreaterThan(-1);
    expect(flow.indexOf("beginStorageWrite(")).toBeLessThan(flow.indexOf("putObject("));
    expect(flow).toMatch(/if \(!begun\)[\s\S]*?return failure/);
    // FAILED yalnızca NOT_SENT ile; diğer tüm hata yolları UNKNOWN.
    expect(flow.match(/state: "FAILED"/g)).toHaveLength(1);
    expect(flow).toMatch(/isStorageError\(error, "NOT_SENT"\)[\s\S]{0,200}state: "FAILED"/);
  });

  it("silme servisi zamana dayalı sonlandırma içermez (bekleme payı kaldırıldı)", () => {
    const deletion = readFileSync("src/features/deletion/service.ts", "utf8");
    const constants = readFileSync("src/config/constants.ts", "utf8");
    expect(constants).not.toContain("DELETION_UPLOAD_SETTLE_GRACE_SECONDS");
    expect(deletion).not.toMatch(/settle_after\s*>\s*now|settleAfter\s*>|SETTLING/);
    expect(deletion).toContain('return "UPLOAD_OUTCOME_UNKNOWN" as const');
    expect(deletion).toContain("finalListingStartedAt");
  });

  it("migration 0008: yazım girişimleri, geçiş trigger'ı, geri alınamaz silme işareti, koruma v2, DELETE yetkisi yok", () => {
    const sql = readFileSync("src/server/db/migrations/0008_upload_write_tracking.sql", "utf8");
    expect(sql).toContain('CREATE TABLE "storage_write_attempts"');
    expect(sql).toContain("CREATE TRIGGER storage_write_attempts_guard_update");
    expect(sql).toContain("CREATE TRIGGER applications_guard_deletion_flag");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION applications_guard_delete()");
    expect(sql).toContain("w.settled_at >= listing_at");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM storage_write_attempts w WHERE w.file_id = f.id)",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE ON storage_write_attempts TO cs_app_runtime",
    );
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/);
    // UNKNOWN → FAILED / FENCED geçişi tanımlı değil.
    expect(sql).toContain("(OLD.state = 'UNKNOWN' AND NEW.state = 'CONFIRMED')");
    expect(sql).not.toMatch(/OLD\.state = 'UNKNOWN' AND NEW\.state IN/);
  });

  it("yeni silme hata kodlarının Türkçe audit/arayüz karşılığı vardır", () => {
    expect(describeAuditMetadata({ reason: "UPLOAD_OUTCOME_UNKNOWN" })).toEqual([
      { label: "Neden", value: "Yükleme sonucu doğrulanamadı" },
    ]);
    expect(messages.deletion.errors.UPLOAD_OUTCOME_UNKNOWN).toContain(
      "güvenli şekilde bekletiliyor",
    );
    expect(messages.deletion.errors.LEGACY_UNVERIFIED).toContain("teknik inceleme");
  });

  it("migration 0009: muhasebe nesli (yalnızca ekleme); mutabakat koşullu yazar; silme/temizlik nesli artırır", () => {
    const sql = readFileSync(
      "src/server/db/migrations/0009_reconcile_accounting_epoch.sql",
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "accounting_epoch" bigint DEFAULT 0 NOT NULL');
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b/);
    const maintenance = readFileSync("scripts/storage/maintenance.ts", "utf8");
    expect(maintenance).toMatch(/WHERE id = 1 AND accounting_epoch = \$2::bigint/);
    expect(maintenance.indexOf("accounting_epoch::text AS epoch")).toBeLessThan(
      maintenance.indexOf('storage.listObjectVersions("", MAX_LIST_PAGES)'),
    );
    const deletion = readFileSync("src/features/deletion/service.ts", "utf8");
    expect(deletion.match(/bumpAccountingEpoch\(tx\)/g)).toHaveLength(2);
  });

  it("NOT_SENT sınıflandırması: iç içe/çok denemeli/yanıtlı hatalar kesin başarısızlık SAYILMAZ", async () => {
    const { isDefinitelyNotSent } = await import("@/server/storage/b2");
    const net = (code: string, extra: Record<string, unknown> = {}) =>
      Object.assign(new Error(code), { code }, extra);
    expect(isDefinitelyNotSent(net("ECONNREFUSED"))).toBe(true);
    expect(isDefinitelyNotSent(net("ENOTFOUND", { $metadata: { attempts: 1 } }))).toBe(true);
    expect(isDefinitelyNotSent(net("ECONNREFUSED", { $metadata: { attempts: 2 } }))).toBe(false);
    expect(isDefinitelyNotSent(net("ECONNRESET"))).toBe(false);
    expect(isDefinitelyNotSent(net("ETIMEDOUT"))).toBe(false);
    expect(isDefinitelyNotSent(new Error("no code"))).toBe(false);
    const allRefused = Object.assign(
      new AggregateError([net("ECONNREFUSED"), net("ECONNREFUSED")]),
      {
        code: "ECONNREFUSED",
      },
    );
    const mixed = Object.assign(new AggregateError([net("ECONNREFUSED"), net("ECONNRESET")]), {
      code: "ECONNREFUSED",
    });
    expect(isDefinitelyNotSent(allRefused)).toBe(true);
    expect(isDefinitelyNotSent(mixed)).toBe(false);
    const responded = new S3ServiceException({
      name: "ServiceUnavailable",
      $fault: "server",
      $metadata: { httpStatusCode: 503 },
      message: "x",
    });
    expect(isDefinitelyNotSent(Object.assign(responded, { code: "ECONNREFUSED" }))).toBe(false);
  });
});
