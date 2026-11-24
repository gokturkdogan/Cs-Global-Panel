import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Personel kimlik doğrulaması (OD-24). ŞİFREYLE giriş testleri yalnızca global setup geçici test
 * hesaplarını oluşturabildiyse çalışır (gerçek hesaplar varsa atlanır — gerçek şifreler bilinmez).
 * Gerçek hesaplar varken oturum davranışı `dashboard.spec.ts`'te test oturumlarıyla doğrulanır (D-067).
 */
const accountsAvailable = process.env.E2E_ACCOUNTS === "available";
const accounts = {
  admin: {
    username: process.env.E2E_ADMIN_USERNAME ?? "",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
    label: "ADMIN",
  },
  employee: {
    username: process.env.E2E_EMPLOYEE_USERNAME ?? "",
    password: process.env.E2E_EMPLOYEE_PASSWORD ?? "",
    label: "EMPLOYEE",
  },
} as const;

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Kullanıcı adı").fill(username);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
}

test.describe("giriş ekranı", () => {
  test("yalnızca kullanıcı adı ve şifre; e-posta, kayıt, şifremi unuttum yok", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Kullanıcı adı")).toBeVisible();
    await expect(page.getByLabel("Şifre", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByText(/kayıt ol|şifremi unuttum|e-posta/i)).toHaveCount(0);
  });

  test("şifre göster/gizle çalışır (istemci betikleri CSP altında çalışıyor)", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Şifre", { exact: true });
    await page.getByRole("button", { name: "Şifreyi göster" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Şifreyi gizle" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("CSP nonce her istekte farklıdır", async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get("/login")).headers()["content-security-policy"] ?? "",
      )?.[1];
    const [first, second] = [await nonceOf(), await nonceOf()];
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  test("oturumsuz korumalı sayfa giriş ekranına yönlendirir", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

/** Giriş formunun Server Action alanlarını alır (isteği doğrudan göndermek için). */
async function loginFormFields(request: APIRequestContext): Promise<Record<string, string>> {
  const html = await (await request.get("/login")).text();
  const decode = (value: string) => value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  const fields = [...html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)];
  return Object.fromEntries(fields.map((match) => [match[1]!, decode(match[2] ?? "")]));
}

test.describe("durum değiştiren isteklerde köken kontrolü (P4-02, D-069)", () => {
  const forgedPost = async (request: APIRequestContext, headers: Record<string, string>) => {
    const multipart = { ...(await loginFormFields(request)), username: "x", password: "y" };
    return request.post("/login", { multipart, headers, maxRedirects: 0 });
  };

  for (const [name, headers] of [
    ["başka origin", { origin: "https://evil.example" }],
    ['"null" origin', { origin: "null" }],
    ["bozuk origin", { origin: "::::" }],
    ["farklı port", { origin: "http://localhost:3999" }],
  ] as const) {
    test(`${name} → kontrollü 403, cookie yok`, async ({ request }) => {
      const response = await forgedPost(request, headers);
      expect(response.status()).toBe(403);
      expect(await response.text()).toBe("İstek reddedildi.");
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["set-cookie"] ?? "").not.toContain("cs.session_token");
    });
  }

  test("Origin header'ı olmayan POST → 403", async ({ playwright, baseURL }) => {
    // Varsayılan istemci Origin göndermez; açıkça doğrulanır.
    const context = await playwright.request.newContext({ baseURL });
    try {
      const response = await context.post("/login", { form: { username: "x" }, maxRedirects: 0 });
      expect(response.status()).toBe(403);
    } finally {
      await context.dispose();
    }
  });

  test("güvenilmeyen Host / X-Forwarded-Host → 403", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const response = await forgedPost(request, { origin, "x-forwarded-host": "evil.example" });
    expect(response.status()).toBe(403);
  });

  test("aynı origin'den gelen istek proxy'den geçer (ret 403 değildir)", async ({
    request,
    baseURL,
  }) => {
    // Server Action alanı gönderilmez → giriş denemesi (ve rate limit sayacı) oluşmaz.
    const response = await request.post("/login", {
      form: { probe: "1" },
      headers: { origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    });
    expect(response.status()).not.toBe(403);
    expect(response.headers()["set-cookie"] ?? "").not.toContain("cs.session_token");
  });

  test("GET istekleri Origin olmadan da çalışır", async ({ request }) => {
    expect((await request.get("/login")).status()).toBe(200);
  });
});

test.describe("Better Auth HTTP uç noktaları bağlı değil (D-060)", () => {
  for (const path of [
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/sign-in/username",
    "/api/auth/change-password",
    "/api/auth/update-user",
    "/api/auth/delete-user",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/admin/create-user",
    "/api/auth/admin/impersonate-user",
    "/api/auth/get-session",
  ]) {
    test(`POST ${path} → 404`, async ({ request }) => {
      const response = await request.post(path, {
        data: { email: "x@example.invalid", username: "x", password: "Gizli-Sifre-1", name: "x" },
      });
      expect(response.status()).toBe(404);
    });
  }
});

test.describe("giriş ve çıkış (geçici test hesapları)", () => {
  test.skip(
    !accountsAvailable,
    `hesap testleri atlandı: ${process.env.E2E_ACCOUNTS ?? "bilinmiyor"}`,
  );

  for (const role of ["admin", "employee"] as const) {
    test(`${accounts[role].label} aynı ekrandan giriş yapar, aynı panele yönlenir ve çıkış yapar`, async ({
      page,
      context,
    }) => {
      await signIn(page, accounts[role].username, accounts[role].password);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { level: 1, name: "Genel Bakış" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: `Hesap menüsü: ${accounts[role].username}` }),
      ).toBeVisible();

      const cookie = (await context.cookies()).find((item) => item.name === "cs.session_token");
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe("Lax");
      expect(cookie?.path).toBe("/");
      expect(cookie?.domain).toBe("localhost"); // Domain özniteliği yok → host-only
      const days = ((cookie?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7.01);

      await page.getByRole("button", { name: `Hesap menüsü: ${accounts[role].username}` }).click();
      await page.getByRole("menuitem", { name: "Çıkış Yap" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("iki hesap aynı panel içeriğini görür (rol bazlı UI farkı yok)", async ({ browser }) => {
    const snapshot = async (role: "admin" | "employee") => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, accounts[role].username, accounts[role].password);
      await expect(page).toHaveURL(/\/dashboard$/);
      // Yükleme iskeleti bitene kadar bekle (sayfa akışla gelir).
      await expect(page.getByTestId("dashboard-stats")).toBeVisible();
      const { username } = accounts[role];
      const initial = username.charAt(0).toLocaleUpperCase("tr-TR");
      const strip = (values: string[]) =>
        values.map((value) =>
          value
            .replaceAll(`${initial}${username}`, "<avatar><kullanıcı>")
            .replaceAll(username, "<kullanıcı>"),
        );
      const buttons = strip(await page.getByRole("button").allTextContents());
      const links = strip(await page.getByRole("link").allTextContents());
      await context.close();
      return { buttons, links };
    };
    expect(await snapshot("admin")).toEqual(await snapshot("employee"));
  });

  test("yanlış şifre genel Türkçe hata verir ve oturum açmaz", async ({ page, context }) => {
    await signIn(page, accounts.admin.username, "Yanlis-Sifre-123");
    await expect(page.locator("#login-error")).toHaveText("Kullanıcı adı veya şifre hatalı.");
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).some((item) => item.name === "cs.session_token")).toBe(false);
  });

  test("yönlendirme parametresi yok sayılır (open redirect yok)", async ({ page }) => {
    await page.goto("/login?callbackURL=https://evil.example/&redirect=https://evil.example/");
    await page.getByLabel("Kullanıcı adı").fill(accounts.employee.username);
    await page.getByLabel("Şifre", { exact: true }).fill(accounts.employee.password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  test("CSRF: başka origin'den gelen giriş isteği geçerli şifreyle bile 403 ile reddedilir", async ({
    request,
  }) => {
    const multipart = {
      ...(await loginFormFields(request)),
      username: accounts.admin.username,
      password: accounts.admin.password,
    };
    const forged = await request.post("/login", {
      multipart,
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    expect(forged.headers()["set-cookie"] ?? "").not.toContain("cs.session_token");
  });
});
