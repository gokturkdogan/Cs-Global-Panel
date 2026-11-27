import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listApplications, getApplicationDetail } from "@/features/applications/queries";
import { listAuditLogs } from "@/features/audit-logs/queries";
import { parseAuditFilters } from "@/features/audit-logs/schemas";
import { getCustomerPortalView } from "@/features/customer-portal/queries";
import { queryDashboardOverview } from "@/features/dashboard/queries";
import { listServices } from "@/features/services/queries";
import * as schema from "@/server/db/schema";

import { connectOwner, createRuntimePool, testId } from "../integration/helpers";
import { isIsolatedTestDatabase } from "../support/isolation";
import { seedApplication } from "../support/portal-seed";

/**
 * PHASE 11 (11.E) veritabanı sorgu analizi — YALNIZCA izole geçici veritabanı (`pnpm perf:db:isolated`).
 * Uygulamanın GERÇEK sorgu fonksiyonları çalıştırılır; üretilen SQL (Drizzle logger) yakalanır ve
 * sentetik veri setlerinde `EXPLAIN (ANALYZE, BUFFERS)` ile ölçülür: 100 / 1 000 / 10 000 başvuru,
 * 10 000 / 100 000 audit satırı. Büyük tablolarda sıralı tarama (Seq Scan) raporlanır. Neon'a dokunulmaz.
 */
type Captured = { sql: string; params: unknown[] };

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  Plans?: PlanNode[];
};

function walkPlan(node: PlanNode, out: string[]) {
  const label = node["Relation Name"]
    ? `${node["Node Type"]}(${node["Relation Name"]}${node["Index Name"] ? `:${node["Index Name"]}` : ""})`
    : node["Node Type"];
  out.push(label);
  for (const child of node.Plans ?? []) walkPlan(child, out);
}

