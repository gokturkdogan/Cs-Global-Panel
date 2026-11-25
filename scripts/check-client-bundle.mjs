// Client bundle'da sunucu secret adlarının veya sunucu modüllerinin bulunmadığını doğrular
// (ARCHITECTURE §7, TESTING_STRATEGY §7). `pnpm build` sonrasında çalıştırılır.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const STATIC_DIR = ".next/static";

/** Sunucuya özel env değişkenleri — hem adları hem (tanımlıysa) değerleri client'ta aranır. */
const SERVER_ENV_NAMES = [
  "APP_URL",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "RATE_LIMIT_KEY_SECRET",
  "ACCESS_TOKEN_HMAC_KEY",
  "ACCESS_TOKEN_ENCRYPTION_KEYS",
  "ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID",
  "CUSTOMER_SESSION_SECRET",
  // PHASE 08: Backblaze B2 (bucket'a kısıtlı anahtar) — client'ta asla bulunmamalı.
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_ENDPOINT",
  "STORAGE_LOCAL_ROOT",
];

/** Sunucu modülü işaretleri (bu ifadeler yalnızca sunucu kodunda bulunur). */
const SERVER_MODULE_MARKERS = [
  "EnvValidationError",
  "DatabaseConfigError",
  "cs_app_runtime",
  // PHASE 06: token kriptografisi yalnızca sunucuda.
  "AccessTokenCryptoError",
  // PHASE 07: müşteri oturumu imzası yalnızca sunucuda.
  "cs-portal",
  "cs-access-token:",
  // PHASE 08: storage ve PDF doğrulama yalnızca sunucuda.
  "StorageConfigError",
  "storage_quota_state",
  "PdfValidatorUnavailableError",
  "backblazeb2.com",
];

/**
 * Build sırasında ortamda bulunan secret değerleri de aranır (canary sızıntı testi):
 * CI, gerçek olmayan benzersiz değerlerle build alıp bu kontrolü aynı ortamla çalıştırır.
 * Değerler raporda gösterilmez; yalnızca değişken adı yazılır.
 */
const secretValues = SERVER_ENV_NAMES.map((name) => [name, process.env[name]])
  .filter(([, value]) => typeof value === "string" && value.length >= 8)
  .flatMap(([name, value]) => {
    const candidates = [value];
    try {
      const url = new URL(value);
      if (url.password) candidates.push(decodeURIComponent(url.password));
    } catch {
      // URL değil
    }
    try {
      // JSON anahtar haritası (ACCESS_TOKEN_ENCRYPTION_KEYS): her anahtar değeri ayrıca aranır.
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        for (const item of Object.values(parsed))
          if (typeof item === "string" && item.length >= 8) candidates.push(item);
      }
    } catch {
      // JSON değil
    }
    return candidates.map((candidate) => ({ label: `${name} değeri`, value: candidate }));
  });

const FORBIDDEN = [
  ...SERVER_ENV_NAMES.map((name) => ({ label: name, value: name })),
  ...SERVER_MODULE_MARKERS.map((marker) => ({ label: marker, value: marker })),
  ...secretValues,
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
    if (content.includes(term.value)) findings.push(`${file}: ${term.label}`);
  }
}

if (findings.length > 0) {
  console.error("Client bundle'da yasaklı ifade bulundu:\n" + findings.join("\n"));
  process.exit(1);
}

console.log(
  `Client bundle kontrolü başarılı: ${files.length} dosya tarandı, yasaklı ifade yok` +
    ` (${secretValues.length} secret değeri dahil).`,
);
