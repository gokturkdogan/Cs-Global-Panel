import "server-only";

import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { DocumentFacts } from "@/features/applications/domain/application-status";
import type { Database } from "@/server/db/client";
import {
  applicationDocumentFiles as files,
  applicationDocumentRequirements as requirements,
  applicationStatusHistory as history,
  documentComments as comments,
  documentReviews as reviews,
  users,
} from "@/server/db/schema";

/**
 * Personel iş akışı okumaları (PHASE 09). Yalnızca veritabanı — PDF/storage çağrısı yok.
 * İki hesap aynı veriyi görür (OD-24).
 */

type Reader = Pick<Database, "select">;

export type StaffReview = {
  readonly id: string;
  readonly decision: "APPROVED" | "REVISION_REQUIRED";
  readonly customerMessage: string | null;
  readonly reviewer: string;
  readonly fileId: string;
  readonly fileVersion: number | null;
  readonly createdAt: string;
};

export type StaffComment = {
  readonly id: string;
  readonly body: string;
  readonly author: string;
  readonly documentTitle: string | null;
  readonly createdAt: string;
};

export type StaffHistoryEntry = {
  readonly id: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly transitionCode: string;
  readonly actor: string;
  readonly onBehalfOfCustomer: boolean;
  readonly reason: string | null;
  readonly createdAt: string;
};

export type WorkflowDetail = {
  readonly reviewsByRequirement: ReadonlyMap<string, readonly StaffReview[]>;
  readonly comments: readonly StaffComment[];
  readonly history: readonly StaffHistoryEntry[];
  readonly facts: readonly (DocumentFacts & {
    readonly requirementId: string;
    readonly title: string;
    readonly activeFileId: string | null;
    readonly activeFileVersion: number | null;
  })[];
};

export async function getWorkflowDetail(
  db: Reader,
  applicationId: string,
): Promise<WorkflowDetail> {
  const reviewRows = await db
    .select({
      id: reviews.id,
      requirementId: reviews.requirementId,
      decision: reviews.decision,
      customerMessage: reviews.customerMessage,
      reviewer: users.username,
      fileId: reviews.fileId,
      fileVersion: files.versionNumber,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.reviewedByUserId))
    .leftJoin(files, eq(files.id, reviews.fileId))
    .where(eq(reviews.applicationId, applicationId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));
  const reviewsByRequirement = new Map<string, StaffReview[]>();
  for (const row of reviewRows) {
    const list = reviewsByRequirement.get(row.requirementId) ?? [];
    list.push({
      id: row.id,
      decision: row.decision,
      customerMessage: row.customerMessage,
      reviewer: row.reviewer ?? "Personel",
      fileId: row.fileId,
      fileVersion: row.fileVersion,
      createdAt: row.createdAt.toISOString(),
    });
    reviewsByRequirement.set(row.requirementId, list);
  }

  const reqRows = await db
    .select({
      id: requirements.id,
      title: requirements.title,
      isRequired: requirements.isRequired,
      status: requirements.status,
    })
    .from(requirements)
    .where(eq(requirements.applicationId, applicationId))
    .orderBy(asc(requirements.sortOrder), asc(requirements.createdAt), asc(requirements.id));
  const fileRows = await db
    .select({
      id: files.id,
      requirementId: files.requirementId,
      status: files.status,
      versionNumber: files.versionNumber,
    })
    .from(files)
    .where(
      and(
        eq(files.applicationId, applicationId),
        inArray(files.status, ["ACTIVE", "UPLOAD_PENDING", "VALIDATING"]),
      ),
    );
  const livePending = await db
    .select({ requirementId: files.requirementId })
    .from(files)
    .where(
      and(
        eq(files.applicationId, applicationId),
        inArray(files.status, ["UPLOAD_PENDING", "VALIDATING"]),
        gt(files.uploadExpiresAt, sql`now()`),
      ),
    );
  const pending = new Set(livePending.map((row) => row.requirementId));
  const activeByReq = new Map(
    fileRows.filter((f) => f.status === "ACTIVE").map((f) => [f.requirementId, f]),
  );
  const facts = reqRows.map((req) => {
    const active = activeByReq.get(req.id);
    return {
      requirementId: req.id,
      title: req.title,
      isRequired: req.isRequired,
      status: req.status,
      hasActiveFile: active !== undefined,
      hasPendingUpload: pending.has(req.id),
      activeFileId: active?.id ?? null,
      activeFileVersion: active?.versionNumber ?? null,
    };
  });
  const titleById = new Map(reqRows.map((req) => [req.id, req.title]));

  const commentRows = await db
    .select({
      id: comments.id,
      body: comments.body,
      author: users.username,
      requirementId: comments.requirementId,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(eq(comments.applicationId, applicationId))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(200);

  const historyRows = await db
    .select({
      id: history.id,
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      transitionCode: history.transitionCode,
      actorType: history.actorType,
      username: users.username,
      onBehalfOfCustomer: history.onBehalfOfCustomer,
      reason: history.reason,
      createdAt: history.createdAt,
    })
    .from(history)
    .leftJoin(users, eq(users.id, history.actorUserId))
    .where(eq(history.applicationId, applicationId))
    .orderBy(asc(history.createdAt), asc(history.id));

  return {
    reviewsByRequirement,
    facts,
    comments: commentRows.map((row) => ({
      id: row.id,
      body: row.body,
      author: row.author ?? "Personel",
      documentTitle: row.requirementId ? (titleById.get(row.requirementId) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    })),
    history: historyRows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      transitionCode: row.transitionCode,
      actor: row.actorType === "CUSTOMER" ? "Müşteri" : (row.username ?? "Personel"),
      onBehalfOfCustomer: row.onBehalfOfCustomer,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
