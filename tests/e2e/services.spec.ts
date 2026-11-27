import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type { Locator, Page, TestInfo } from "@playwright/test";

import { isIsolatedTestDatabase, ISOLATION_SKIP_REASON } from "../support/isolation";
import { expect, sessionsAvailable, sessionsSkipReason, test } from "./fixtures";
import { collectErrors } from "./console-errors";

/**
 * Hizmet ve evrak şablonu yönetimi (PHASE 05).
 * - Salt okunur testler her ortamda (ortak `neondb` dahil) test oturumlarıyla çalışır; veri değiştirmez.
 * - Mutasyon testleri (oluşturma, düzenleme, evrak, sıralama, pasifleştirme) YALNIZCA izole geçici
 *   veritabanında çalışır (`pnpm test:e2e:isolated`, D-077): gerçek hesaplar ve gerçek veri yoktur,
 *   hesaplar geçici `test-` hesaplarıdır, container test sonunda silinir.
 */
test.skip(!sessionsAvailable, sessionsSkipReason);

const isolated = isIsolatedTestDatabase();
const tag = () => randomBytes(3).toString("hex");

async function screenshot(page: Page, testInfo: TestInfo, name: string, projects: string[]) {
  if (process.env.E2E_SCREENSHOTS !== "1" || !isolated || !projects.includes(testInfo.project.name))
    return;
  mkdirSync("screenshots/phase-05", { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: `screenshots/phase-05/${name}.png`,
    fullPage: true,
    mask: [page.getByTestId("header-username"), page.getByTestId("sidebar-username")],
  });
}

const requirementItem = (page: Page, title: string): Locator =>
  page.getByTestId("requirement-item").filter({ has: page.getByRole("heading", { name: title }) });

async function requirementTitles(page: Page) {
  return (
    await page.getByTestId("requirement-item").getByRole("heading", { level: 3 }).allTextContents()
  ).map((text) => text.replace(/^\d+\.\s*/, ""));
}

