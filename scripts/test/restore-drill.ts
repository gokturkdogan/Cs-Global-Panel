/**
 * Yedekleme / geri yükleme tatbikatı (PHASE 12, D-142) — YALNIZCA sentetik veri ve geçici Docker container'ları.
 *
 * Kullanım: `node scripts/test/restore-drill.ts`
 *
 * Gerçek Neon'a, gerçek Backblaze'e veya `.env.local` değerlerine bağlanmaz (tüm bağlantılar bu betiğin
 * oluşturduğu iki geçici container'a). Adımlar:
 *  1. Kaynak PostgreSQL container'ı → `db:init` + `db:migrate` (aynı migration'lar).
 *  2. Temsili sentetik veri: hizmet, başvuru, token, evrak, dosya (yerel depolamada gerçek nesne), yazım
 *     girişimi, inceleme, yorum, iç not, statü geçmişi, audit.
 *  3. Parmak izi (tablo satır sayıları + içerik hash'leri) ve şema envanteri (kısıt/indeks/trigger/yetki).
 *  4. `pg_dump -Fc` (kaynak container içinde) → hedef container (`db:init` ile yalnızca runtime rolü) →
 *     `pg_restore` → aynı envanter/parmak izi karşılaştırması.
 *  5. Hedefte: runtime rolüyle audit değiştirilemezliği, normal okuma/yazma, silme koruma trigger'ı.
 *  6. Silinmiş veri geri dönüşü (resurrection) gösterimi: yedekten SONRA iptal edilen token, geri yüklenen
 *     veritabanında yeniden geçerlidir → geri yükleme sonrası prosedür gereklidir (runbook).
 *  7. Nesne kopyası: sentetik PDF'ler başka bir yerel "bucket"a kopyalanır → SHA-256 eşleşir, VersionId'ler
 *     DEĞİŞİR → eşleme gerekir (runbook).
 * Çıktı yalnızca sayılar/süreler/sonuçlar; şifre, token veya kişisel veri yazdırılmaz. Container'lar ve geçici
 * dizinler her durumda silinir.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";

import { createLocalPrivateAdapter } from "../../src/server/storage/local-private.ts";
import { buildObjectKey } from "../../src/server/storage/types.ts";

const IMAGE = "postgres:18-alpine";
const DATABASE = "cs_drill";
const OWNER = "cs_drill_owner";
const run = randomBytes(3).toString("hex");
const secret = () => randomBytes(24).toString("hex");
const ownerPassword = secret();
const runtimePassword = secret();
const names = { source: `cs-drill-src-${run}`, target: `cs-drill-dst-${run}` };
const work = mkdtempSync(join(tmpdir(), "cs-drill-"));

function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function cleanup() {
  for (const name of Object.values(names)) {
    try {
      docker(["rm", "-f", name]);
    } catch {
      // zaten silinmiş
    }
  }
  rmSync(work, { recursive: true, force: true });
}

async function startDatabase(name: string): Promise<string> {
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-e",
    `POSTGRES_USER=${OWNER}`,
    "-e",
    `POSTGRES_PASSWORD=${ownerPassword}`,
    "-e",
    `POSTGRES_DB=${DATABASE}`,
    "-e",
    "POSTGRES_INITDB_ARGS=--locale-provider=builtin --builtin-locale=C.UTF-8 --encoding=UTF8",
    "-p",
    "127.0.0.1::5432",
    IMAGE,
  ]);
  for (let i = 0; i < 60; i += 1) {
    try {
      docker(["exec", name, "pg_isready", "-U", OWNER, "-d", DATABASE, "-h", "127.0.0.1"]);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const port = docker(["port", name, "5432/tcp"]).split(":").pop()!;
  return port;
}

function envFor(port: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: "development",
    ISOLATED_TEST_DB: "1",
    DATABASE_URL_UNPOOLED: `postgresql://${OWNER}:${ownerPassword}@127.0.0.1:${port}/${DATABASE}`,
    DATABASE_URL: `postgresql://cs_app_runtime:${runtimePassword}@127.0.0.1:${port}/${DATABASE}`,
  };
}

function node(script: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} başarısız`))));
  });
}

async function client(port: string, role: "owner" | "runtime"): Promise<pg.Client> {
  const c = new pg.Client({
    host: "127.0.0.1",
    port: Number(port),
    database: DATABASE,
    user: role === "owner" ? OWNER : "cs_app_runtime",
    password: role === "owner" ? ownerPassword : runtimePassword,
  });
  // Container silinirken kopan bağlantılar süreci düşürmesin (temizlik her durumda çalışır).
  c.on("error", () => undefined);
  await c.connect();
  return c;
}

const INVENTORY_SQL = {
  tables:
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  constraints:
    "SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'",
  indexes: "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'",
  triggers: "SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal",
  grants:
    "SELECT md5(string_agg(table_name||':'||privilege_type, ',' ORDER BY table_name, privilege_type)) AS n FROM information_schema.role_table_grants WHERE grantee='cs_app_runtime'",
  migrations: "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
};

async function inventory(c: pg.Client) {
  const out: Record<string, unknown> = {};
  for (const [key, sql] of Object.entries(INVENTORY_SQL))
    out[key] = (await c.query(sql)).rows[0]!.n;
  return out;
}

async function fingerprint(c: pg.Client) {
  const tables = (
    await c.query<{ t: string }>(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1",
    )
  ).rows.map((r) => r.t);
  const out: Record<string, string> = {};
  for (const table of tables) {
    const row = (
      await c.query<{ n: string; h: string }>(
        `SELECT count(*)::text AS n, coalesce(md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))), '') AS h FROM "${table}" t`,
      )
    ).rows[0]!;
    out[table] = `${row.n}:${row.h.slice(0, 8)}`;
  }
  return out;
}

async function main() {
  const timings: Record<string, number> = {};
  const t = (label: string, start: number) => (timings[label] = Date.now() - start);

  // 1) Kaynak.
  let start = Date.now();
  const sourcePort = await startDatabase(names.source);
  const sourceEnv = envFor(sourcePort);
  await node("scripts/db/init.ts", sourceEnv);
  await node("scripts/db/migrate.ts", sourceEnv);
  t("sourceReadyMs", start);

  // 2) Sentetik veri (runtime rolüyle — uygulamanın yazdığı gibi; owner yalnızca kurulum).
  const owner = await client(sourcePort, "owner");
  const runtime = await client(sourcePort, "runtime");
  const userId = `test-drill-${randomUUID()}`;
  await owner.query(
    "INSERT INTO users (id, name, email, username, role) VALUES ($1, 'Drill', $1 || '@staff.invalid', $2, 'admin')",
    [userId, `drill_${run}`],
  );
  const storageA = await createLocalPrivateAdapter(join(work, "bucket-a"));
  const files: { key: string; versionId: string; sha256: string }[] = [];
  const tokens: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const service = (
      await runtime.query<{ id: string }>(
        "INSERT INTO services (name, created_by_user_id, updated_by_user_id) VALUES ($1, $2, $2) RETURNING id",
        [`Drill Hizmet ${run} ${i}`, userId],
      )
    ).rows[0]!.id;
    const app = (
      await runtime.query<{ id: string }>(
        `INSERT INTO applications (application_number, customer_first_name, customer_last_name, customer_phone_e164,
           customer_email, search_text, service_id, service_name_snapshot, created_by_user_id)
         VALUES ($1, 'Sentetik', 'Müşteri', '+905320000000', $2, 'sentetik', $3, $4, $5) RETURNING id`,
        [
          `CS-2096-${String(i).padStart(12, "0")}`,
          `drill${i}@example.invalid`,
          service,
          `Drill Hizmet ${i}`,
          userId,
        ],
      )
    ).rows[0]!.id;
    const tokenId = randomUUID();
    tokens.push(tokenId);
    await runtime.query(
      `INSERT INTO application_access_tokens (id, application_id, token_hash, token_ciphertext, encryption_key_id, created_by_user_id)
       VALUES ($1, $2, $3, 'v1:t1:seed:seed:seed', 't1', $4)`,
      [tokenId, app, randomBytes(32).toString("hex"), userId],
    );
    const requirement = (
      await runtime.query<{ id: string }>(
        "INSERT INTO application_document_requirements (application_id, title, is_required, sort_order, status) VALUES ($1, 'Pasaport', true, 10, 'UPLOADED') RETURNING id",
        [app],
      )
    ).rows[0]!.id;
    if (i < 3) {
      // Gerçek nesne (yerel private depolama) + tutarlı dosya kaydı + onaylı yazım girişimi.
      const fileId = randomUUID();
      const key = buildObjectKey(app, requirement, fileId);
      const body = Buffer.from(
        `%PDF-1.7\n% drill ${run} ${i}\n${randomBytes(512).toString("hex")}\n%%EOF\n`,
      );
      const md5Hex = createHash("md5").update(body).digest("hex");
      const sha256 = createHash("sha256").update(body).digest("hex");
      const { versionId } = await storageA.putObject({
        key,
        body,
        contentType: "application/pdf",
        sizeBytes: body.length,
        md5Hex,
      });
      files.push({ key, versionId: versionId!, sha256 });
      await runtime.query(
        `INSERT INTO application_document_files (id, application_id, requirement_id, status, version_number, blob_pathname,
           original_filename, size_bytes, sha256, uploaded_by_actor_type, uploaded_by_user_id, upload_expires_at, activated_at,
           uploaded_at, storage_version_id)
         VALUES ($1, $2, $3, 'ACTIVE', 1, $4, 'sentetik.pdf', $5, $6, 'USER', $7, now(), now(), now(), $8)`,
        [fileId, app, requirement, key, body.length, sha256, userId, versionId],
      );
      await runtime.query(
        `INSERT INTO storage_write_attempts (application_id, file_id, object_key, state, outcome, version_id, started_at, settled_at)
         VALUES ($1, $2, $3, 'CONFIRMED', 'PROVIDER_CONFIRMED', $4, now(), now())`,
        [app, fileId, key, versionId],
      );
      await runtime.query(
        "INSERT INTO document_reviews (application_id, requirement_id, file_id, decision, customer_message, reviewed_by_user_id) VALUES ($1, $2, $3, 'REVISION_REQUIRED', 'Sentetik açıklama', $4)",
        [app, requirement, fileId, userId],
      );
    }
    await runtime.query(
      "INSERT INTO document_comments (application_id, body, author_user_id) VALUES ($1, 'Sentetik yorum', $2)",
      [app, userId],
    );
    await runtime.query(
      "INSERT INTO application_internal_notes (application_id, body, author_user_id) VALUES ($1, 'Sentetik not', $2)",
      [app, userId],
    );
    await runtime.query(
      "INSERT INTO application_status_history (application_id, from_status, to_status, transition_code, actor_type, actor_user_id) VALUES ($1, NULL, 'AWAITING_DOCUMENTS', 'CREATE', 'USER', $2)",
      [app, userId],
    );
    await runtime.query(
      "INSERT INTO audit_logs (action, actor_type, actor_user_id, resource_type, resource_id, application_id) VALUES ('APPLICATION_CREATED', 'USER', $1, 'application', $2, $3)",
      [userId, app, app],
    );
  }
  await owner.query("UPDATE storage_quota_state SET untracked_bytes = 1234 WHERE id = 1");
  const sourceInventory = await inventory(owner);
  const sourceFingerprint = await fingerprint(owner);

  // 3) Yedek (kaynak container içinde, özel biçim).
  start = Date.now();
  docker([
    "exec",
    "-e",
    `PGPASSWORD=${ownerPassword}`,
    names.source,
    "pg_dump",
    "-h",
    "127.0.0.1",
    "-U",
    OWNER,
    "-d",
    DATABASE,
    "-Fc",
    "-f",
    "/tmp/drill.dump",
  ]);
  t("dumpMs", start);
  docker(["cp", `${names.source}:/tmp/drill.dump`, join(work, "drill.dump")]);
  const dumpBytes = Number(docker(["exec", names.source, "stat", "-c", "%s", "/tmp/drill.dump"]));

  // 6a) Yedekten SONRA token iptali (silme/iptal olayının yedekte bulunmadığı durum).
  await owner.query(
    "UPDATE application_access_tokens SET revoked_at = now(), revoke_reason = 'REVOKED', revoked_by_user_id = $1 WHERE id = $2",
    [userId, tokens[0]],
  );
  await owner.end();
  await runtime.end();

  // 4) Hedef: temiz container + yalnızca rol (db:init), sonra geri yükleme.
  start = Date.now();
  const targetPort = await startDatabase(names.target);
  await node("scripts/db/init.ts", envFor(targetPort));
  docker(["cp", join(work, "drill.dump"), `${names.target}:/tmp/drill.dump`]);
  const restoreStart = Date.now();
  docker([
    "exec",
    "-e",
    `PGPASSWORD=${ownerPassword}`,
    names.target,
    "pg_restore",
    "-h",
    "127.0.0.1",
    "-U",
    OWNER,
    "-d",
    DATABASE,
    "--exit-on-error",
    "/tmp/drill.dump",
  ]);
  t("restoreMs", restoreStart);
  t("targetTotalMs", start);
  const targetOwner = await client(targetPort, "owner");
  const targetRuntime = await client(targetPort, "runtime");
  const targetInventory = await inventory(targetOwner);
  const targetFingerprint = await fingerprint(targetOwner);
  const fingerprintDiff = Object.keys(sourceFingerprint).filter(
    (k) => sourceFingerprint[k] !== targetFingerprint[k],
  );

  // 5) Hedefte güvenlik davranışı.
  const auditUpdate = await targetRuntime
    .query("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = (SELECT min(id) FROM audit_logs)")
    .then(
      () => "ALLOWED",
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );
  const auditDelete = await targetRuntime.query("DELETE FROM audit_logs").then(
    () => "ALLOWED",
    (e: { code?: string }) => `REJECTED ${e.code}`,
  );
  const appDelete = await targetRuntime
    .query("DELETE FROM applications WHERE application_number = 'CS-2096-000000000005'")
    .then(
      () => "ALLOWED",
      (e: { code?: string }) => `REJECTED ${e.code}`,
    );
  const runtimeRead = (
    await targetRuntime.query<{ n: number }>("SELECT count(*)::int AS n FROM applications")
  ).rows[0]!.n;
  const runtimeWrite = await targetRuntime
    .query(
      "INSERT INTO audit_logs (action, actor_type, resource_type) VALUES ('APPLICATION_CREATED', 'SYSTEM', 'application')",
    )
    .then(
      () => "OK",
      (e: { code?: string }) => `FAILED ${e.code}`,
    );

  // 6b) Resurrection: yedekten sonra iptal edilen token geri yüklenen veritabanında iptal edilmemiş görünür.
  const resurrected =
    (
      await targetOwner.query<{ revoked: boolean }>(
        "SELECT revoked_at IS NOT NULL AS revoked FROM application_access_tokens WHERE id = $1",
        [tokens[0]],
      )
    ).rows[0]!.revoked === false;

  // 7) Nesne kopyası: SHA-256 korunur, VersionId değişir → eşleme gerekir.
  const storageB = await createLocalPrivateAdapter(join(work, "bucket-b"));
  let shaMatches = 0;
  let versionChanged = 0;
  for (const file of files) {
    const object = await storageA.getObject(file.key, file.versionId);
    const bytes = Buffer.from(await new Response(object.body).arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    const md5Hex = createHash("md5").update(bytes).digest("hex");
    const { versionId } = await storageB.putObject({
      key: file.key,
      body: bytes,
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      md5Hex,
    });
    if (sha === file.sha256) shaMatches += 1;
    if (versionId !== file.versionId) versionChanged += 1;
  }
  const dbVersionResolves = await Promise.all(
    files.map(async (f) => (await storageB.headObject(f.key, f.versionId)) !== null),
  );
  await targetOwner.end();
  await targetRuntime.end();

  console.log(
    JSON.stringify(
      {
        sourceInventory,
        targetInventory,
        inventoryEqual: JSON.stringify(sourceInventory) === JSON.stringify(targetInventory),
        fingerprintTables: Object.keys(sourceFingerprint).length,
        fingerprintDiff,
        dumpBytes,
        timings,
        target: {
          auditUpdate,
          auditDelete,
          appDeleteWithoutEvidence: appDelete,
          runtimeRead,
          runtimeWrite,
        },
        resurrection: { tokenRevokedAfterBackupIsActiveAgain: resurrected },
        objectCopy: {
          objects: files.length,
          sha256Matches: shaMatches,
          versionIdsChanged: versionChanged,
          dbVersionIdsResolvableInNewBucket: dbVersionResolves.filter(Boolean).length,
        },
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    `[restore-drill] ${error instanceof Error && !("cmd" in error) ? error.message : "komut başarısız"}`,
  );
  process.exitCode = 1;
} finally {
  cleanup();
}
