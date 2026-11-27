import type { Browser } from "@playwright/test";
import type pg from "pg";

import { openCustomerLink } from "./customer-link";
import { expect } from "./fixtures";

/**
 * Sentetik PDF yüklemesi MÜŞTERİ yolundan (ayrı tarayıcı bağlamı, `/b/<token>` → oturum bağlamı). Yükleme
 * rate limit'i aktör başınadır: personel hesabı tüm E2E paketinde ortak olduğundan (iki hesap modeli)
 * görüntüleyici testleri personel kotasını tüketmez; her tohum başvurusunun kendi token anahtarı vardır.
 * Uygulamadaki sınır gevşetilmez.
 */
export async function uploadAsCustomer(
  browser: Browser,
  db: pg.Client,
  baseURL: string,
  token: string,
  requirementId: string,
  bytes: Buffer,
): Promise<string> {
  const { version } = (
    await db.query<{ version: number }>(
      "SELECT version FROM application_document_requirements WHERE id = $1",
      [requirementId],
    )
  ).rows[0]!;
  const customer = await browser.newContext({ baseURL });
  try {
    const page = await customer.newPage();
    await openCustomerLink(page, token);
    await expect(page).toHaveURL(/\/portal\//);
    const context = new URL(page.url()).pathname.split("/portal/")[1]!;
    const response = await customer.request.post(
      `/api/portal/${context}/documents/${requirementId}/file?expectedVersion=${version}`,
      {
        data: bytes,
        headers: {
          "content-type": "application/pdf",
          "x-upload-filename": "sentetik.pdf",
          origin: baseURL,
        },
        timeout: 60_000,
      },
    );
    expect(response.status()).toBe(200);
    return ((await response.json()) as { fileId: string }).fileId;
  } finally {
    await customer.close();
  }
}
