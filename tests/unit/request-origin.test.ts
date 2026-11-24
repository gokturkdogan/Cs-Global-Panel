import { describe, expect, it } from "vitest";

import {
  isSafeMethod,
  isTrustedRequestOrigin,
  resolveAppUrl,
} from "@/server/security/request-origin";

const appUrl = "https://panel.example.com";
const check = (overrides: Partial<Parameters<typeof isTrustedRequestOrigin>[0]>) =>
  isTrustedRequestOrigin({
    method: "POST",
    origin: appUrl,
    host: "panel.example.com",
    appUrl,
    ...overrides,
  });

describe("isTrustedRequestOrigin (P4-02, D-069)", () => {
  it("aynı origin ve host kabul edilir", () => {
    expect(check({})).toBe(true);
    expect(check({ host: "PANEL.example.com" })).toBe(true);
  });

  it("güvenli metotlar her zaman geçer", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(isSafeMethod(method)).toBe(true);
      expect(check({ method, origin: null, host: null })).toBe(true);
    }
  });

  it.each([
    ["başka origin", { origin: "https://evil.example" }],
    ["alt alan adı", { origin: "https://evil.panel.example.com" }],
    ["farklı şema", { origin: "http://panel.example.com" }],
    ["farklı port", { origin: "https://panel.example.com:8443" }],
    ["Origin yok", { origin: null }],
    ['"null" Origin (sandbox/iframe)', { origin: "null" }],
    ["bozuk Origin", { origin: "::::" }],
    ["güvenilmeyen Host", { host: "evil.example" }],
    ["Host yok", { host: null }],
    ["APP_URL yok", { appUrl: null }],
    ["bozuk APP_URL", { appUrl: "not a url" }],
  ] as const)("reddedilir: %s", (_name, overrides) => {
    expect(check(overrides)).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s durum değiştiren metot olarak kontrol edilir",
    (method) => {
      expect(check({ method, origin: "https://evil.example" })).toBe(false);
    },
  );

  it("port içeren yerel adres", () => {
    expect(
      isTrustedRequestOrigin({
        method: "POST",
        origin: "http://localhost:3100",
        host: "localhost:3100",
        appUrl: "http://localhost:3100",
      }),
    ).toBe(true);
    expect(
      isTrustedRequestOrigin({
        method: "POST",
        origin: "http://localhost:3100",
        host: "localhost:3000",
        appUrl: "http://localhost:3100",
      }),
    ).toBe(false);
  });
});

describe("resolveAppUrl", () => {
  it("APP_URL varsa onu döner", () => {
    expect(resolveAppUrl({ APP_URL: " https://a.example ", NODE_ENV: "production" })).toBe(
      "https://a.example",
    );
  });
  it("production'da APP_URL yoksa null (fail-closed)", () => {
    expect(resolveAppUrl({ NODE_ENV: "production" })).toBeNull();
  });
  it("geliştirmede env.ts ile aynı varsayılan", () => {
    expect(resolveAppUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});
