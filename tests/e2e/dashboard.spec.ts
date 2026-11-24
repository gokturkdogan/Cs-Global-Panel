import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { Page } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { expect, sessionsAvailable, sessionsSkipReason, test } from "./fixtures";

/**
 * Şirket paneli (PHASE 04). Kimlik doğrulama: test başına kısa ömürlü oturum (D-067). İki hesap
 * aynı arayüzü görür (OD-24). Veri testleri yalnızca "Desktop Chrome" projesinde ve sırayla çalışır
 * (sentetik başvuru ekleyen tek yer; diğer projeler sayaç karşılaştırmasını etkilemesin diye).
 */
test.skip(!sessionsAvailable, sessionsSkipReason);

const NAV = ["Genel Bakış", "Başvurular", "Hizmetler", "İşlem Geçmişi"] as const;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Ana menüyü döndürür: masaüstünde sidebar, mobilde drawer açılarak. */
async function openMenu(page: Page) {
  if (!isDesktop(page)) {
    await page.getByRole("button", { name: "Menüyü aç" }).click();
    await expect(page.getByRole("dialog", { name: "Menü" })).toBeVisible();
  }
  return page.getByRole("navigation", { name: "Ana menü" }).locator("visible=true");
}

test.describe("panel iskeleti", () => {
  test("Genel Bakış: başlık, açıklama, konum yolu, pasif Yeni Başvuru, 4 sayaç; hata yok; no-store", async ({
    page,
    signInAs,
  }) => {
    const errors = collectErrors(page);
    await signInAs("employee");
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["content-security-policy"]).toMatch(/'nonce-[^']+'/);

    await expect(page).toHaveTitle("Genel Bakış | CS Global");
    await expect(page.getByRole("heading", { level: 1, name: "Genel Bakış" })).toBeVisible();
    await expect(page.getByText("Başvuru süreçlerinizi tek bir yerden takip edin.")).toBeVisible();
    const breadcrumb = page.getByRole("navigation", { name: "Konum" });
    await expect(breadcrumb).toHaveText(/Panel\s*Genel Bakış/);
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Genel Bakış");

    const newApplication = page.getByRole("button", { name: "Yeni Başvuru" });
    await expect(newApplication).toBeDisabled();
    await expect(
      page.getByText("Başvuru oluşturma sonraki aşamada kullanıma açılacak."),
    ).toBeVisible();

    const stats = page.getByTestId("dashboard-stats");
    for (const label of ["Toplam Başvuru", "Evrak Bekleyen", "İncelemede", "Tamamlanan"]) {
      await expect(stats.getByRole("heading", { name: label })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: "Son Başvurular" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "İnceleme Bekleyenler" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("iki hesap birebir aynı menü, buton ve bağlantıları görür", async ({
    browser,
    signInAs,
  }) => {
    const snapshot = async (role: "admin" | "employee") => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const session = await signInAs(role, context);
        const page = await context.newPage();
        await page.goto("/dashboard");
        // Yükleme iskeleti bitene kadar bekle (sayfa akışla gelir).
        await expect(page.getByTestId("dashboard-stats")).toBeVisible();
        await expect(page.getByRole("heading", { name: "İnceleme Bekleyenler" })).toBeVisible();
        const initial = session.username.charAt(0).toLocaleUpperCase("tr-TR");
        const strip = (values: string[]) =>
          values.map((value) =>
            value
              .replaceAll(`${initial}${session.username}`, "<avatar><kullanıcı>")
              .replaceAll(session.username, "<kullanıcı>")
              .trim(),
          );
        return {
          buttons: strip(await page.getByRole("button").allTextContents()),
          links: strip(await page.getByRole("link").allTextContents()),
          headings: strip(await page.getByRole("heading").allTextContents()),
        };
      } finally {
        await context.close();
      }
    };
    const [admin, employee] = [await snapshot("admin"), await snapshot("employee")];
    expect(admin).toEqual(employee);
    expect(admin.links).toEqual(expect.arrayContaining([...NAV]));
    expect(JSON.stringify(admin)).not.toMatch(/Ayarlar|Çalışan|Kullanıcı Yönetimi|Hesabım/);
  });

  test("menü gezinmesi: aktif öğe, konum yolu, hazır olmayan modüller 404 değil, Hizmetler gerçek modül", async ({
    page,
    signInAs,
  }) => {
    const errors = collectErrors(page);
    await signInAs("admin");
    await page.goto("/dashboard");
    for (const [label, path] of [
      ["Başvurular", "/dashboard/applications"],
      ["Hizmetler", "/dashboard/services"],
      ["İşlem Geçmişi", "/dashboard/audit-logs"],
      ["Genel Bakış", "/dashboard"],
    ] as const) {
      const menu = await openMenu(page);
      await menu.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("dialog")).toHaveCount(0); // drawer gezinmede kapanır
      await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
      const active = await openMenu(page);
      await expect(active.locator('[aria-current="page"]')).toHaveText(label);
      if (!isDesktop(page)) await page.keyboard.press("Escape");
      if (path !== "/dashboard") {
        // Hizmetler PHASE 05'te gerçek modül; diğerleri bilgilendirme sayfası.
        await expect(page.getByText("Henüz kullanıma hazır değil")).toHaveCount(
          path === "/dashboard/services" ? 0 : 1,
        );
        await expect(page.getByRole("navigation", { name: "Konum" })).toHaveText(
          new RegExp(`Panel\\s*${label}`),
        );
      }
    }
    expect(errors).toEqual([]);
  });

  test("panel içindeki tanımsız yol panel düzeninde 404 gösterir", async ({ page, signInAs }) => {
    await signInAs("employee");
    const response = await page.goto("/dashboard/olmayan-sayfa");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
    await expect(page.getByRole("link", { name: "Genel Bakış'a dön" })).toBeVisible();
  });

  test("klavye: ilk Tab 'İçeriğe geç' bağlantısıdır", async ({ page, signInAs, browserName }) => {
    test.skip(
      browserName === "webkit",
      "Safari varsayılanında Tab bağlantılara odaklanmaz (Option+Tab)",
    );
    await signInAs("employee");
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "İçeriğe geç" })).toBeFocused();
  });
});

