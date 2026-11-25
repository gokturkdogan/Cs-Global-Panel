/**
 * pnpm env:token-keys
 *
 * Yerel `.env.local` dosyasına EKSİK olan müşteri erişim anahtarlarını ekler (PHASE 06 D-081, PHASE 07 D-088):
 * `ACCESS_TOKEN_HMAC_KEY`, `ACCESS_TOKEN_ENCRYPTION_KEYS`, `ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`,
 * `CUSTOMER_SESSION_SECRET`.
 * Mevcut değerlerin üzerine ASLA yazmaz (anahtar değişikliği mevcut bağlantıları bozar — DEPLOYMENT §5);
 * değerleri ekrana yazmaz. Yalnızca yerel geliştirme içindir; production anahtarları hosting
 * ortam değişkenlerinde, yetkili kişi tarafından üretilir.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const FILE = ".env.local";
if (!existsSync(FILE)) {
  console.error(`${FILE} bulunamadı. Önce .env.example'dan oluşturun.`);
  process.exit(1);
}

const content = readFileSync(FILE, "utf8");
const has = (name: string) => new RegExp(`^${name}=\\S+`, "m").test(content);

const keyId = "k1";
const additions: [string, string][] = [];
if (!has("ACCESS_TOKEN_HMAC_KEY")) {
  additions.push(["ACCESS_TOKEN_HMAC_KEY", randomBytes(32).toString("base64")]);
}
if (!has("ACCESS_TOKEN_ENCRYPTION_KEYS")) {
  additions.push([
    "ACCESS_TOKEN_ENCRYPTION_KEYS",
    JSON.stringify({ [keyId]: randomBytes(32).toString("base64") }),
  ]);
}
if (!has("ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID")) {
  additions.push(["ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID", keyId]);
}
if (!has("CUSTOMER_SESSION_SECRET")) {
  // Değişirse tüm müşteri oturumları sonlanır (bağlantılar geçerli kalır).
  additions.push(["CUSTOMER_SESSION_SECRET", randomBytes(32).toString("base64")]);
}

if (additions.length === 0) {
  console.log("Müşteri erişim anahtarları zaten tanımlı; değişiklik yapılmadı.");
} else {
  const prefix = content.endsWith("\n") ? "" : "\n";
  appendFileSync(
    FILE,
    `${prefix}\n# Müşteri erişim anahtarları (yerel geliştirme; değiştirmeyin — mevcut bağlantılar/oturumlar bozulur)\n${additions
      .map(
        ([name, value]) =>
          `${name}=${name === "ACCESS_TOKEN_ENCRYPTION_KEYS" ? `'${value}'` : value}`,
      )
      .join("\n")}\n`,
  );
  console.log(`Eklendi (değerler gösterilmez): ${additions.map(([name]) => name).join(", ")}`);
}
