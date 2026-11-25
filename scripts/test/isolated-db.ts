/**
 * İzole geçici test veritabanı (D-077 — PHASE 05).
 *
 * Kullanım: `node scripts/test/isolated-db.ts <komut> [argümanlar…]`
 *   (ör. `pnpm test:integration:isolated`, `pnpm test:e2e:isolated`)
 *
 * 1. Docker'da resmî `postgres:18-alpine` imajıyla geçici bir container başlatır: rastgele şifreler,
 *    yalnızca 127.0.0.1'e bağlı rastgele port, Neon ile aynı locale (builtin C.UTF-8).
 * 2. `db:init` + `db:migrate` uygular (aynı migration'lar).
 * 3. Komutu, bu veritabanını gösteren ortam değişkenleriyle çalıştırır (`.env.local` değerleri ezilir;
 *    gerçek `neondb`'ye bağlanılmaz). Auth secret'ları da rastgele ve geçicidir.
 * 4. Dosya depolama (PHASE 08, D-106): her koşu için benzersiz, proje dışı geçici kök dizinde yerel
 *    private adapter (`STORAGE_PROVIDER=local`). Gerçek Backblaze değişkenleri ortamdan SİLİNİR; ayrıca
 *    `ISOLATED_TEST_DB=1` iken B2 yapılandırması reddedilir (fail-closed) → testler gerçek bucket'a bağlanamaz.
 *    Test kotası küçük sentetik değerlerle değil gerçek sınırlarla başlar; kota testleri kendi değerlerini verir.
 * 5. Komut nasıl biterse bitsin container ve depolama kökü silinir (`--rm` + `docker rm -f` + `rm -rf`).
 *
 * Gerçek hesaplar, gerçek oturumlar ve gerçek veriler bu ortamda yoktur. Hiçbir değer yazdırılmaz.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IMAGE = "postgres:18-alpine";
const DATABASE = "cs_isolated_test";
const OWNER = "cs_isolated_owner";

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Kullanım: node scripts/test/isolated-db.ts <komut> [argümanlar…]");
  process.exit(2);
}

const secret = () => randomBytes(24).toString("hex");
const container = `cs-global-isolated-${randomBytes(4).toString("hex")}`;
const ownerPassword = secret();
const runtimePassword = secret();
const storageRoot = mkdtempSync(join(tmpdir(), "cs-global-isolated-storage-"));

function docker(args: string[], options: { quiet?: boolean } = {}): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "inherit"],
  }).trim();
}

function removeContainer(): void {
  try {
    docker(["rm", "-f", container], { quiet: true });
  } catch {
    // Container zaten silinmiş olabilir (--rm).
  }
  rmSync(storageRoot, { recursive: true, force: true });
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", env });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on("error", () => resolve(1));
  });
}

async function waitForDatabase(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", OWNER, "-d", DATABASE, "-h", "127.0.0.1"], {
        quiet: true,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Geçici veritabanı zamanında hazır olmadı");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    removeContainer();
    process.exit(130);
  });
}

let exitCode = 1;
try {
  docker(
    [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
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
    ],
    { quiet: true },
  );
  await waitForDatabase();
  const port = docker(["port", container, "5432/tcp"], { quiet: true }).split(":").pop();
  if (port === undefined || !/^\d+$/.test(port)) throw new Error("Container portu okunamadı");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_ENV: "development",
    DATABASE_URL_UNPOOLED: `postgresql://${OWNER}:${ownerPassword}@127.0.0.1:${port}/${DATABASE}`,
    DATABASE_URL: `postgresql://cs_app_runtime:${runtimePassword}@127.0.0.1:${port}/${DATABASE}`,
    BETTER_AUTH_SECRET: secret(),
    RATE_LIMIT_KEY_SECRET: secret(),
    // Müşteri bağlantı token anahtarları: geçici, rastgele (gerçek anahtarlar kullanılmaz).
    ACCESS_TOKEN_HMAC_KEY: randomBytes(32).toString("base64"),
    ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ t1: randomBytes(32).toString("base64") }),
    ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "t1",
    CUSTOMER_SESSION_SECRET: randomBytes(32).toString("base64"),
    // Testler bu işaretle mutasyon testlerini açar; işaret ayrıca veritabanının yerel olduğunu doğrular.
    ISOLATED_TEST_DB: "1",
    // Dosya depolama: yalnızca geçici yerel private kök (gerçek B2 yok).
    STORAGE_PROVIDER: "local",
    STORAGE_LOCAL_ROOT: storageRoot,
  };
  // Boş değer (silme değil): Next.js `.env.local`'ı yalnızca TANIMSIZ değişkenler için yükler.
  for (const name of [
    "B2_KEY_ID",
    "B2_APPLICATION_KEY",
    "B2_BUCKET_NAME",
    "B2_ENDPOINT",
    "B2_REGION",
  ]) {
    env[name] = "";
  }
  console.log(
    `[isolated-db] geçici PostgreSQL hazır (${IMAGE}, 127.0.0.1, container ${container})`,
  );

  for (const script of ["scripts/db/init.ts", "scripts/db/migrate.ts"]) {
    const code = await run(process.execPath, [script], env);
    if (code !== 0) throw new Error(`${script} başarısız`);
  }
  exitCode = await run(command[0]!, command.slice(1), env);
} catch (error) {
  console.error(`[isolated-db] ${error instanceof Error ? error.message : "hata"}`);
  exitCode = 1;
} finally {
  removeContainer();
  console.log("[isolated-db] geçici container silindi");
}
process.exit(exitCode);
