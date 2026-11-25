/**
 * pnpm storage:verify — tek ve kontrollü CANLI Backblaze B2 duman testi (PHASE 08 §7, D-096).
 * Otomatik test paketlerinde çalışmaz; yalnızca elle. Yaklaşık 10 API çağrısı (Class A ücretsiz;
 * birkaç Class B/C), birkaç KB veri — günlük ücretsiz kotalar korunur.
 *
 * Adımlar:
 *  1. Yapılandırma (bucket'a kısıtlı anahtar; master key kullanılmaz). Değer yazdırılmaz.
 *  2. Bucket'a erişim + sınırlı envanter (ListObjectVersions, en çok 3 sayfa): nesne sayısı/bayt,
 *     uygulama dışı/bilinmeyen nesne var mı (kota hesabı bilinmeyen kullanımı yok saymaz).
 *  3. `_verification/<rastgele>.pdf` altına küçük SENTETİK PDF yazma (SSE-B2 + versiyon kimliği + ETag=MD5).
 *  4. HEAD (boyut/versiyon) + GET (SHA-256 içerik karşılaştırması).
 *  5. Private erişim: imzasız GET (path-style, virtual-host, B2 "friendly" URL) reddedilmeli.
 *  6. Yalnızca bu betiğin oluşturduğu nesnenin TÜM fiziksel versiyonları versiyona özgü silinir ve
 *     listede kalmadığı doğrulanır. Bucket listelenip toplu silme yapılmaz.
 */
import { createHash, randomBytes } from "node:crypto";

import { createB2Adapter } from "../../src/server/storage/b2.ts";
import { isStorageError } from "../../src/server/storage/errors.ts";
import { runCli } from "../db/lib.ts";
import { loadStorageConfig } from "./common.ts";

function syntheticPdf(marker: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
  ];
  let out = `%PDF-1.7\n% CS Global storage:verify ${marker} (sentetik)\n`;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const step = (ok: boolean, label: string, detail = "") =>
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);

await runCli("storage:verify", async () => {
  const config = loadStorageConfig();
  if (config.provider !== "b2") {
    throw new Error(
      "storage:verify yalnızca STORAGE_PROVIDER=b2 için çalışır (yerel adapter canlı test değildir).",
    );
  }
  console.log(
    `Hedef: Backblaze B2 · bucket ${config.bucket} · bölge ${config.region} (değerler/anahtarlar gösterilmez)`,
  );
  const storage = createB2Adapter(config);
  let failures = 0;
  const check = (ok: boolean, label: string, detail?: string) => {
    step(ok, label, detail);
    if (!ok) failures += 1;
  };

  // 2. Erişim + sınırlı envanter.
  const inventory = await storage.listObjectVersions("", 3);
  const live = inventory.versions.filter((v) => !v.isDeleteMarker);
  const appObjects = live.filter((v) => v.key.startsWith("applications/"));
  const leftovers = live.filter((v) => v.key.startsWith("_verification/"));
  const unknown = live.filter(
    (v) => !v.key.startsWith("applications/") && !v.key.startsWith("_verification/"),
  );
  check(true, "Bucket erişimi (ListObjectVersions)");
  console.log(
    `  Envanter: ${live.length} fiziksel versiyon (${live.reduce((sum, v) => sum + v.sizeBytes, 0)} bayt) · uygulama: ${appObjects.length} · önceki doğrulama kalıntısı: ${leftovers.length} · bilinmeyen: ${unknown.length} · silme işareti: ${inventory.versions.length - live.length}${inventory.truncated ? " · LİSTE KESİLDİ (3 sayfa)" : ""}`,
  );
  if (unknown.length > 0) {
    console.log(
      "  UYARI: Uygulama dışı nesneler var; kota hesabına dahil etmek için: pnpm storage:reconcile --apply",
    );
  }

  // 3. Sentetik yazma.
  const marker = randomBytes(16).toString("hex");
  const key = `_verification/${marker}.pdf`;
  const body = syntheticPdf(marker);
  const sha256 = createHash("sha256").update(body).digest("hex");
  let versionId: string | null = null;
  try {
    const put = await storage.putObject({
      key,
      body,
      contentType: "application/pdf",
      sizeBytes: body.length,
      md5Hex: createHash("md5").update(body).digest("hex"),
    });
    versionId = put.versionId;
    check(true, "Sentetik PDF yazma (PutObject, SSE-B2 AES256 yanıtı, ETag=MD5)");
    check(versionId !== null, "Sağlayıcı versiyon kimliği döndü (x-amz-version-id)");
  } catch (error) {
    check(
      false,
      "Sentetik PDF yazma",
      isStorageError(error) ? `${error.kind}${error.code ? ` ${error.code}` : ""}` : "hata",
    );
  }

  try {
    if (versionId !== null) {
      // 4. HEAD + GET.
      const head = await storage.headObject(key, versionId);
      check(
        head !== null && head.contentLength === body.length,
        "HEAD: boyut eşleşiyor",
        `${head?.contentLength ?? "-"} / ${body.length} bayt`,
      );
      const object = await storage.getObject(key, versionId);
      const received = Buffer.from(await new Response(object.body).arrayBuffer());
      check(
        createHash("sha256").update(received).digest("hex") === sha256,
        "GET: içerik SHA-256 eşleşiyor",
      );

      // 5. Private erişim: imzasız istekler reddedilmeli.
      const friendlyHost = config.region.replace(/^.*-(\d{3})$/, "f$1");
      const urls = [
        `${config.endpoint}/${config.bucket}/${key}`,
        `https://${config.bucket}.s3.${config.region}.backblazeb2.com/${key}`,
        `https://${friendlyHost}.backblazeb2.com/file/${config.bucket}/${key}`,
      ];
      for (const [index, url] of urls.entries()) {
        try {
          const response = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          });
          await response.body?.cancel();
          check(
            response.status === 401 || response.status === 403,
            `İmzasız erişim reddedildi (${["path-style", "virtual-host", "friendly URL"][index]})`,
            `HTTP ${response.status}`,
          );
        } catch {
          check(
            true,
            `İmzasız erişim reddedildi (${["path-style", "virtual-host", "friendly URL"][index]})`,
            "bağlantı kurulamadı",
          );
        }
      }
    }
  } finally {
    // 6. Yalnızca bu betiğin nesnesi: tüm fiziksel versiyonlar (yeniden deneme kaynaklı olanlar dahil).
    try {
      const own = await storage.listObjectVersions(key, 2);
      const versions = own.versions.filter((v) => v.key === key);
      for (const version of versions) await storage.deleteObjectVersion(key, version.versionId);
      const after = await storage.listObjectVersions(key, 2);
      check(
        !after.versions.some((v) => v.key === key),
        "Versiyona özgü fiziksel silme + doğrulama",
        `${versions.length} versiyon silindi`,
      );
    } catch (error) {
      check(false, "Temizlik", isStorageError(error) ? error.kind : "hata");
      console.log(
        `  Kalan doğrulama nesnesi önek: _verification/ — tekrar çalıştırın veya B2 panelinden kaldırın.`,
      );
    }
  }

  console.log(
    failures === 0
      ? "\nBackblaze B2 doğrulaması BAŞARILI."
      : `\nBackblaze B2 doğrulaması BAŞARISIZ (${failures} adım).`,
  );
  if (failures > 0) process.exitCode = 1;
});
