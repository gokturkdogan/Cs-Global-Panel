import { describe, expect, it } from "vitest";

import { DatabaseConfigError, parseDatabaseUrl, RUNTIME_ROLE } from "@/server/db/settings";

// Sentetik değerler — gerçek bir sunucuya veya kimlik bilgisine işaret etmez.
const SECRET = "CANARY-pw-0f9e8d7c";
const REMOTE = `postgresql://cs_app_runtime:${SECRET}@ep-canary-pooler.example.invalid/cs_global_dev?sslmode=verify-full`;

function errorOf(fn: () => unknown): DatabaseConfigError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseConfigError);
    return error as DatabaseConfigError;
  }
  throw new Error("DatabaseConfigError bekleniyordu");
}

describe("parseDatabaseUrl", () => {
  it("geçerli uzak runtime adresini çözer", () => {
    const parsed = parseDatabaseUrl(REMOTE, "DATABASE_URL", {
      allowLocal: false,
      expectedUser: RUNTIME_ROLE,
    });
    expect(parsed).toMatchObject({
      host: "ep-canary-pooler.example.invalid",
      database: "cs_global_dev",
      user: RUNTIME_ROLE,
      isLocal: false,
    });
  });

  it.each([
    ["tanımsız", undefined],
    ["boş", "  "],
    ["geçersiz", "not a url"],
    ["yanlış protokol", "mysql://u:p@h/db"],
    ["veritabanı adı yok", "postgresql://u:p@h.example.invalid/?sslmode=verify-full"],
    ["şifre yok", "postgresql://u@h.example.invalid/db?sslmode=verify-full"],
    ["sslmode yok", "postgresql://u:p@h.example.invalid/db"],
    ["sslmode=require", "postgresql://u:p@h.example.invalid/db?sslmode=require"],
    ["sslmode=disable", "postgresql://u:p@h.example.invalid/db?sslmode=disable"],
  ])("reddeder: %s", (_label, value) => {
    errorOf(() => parseDatabaseUrl(value, "DATABASE_URL", { allowLocal: false }));
  });

  it("runtime bağlantısının başka rolle yapılmasını reddeder (en az yetki)", () => {
    const ownerUrl = REMOTE.replace("cs_app_runtime", "neondb_owner");
    const error = errorOf(() =>
      parseDatabaseUrl(ownerUrl, "DATABASE_URL", { allowLocal: false, expectedUser: RUNTIME_ROLE }),
    );
    expect(error.message).toContain(RUNTIME_ROLE);
  });

  it("yerel veritabanına yalnızca izin verilirse bağlanır; yerelde sslmode zorunlu değildir", () => {
    const local = "postgresql://u:p@localhost:5432/cs_global_dev";
    errorOf(() => parseDatabaseUrl(local, "DATABASE_URL", { allowLocal: false }));
    expect(parseDatabaseUrl(local, "DATABASE_URL", { allowLocal: true }).isLocal).toBe(true);
  });

  it("hata mesajı şifre, sunucu veya adresin herhangi bir parçasını içermez", () => {
    const error = errorOf(() =>
      parseDatabaseUrl(REMOTE.replace("verify-full", "require"), "DATABASE_URL", {
        allowLocal: false,
      }),
    );
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain("example.invalid");
    expect(error.message).not.toContain("cs_global_dev");
    expect(error.message.startsWith("DATABASE_URL:")).toBe(true);
  });
});
