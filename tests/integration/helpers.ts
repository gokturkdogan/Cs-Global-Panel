/**
 * Integration test yardımcıları. Tüm veriler SENTETİKTİR: gerçek kişi, telefon, e-posta, belge
 * veya müşteri bağlantısı değildir. Token hash/ciphertext değerleri rastgele test değerleridir.
 */
import { randomBytes, randomUUID } from "node:crypto";

import pg from "pg";
import { expect } from "vitest";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/server/db/schema";
import { POOL_OPTIONS } from "@/server/db/settings";

import { connect, resolveDatabaseUrls } from "../../scripts/db/lib";
import { guardSharedDatabaseClient, guardSharedDatabasePool } from "../support/db-guard";
import { isIsolatedTestDatabase } from "../support/isolation";

export const urls = resolveDatabaseUrls();

/**
 * Ortak (Neon) veritabanında tüm test bağlantıları korumalıdır (D-129): kalıcı yazım yapılamaz.
 * İzole geçici veritabanında koruma yoktur (commit eden mutasyon testleri yalnızca orada).
 */
const shared = !isIsolatedTestDatabase();
const guardClient = (client: pg.Client) => (shared ? guardSharedDatabaseClient(client) : client);

/** Runtime rolüyle (uygulamanın kullanacağı en az yetkili rol) bağımsız bağlantı. */
export async function connectRuntime(): Promise<pg.Client> {
  return guardClient(await connect(urls.runtime, "cs-global-test-runtime"));
}

/** Tablo sahibi rolle bağlantı — yalnızca fixture temizliği ve sahip davranışı testleri için. */
export async function connectOwner(): Promise<pg.Client> {
  return guardClient(await connect(urls.owner, "cs-global-test-owner"));
}

export function createRuntimePool(max: number): pg.Pool {
  const pool = new pg.Pool({ connectionString: urls.runtime.connectionString, max });
  return shared ? guardSharedDatabasePool(pool) : pool;
}

/** Uygulamanın `createDatabase` eşdeğeri; ortak veritabanında korumalı Pool üzerinde. */
export function createTestDatabase() {
  const pool = new pg.Pool({
    connectionString: urls.runtime.connectionString,
    ...POOL_OPTIONS,
    application_name: "cs-global-test",
  });
  if (shared) guardSharedDatabasePool(pool);
  return { pool, db: drizzle({ client: pool, schema }) };
}

/** PostgreSQL hata kodunu bekler (23505 unique, 23514 check, 23503 FK, 42501 yetki, 55P03 kilit). */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

export const randomHex = (bytes = 32): string => randomBytes(bytes).toString("hex");
const shortId = (): string => randomUUID().slice(0, 8);

/** Test sırasında oluşturulan kayıtlar; `cleanup` bunları FK sırasına göre siler. */
export type Created = {
  users: string[];
  services: string[];
  applications: string[];
  years: number[];
};
export const newCreated = (): Created => ({ users: [], services: [], applications: [], years: [] });

export async function cleanup(created: Created): Promise<void> {
  const owner = await connectOwner();
  try {
    await owner.query("DELETE FROM applications WHERE id = ANY($1::uuid[])", [
      created.applications,
    ]);
    await owner.query(
      "DELETE FROM service_document_requirements WHERE service_id = ANY($1::uuid[])",
      [created.services],
    );
    await owner.query("DELETE FROM services WHERE id = ANY($1::uuid[])", [created.services]);
    // Yalnızca bu testlerin oluşturduğu geçici hesaplar silinir; gerçek hesaplara dokunulmaz.
    const testUsers = created.users.filter((id) => id.startsWith(TEST_ID_PREFIX));
    await owner.query("DELETE FROM users WHERE id = ANY($1::text[])", [testUsers]);
    await owner.query("DELETE FROM application_number_counters WHERE year = ANY($1::smallint[])", [
      created.years,
    ]);
  } finally {
    await owner.end();
  }
}

/** Geçici test hesaplarının kimlik öneki; gerçek hesaplar Better Auth kimliği kullanır (önek yok). */
export const TEST_ID_PREFIX = "test-";
export const testId = (): string => `${TEST_ID_PREFIX}${randomUUID()}`;

/**
 * Test satırları için FK hedefi olacak bir personel kimliği döndürür (OD-24: en fazla iki hesap).
 * Hesap varsa (gerçek veya geçici) yalnızca okunur, DEĞİŞTİRİLMEZ. Hiç hesap yoksa geçici bir
 * EMPLOYEE kaydı oluşturulur ve `cleanup` ile silinir.
 */
export async function createUser(client: pg.ClientBase, created: Created): Promise<string> {
  const existing = await client.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1");
  if (existing.rows[0] !== undefined) return existing.rows[0].id;
  const id = testId();
  await client.query(
    "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Test Personel', $1 || '@staff.invalid', $2, 'employee')",
    [id, `t_${shortId()}`],
  );
  created.users.push(id);
  return id;
}

