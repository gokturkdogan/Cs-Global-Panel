import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { fixtures } from "../support/pdf-fixtures";
import { seedApplication } from "../support/portal-seed";
import { uploadAsCustomer } from "./customer-upload";
import { expect, sessionsAvailable, test } from "./fixtures";

/**
 * PHASE 12 erişilebilirlik denetimi (WCAG 2.2 AA hedefli otomatik kontroller; tam uyum iddiası değildir).
 * Yeni bağımlılık yok (axe/Lighthouse kullanılmadı): Playwright ARIA anlık görüntüsü ve DOM ölçümü.
 * - Adı olmayan etkileşimli öğe yok (düğme, bağlantı, metin alanı, seçim kutusu, onay kutusu, sayı alanı).
 * - Dokunma hedefi ≥ 24 × 24 CSS px veya 2.5.8 boşluk istisnası (merkezdeki 24 px alan başka hedefle
 *   kesişmez); cümle içi bağlantılar istisna.
 * - 320 px genişlikte yatay taşma yok (yeniden akış — 1.4.10).
 */
const isolated = isIsolatedTestDatabase();

const UNNAMED =
  /^\s*- (button|link|textbox|combobox|checkbox|spinbutton|searchbox|radio|switch|menuitem)(\s*\[[^\]]*\])?:?\s*$/;

async function unnamedControls(page: Page): Promise<string[]> {
  const snapshot = await page.locator("body").ariaSnapshot();
  return snapshot.split("\n").filter((line) => UNNAMED.test(line));
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const items = [
      ...document.querySelectorAll<HTMLElement>(
        "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]",
      ),
    ].filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // Görünmeyen (ör. odakta beliren "İçeriğe geç") ve gizli öğeler ölçülmez.
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        !el.closest("[aria-hidden=true]") &&
        rect.bottom > 0 &&
        rect.right > 0
      );
    });
    const rects = items.map((el) => el.getBoundingClientRect());
    const out: string[] = [];
    items.forEach((el, i) => {
      const rect = rects[i]!;
      if (rect.width >= 24 && rect.height >= 24) return;
      const style = getComputedStyle(el);
      // 2.5.8 istisnaları: cümle içi satır içi bağlantı; boşluk istisnası (merkezdeki 24 px'lik alan
      // başka bir hedefle kesişmiyor).
      if (el.tagName === "A" && style.display === "inline" && el.parentElement?.tagName === "P")
        return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const zone = { left: cx - 12, right: cx + 12, top: cy - 12, bottom: cy + 12 };
      const overlaps = rects.some(
        (other, j) =>
          j !== i &&
          !items[j]!.contains(el) &&
          !el.contains(items[j]!) &&
          other.left < zone.right &&
          other.right > zone.left &&
          other.top < zone.bottom &&
          other.bottom > zone.top,
      );
      if (overlaps) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      }
    });
    return out;
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("PHASE 12 erişilebilirlik (izole)", () => {
  test.skip(!isolated || !sessionsAvailable, ISOLATION_SKIP_REASON);

  test("personel ve müşteri ekranları: adsız kontrol yok, dokunma hedefi ≥ 24 px, 320 px'de taşma yok, görüntüleyici penceresi", async ({
    page,
    runtimeDb,
    signInAs,
    baseURL,
  }, testInfo) => {
    const userId = (
      await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1")
    ).rows[0]!.id;
    // SEC-12: veritabanı sınırındaki boşluksuz uzun adlar (hizmet 150, ad/soyad 100, evrak 150
    // karakter) dar ekranda taşmamalı; test kendi verisini tohumlar (diğer testlerin verisine bağlı değil).
    const app = await seedApplication(runtimeDb, userId, {
      firstName: `Ad${"a".repeat(98)}`,
      lastName: `Soyad${"s".repeat(95)}`,
      serviceName: `Hizmet${"h".repeat(136)}${randomUUID().slice(0, 8)}`,
      documents: [
        { title: `Pasaport${"p".repeat(142)}` },
        { title: "Banka Dökümü", required: false },
      ],
    });
    const requirement = (
      await runtimeDb.query<{ id: string }>(
        "SELECT id FROM application_document_requirements WHERE application_id = $1 ORDER BY sort_order",
        [app.applicationId],
      )
    ).rows[0]!.id;
    await uploadAsCustomer(
      page.context().browser()!,
      runtimeDb,
      baseURL!,
      app.token,
      requirement,
      fixtures.valid(),
    );

    const findings: Record<string, { unnamed: string[]; small: string[]; overflow: number }> = {};
    const check = async (label: string) => {
      await page.waitForLoadState("networkidle");
      findings[label] = {
        unnamed: await unnamedControls(page),
        small: await smallTargets(page),
        overflow: await horizontalOverflow(page),
      };
    };

    await signInAs("admin");
    for (const [label, path] of [
      ["dashboard", "/dashboard"],
      ["applications", "/dashboard/applications"],
      ["application-new", "/dashboard/applications/new"],
      ["detail", `/dashboard/applications/${app.applicationId}`],
      ["services", "/dashboard/services"],
      ["audit", "/dashboard/audit-logs"],
    ] as const) {
      await page.goto(path);
      await check(label);
    }
    // Görüntüleyici penceresi (odak kapanı + adlandırılmış kontroller).
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.getByTestId("pdf-view-button").filter({ visible: true }).first().click();
    await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute("data-rendered", "1");
    await check("viewer");
    // Atlama bağlantısı odakta görünür ve yeterli hedef boyutundadır.
    await page.keyboard.press("Escape");
    await page.goto("/dashboard");
    const skip = page.getByRole("link", { name: "İçeriğe geç" });
    // WebKit/Safari varsayılanında bağlantılar Tab sırasına girmez (tarayıcı ayarı); Tab sırası Chromium'da,
    // odaktaki boyut tüm motorlarda doğrulanır.
    if (testInfo.project.name.includes("Chrome")) await page.keyboard.press("Tab");
    else await skip.focus();
    await expect(skip).toBeFocused();
    const box = (await skip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await page.getByTestId("pdf-view-button").filter({ visible: true }).first().click();
    await expect(page.getByTestId("pdf-viewer-canvas")).toHaveAttribute("data-rendered", "1");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]"))),
    ).toBe(true);
    await page.keyboard.press("Escape");

    await page.goto(`/b/${app.token}`);
    await check("portal");
    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();
    await check("portal-320");
    await page.goto(`/dashboard/applications/${app.applicationId}`);
    await check("detail-320");

    for (const [label, result] of Object.entries(findings)) {
      expect(result.unnamed, `${label}: adsız kontrol`).toEqual([]);
      expect(result.overflow, `${label}: yatay taşma`).toBeLessThanOrEqual(1);
      expect(result.small, `${label}: küçük dokunma hedefi`).toEqual([]);
    }
  });
});
