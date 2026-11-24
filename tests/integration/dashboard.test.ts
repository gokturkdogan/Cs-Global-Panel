import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApplicationStatus } from "@/config/statuses";
import { DASHBOARD_RECENT_LIMIT, type DashboardOverview } from "@/features/dashboard/domain";
import { getDashboardOverview, queryDashboardOverview } from "@/features/dashboard/queries";
import { createDatabase } from "@/server/db/client";
import * as schema from "@/server/db/schema";

import { connectRuntime, createService, newCreated, randomHex, urls } from "./helpers";

/**
 * Genel Bakış sorguları (D-070). Runtime rolüyle, REPEATABLE READ bir transaction içinde: önce mevcut
 * veriyle sayaçlar okunur, sonra sentetik başvurular eklenir ve fark doğrulanır; transaction sonunda
 * GERİ ALINIR (veritabanında kalıcı sahte başvuru kalmaz). Gerçek kayıtlar değiştirilmez.
 */

const FUTURE = "now() + interval '1000 days'";

describe("dashboard genel bakış sorguları", () => {
  let client: pg.Client;
  let before: DashboardOverview;
  let after: DashboardOverview;
  const numbers: Record<string, string> = {};

  beforeAll(async () => {
    client = await connectRuntime();
    const db = drizzle({ client, schema });
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    before = await queryDashboardOverview(db);

    const user = await client.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1");
    const userId = user.rows[0]?.id;
    if (userId === undefined) throw new Error("FK için en az bir personel hesabı gerekli");
    const { serviceId } = await createService(client, newCreated(), userId);

    // Benzersiz, sentetik başvuru numaraları (2097 yılı — gerçek numaralarla çakışmaz).
    const base = Number.parseInt(randomHex(3), 16) % 900_000;
    let sequence = 0;
    const insert = async (
      key: string,
      status: ApplicationStatus,
      createdAtSql: string,
      options: { deletionRequested?: boolean; statusChangedAtSql?: string } = {},
    ) => {
      sequence += 1;
      const number = `CS-2097-${String(base + sequence).padStart(6, "0")}`;
      numbers[key] = number;
      await client.query(
        `INSERT INTO applications (application_number, customer_first_name, customer_last_name,
           customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot,
           created_by_user_id, status, created_at, status_changed_at, deletion_requested_at,
           deletion_requested_by_user_id)
         VALUES ($1, 'Test', $2, '+905550000099', 'test+dash@example.invalid', 'test', $3,
           'Test Hizmeti', $4, $5, ${createdAtSql}, ${options.statusChangedAtSql ?? "now()"},
           ${options.deletionRequested ? "now()" : "NULL"}, ${options.deletionRequested ? "$4" : "NULL"})`,
        [number, `Kisi${key}`, serviceId, userId, status],
      );
    };

    // Statü başına bir kayıt; oluşturma zamanları gelecekte → "son başvurular"ın başında olurlar.
    await insert("awaiting", "AWAITING_DOCUMENTS", `${FUTURE} + interval '1 minute'`);
    await insert("revision", "REVISION_REQUIRED", `${FUTURE} + interval '2 minutes'`);
    await insert("review", "UNDER_REVIEW", `${FUTURE} + interval '3 minutes'`, {
      statusChangedAtSql: "now() - interval '5000 days'",
    });
    await insert("approved", "DOCUMENTS_APPROVED", `${FUTURE} + interval '4 minutes'`);
    await insert("process", "IN_PROCESS", `${FUTURE} + interval '5 minutes'`);
    await insert("completed", "COMPLETED", `${FUTURE} + interval '6 minutes'`);
    await insert("cancelled", "CANCELLED", `${FUTURE} + interval '6 minutes'`); // eşit zaman
    // Silme talep edilmiş kayıt hiçbir sayaçta/listede görünmez (BR-153).
    await insert("deleted", "UNDER_REVIEW", `${FUTURE} + interval '10 minutes'`, {
      deletionRequested: true,
      statusChangedAtSql: "now() - interval '6000 days'",
    });

    after = await queryDashboardOverview(db);
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("sayaç farkları tanımlarla uyumludur (Evrak Bekleyen = evrak + düzeltme bekleyen)", () => {
    expect(after.stats.total - before.stats.total).toBe(7);
    expect(after.stats.awaitingDocuments - before.stats.awaitingDocuments).toBe(2);
    expect(after.stats.underReview - before.stats.underReview).toBe(1);
    expect(after.stats.completed - before.stats.completed).toBe(1);
  });

  it("son başvurular: en fazla 5, oluşturma zamanına göre azalan, eşitlikte numaraya göre", () => {
    expect(after.recentApplications).toHaveLength(DASHBOARD_RECENT_LIMIT);
    expect(after.recentApplications.map((row) => row.applicationNumber)).toEqual([
      numbers.cancelled,
      numbers.completed,
      numbers.process,
      numbers.approved,
      numbers.review,
    ]);
    expect(after.recentApplications[0]).toEqual({
      applicationNumber: numbers.cancelled,
      customerName: "Test Kisicancelled",
      serviceName: "Test Hizmeti",
      status: "CANCELLED",
      createdAt: expect.any(String),
    });
  });

  it("DTO'da telefon, e-posta, kimlik veya arama metni yoktur", () => {
    const serialized = JSON.stringify(after);
    expect(serialized).not.toContain("+905550000099");
    expect(serialized).not.toContain("example.invalid");
    for (const row of after.recentApplications) {
      expect(Object.keys(row).sort()).toEqual(
        ["applicationNumber", "createdAt", "customerName", "serviceName", "status"].sort(),
      );
    }
  });

  it("inceleme kuyruğu: yalnızca UNDER_REVIEW, en uzun bekleyen önce, silme talepli hariç", () => {
    expect(after.reviewQueue[0]?.applicationNumber).toBe(numbers.review);
    const queued = after.reviewQueue.map((row) => row.applicationNumber);
    expect(queued).not.toContain(numbers.deleted);
    expect(queued).not.toContain(numbers.awaiting);
    expect(after.reviewQueue.length).toBeLessThanOrEqual(5);
  });

  it("veritabanı hatası boş sonuç değil, ayrı bir hata sonucu döner", async () => {
    const broken = createDatabase(
      urls.runtime.connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:wrong-password@"),
    );
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      expect(await getDashboardOverview(broken.db)).toEqual({ ok: false });
      // Log yalnızca hata türü/kodu içerir: bağlantı adresi veya kullanıcı adı yok.
      expect(JSON.stringify(errors)).not.toContain("cs_app_runtime");
      expect(JSON.stringify(errors)).not.toContain("wrong-password");
    } finally {
      console.error = original;
      await broken.pool.end();
    }
  });

  it("gerçek veritabanında salt okunur transaction ile çalışır", async () => {
    const database = createDatabase(urls.runtime.connectionString);
    try {
      const result = await getDashboardOverview(database.db);
      expect(result.ok).toBe(true);
    } finally {
      await database.pool.end();
    }
  });
});
