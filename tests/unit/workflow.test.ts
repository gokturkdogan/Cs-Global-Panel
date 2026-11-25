import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, DOCUMENT_STATUSES, type ApplicationStatus } from "@/config/statuses";
import {
  approveDocumentsBlockers,
  fixedTarget,
  requestRevisionBlockers,
  staffActions,
  submissionBlockers,
  submissionTransition,
  TRANSITIONS,
  type DocumentFacts,
  type WorkflowTransition,
} from "@/features/applications/domain/application-status";
import {
  canRemoveFile,
  documentStatusAfterRemoval,
  reviewTarget,
} from "@/features/documents/domain/document-status";
import { reviewSchema, transitionSchema, commentSchema } from "@/features/workflow/schemas";

/** STATE_TRANSITIONS §1.2 — beklenen matris (kaynak dokümandan bağımsız olarak burada yazılı). */
const EXPECTED: Record<
  WorkflowTransition,
  { from: ApplicationStatus[]; to: string; reason: boolean }
> = {
  SUBMIT: { from: ["AWAITING_DOCUMENTS"], to: "UNDER_REVIEW", reason: false },
  RESUBMIT: { from: ["REVISION_REQUIRED"], to: "UNDER_REVIEW", reason: false },
  REQUEST_REVISION: { from: ["UNDER_REVIEW"], to: "REVISION_REQUIRED", reason: false },
  APPROVE_DOCUMENTS: { from: ["UNDER_REVIEW"], to: "DOCUMENTS_APPROVED", reason: false },
  START_PROCESSING: { from: ["DOCUMENTS_APPROVED"], to: "IN_PROCESS", reason: false },
  COMPLETE: { from: ["IN_PROCESS"], to: "COMPLETED", reason: false },
  CANCEL: {
    from: [
      "AWAITING_DOCUMENTS",
      "UNDER_REVIEW",
      "REVISION_REQUIRED",
      "DOCUMENTS_APPROVED",
      "IN_PROCESS",
    ],
    to: "CANCELLED",
    reason: true,
  },
  REOPEN_CANCELLED: { from: ["CANCELLED"], to: "PREVIOUS", reason: true },
  REOPEN_COMPLETED: { from: ["COMPLETED"], to: "IN_PROCESS", reason: true },
  REVERT_TO_DOCUMENTS_APPROVED: { from: ["IN_PROCESS"], to: "DOCUMENTS_APPROVED", reason: true },
  REVERT_TO_REVIEW: { from: ["DOCUMENTS_APPROVED"], to: "UNDER_REVIEW", reason: true },
  REVERT_FOR_REVISION: {
    from: ["DOCUMENTS_APPROVED", "IN_PROCESS"],
    to: "REVISION_REQUIRED",
    reason: true,
  },
};

const doc = (overrides: Partial<DocumentFacts> = {}): DocumentFacts => ({
  isRequired: true,
  status: "UPLOADED",
  hasActiveFile: true,
  hasPendingUpload: false,
  ...overrides,
});

describe("başvuru geçiş matrisi (T1–T12) — her statü × her aksiyon", () => {
  it.each(Object.keys(EXPECTED) as WorkflowTransition[])("%s", (code) => {
    expect([...TRANSITIONS[code].from].sort()).toEqual([...EXPECTED[code].from].sort());
    expect(TRANSITIONS[code].to).toBe(EXPECTED[code].to);
    expect(TRANSITIONS[code].reasonRequired).toBe(EXPECTED[code].reason);
    expect(TRANSITIONS[code].customer).toBe(code === "SUBMIT" || code === "RESUBMIT");
  });

  it.each(APPLICATION_STATUSES)("%s: yalnızca matristeki aksiyonlar sunulur", (status) => {
    const offered = staffActions(status, [doc()])
      .map((a) => a.code)
      .sort();
    const expected = (Object.keys(EXPECTED) as WorkflowTransition[])
      .filter((code) => EXPECTED[code].from.includes(status))
      .sort();
    expect(offered).toEqual(expected);
  });

  it("T8 hedefi sabit değildir (geçmişten); diğerleri sabittir", () => {
    expect(fixedTarget("REOPEN_CANCELLED")).toBeNull();
    expect(fixedTarget("COMPLETE")).toBe("COMPLETED");
  });

  it("gönderim aksiyonu statüye göre", () => {
    expect(submissionTransition("AWAITING_DOCUMENTS")).toBe("SUBMIT");
    expect(submissionTransition("REVISION_REQUIRED")).toBe("RESUBMIT");
    for (const status of [
      "UNDER_REVIEW",
      "DOCUMENTS_APPROVED",
      "IN_PROCESS",
      "COMPLETED",
      "CANCELLED",
    ] as const) {
      expect(submissionTransition(status)).toBeNull();
    }
  });
});