test.describe("mobil drawer (<1024px)", () => {
  test.beforeEach(({ page }) => {
    test.skip(isDesktop(page), "yalnızca mobil/tablet genişliklerde");
  });

  test("aç/kapat: odak yönetimi, Escape, overlay, kaydırma kilidi", async ({ page, signInAs }) => {
    await signInAs("employee");
    await page.goto("/dashboard");
    await expect(page.getByRole("complementary", { name: "Panel menüsü" })).toBeHidden();
    const trigger = page.getByRole("button", { name: "Menüyü aç" });

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Menü" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("CS Global", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Vize Danışmanlık", { exact: true })).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", /.*/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", /.*/);

    await trigger.click();
    await expect(dialog).toBeVisible();
    // Drawer dışındaki overlay alanına tıklama (sağ kenar).
    const viewport = page.viewportSize()!;
    await page.locator(".drawer-overlay").click({ position: { x: viewport.width - 10, y: 200 } });
    await expect(dialog).toBeHidden();

    await trigger.click();
    await dialog.getByRole("button", { name: "Menüyü kapat" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("hesap menüsü ve oturum", () => {
  test("hesap menüsünden çıkış: oturum sunucuda silinir, panel kapanır", async ({
    page,
    signInAs,
    runtimeDb,
  }, testInfo) => {
    // Çıkış, oturumdaki hesap adına USER_LOGOUT audit kaydı yazar. Gerçek personel adına yanıltıcı
    // audit oluşmasın diye (D-067 onay koşulu) yalnızca izole veritabanında (geçici hesaplar) çalışır.
    test.skip(!isIsolatedTestDatabase(), ISOLATION_SKIP_REASON);
    test.skip(testInfo.project.name !== "Desktop Chrome", "tek projede yeterli");
    const session = await signInAs("employee");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: `Hesap menüsü: ${session.username}` }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText(session.username)).toBeVisible();
    await menu.getByRole("menuitem", { name: "Çıkış Yap" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const row = await runtimeDb.query("SELECT 1 FROM sessions WHERE id = $1", [session.sessionId]);
    expect(row.rowCount).toBe(0);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sidebar: kullanıcı adı, baş harf avatarı ve Çıkış Yap", async ({ page, signInAs }) => {
    const session = await signInAs("admin");
    await page.goto("/dashboard");
    const menu = await openMenu(page);
    const sidebar = menu.locator("xpath=..");
    await expect(sidebar.getByTestId("sidebar-username")).toHaveText(session.username);
    await expect(sidebar.getByRole("button", { name: "Çıkış Yap" })).toBeVisible();
  });

  test("sunucuda iptal edilen oturum bir sonraki istekte reddedilir", async ({
    page,
    signInAs,
    runtimeDb,
  }) => {
    const session = await signInAs("employee");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Genel Bakış" })).toBeVisible();
    await runtimeDb.query("DELETE FROM sessions WHERE id = $1", [session.sessionId]);
    await page.goto("/dashboard/services");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("süresi dolmuş oturum reddedilir", async ({ page, signInAs, runtimeDb }) => {
    const session = await signInAs("admin");
    await runtimeDb.query(
      "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [session.sessionId],
    );
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("değiştirilmiş cookie reddedilir", async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: "cs.session_token",
        value: encodeURIComponent(`${randomBytes(24).toString("base64url")}.AAAA`),
        url: baseURL!,
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("responsive", () => {
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    test(`${width}px: yatay taşma yok; sidebar yalnızca ≥1024px`, async ({
      page,
      signInAs,
    }, testInfo) => {
      test.skip(
        !["Desktop Chrome", "Desktop WebKit"].includes(testInfo.project.name),
        "genişlikler Chrome ve WebKit masaüstü projelerinde ayarlanır",
      );
      await page.setViewportSize({ width, height: 900 });
      await signInAs("employee");
      for (const path of ["/dashboard", "/dashboard/applications"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const sidebar = page.getByRole("complementary", { name: "Panel menüsü" });
        const trigger = page.getByRole("button", { name: "Menüyü aç" });
        if (width >= 1024) {
          await expect(sidebar).toBeVisible();
          await expect(trigger).toBeHidden();
          const box = await sidebar.boundingBox();
          expect(box?.width).toBe(248);
        } else {
          await expect(sidebar).toBeHidden();
          await expect(trigger).toBeVisible();
        }
      }
      if (process.env.E2E_SCREENSHOTS === "1" && testInfo.project.name === "Desktop Chrome") {
        const dir = "screenshots/phase-04";
        mkdirSync(dir, { recursive: true });
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");
        // Kullanıcı adı ve başvuru satırları maskelenir (gerçek veri ekran görüntüsüne girmez).
        const mask = [
          page.getByTestId("header-username"),
          page.getByTestId("sidebar-username"),
          page.getByTestId("recent-applications-table").locator("tbody"),
          page.getByTestId("recent-applications-list"),
          page.getByTestId("review-queue-list"),
        ];
        await page.screenshot({ path: `${dir}/dashboard-${width}.png`, fullPage: true, mask });
        if (width < 1024) {
          await page.getByRole("button", { name: "Menüyü aç" }).click();
          await expect(page.getByRole("dialog", { name: "Menü" })).toBeVisible();
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `${dir}/dashboard-${width}-drawer.png`,
            mask: [page.getByTestId("sidebar-username").locator("visible=true")],
          });
        }
      }
    });
  }
});

test.describe("veri (Desktop Chrome, sıralı)", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "sentetik veri yalnızca tek projede");
  });

  const countsSql = `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('AWAITING_DOCUMENTS','REVISION_REQUIRED'))::int AS awaiting,
      count(*) FILTER (WHERE status = 'UNDER_REVIEW')::int AS review,
      count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
    FROM applications WHERE deletion_requested_at IS NULL`;

  const statValue = (page: Page, label: string) =>
    page
      .getByTestId("dashboard-stats")
      .getByRole("heading", { name: label })
      .locator("xpath=../..")
      .locator("p")
      .first();

  test("sayaçlar veritabanıyla aynı; boşsa boş durum metinleri", async ({
    page,
    signInAs,
    runtimeDb,
  }) => {
    await signInAs("employee");
    await page.goto("/dashboard");
    const counts = (await runtimeDb.query<Record<string, number>>(countsSql)).rows[0]!;
    await expect(statValue(page, "Toplam Başvuru")).toHaveText(String(counts.total));
    await expect(statValue(page, "Evrak Bekleyen")).toHaveText(String(counts.awaiting));
    await expect(statValue(page, "İncelemede")).toHaveText(String(counts.review));
    await expect(statValue(page, "Tamamlanan")).toHaveText(String(counts.completed));
    if (counts.total === 0) {
      await expect(page.getByText("Henüz başvuru bulunmuyor.")).toBeVisible();
      await expect(
        page.getByText("Oluşturulan başvurular burada görüntülenecektir."),
      ).toBeVisible();
    }
    if (counts.review === 0) {
      await expect(page.getByText("İnceleme bekleyen başvuru bulunmuyor.")).toBeVisible();
    }
  });

  test("sentetik başvuru son başvurularda ve inceleme kuyruğunda görünür; telefon/e-posta görünmez", async ({
    page,
    signInAs,
    runtimeDb,
  }) => {
    const user = (
      await runtimeDb.query<{ id: string }>("SELECT id FROM users ORDER BY role LIMIT 1")
    ).rows[0]!;
    const suffix = randomBytes(4).toString("hex");
    const service = await runtimeDb.query<{ id: string }>(
      "INSERT INTO services (name, created_by_user_id) VALUES ($1, $2) RETURNING id",
      [`E2E Test Hizmeti ${suffix}`, user.id],
    );
    const number = `CS-2096-${String(Number.parseInt(suffix, 16) % 1_000_000).padStart(6, "0")}`;
    const application = await runtimeDb.query<{ id: string }>(
      `INSERT INTO applications (application_number, customer_first_name, customer_last_name,
         customer_phone_e164, customer_email, search_text, service_id, service_name_snapshot,
         created_by_user_id, status, created_at, status_changed_at)
       VALUES ($1, 'Sentetik', 'Kişi', '+905550000098', 'e2e+dash@example.invalid', 'sentetik',
         $2, $3, $4, 'UNDER_REVIEW', now() + interval '2000 days', now() - interval '9000 days')
       RETURNING id`,
      [number, service.rows[0]!.id, `E2E Test Hizmeti ${suffix}`, user.id],
    );
    try {
      await signInAs("admin");
      await page.goto("/dashboard");
      const table = page.getByTestId("recent-applications-table");
      const firstRow = table.locator("tbody tr").first();
      await expect(firstRow).toContainText(number);
      await expect(firstRow).toContainText("Sentetik Kişi");
      await expect(firstRow).toContainText(`E2E Test Hizmeti ${suffix}`);
      await expect(firstRow).toContainText("İncelemede");
      await expect(firstRow.locator("a")).toHaveCount(0);
      await expect(page.getByTestId("review-queue-list").locator("li").first()).toContainText(
        number,
      );
      const html = await page.content();
      expect(html).not.toContain("+905550000098");
      expect(html).not.toContain("e2e+dash@example.invalid");
      expect(html).not.toContain(application.rows[0]!.id);
    } finally {
      await runtimeDb.query("DELETE FROM applications WHERE id = $1", [application.rows[0]!.id]);
      // Hizmet silme yetkisi runtime rolünde yok (OD-12: hizmet silinmez) → sahip bağlantısıyla.
      const { connect, resolveDatabaseUrls } = await import("../../scripts/db/lib");
      const owner = await connect(resolveDatabaseUrls().owner, "cs-global-e2e-cleanup");
      try {
        await owner.query("DELETE FROM service_document_requirements WHERE service_id = $1", [
          service.rows[0]!.id,
        ]);
        await owner.query("DELETE FROM services WHERE id = $1", [service.rows[0]!.id]);
      } finally {
        await owner.end();
      }
    }
  });
});
