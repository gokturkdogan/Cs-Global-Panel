// Client bundle'da sunucu secret adlarının veya sunucu modüllerinin bulunmadığını doğrular
// (ARCHITECTURE §7, TESTING_STRATEGY §7). `pnpm build` sonrasında çalıştırılır.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const STATIC_DIR = ".next/static";

/** Client koduna asla girmemesi gereken ifadeler: sunucu env adları ve sunucu modülü işaretleri. */
const FORBIDDEN = [
  "APP_URL",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "RATE_LIMIT_KEY_SECRET",
  "ACCESS_TOKEN_HMAC_KEY",
  "ACCESS_TOKEN_ENCRYPTION_KEYS",
  "CUSTOMER_SESSION_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "EnvValidationError",
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(js|mjs|css|json)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

let files;
try {
  files = await listFiles(STATIC_DIR);
} catch {
  console.error(`${STATIC_DIR} bulunamadı. Önce "pnpm build" çalıştırın.`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const term of FORBIDDEN) {
    if (content.includes(term)) findings.push(`${file}: ${term}`);
  }
}

if (findings.length > 0) {
  console.error("Client bundle'da yasaklı ifade bulundu:\n" + findings.join("\n"));
  process.exit(1);
}

console.log(`Client bundle kontrolü başarılı: ${files.length} dosya tarandı, yasaklı ifade yok.`);