describe("BR-50 / BR-59 / BR-60 guard'ları", () => {
  it("BR-50: zorunlu eksik, devam eden yükleme, düzeltme bekleyen evrak engeller; isteğe bağlı eksik engellemez", () => {
    expect(
      submissionBlockers("AWAITING_DOCUMENTS", [
        doc(),
        doc({ isRequired: false, status: "NOT_UPLOADED", hasActiveFile: false }),
      ]),
    ).toEqual([]);
    expect(
      submissionBlockers("AWAITING_DOCUMENTS", [
        doc({ status: "NOT_UPLOADED", hasActiveFile: false }),
      ]),
    ).toEqual(["MISSING_REQUIRED"]);
    expect(submissionBlockers("AWAITING_DOCUMENTS", [doc({ hasPendingUpload: true })])).toEqual([
      "UPLOAD_IN_PROGRESS",
    ]);
    expect(submissionBlockers("REVISION_REQUIRED", [doc({ status: "REVISION_REQUIRED" })])).toEqual(
      ["REVISION_PENDING"],
    );
    expect(submissionBlockers("UNDER_REVIEW", [doc()])).toEqual(["WRONG_STATUS"]);
    // Zorunlu evrakı olmayan hizmet: BR-50 koşulları boş kümede sağlanır.
    expect(submissionBlockers("AWAITING_DOCUMENTS", [])).toEqual([]);
    // Aktif dosyası olmayan "UPLOADED" (tutarsız veri) zorunlu ise sayılmaz.
    expect(submissionBlockers("AWAITING_DOCUMENTS", [doc({ hasActiveFile: false })])).toEqual([
      "MISSING_REQUIRED",
    ]);
  });

  it("BR-59: inceleme bekleyen kalmamalı ve ≥1 düzeltme olmalı", () => {
    expect(
      requestRevisionBlockers([doc({ status: "APPROVED" }), doc({ status: "REVISION_REQUIRED" })]),
    ).toEqual([]);
    expect(
      requestRevisionBlockers([
        doc({ status: "PENDING_REVIEW" }),
        doc({ status: "REVISION_REQUIRED" }),
      ]),
    ).toEqual(["PENDING_REVIEW"]);
    expect(requestRevisionBlockers([doc({ status: "APPROVED" })])).toEqual(["NO_REVISION"]);
  });

  it("BR-60: tüm zorunlular ve aktif dosyalı isteğe bağlılar onaylı olmalı", () => {
    expect(
      approveDocumentsBlockers([
        doc({ status: "APPROVED" }),
        doc({ isRequired: false, status: "NOT_UPLOADED", hasActiveFile: false }),
      ]),
    ).toEqual([]);
    expect(
      approveDocumentsBlockers([
        doc({ status: "APPROVED" }),
        doc({ isRequired: false, status: "PENDING_REVIEW" }),
      ]),
    ).toEqual(["PENDING_REVIEW", "NOT_ALL_APPROVED"]);
    expect(approveDocumentsBlockers([doc({ status: "REVISION_REQUIRED" })])).toEqual([
      "REVISION_PENDING",
      "NOT_ALL_APPROVED",
    ]);
    expect(approveDocumentsBlockers([doc({ status: "APPROVED", hasActiveFile: false })])).toEqual([
      "NOT_ALL_APPROVED",
    ]);
  });
});

