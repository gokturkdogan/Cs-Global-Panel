import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import type { ApplicationStatus, DocumentStatus } from "@/config/statuses";
import type { Database } from "@/server/db/client";
import type { ActiveAccess } from "@/server/customer-session/access";
import {
  applicationDocumentRequirements as snapshots,
  applications,
  documentReviews as reviews,
} from "@/server/db/schema";

/**
 * Müşteri portalı okuma sorgusu (PHASE 07, D-091). YALNIZCA doğrulanmış erişimin başvurusu
 * (`access.applicationId`); istemciden başvuru kimliği alınmaz. Açık kolon seçimi; DTO'da teknik
 * kimlik, telefon, e-posta, token, iç not, personel, audit, dosya/depolama bilgisi yoktur.
 * Evraklar başvuru anındaki snapshot'tan (BR-30), belirleyici sırada.
 * Bu modül iç not, audit, kullanıcı ve token tablolarını import etmez (ESLint kuralı).
 */

type Reader = Pick<Database, "select" | "selectDistinctOn">;

export type CustomerDocument = {
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
  };
  readonly documents: readonly CustomerDocument[];
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
    })
    .from(applications)
    .where(eq(applications.id, access.applicationId))
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
  const revisionByRequirement = new Map<string, string | null>(
    revisionRows.map((row) => [row.requirementId, row.message]),
  );

  return {
    customer: { firstName: application.firstName, lastName: application.lastName },
    application: {
      number: application.number,
      serviceName: application.serviceName,
      createdAt: application.createdAt.toISOString(),
      status: application.status,
    },
    documents: rows.map((row) => ({
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
