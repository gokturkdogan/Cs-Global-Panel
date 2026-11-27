/**
 * pnpm env:b2
 *
 * Backblaze B2 dosya depolama yapılandırmasını yerel `.env.local` dosyasına güvenli biçimde yazar
 * (PHASE 08, D-096/D-098). Etkileşimli terminal zorunludur:
 * - `B2_KEY_ID` görünür, `B2_APPLICATION_KEY` gizli (yankısız) girilir; komut argümanı, ortam değişkeni
 *   veya pipe kabul edilmez → değerler shell geçmişine ve süreç listesine düşmez.
 * - Mevcut değişkenler korunur; eksik B2/depolama ayarları eklenir. Mevcut B2 anahtarı yalnızca açık
 *   "evet" onayıyla değiştirilir (sessiz değişiklik yok). Yinelenen değişken varsa işlem durur.
 * - Dosya geçici dosyaya 0600 izniyle yazılıp atomik olarak yer değiştirir; izin 0600 kalır.
 * - Hiçbir değer ekrana yazılmaz.
 *
 * Master Application Key kullanılmamalıdır: yalnızca `cs-global-documents` bucket'ına kısıtlı
 * Application Key girin (Backblaze S3 uyumlu API master key'i zaten kabul etmez).
 */
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import { askHidden, askVisible, assertInteractiveTerminal } from "../auth/prompt.ts";

const FILE = ".env.local";
const TEMP = `${FILE}.tmp-b2`;

/** Gizli olmayan varsayılan ayarlar (kullanıcı tarafından sağlanan mevcut bucket — PHASE 08 §3). */
const DEFAULTS: readonly (readonly [string, string])[] = [
  ["STORAGE_PROVIDER", "b2"],
  ["B2_BUCKET_NAME", "cs-global-documents"],
  ["B2_ENDPOINT", "https://s3.eu-central-003.backblazeb2.com"],
  ["B2_REGION", "eu-central-003"],
  // Güvenli başlangıç kotası (yalnızca tanımsızsa eklenir). Hedef 100 GB / 90 GB (OD-26) sağlayıcı hesabı
  // hazırlığı (ödeme yöntemi, cap'ler, uyarılar) doğrulandıktan sonra elle etkinleştirilir — FILE_STORAGE §7.2.
  ["STORAGE_MAX_TOTAL_BYTES", "9000000000"],
  ["STORAGE_WARNING_BYTES", "8000000000"],
];

const KEY_ID_PATTERN = /^[A-Za-z0-9]{10,64}$/;
const APPLICATION_KEY_PATTERN = /^[A-Za-z0-9+/=_-]{20,128}$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  assertInteractiveTerminal();
  if (!existsSync(FILE)) fail(`${FILE} bulunamadı. Önce .env.example'dan oluşturun.`);

  const original = readFileSync(FILE, "utf8");
  const lines = original.split("\n");
  const names = lines
    .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
  const duplicates = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];
  if (duplicates.length > 0) {
    fail(`${FILE} içinde yinelenen değişken var (${duplicates.join(", ")}); önce düzeltin.`);
  }
  const hasValue = (name: string) => new RegExp(`^${name}=\\S+`, "m").test(original);

  if (hasValue("B2_KEY_ID") || hasValue("B2_APPLICATION_KEY")) {
    const answer = await askVisible(
      "B2 anahtarı zaten tanımlı. Yeni anahtarla DEĞİŞTİRMEK istiyor musunuz? (evet/hayır): ",
    );
    if (answer.trim().toLocaleLowerCase("tr") !== "evet") {
      console.log("Değişiklik yapılmadı. Mevcut B2 anahtarı korundu.");
      return;
    }
  }

  const keyId = (await askVisible("B2 Application Key ID (keyID): ")).trim();
  if (!KEY_ID_PATTERN.test(keyId)) fail("Geçersiz keyID biçimi. Değişiklik yapılmadı.");
  const applicationKey = (await askHidden("B2 Application Key (gizli, ekranda görünmez): ")).trim();
  if (!APPLICATION_KEY_PATTERN.test(applicationKey)) {
    fail("Geçersiz Application Key biçimi. Değişiklik yapılmadı.");
  }
  if (applicationKey === keyId) fail("keyID ve Application Key aynı olamaz. Değişiklik yapılmadı.");

  const updates = new Map<string, string>([
    ["B2_KEY_ID", keyId],
    ["B2_APPLICATION_KEY", applicationKey],
  ]);
  const output = lines.map((line) => {
    const name = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (name !== undefined && updates.has(name)) {
      const value = updates.get(name)!;
      updates.delete(name);
      return `${name}=${value}`;
    }
    return line;
  });
  while (output.length > 0 && output.at(-1) === "") output.pop();

  const additions: string[] = [];
  for (const [name, value] of DEFAULTS) {
    if (!names.includes(name)) additions.push(`${name}=${value}`);
  }
  for (const [name, value] of updates) additions.push(`${name}=${value}`);
  if (additions.length > 0) {
    output.push(
      "",
      "# Backblaze B2 dosya depolama (PHASE 08 — yalnızca bucket'a kısıtlı Application Key; master key değil)",
      ...additions,
    );
  }

  writeFileSync(TEMP, `${output.join("\n")}\n`, { mode: 0o600, flag: "w" });
  chmodSync(TEMP, 0o600);
  renameSync(TEMP, FILE);
  chmodSync(FILE, 0o600);

  console.log("Backblaze B2 yapılandırması tamamlandı.");
  console.log("Gizli değerler gösterilmedi.");
  console.log("Bağlantıyı doğrulamak için: pnpm storage:verify");
}

main().catch((error: unknown) => {
  try {
    if (existsSync(TEMP)) unlinkSync(TEMP);
  } catch {
    // Geçici dosya temizliği en iyi çabadır.
  }
  console.error(error instanceof Error ? error.message : "İşlem başarısız.");
  process.exit(1);
});