describe.runIf(isIsolatedTestDatabase())("PHASE 11 sorgu planları (sentetik, izole)", () => {
  const pool = createRuntimePool(4);
  let captured: Captured[] = [];
  const db = drizzle({
    client: pool,
    schema,
    logger: { logQuery: (sql, params) => captured.push({ sql, params }) },
  });
  let owner: pg.Client;
  let userId: string;
  const results: Record<string, unknown> = {};

  beforeAll(async () => {
    owner = await connectOwner();
    await owner.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    const existing = await owner.query<{ id: string }>("SELECT id FROM users LIMIT 1");
    if (existing.rows[0]) userId = existing.rows[0].id;
    else {
      userId = testId();
      await owner.query(
        "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Perf', $1 || '@staff.invalid', $2, 'admin')",
        [userId, `t_${randomUUID().slice(0, 8)}`],
      );
    }
    await owner.query(
      `INSERT INTO services (name, created_by_user_id, updated_by_user_id)
         SELECT 'Explain Hizmet ' || g, $1, $1 FROM generate_series(1, 8) g`,
      [userId],
    );
  });
  afterAll(async () => {
    mkdirSync("perf-results", { recursive: true });
    writeFileSync("perf-results/db-explain.json", `${JSON.stringify(results, null, 2)}\n`);
    await owner.end();
    await pool.end();
  });

  async function growApplications(target: number) {
    const { rows } = await owner.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM applications WHERE application_number LIKE 'CS-2095-%'",
    );
    const from = rows[0]!.n + 1;
    if (from > target) return;
    await owner.query(
      `WITH s AS (SELECT id, name, row_number() OVER (ORDER BY name) AS rn FROM services WHERE name LIKE 'Explain Hizmet %')
       INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164,
          customer_email, search_text, service_id, service_name_snapshot, created_by_user_id, status, created_at)
       SELECT 'CS-2095-' || lpad(g::text, 12, '0'), 'Ad' || g, 'Soyad', '+90533' || lpad(g::text, 7, '0'),
          'x' || g || '@example.invalid', 'ad' || g || ' soyad 90533' || lpad(g::text, 7, '0'), s.id, s.name, $3,
          (ARRAY['AWAITING_DOCUMENTS','UNDER_REVIEW','REVISION_REQUIRED','DOCUMENTS_APPROVED','IN_PROCESS','COMPLETED','CANCELLED'])[1 + g % 7],
          now() - (g || ' minutes')::interval
         FROM generate_series($1::int, $2::int) g JOIN s ON s.rn = 1 + g % 8`,
      [from, target, userId],
    );
    await owner.query(
      `INSERT INTO application_document_requirements (application_id, title, is_required, sort_order, status)
         SELECT a.id, t.title, true, t.ord * 10, 'NOT_UPLOADED'
           FROM applications a CROSS JOIN (VALUES ('Pasaport', 1), ('Fotoğraf', 2), ('Banka Dökümü', 3), ('Form', 4)) AS t(title, ord)
          WHERE a.application_number LIKE 'CS-2095-%'
            AND NOT EXISTS (SELECT 1 FROM application_document_requirements r WHERE r.application_id = a.id)`,
    );
    await owner.query("ANALYZE");
  }

  async function growAudit(target: number) {
    const { rows } = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs");
    const missing = target - rows[0]!.n;
    if (missing <= 0) return;
    await owner.query(
      `INSERT INTO audit_logs (occurred_at, action, actor_type, actor_user_id, resource_type, resource_id, application_id)
         SELECT now() - (g || ' seconds')::interval,
                (ARRAY['APPLICATION_CREATED','DOCUMENT_UPLOADED','DOCUMENT_VIEWED','INTERNAL_NOTE_ADDED','APPLICATION_STATUS_CHANGED'])[1 + g % 5],
                'USER', $2, 'application', a.id::text, a.id
           FROM generate_series(1, $1::int) g
           JOIN LATERAL (SELECT id FROM applications WHERE application_number LIKE 'CS-2095-%'
                          ORDER BY application_number OFFSET (g % 1000) LIMIT 1) a ON true`,
      [missing, userId],
    );
    await owner.query("ANALYZE");
  }

  async function explain(name: string, run: () => Promise<unknown>) {
    captured = [];
    await run();
    const plans = [];
    for (const query of captured) {
      const { rows } = await owner.query<{
        "QUERY PLAN": [{ Plan: PlanNode; "Execution Time": number; "Planning Time": number }];
      }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, query.params);
      const [plan] = rows[0]!["QUERY PLAN"];
      const nodes: string[] = [];
      walkPlan(plan.Plan, nodes);
      plans.push({
        executionMs: Number(plan["Execution Time"].toFixed(3)),
        planningMs: Number(plan["Planning Time"].toFixed(3)),
        seqScans: nodes.filter((n) => n.startsWith("Seq Scan")),
        nodes,
      });
    }
    return {
      name,
      queries: plans.length,
      totalExecutionMs: Number(plans.reduce((n, p) => n + p.executionMs, 0).toFixed(3)),
      seqScansOnLargeTables: [
        ...new Set(
          plans.flatMap((p) =>
            p.seqScans.filter((s) =>
              /applications\)|audit_logs|application_document_requirements|application_document_files/.test(
                s,
              ),
            ),
          ),
        ),
      ],
      plans,
    };
  }

  const sizes = [
    { applications: 100, audit: 10_000 },
    { applications: 1_000, audit: 10_000 },
    { applications: 10_000, audit: 100_000 },
  ];

  it.each(sizes)(
    "veri seti: $applications başvuru / $audit audit",
    async ({ applications, audit }) => {
      await growApplications(applications);
      await growAudit(audit);
      const sample = await owner.query<{ id: string; service_id: string }>(
        "SELECT id, service_id FROM applications WHERE application_number LIKE 'CS-2095-%' ORDER BY application_number LIMIT 1 OFFSET 7",
      );
      const appId = sample.rows[0]!.id;
      const portal = await seedApplication(owner, userId);
      const base = { status: "ALL", serviceId: "", page: 1, pageSize: 20, q: "" } as const;
      const audits = (raw: Record<string, string>) => parseAuditFilters(raw).filters;
      const reports = [
        await explain("dashboard", () => queryDashboardOverview(db)),
        await explain("applications:list", () => listApplications(db, base)),
        await explain("applications:status", () =>
          listApplications(db, { ...base, status: "UNDER_REVIEW" }),
        ),
        await explain("applications:service", () =>
          listApplications(db, { ...base, serviceId: sample.rows[0]!.service_id }),
        ),
        await explain("applications:page-last", () =>
          listApplications(db, { ...base, page: 10_000 }),
        ),
        await explain("applications:search-name", () =>
          listApplications(db, { ...base, q: "Ad77" }),
        ),
        await explain("applications:search-phone", () =>
          listApplications(db, { ...base, q: "0533 000 0077" }),
        ),
        await explain("application:detail", () => getApplicationDetail(db, appId)),
        await explain("services:list", () => listServices(db, { q: "", status: "all" })),
        await explain("audit:list", () => listAuditLogs(db, audits({}))),
        await explain("audit:action", () =>
          listAuditLogs(db, audits({ action: "INTERNAL_NOTE_ADDED" })),
        ),
        await explain("audit:application", () =>
          listAuditLogs(db, audits({ applicationId: appId })),
        ),
        await explain("audit:date-range", () =>
          listAuditLogs(db, audits({ from: "2020-01-01", to: "2030-01-01" })),
        ),
        await explain("customer:portal", () =>
          getCustomerPortalView(db, {
            applicationId: portal.applicationId,
            tokenId: portal.tokenId,
          }),
        ),
      ];
      // Keyset sayfalama: ikinci sayfa (ilk sayfanın son kaydından sonra).
      const firstPage = await listAuditLogs(db, audits({}));
      const lastId = firstPage.items.at(-1)?.id;
      if (lastId !== undefined) {
        reports.push(
          await explain("audit:keyset-page2", () =>
            listAuditLogs(db, audits({ after: String(lastId) })),
          ),
        );
      }
      results[`${applications}-apps_${audit}-audit`] = reports.map(
        ({ name, queries, totalExecutionMs, seqScansOnLargeTables }) => ({
          name,
          queries,
          totalExecutionMs,
          seqScansOnLargeTables,
        }),
      );
      results[`${applications}-apps_${audit}-audit_detail`] = reports;
      expect(reports.length).toBeGreaterThan(10);
    },
    600_000,
  );
});
