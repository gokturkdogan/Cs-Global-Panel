/**
 * E2E müşteri portalı tohumlama (YALNIZCA izole veritabanı — D-077/D-094). Sentetik başvuru +
 * snapshot evrakları + aktif token satırı oluşturur. Token test sürecinde üretilir, yalnızca
 * bellekte tutulur; hash izole ortamın rastgele `ACCESS_TOKEN_HMAC_KEY`'i ile hesaplanır. Portal
 * şifreli kopyayı çözmez; şifreli kopya alanı biçime uygun yer tutucudur (personel "Göster" bu
 * tohum başvurularında kullanılmaz). Test token'ları gerçek müşteri bağlantısı değildir.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type pg from "pg";

import type { ApplicationStatus, DocumentStatus } from "../../src/config/statuses";

export type SeedDocument = {
  title: string;
  required?: boolean;
  instructions?: string;
  status?: DocumentStatus;
  /** Düzeltme açıklaması: sentetik ACTIVE dosya + REVISION_REQUIRED inceleme kaydı (PHASE 09 verisi simülasyonu). */
  revisionMessage?: string;
};

export type SeededApplication = {
  readonly applicationId: string;
  readonly tokenId: string;
  readonly token: string;
  readonly number: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly serviceName: string;
};

function tokenKeys() {
  const hmac = process.env.ACCESS_TOKEN_HMAC_KEY;
  const keyId = process.env.ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID;
  if (!hmac || !keyId) throw new Error("token anahtarları yok (izole ortam gerekli)");
  return { hmacKey: Buffer.from(hmac, "base64"), keyId };
}

export async function insertToken(db: pg.ClientBase, applicationId: string, userId: string) {
  const { hmacKey, keyId } = tokenKeys();
  const token = randomBytes(32).toString("base64url");
  const tokenId = randomUUID();
  await db.query(
    `INSERT INTO application_access_tokens (id, application_id, token_hash, token_ciphertext, encryption_key_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      tokenId,
      applicationId,
      createHmac("sha256", hmacKey).update(token).digest("hex"),
      `v1:${keyId}:seed:seed:seed`,
      keyId,
      userId,
    ],
  );
  return { token, tokenId };
}

export async function seedApplication(
  db: pg.ClientBase,
  userId: string,
  options: {
    firstName?: string;
    lastName?: string;
    serviceName?: string;
    status?: ApplicationStatus;
    documents?: SeedDocument[];
  } = {},
): Promise<SeededApplication> {
  const tag = randomBytes(3).toString("hex");
  const firstName = options.firstName ?? "Deniz";
  const lastName = options.lastName ?? "Aydın";
  const serviceName = options.serviceName ?? `Portal Vize ${tag}`;
  const service = await db.query<{ id: string }>(
    "INSERT INTO services (name, created_by_user_id, updated_by_user_id) VALUES ($1, $2, $2) RETURNING id",
    [serviceName.slice(0, 150), userId],
  );
  const number = `CS-2093-${String((Number.parseInt(randomBytes(3).toString("hex"), 16) % 900000) + 100000)}`;
  const application = await db.query<{ id: string }>(
    `INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164, customer_email,
       search_text, service_id, service_name_snapshot, created_by_user_id, status)
     VALUES ($1, $2, $3, '+905320000123', $4, 'portal test', $5, $6, $7, $8) RETURNING id`,
    [
      number,
      firstName,
      lastName,
      `portal.${tag}@example.invalid`,
      service.rows[0]!.id,
      serviceName.slice(0, 150),
      userId,
      options.status ?? "AWAITING_DOCUMENTS",
    ],
  );
  const applicationId = application.rows[0]!.id;
  const documents = options.documents ?? [
    {
      title: "Pasaport",
      instructions: "Pasaportunuzun fotoğraflı sayfasını okunaklı şekilde PDF olarak yükleyiniz.",
    },
    {
      title: "Fotoğraf",
      required: false,
      instructions: "Son 6 ay içinde çekilmiş biyometrik fotoğraf.",
    },
    { title: "Banka Dökümü", instructions: "Son 3 aylık hesap dökümü." },
  ];
  for (const [index, doc] of documents.entries()) {
    const requirement = await db.query<{ id: string }>(
      `INSERT INTO application_document_requirements (application_id, title, instructions, is_required, sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        applicationId,
        doc.title,
        doc.instructions ?? null,
        doc.required ?? true,
        (index + 1) * 10,
        doc.status ?? "NOT_UPLOADED",
      ],
    );
    if (doc.revisionMessage) {
      const requirementId = requirement.rows[0]!.id;
      const fileId = randomUUID();
      await db.query(
        `INSERT INTO application_document_files
           (id, application_id, requirement_id, status, version_number, blob_pathname, original_filename,
            size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at, activated_at)
         VALUES ($1, $2, $3, 'ACTIVE', 1, $4, 'belge.pdf', 1024, $5, 'USER', $6, now() + interval '15 minutes', now())`,
        [
          fileId,
          applicationId,
          requirementId,
          `applications/${applicationId}/${requirementId}/${fileId}.pdf`,
          randomBytes(32).toString("hex"),
          userId,
        ],
      );
      await db.query(
        `INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, customer_message, reviewed_by_user_id)
         VALUES ($1, $2, $3, 'REVISION_REQUIRED', $4, $5)`,
        [applicationId, requirementId, fileId, doc.revisionMessage, userId],
      );
    }
  }
  const { token, tokenId } = await insertToken(db, applicationId, userId);
  return { applicationId, tokenId, token, number, firstName, lastName, serviceName };
}

/** Test için imzalı müşteri oturumu değeri (süre testleri). Biçim SECURITY §3.4 ile aynı. */
export function signCustomerSession(payload: Record<string, unknown>): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET yok");
  const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${part}.${createHmac("sha256", Buffer.from(secret, "base64")).update(part).digest("base64url")}`;
}

export const CUSTOMER_COOKIE = "cs_portal";
