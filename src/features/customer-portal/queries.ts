import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import type { ActiveAccess } from "@/server/customer-session/access";
import {
  applicationDocumentFiles as files,
  applicationDocumentRequirements as snapshots,
  applications,
  applicationStatusHistory as statusHistory,
  documentComments as comments,
  documentReviews as reviews,
} from "@/server/db/schema";

/**
 * Müşteri portalı okuma sorgusu (PHASE 07, D-091). YALNIZCA doğrulanmış erişimin başvurusu
 * (`access.applicationId`); istemciden başvuru kimliği alınmaz. Açık kolon seçimi; DTO'da telefon,
 * e-posta, token, iç not, personel, audit, storage anahtarı/sağlayıcı bilgisi, eski dosya versiyonları
 * yoktur. PHASE 08: evrak kimliği + sürümü (yalnızca bu başvurunun evrakları; yükleme hedefi ve
 * `expectedVersion`) ve yalnızca ACTIVE dosyanın görünen adı/boyutu/tarihi eklendi (D-091 güncellemesi).
 * Evraklar başvuru anındaki snapshot'tan (BR-30), belirleyici sırada.
 * Bu modül iç not, audit, kullanıcı ve token tablolarını import etmez (ESLint kuralı).
 */

type Reader = Pick<Database, "select" | "selectDistinctOn">;

export type CustomerActiveFile = {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
};

export type CustomerDocument = {
  readonly requirementId: string;
  /** Optimistic lock — yüklemede `expectedVersion`. */
  readonly version: number;
  readonly activeFile: CustomerActiveFile | null;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly isRequired: boolean;
  readonly status: DocumentStatus;
  /** Yalnızca müşteriye yönelik düzeltme açıklaması (`document_reviews.customer_message`). */
  readonly revisionMessage: string | null;
};

export type CustomerPortalView = {
  readonly customer: { readonly firstName: string; readonly lastName: string };
  readonly application: {
    readonly number: string;
    readonly serviceName: string;
    readonly createdAt: string;
    readonly status: ApplicationStatus;
    /** Optimistic lock — gönderimde `expectedVersion` (PHASE 09). */
    readonly version: number;
  };
  readonly documents: readonly CustomerDocument[];
  /** Müşteriye görünür yorumlar (BR-120; yazar/personel bilgisi yok). */
  readonly comments: readonly {
    readonly body: string;
    readonly createdAt: string;
    readonly documentTitle: string | null;
  }[];
  /** Herkese açık süreç geçmişi: yalnızca statü + tarih (gerekçe ve aktör yok — STATE_TRANSITIONS §1.4). */
  readonly timeline: readonly { readonly status: ApplicationStatus; readonly at: string }[];
  /** Gönderim guard'ları için devam eden (süresi dolmamış) yükleme olan evraklar. */
  readonly pendingUploadRequirementIds: readonly string[];
};

export async function getCustomerPortalView(
  db: Reader,
  access: ActiveAccess,
): Promise<CustomerPortalView | null> {
  const [application] = await db
    .select({
      number: applications.applicationNumber,
      firstName: applications.customerFirstName,
      lastName: applications.customerLastName,
      serviceName: applications.serviceNameSnapshot,
      createdAt: applications.createdAt,
      status: applications.status,
      version: applications.version,
    })
    .from(applications)
    // Katmanlı savunma (PHASE 10): erişim kontrolü zaten reddeder; sorgu da silme sürecindeki başvuruyu okumaz.
    .where(and(eq(applications.id, access.applicationId), isNull(applications.deletionRequestedAt)))
    .limit(1);
  if (application === undefined) return null;

  const rows = await db
    .select({
      id: snapshots.id,
      title: snapshots.title,
      description: snapshots.description,
      instructions: snapshots.instructions,
      isRequired: snapshots.isRequired,
      status: snapshots.status,
      version: snapshots.version,
    })
    .from(snapshots)
    .where(eq(snapshots.applicationId, access.applicationId))
    .orderBy(asc(snapshots.sortOrder), asc(snapshots.createdAt), asc(snapshots.id));

  // Düzeltme bekleyen evraklar için en son müşteri açıklaması (PHASE 09 verisi; şimdilik boş olabilir).
  const revisionRows = await db
    .selectDistinctOn([reviews.requirementId], {
      requirementId: reviews.requirementId,
      message: reviews.customerMessage,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.applicationId, access.applicationId),
        eq(reviews.decision, "REVISION_REQUIRED"),
      ),
    )
    .orderBy(reviews.requirementId, desc(reviews.createdAt));
  // Yalnızca ACTIVE dosya (BR-72: müşteri eski versiyonları görmez); storage'a istek yapılmaz.
  const activeRows = await db
    .select({
      id: files.id,
      requirementId: files.requirementId,
      name: files.originalFilename,
      sizeBytes: files.sizeBytes,
      activatedAt: files.activatedAt,
    })
    .from(files)
    .where(and(eq(files.applicationId, access.applicationId), eq(files.status, "ACTIVE")));
  const activeByRequirement = new Map<string, CustomerActiveFile>();
  for (const row of activeRows) {
    if (row.sizeBytes === null || row.activatedAt === null) continue;
    activeByRequirement.set(row.requirementId, {
      id: row.id,
      name: row.name,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.activatedAt.toISOString(),
    });
  }

  const revisionByRequirement = new Map<string, string | null>(
    revisionRows.map((row) => [row.requirementId, row.message]),
  );

  const commentRows = await db
    .select({
      body: comments.body,
      createdAt: comments.createdAt,
      requirementId: comments.requirementId,
    })
    .from(comments)
    .where(eq(comments.applicationId, access.applicationId))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(100);
  const titleById = new Map(rows.map((row) => [row.id, row.title]));

  const timelineRows = await db
    .select({ status: statusHistory.toStatus, at: statusHistory.createdAt })
    .from(statusHistory)
    .where(eq(statusHistory.applicationId, access.applicationId))
    .orderBy(asc(statusHistory.createdAt), asc(statusHistory.id))
    .limit(200);

  const pendingRows = await db
    .select({ requirementId: files.requirementId })
    .from(files)
    .where(
      and(
        eq(files.applicationId, access.applicationId),
        inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
        gt(files.uploadExpiresAt, sql`now()`),
      ),
    );

  return {
    customer: { firstName: application.firstName, lastName: application.lastName },
    application: {
      number: application.number,
      serviceName: application.serviceName,
      createdAt: application.createdAt.toISOString(),
      status: application.status,
      version: application.version,
    },
    comments: commentRows.map((row) => ({
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      documentTitle: row.requirementId ? (titleById.get(row.requirementId) ?? null) : null,
    })),
    timeline: timelineRows.map((row) => ({ status: row.status, at: row.at.toISOString() })),
    pendingUploadRequirementIds: [...new Set(pendingRows.map((row) => row.requirementId))],
    documents: rows.map((row) => ({
      requirementId: row.id,
      version: row.version,
      activeFile: activeByRequirement.get(row.id) ?? null,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      isRequired: row.isRequired,
      status: row.status,
      revisionMessage:
        row.status === "REVISION_REQUIRED" ? (revisionByRequirement.get(row.id) ?? null) : null,
    })),
  };
}
