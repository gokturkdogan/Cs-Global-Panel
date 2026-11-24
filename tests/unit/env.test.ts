import { describe, expect, it } from "vitest";

import { EnvValidationError, parseServerEnv } from "@/server/env";

function expectEnvError(source: Record<string, string | undefined>, variable: string) {
  try {
    parseServerEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).variables).toEqual([variable]);
    return error as EnvValidationError;
  }
  throw new Error("EnvValidationError bekleniyordu");
}

describe("parseServerEnv", () => {
  it("development'ta değişken yoksa yerel varsayılanları kullanır", () => {
    expect(parseServerEnv({})).toEqual({
      appEnv: "development",
      appUrl: "http://localhost:3000",
    });
  });

  it("boş değerleri tanımsız sayar (.env.example kopyası)", () => {
    expect(parseServerEnv({ APP_ENV: "", APP_URL: "" }).appUrl).toBe("http://localhost:3000");
  });

  it("APP_URL'yi origin'e indirger", () => {
    expect(parseServerEnv({ APP_URL: "http://localhost:3100/" }).appUrl).toBe(
      "http://localhost:3100",
    );
  });

  it("production'da https APP_URL kabul eder", () => {
    expect(
      parseServerEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_URL: "https://ornek.test",
      }),
    ).toEqual({ appEnv: "production", appUrl: "https://ornek.test" });
  });

  it("NODE_ENV=production iken APP_ENV belirtilmemişse reddeder (fail-closed)", () => {
    expectEnvError({ NODE_ENV: "production", APP_URL: "https://ornek.test" }, "APP_ENV");
  });

  it.each(["preview", "production"])("%s ortamında APP_URL zorunludur", (appEnv) => {
    expectEnvError({ APP_ENV: appEnv }, "APP_URL");
  });

  it.each(["preview", "production"])("%s ortamında http APP_URL reddedilir", (appEnv) => {
    expectEnvError({ APP_ENV: appEnv, APP_URL: "http://ornek.test" }, "APP_URL");
  });

  it.each([
    "ornek.test",
    "ftp://ornek.test",
    "https://ornek.test/panel",
    "https://ornek.test/?a=1",
    "https://ornek.test/#x",
    "https://kullanici:sifre@ornek.test",
  ])("origin olmayan veya geçersiz APP_URL reddedilir: %s", (appUrl) => {
    expectEnvError({ APP_ENV: "production", APP_URL: appUrl }, "APP_URL");
  });

  it("bilinmeyen APP_ENV değerini reddeder", () => {
    expectEnvError({ APP_ENV: "staging" }, "APP_ENV");
  });

  it("hata mesajı değişken değerini içermez", () => {
    const secretLookingValue = "https://gizli-deger.test/token-123";
    const error = expectEnvError({ APP_ENV: "production", APP_URL: secretLookingValue }, "APP_URL");
    expect(error.message).not.toContain(secretLookingValue);
    expect(error.message).toContain("APP_URL");
  });
});