describe("evrak kararı (D4–D6) ve kaldırma (D2/D8) matrisleri", () => {
  it.each(APPLICATION_STATUSES.flatMap((a) => DOCUMENT_STATUSES.map((d) => [a, d] as const)))(
    "%s / %s",
    (app, document) => {
      const underReview = app === "UNDER_REVIEW";
      expect(reviewTarget(app, document, "APPROVED")).toBe(
        underReview && (document === "PENDING_REVIEW" || document === "REVISION_REQUIRED")
          ? "APPROVED"
          : null,
      );
      expect(reviewTarget(app, document, "REVISION_REQUIRED")).toBe(
        underReview && (document === "PENDING_REVIEW" || document === "APPROVED")
          ? "REVISION_REQUIRED"
          : null,
      );
      const removable =
        (app === "AWAITING_DOCUMENTS" && document === "UPLOADED") ||
        (app === "REVISION_REQUIRED" &&
          (document === "UPLOADED" || document === "REVISION_REQUIRED"));
      expect(canRemoveFile("CUSTOMER", app, document)).toBe(removable);
      expect(canRemoveFile("STAFF", app, document)).toBe(removable);
    },
  );

  it("kaldırma sonrası statü", () => {
    expect(documentStatusAfterRemoval("UPLOADED", true)).toBe("NOT_UPLOADED");
    expect(documentStatusAfterRemoval("REVISION_REQUIRED", true)).toBe("REVISION_REQUIRED");
    expect(documentStatusAfterRemoval("REVISION_REQUIRED", false)).toBe("NOT_UPLOADED");
  });
});

describe("iş akışı girdileri (Zod .strict — mass assignment yok)", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("hedef statü, aktör veya bilinmeyen alan reddedilir", () => {
    expect(
      transitionSchema.safeParse({
        applicationId: id,
        expectedVersion: 1,
        code: "COMPLETE",
        toStatus: "COMPLETED",
      }).success,
    ).toBe(false);
    expect(
      transitionSchema.safeParse({ applicationId: id, expectedVersion: 1, code: "SUBMIT" }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        decision: "APPROVED",
        requirementId: id,
        fileId: id,
        expectedVersion: 1,
        reviewedByUserId: "x",
      }).success,
    ).toBe(false);
  });

  it("düzeltme açıklaması 10–1000, boşluk/kontrol karakteri reddi", () => {
    const base = {
      decision: "REVISION_REQUIRED",
      requirementId: id,
      fileId: id,
      expectedVersion: 1,
    };
    expect(reviewSchema.safeParse({ ...base, customerMessage: "   kısa    " }).success).toBe(false);
    expect(
      reviewSchema.safeParse({ ...base, customerMessage: "Okunaklı değil\u0007 lütfen" }).success,
    ).toBe(false);
    const ok = reviewSchema.safeParse({
      ...base,
      customerMessage: "  Sayfa okunaklı değil.\r\nYeniden yükleyiniz.  ",
    });
    expect(ok.success && ok.data.decision === "REVISION_REQUIRED" && ok.data.customerMessage).toBe(
      "Sayfa okunaklı değil.\nYeniden yükleyiniz.",
    );
  });

  it("yorum: boş/yalnızca boşluk reddedilir; HTML düz metin olarak kalır", () => {
    expect(
      commentSchema.safeParse({ applicationId: id, body: "   ", idempotencyKey: id }).success,
    ).toBe(false);
    const parsed = commentSchema.safeParse({
      applicationId: id,
      body: "<script>alert(1)</script>",
      idempotencyKey: id,
    });
    expect(parsed.success && parsed.data.body).toBe("<script>alert(1)</script>");
    // İşlem anahtarı zorunlu ve UUID (D-113).
    expect(commentSchema.safeParse({ applicationId: id, body: "metin" }).success).toBe(false);
    expect(
      commentSchema.safeParse({ applicationId: id, body: "metin", idempotencyKey: "x" }).success,
    ).toBe(false);
  });
});

describe("depolama regresyonu (statik)", () => {
  it("iş akışı modülleri storage adapter'ı, AWS SDK'yi veya dosya akışı fonksiyonlarını içe aktarmaz (B2 çağrısı imkânsız)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk("src/features/workflow");
    files.push(
      "src/features/applications/domain/application-status.ts",
      "src/features/documents/domain/document-status.ts",
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /@\/server\/storage|@aws-sdk|openDocumentFile|uploadDocumentFile|getStorage\(/,
      );
    }
  });
});
