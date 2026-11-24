import { describe, expect, it } from "vitest";

import { signInSchema } from "@/features/auth/schemas";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/server/auth/credentials-policy";
import { EnvValidationError, parseAuthEnv } from "@/server/env";

describe("kullanıcı adı politikası (BR-131)", () => {
  it("kırpar ve küçük harfe çevirir (Better Auth username plugin ile aynı)", () => {
    expect(normalizeUsername("  Ayse.Yilmaz ")).toBe("ayse.yilmaz");
  });

  it.each(["ab", "a".repeat(31), "ayşe", "ad min", "admin!", "Admin"])("reddeder: %s", (value) => {
    expect(validateUsername(value)).not.toBeNull();
  });

  it.each(["abc", "ayse.yilmaz", "personel_1"])("kabul eder: %s", (value) => {
    expect(validateUsername(value)).toBeNull();
  });
});

describe("şifre politikası (OD-22, BR-131)", () => {
  it.each([
    ["7 karakter", "Ab1-xyz"],
    ["129 karakter", "Ab1-".repeat(33)],
    ["baş/son boşluk", " Gizli-Sifre-1"],
    ["kullanıcı adını içerir", "xx-Personel1-yy"],
    ["az farklı karakter", "aaaaaaaa"],
  ])("reddeder: %s", (_label, password) => {
    expect(validatePassword(password, "personel1")).not.toBeNull();
  });

  it("8 karakterlik geçerli şifreyi kabul eder (minimum 8 korunur)", () => {
    expect(validatePassword("Gz-4kL9q", "personel1")).toBeNull();
  });
});

describe("giriş formu şeması", () => {
  it("fazladan alanları (rol, kullanıcı kimliği) reddeder — mass assignment yok", () => {
    expect(signInSchema.safeParse({ username: "a", password: "b", role: "admin" }).success).toBe(
      false,
    );
    expect(signInSchema.safeParse({ username: "a", password: "b", userId: "x" }).success).toBe(
      false,
    );
  });

  it("aşırı uzun girdileri reddeder", () => {
    expect(signInSchema.safeParse({ username: "a".repeat(65), password: "b" }).success).toBe(false);
    expect(signInSchema.safeParse({ username: "a", password: "b".repeat(129) }).success).toBe(
      false,
    );
  });
});

describe("parseAuthEnv (D-066)", () => {
  const secret = "a".repeat(32);
  const other = "b".repeat(32);

  it("secret'lar eksik veya kısa ise fail-closed; mesaj değer içermez", () => {
    expect(() => parseAuthEnv({})).toThrow(EnvValidationError);
    try {
      parseAuthEnv({ BETTER_AUTH_SECRET: "kisa-deger", RATE_LIMIT_KEY_SECRET: other });
    } catch (error) {
      expect((error as EnvValidationError).variables).toEqual(["BETTER_AUTH_SECRET"]);
      expect((error as Error).message).not.toContain("kisa-deger");
    }
  });

  it("iki secret aynı olamaz", () => {
    expect(() =>
      parseAuthEnv({ BETTER_AUTH_SECRET: secret, RATE_LIMIT_KEY_SECRET: secret }),
    ).toThrow(EnvValidationError);
  });

  it("Secure cookie yalnızca https APP_URL ile (production'da https zorunlu)", () => {
    expect(
      parseAuthEnv({ BETTER_AUTH_SECRET: secret, RATE_LIMIT_KEY_SECRET: other }).secureCookies,
    ).toBe(false);
    expect(
      parseAuthEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_URL: "https://ornek.test",
        BETTER_AUTH_SECRET: secret,
        RATE_LIMIT_KEY_SECRET: other,
      }),
    ).toMatchObject({ secureCookies: true, appUrl: "https://ornek.test" });
  });
});
