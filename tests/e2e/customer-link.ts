import type { Page } from "@playwright/test";

/** D-141 ara sayfasındaki açık giriş düğmesi (müşteri oturumu yalnızca bu POST ile açılır). */
export const CUSTOMER_LINK_BUTTON = "Başvurumu Görüntüle";

/**
 * Müşteri bağlantısını gerçek kullanıcı gibi açar (PHASE 12.1, D-141): `GET /b/<token>` genel ara sayfa →
 * "Başvurumu Görüntüle" → `POST /b/enter` → 303 ile `/portal/<bağlam>` veya genel hata sayfası.
 * Token yalnızca bellekte; ekran görüntüsü/trace yok.
 */
export async function openCustomerLink(page: Page, token: string): Promise<void> {
  // D-139: test kaynaklı gezinmeden önce mevcut sayfanın uçuştaki istekleri (ör. personel sayfasının
  // ön-getirmeleri) beklenir; D-131 istisnası genişletilmez. Boş sayfada anında döner.
  await page.waitForLoadState("networkidle");
  await page.goto(`/b/${token}`);
  await page.getByRole("button", { name: CUSTOMER_LINK_BUTTON }).click();
  await page.waitForURL(/\/(portal\/[A-Za-z0-9_-]+|link-invalid|link-unavailable)$/);
}