async function createServiceViaUi(page: Page, name: string) {
  await page.goto("/dashboard/services/new");
  await page.getByLabel("Hizmet adı").fill(name);
  await page.getByRole("button", { name: "Hizmeti Oluştur" }).click();
  await expect(page).toHaveURL(/\/dashboard\/services\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addRequirement(page: Page, title: string, instructions: string, required = true) {
  await page.getByRole("button", { name: "Yeni Evrak Ekle" }).click();
  const form = page.getByRole("form", { name: "Yeni evrak gereksinimi" });
  await expect(form.getByLabel("Evrak adı")).toBeFocused();
  await form.getByLabel("Evrak adı").fill(title);
  await form.getByLabel("Müşteriye gösterilecek yükleme talimatı").fill(instructions);
  if (!required) await form.getByLabel("Zorunlu evrak").uncheck();
  await form.getByRole("button", { name: "Evrakı Ekle" }).click();
  await expect(requirementItem(page, title)).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Evrak gereksinimi eklendi." }),
  ).toBeVisible();
}

test.describe("hizmetler — salt okunur", () => {
  test("liste sayfası: başlık, açıklama, Yeni Hizmet, arama, filtreler; no-store; konsol hatası yok", async ({
    page,
    signInAs,
  }) => {
    const errors = collectErrors(page);
    await signInAs("employee");
    const response = await page.goto("/dashboard/services");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page).toHaveTitle("Hizmetler | CS Global");
    await expect(page.getByRole("heading", { level: 1, name: "Hizmetler" })).toBeVisible();
    await expect(
      page.getByText("Vize hizmetlerini ve evrak gereksinimlerini yönetin."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Yeni Hizmet" }).first()).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Hizmet adına göre ara" })).toBeVisible();
    const filter = page.getByRole("navigation", { name: "Durum filtresi" });
    await expect(filter.locator('[aria-current="page"]')).toHaveText("Tümü");
    await expect(page.getByText("Henüz kullanıma hazır değil")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("arama sonucu yoksa ayrı mesaj; durum filtresi URL ve aria-current ile", async ({
    page,
    signInAs,
  }) => {
    await signInAs("employee");
    await page.goto(`/dashboard/services?q=${encodeURIComponent(`bulunmaz-${tag()}`)}`);
    // Katalog boşsa "Henüz hizmet bulunmuyor.", doluysa "sonuç yok" mesajı (ikisi birlikte asla).
    await expect(
      page.getByText(/^(Aramanıza uygun hizmet bulunamadı\.|Henüz hizmet bulunmuyor\.)$/),
    ).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Durum filtresi" })
      .getByRole("link", { name: "Pasif" })
      .click();
    await expect(page).toHaveURL(/status=inactive/);
    await expect(
      page.getByRole("navigation", { name: "Durum filtresi" }).locator('[aria-current="page"]'),
    ).toHaveText("Pasif");
    await expect(page.getByRole("searchbox")).toHaveValue(/^bulunmaz-/);
  });

  test("geçersiz ve bilinmeyen hizmet kimliği panel içinde 404", async ({ page, signInAs }) => {
    await signInAs("admin");
    for (const id of ["gecersiz-kimlik", "00000000-0000-4000-8000-000000000000"]) {
      const response = await page.goto(`/dashboard/services/${id}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
    }
  });

  test("oturumsuz erişim girişe yönlenir; başka origin'den mutasyon 403", async ({
    page,
    request,
  }) => {
    for (const path of ["/dashboard/services", "/dashboard/services/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    const forged = await request.post("/dashboard/services/new", {
      headers: { origin: "https://evil.example", "next-action": "x" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
  });

  test("iki hesap hizmet sayfalarında birebir aynı buton ve bağlantıları görür", async ({
    browser,
    signInAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "tek projede yeterli");
    const snapshot = async (role: "admin" | "employee", path: string) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const session = await signInAs(role, context);
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // Stil ve hidrasyon tamamlanmadan duyarlı (md:hidden) öğeler görünür sayılabilir.
        await page.waitForLoadState("networkidle");
        const initial = session.username.charAt(0).toLocaleUpperCase("tr-TR");
        const strip = (values: string[]) =>
          values.map((value) =>
            value
              .replaceAll(`${initial}${session.username}`, "<k>")
              .replaceAll(session.username, "<k>")
              .trim(),
          );
        // Veri listesi hariç (paralel testler izole ortamda hizmet ekleyebilir): kabuk, başlık,
        // filtreler ve form/aksiyonlar karşılaştırılır. Liste satırları aynı sorgudan gelir.
        const outsideList = ':not(section[aria-label="Hizmet listesi"] *):visible';
        return {
          buttons: strip(await page.locator(`button${outsideList}`).allTextContents()),
          links: strip(await page.locator(`a${outsideList}`).allTextContents()),
          fields: await page.locator(`:is(input, textarea)${outsideList}`).count(),
        };
      } finally {
        await context.close();
      }
    };
    for (const path of ["/dashboard/services", "/dashboard/services/new"]) {
      expect(await snapshot("admin", path)).toEqual(await snapshot("employee", path));
    }
  });

  test("mevcut bir hizmetin detayı (varsa) salt okunur görüntülenir; veri değiştirilmez", async ({
    page,
    signInAs,
  }) => {
    const errors = collectErrors(page);
    await signInAs("employee");
    await page.goto("/dashboard/services");
    const edit = page
      .getByRole("link", { name: /hizmetini düzenle$/ })
      .locator("visible=true")
      .first();
    test.skip((await edit.count()) === 0, "veritabanında hizmet yok");
    await edit.click();
    await expect(page.getByRole("heading", { level: 2, name: "Genel bilgiler" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Durum" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Evrak gereksinimleri" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Bu hizmette yapılan değişiklikler yeni başvurular için geçerlidir. Mevcut başvuruların evrak listeleri değişmez.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Dosya başına en fazla 10 MB")).toBeVisible();
    await expect(page.locator('input[name*="size" i], input[name*="mime" i]')).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    test(`${width}px: liste ve yeni hizmet formunda yatay taşma yok`, async ({
      page,
      signInAs,
      runtimeDb,
    }, testInfo) => {
      test.skip(
        !["Desktop Chrome", "Desktop WebKit"].includes(testInfo.project.name),
        "genişlikler masaüstü projelerinde ayarlanır",
      );
      await page.setViewportSize({ width, height: 900 });
      await signInAs("employee");
      // PHASE 12: boşluksuz uzun hizmet adı (yalnızca izole ortamda tohumlanır) dar ekranda taşmamalı.
      if (isolated) {
        const userId = (await runtimeDb.query<{ id: string }>("SELECT id FROM users LIMIT 1"))
          .rows[0]!.id;
        await runtimeDb.query(
          "INSERT INTO services (name, created_by_user_id, updated_by_user_id) VALUES ($1, $2, $2)",
          [`Uzun${"a".repeat(80)}${randomUUID().slice(0, 8)}`, userId],
        );
      }
      for (const path of ["/dashboard/services", "/dashboard/services/new"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("hizmetler — mutasyonlar (izole veritabanı)", () => {
  test.skip(!isolated, ISOLATION_SKIP_REASON);

  test("oluşturma: Türkçe doğrulama, odak, çift tıklamada tek kayıt, oturumdaki aktör ve audit", async ({
    page,
    signInAs,
    runtimeDb,
  }, testInfo) => {
    const errors = collectErrors(page);
    const admin = await signInAs("admin");
    await page.goto("/dashboard/services/new");
    await screenshot(page, testInfo, "new-service-form-desktop", ["Desktop Chrome"]);
    await screenshot(page, testInfo, "new-service-form-mobile", ["Mobile Chrome"]);

    await page.getByRole("button", { name: "Hizmeti Oluştur" }).click();
    await expect(page.getByText("Hizmet adı zorunludur.")).toBeVisible();
    await expect(page.getByLabel("Hizmet adı")).toBeFocused();
    await expect(page.getByLabel("Hizmet adı")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Hizmet adı").fill("<b>Vize</b>");
    await page.getByRole("button", { name: "Hizmeti Oluştur" }).click();
    await expect(page.getByText(/Yalnızca harf, rakam, boşluk/)).toBeVisible();

    const name = `Çalışma Vizesi ${tag()}`;
    await page.getByLabel("Hizmet adı").fill(name);
    await page.getByLabel("Açıklama").fill("Satır 1\nSatır 2");
    await expect(page.getByTestId("unsaved-indicator")).toBeVisible();
    await page.getByRole("button", { name: "Hizmeti Oluştur" }).dblclick();
    await expect(page).toHaveURL(/\?created=1$/);
    await expect(page.getByRole("status").filter({ hasText: "Hizmet oluşturuldu." })).toBeVisible();
    // Varsayılan pasif: aktif evrak olmadan başvuruya açılmaz.
    await expect(page.getByRole("button", { name: "Hizmeti aktifleştir" })).toBeVisible();

    const rows = await runtimeDb.query<{
      id: string;
      created_by_user_id: string;
      is_active: boolean;
    }>("SELECT id, created_by_user_id, is_active FROM services WHERE name = $1", [name]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({ created_by_user_id: admin.userId, is_active: false });
    const audit = await runtimeDb.query(
      "SELECT actor_user_id FROM audit_logs WHERE resource_id = $1 AND action = 'SERVICE_CREATED'",
      [rows.rows[0]!.id],
    );
    expect(audit.rows).toEqual([{ actor_user_id: admin.userId }]);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("aynı ad (Türkçe büyük harf) reddedilir; girilen veri korunur", async ({
    page,
    signInAs,
  }) => {
    await signInAs("employee");
    const base = `İstanbul Vizesi ${tag()}`;
    await createServiceViaUi(page, base);
    await page.goto("/dashboard/services/new");
    const duplicate = base.toLocaleUpperCase("tr-TR");
    await page.getByLabel("Hizmet adı").fill(duplicate);
    await page.getByLabel("Açıklama").fill("Korunacak açıklama");
    await page.getByRole("button", { name: "Hizmeti Oluştur" }).click();
    await expect(page.getByText("Bu adla bir hizmet zaten var.").first()).toBeVisible();
    await expect(page.getByLabel("Hizmet adı")).toHaveValue(duplicate);
    await expect(page.getByLabel("Açıklama")).toHaveValue("Korunacak açıklama");
  });

  test("düzenleme: kaydedildi bildirimi; eşzamanlı düzenlemede çakışma (iki hesap eşit)", async ({
    browser,
    signInAs,
  }) => {
    const adminContext = await browser.newContext();
    const employeeContext = await browser.newContext();
    try {
      await signInAs("admin", adminContext);
      await signInAs("employee", employeeContext);
      const adminPage = await adminContext.newPage();
      const employeePage = await employeeContext.newPage();
      const name = `Düzenleme Testi ${tag()}`;
      await createServiceViaUi(adminPage, name);
      await employeePage.goto(adminPage.url().replace("?created=1", ""));

      const renamed = `${name} (güncel)`;
      await employeePage.getByLabel("Hizmet adı").fill(renamed);
      await employeePage.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(
        employeePage.getByRole("status").filter({ hasText: "Değişiklikler kaydedildi." }),
      ).toBeVisible();
      await expect(employeePage.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

      // ADMIN eski sürüm üzerinden kaydeder → sessiz üzerine yazma yok.
      await adminPage.getByLabel("Açıklama").fill("Bayat form");
      await adminPage.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(
        adminPage.getByText("Bu kayıt başka bir işlem tarafından güncellendi.", { exact: false }),
      ).toBeVisible();
      await expect(adminPage.getByRole("button", { name: "Sayfayı yenile" })).toBeVisible();
      await adminPage.getByRole("button", { name: "Sayfayı yenile" }).click();
      await expect(adminPage.getByLabel("Hizmet adı")).toHaveValue(renamed);
    } finally {
      await adminContext.close();
      await employeeContext.close();
    }
  });

  test("evrak yönetimi: ekleme, XSS talimatı inert, zorunluluk, sıralama, pasifleştirme onayı, yeniden aktifleştirme", async ({
    page,
    signInAs,
  }, testInfo) => {
    const errors = collectErrors(page);
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await signInAs("employee");
    await createServiceViaUi(page, `Evrak Testi ${tag()}`);
    await expect(page.getByText("Bu hizmette henüz evrak gereksinimi yok.")).toBeVisible();

    const xss = "<img src=x onerror=alert(1)><script>alert(2)</script>\nİkinci satır";
    await addRequirement(page, "Pasaport", "Fotoğraflı sayfayı PDF olarak yükleyin.");
    await addRequirement(page, "Kimlik Fotokopisi", xss, false);
    await page.getByRole("button", { name: "Yeni Evrak Ekle" }).click();
    await screenshot(page, testInfo, "requirement-add-form-desktop", ["Desktop Chrome"]);
    await page
      .getByRole("form", { name: "Yeni evrak gereksinimi" })
      .getByLabel("Evrak adı")
      .fill("İş Sözleşmesi");
    await page
      .getByRole("form", { name: "Yeni evrak gereksinimi" })
      .getByRole("button", { name: "Evrakı Ekle" })
      .click();
    await expect(requirementItem(page, "İş Sözleşmesi")).toBeVisible();

    const kimlik = requirementItem(page, "Kimlik Fotokopisi");
    await expect(kimlik.getByTestId("requirement-instructions")).toHaveText(
      xss.replace("\n", "\n"),
    );
    await expect(kimlik.getByText("İsteğe bağlı")).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(dialogs).toEqual([]);

    // Sıralama: İş Sözleşmesi yukarı → Pasaport, İş Sözleşmesi, Kimlik; yenilemede korunur.
    expect(await requirementTitles(page)).toEqual([
      "Pasaport",
      "Kimlik Fotokopisi",
      "İş Sözleşmesi",
    ]);
    await page.getByRole("button", { name: "İş Sözleşmesi evrakını yukarı taşı" }).click();
    await expect
      .poll(() => requirementTitles(page))
      .toEqual(["Pasaport", "İş Sözleşmesi", "Kimlik Fotokopisi"]);
    await expect(
      page.getByRole("button", { name: "İş Sözleşmesi evrakını yukarı taşı" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Pasaport evrakını yukarı taşı" }),
    ).toBeDisabled();
    await page.reload();
    expect(await requirementTitles(page)).toEqual([
      "Pasaport",
      "İş Sözleşmesi",
      "Kimlik Fotokopisi",
    ]);

    // Düzenleme: zorunluluk değişimi.
    await page.getByRole("button", { name: "Kimlik Fotokopisi evrakını düzenle" }).click();
    const editForm = page.getByRole("form", { name: "Kimlik Fotokopisi evrakını düzenle" });
    await editForm.getByLabel("Zorunlu evrak").check();
    await editForm.getByRole("button", { name: "Evrakı Kaydet" }).click();
    await expect(
      requirementItem(page, "Kimlik Fotokopisi").getByText("Zorunlu", { exact: true }),
    ).toBeVisible();

    // Pasifleştirme: Escape iptal eder; onay uygular; yeniden aktifleştirilebilir.
    await page.getByRole("button", { name: "Pasaport evrakını pasifleştir" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Evrak pasifleştirilsin mi?" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Mevcut başvurulardaki evrak kayıtları silinmez veya değişmez.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Pasaport evrakını pasifleştir" })).toBeFocused();
    await expect(
      requirementItem(page, "Pasaport").getByText("Aktif", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pasaport evrakını pasifleştir" }).click();
    await dialog.getByRole("button", { name: "Pasifleştir" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      requirementItem(page, "Pasaport").getByText("Pasif", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pasaport evrakını aktifleştir" }).click();
    await expect(
      requirementItem(page, "Pasaport").getByText("Aktif", { exact: true }),
    ).toBeVisible();

    await screenshot(page, testInfo, "service-edit-desktop", ["Desktop Chrome"]);
    await screenshot(page, testInfo, "requirements-mobile", ["Mobile Chrome"]);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("hizmet pasifleştirme onayı, aktif evrak yoksa uyarı, liste filtreleri ve Türkçe arama", async ({
    page,
    signInAs,
  }, testInfo) => {
    await signInAs("admin");
    const id = tag();
    const name = `Öğrenci Işık Vizesi ${id}`;
    await createServiceViaUi(page, name);
    await page.getByRole("button", { name: "Hizmeti aktifleştir" }).click();
    await expect(
      page
        .getByText("Aktif evrak gereksinimi olmayan hizmetle başvuru oluşturulamaz.", {
          exact: false,
        })
        .first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Hizmeti pasifleştir" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Hizmet pasifleştirilsin mi?" });
    await expect(
      dialog.getByText("geçmiş kayıtlar silinmez veya değişmez", { exact: false }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Pasifleştir" }).click();
    await expect(page.getByRole("button", { name: "Hizmeti aktifleştir" })).toBeVisible();

    for (const query of [
      `ogrenci isik vizesi ${id}`,
      `ÖĞRENCİ IŞIK VİZESİ ${id}`,
      `OGRENCI ISIK ${id}`.replace(` ${id}`, ""),
    ]) {
      await page.goto(`/dashboard/services?q=${encodeURIComponent(query)}&status=inactive`);
      await expect(page.getByText(name).locator("visible=true").first()).toBeVisible();
    }
    await page.goto(`/dashboard/services?q=${encodeURIComponent(id)}&status=active`);
    await expect(page.getByText("Aramanıza uygun hizmet bulunamadı.")).toBeVisible();
    await page.goto(`/dashboard/services?q=${encodeURIComponent(id)}`);
    await screenshot(page, testInfo, "service-list-desktop", ["Desktop Chrome"]);
    await screenshot(page, testInfo, "service-list-mobile", ["Mobile Chrome"]);
  });
});