export async function createService(
  client: pg.ClientBase,
  created: Created,
  userId: string,
): Promise<{ serviceId: string; templateId: string }> {
  const service = await client.query<{ id: string }>(
    "INSERT INTO services (name, created_by_user_id) VALUES ($1, $2) RETURNING id",
    [`Test Hizmeti ${shortId()}`, userId],
  );
  const serviceId = service.rows[0]!.id;
  created.services.push(serviceId);
  const template = await client.query<{ id: string }>(
    `INSERT INTO service_document_requirements (service_id, title, instructions, created_by_user_id)
     VALUES ($1, 'Pasaport', 'İlk sayfa', $2) RETURNING id`,
    [serviceId, userId],
  );
  return { serviceId, templateId: template.rows[0]!.id };
}

let numberCounter = 0;

export async function createApplication(
  client: pg.ClientBase,
  created: Created,
  input: { serviceId: string; userId: string; number?: string },
): Promise<string> {
  numberCounter += 1;
  const number =
    input.number ?? `CS-2098-${String(Date.now() % 1_000_000).padStart(6, "0")}${numberCounter}`;
  const result = await client.query<{ id: string }>(
    `INSERT INTO applications (application_number, customer_first_name, customer_last_name,
       customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot, created_by_user_id)
     VALUES ($1, 'Test', 'Müşteri', '+905550000001', 'test+1@example.invalid', 'test musteri', $2, 'Test Hizmeti', $3)
     RETURNING id`,
    [number, input.serviceId, input.userId],
  );
  const id = result.rows[0]!.id;
  created.applications.push(id);
  return id;
}

export async function createRequirement(
  client: pg.ClientBase,
  applicationId: string,
  sourceRequirementId: string | null = null,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO application_document_requirements
       (application_id, source_requirement_id, title, instructions, is_required, sort_order)
     VALUES ($1, $2, 'Pasaport', 'İlk sayfa', true, 10) RETURNING id`,
    [applicationId, sourceRequirementId],
  );
  return result.rows[0]!.id;
}

type FileInput = {
  applicationId: string;
  requirementId: string;
  userId: string;
  status:
    "UPLOAD_PENDING" | "VALIDATING" | "ACTIVE" | "SUPERSEDED" | "REMOVED" | "REJECTED" | "EXPIRED";
  versionNumber?: number | null;
  sizeBytes?: number | null;
  id?: string;
  blobPathname?: string;
};

/** Sentetik dosya metadata'sı satırı ekler (gerçek dosya/blob yoktur). */
export function insertFile(
  client: pg.ClientBase,
  input: FileInput,
): Promise<pg.QueryResult<{ id: string }>> {
  const id = input.id ?? randomUUID();
  const validated = ["ACTIVE", "SUPERSEDED", "REMOVED"].includes(input.status);
  const sizeBytes = input.sizeBytes === undefined ? (validated ? 1024 : null) : input.sizeBytes;
  return client.query<{ id: string }>(
    `INSERT INTO application_document_files
       (id, application_id, requirement_id, status, version_number, blob_pathname, original_filename,
        size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at, activated_at,
        storage_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'belge.pdf', $7, $8, 'USER', $9, now() + interval '15 minutes', $10, $11)
     RETURNING id`,
    [
      id,
      input.applicationId,
      input.requirementId,
      input.status,
      input.versionNumber === undefined ? (validated ? 1 : null) : input.versionNumber,
      input.blobPathname ?? `applications/${input.applicationId}/${input.requirementId}/${id}.pdf`,
      sizeBytes,
      validated ? randomHex(32) : null,
      input.userId,
      validated ? new Date() : null,
      // Sentetik sağlayıcı versiyon kimliği (ACTIVE için zorunlu — migration 0005).
      validated ? `test-version-${id}` : null,
    ],
  );
}

export function insertToken(
  client: pg.ClientBase,
  input: { applicationId: string; userId: string; tokenHash?: string },
): Promise<pg.QueryResult<{ id: string }>> {
  return client.query<{ id: string }>(
    `INSERT INTO application_access_tokens
       (application_id, token_hash, token_ciphertext, encryption_key_id, created_by_user_id)
     VALUES ($1, $2, $3, 'k1', $4) RETURNING id`,
    [
      input.applicationId,
      input.tokenHash ?? randomHex(32),
      `v1:k1:${randomHex(12)}:${randomHex(32)}:${randomHex(16)}`,
      input.userId,
    ],
  );
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** PHASE 11: `openDocumentFile` isteği (varsayılan: tam GET, Range yok). */
export function fileGet(
  fileId: string,
  disposition: "inline" | "attachment" = "inline",
  extra: { rangeHeader?: string | null; ifRange?: string | null; method?: "GET" | "HEAD" } = {},
) {
  return {
    fileId,
    disposition,
    method: extra.method ?? "GET",
    rangeHeader: extra.rangeHeader ?? null,
    ifRange: extra.ifRange ?? null,
  } as const;
}
