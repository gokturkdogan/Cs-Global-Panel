import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, type ApplicationStatus } from "@/config/statuses";
import {
  CUSTOMER_STATUS_MESSAGE,
  documentCompletion,
  isCustomerEditable,
  processProgress,
} from "@/features/customer-portal/domain/progress";
import {
  createSessionValue,
  customerCookieName,
  customerCookieOptions,
  entryContextId,
  isContextId,
  newContextId,
  verifySessionValue,
} from "@/server/customer-session/session";
import { EnvValidationError, parseCustomerSessionEnv } from "@/server/env";

const secret = randomBytes(32);
const now = 1_800_000_000;
const ids = () => ({
  applicationId: randomUUID(),
  tokenId: randomUUID(),
  contextId: newContextId(),
});
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const signPart = (part: string, key = secret) =>
  createHmac("sha256", key).update(part).digest("base64url");

describe("müşteri oturumu imzası (SECURITY §3.4, D-088)", () => {
  it("tur: geçerli oturum; payload yalnızca teknik alanlar, 7 gün sabit", () => {
    const input = ids();
    const { value, payload } = createSessionValue(input, secret, now);
    expect(Object.keys(payload).sort()).toEqual(["aid", "ctx", "exp", "iat", "tid", "typ", "v"]);
    expect(payload).toMatchObject({
      v: 1,
      typ: "cs-portal",
      aid: input.applicationId,
      tid: input.tokenId,
      ctx: input.contextId,
      iat: now,
      exp: now + 7 * 86400,
    });
    expect(verifySessionValue(value, secret, now + 100)).toEqual({ ok: true, payload });
    const decoded = Buffer.from(value.split(".")[0]!, "base64url").toString();
    // Yalnızca teknik alanlar: kişisel veri, telefon, e-posta veya ham token yok.
    expect(Object.keys(JSON.parse(decoded) as object).sort()).toEqual(
      ["aid", "ctx", "exp", "iat", "tid", "typ", "v"].sort(),
    );
    expect(decoded).not.toMatch(/@|\+90/);
  });

  it("sabit süre: 7 gün sonunda expired; kullanım süreyi uzatmaz (yeni değer üretilmez)", () => {
    const { value } = createSessionValue(ids(), secret, now);
    expect(verifySessionValue(value, secret, now + 7 * 86400 - 1).ok).toBe(true);
    expect(verifySessionValue(value, secret, now + 7 * 86400)).toEqual({
      ok: false,
      reason: "expired",
    });
    const source = readFileSync("src/server/customer-session/access.ts", "utf8");
    expect(source).not.toMatch(/cookies\(\)\.set|\.set\(/); // erişim kontrolü cookie yenilemez
  });

  it.each([
    [
      "değiştirilmiş payload",
      (value: string) => {
        const [part] = value.split(".");
        const payload = JSON.parse(Buffer.from(part!, "base64url").toString());
        return `${b64({ ...payload, aid: randomUUID() })}.${value.split(".")[1]}`;
      },
    ],
    ["değiştirilmiş imza", (value: string) => `${value.split(".")[0]}.${"A".repeat(43)}`],
    ["imzasız", (value: string) => value.split(".")[0]!],
    ["fazla parça", (value: string) => `${value}.x`],
    ["boş", () => ""],
    ["aşırı uzun", () => "a".repeat(600)],
    ["biçimsiz base64", () => "!!!.###"],
  ])("%s → invalid", (_name, mutate) => {
    const { value } = createSessionValue(ids(), secret, now);
    expect(verifySessionValue(mutate(value), secret, now)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("yanlış anahtar, aşırı ömür, gelecekteki iat, fazla alan, yanlış tür/sürüm → invalid", () => {
    const { value } = createSessionValue(ids(), secret, now);
    expect(verifySessionValue(value, randomBytes(32), now).ok).toBe(false);
    const base = {
      v: 1,
      typ: "cs-portal",
      aid: randomUUID(),
      tid: randomUUID(),
      ctx: newContextId(),
      iat: now,
      exp: now + 3600,
    };
    for (const payload of [
      { ...base, exp: now + 8 * 86400 },
      { ...base, iat: now + 3600, exp: now + 7200 },
      { ...base, name: "Ahmet" },
      { ...base, typ: "staff" },
      { ...base, v: 2 },
      { ...base, aid: "1 OR 1=1" },
      { ...base, ctx: "kısa" },
    ]) {
      const part = b64(payload);
      expect(verifySessionValue(`${part}.${signPart(part)}`, secret, now)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("bağlam kimliği: 16 bayt rastgele, kanonik", () => {
    const contexts = new Set(Array.from({ length: 500 }, newContextId));
    expect(contexts.size).toBe(500);
    for (const context of [...contexts].slice(0, 20)) expect(isContextId(context)).toBe(true);
    for (const bad of [
      "",
      "abc",
      "a".repeat(23),
      "../../etc/passwd/xxxxx",
      `${newContextId().slice(0, 21)}+`,
    ]) {
      expect(isContextId(bad)).toBe(false);
    }
  });

  it("giriş bağlamı (D-090): aynı başvuru + aynı token → korunur; aksi hâlde yeni", () => {
    const input = ids();
    const access = { applicationId: input.applicationId, tokenId: input.tokenId };
    const { value } = createSessionValue(input, secret, now);
    expect(entryContextId(value, access, secret, now + 10)).toBe(input.contextId);
    for (const other of [
      { ...access, applicationId: randomUUID() }, // başka başvuru
      { ...access, tokenId: randomUUID() }, // yenilenmiş bağlantı
    ]) {
      const next = entryContextId(value, other, secret, now + 10);
      expect(next).not.toBe(input.contextId);
      expect(isContextId(next)).toBe(true);
    }
    // Oturum yok, süresi dolmuş, başka anahtarla imzalı → yeni bağlam.
    expect(entryContextId(undefined, access, secret, now)).not.toBe(input.contextId);
    expect(entryContextId(value, access, secret, now + 7 * 86400)).not.toBe(input.contextId);
    expect(entryContextId(value, access, randomBytes(32), now)).not.toBe(input.contextId);
  });

  it("cookie: https'te __Host- + Secure; HttpOnly, SameSite=Lax, Path=/, 7 gün; personel cookie'sinden farklı ad", () => {
    expect(customerCookieName(true)).toBe("__Host-cs_portal");
    expect(customerCookieName(false)).toBe("cs_portal");
    expect(customerCookieOptions(true, 604800)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });
    expect(customerCookieOptions(false, 604800).secure).toBe(false);
    expect(customerCookieName(true)).not.toContain("session_token");
  });
});

describe("müşteri oturumu anahtarı (D-088)", () => {
  const key = () => randomBytes(32).toString("base64");
  it("geçerli; https'te secure", () => {
    const env = parseCustomerSessionEnv({
      APP_URL: "https://panel.example.com",
      CUSTOMER_SESSION_SECRET: key(),
    });
    expect(env.secret).toHaveLength(32);
    expect(env.secureCookies).toBe(true);
  });
  it.each([
    ["eksik", {}],
    ["kısa", { CUSTOMER_SESSION_SECRET: randomBytes(16).toString("base64") }],
    ["base64 değil", { CUSTOMER_SESSION_SECRET: "gizli değer!" }],
  ])("%s → fail-closed", (_name, extra) => {
    expect(() =>
      parseCustomerSessionEnv({ APP_URL: "https://panel.example.com", ...extra }),
    ).toThrow(EnvValidationError);
  });
  it("token anahtarları ve auth secret'larından farklı olmalı", () => {
    const shared = key();
    expect(() =>
      parseCustomerSessionEnv({
        APP_URL: "https://x.example",
        CUSTOMER_SESSION_SECRET: shared,
        ACCESS_TOKEN_HMAC_KEY: shared,
      }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseCustomerSessionEnv({
        APP_URL: "https://x.example",
        CUSTOMER_SESSION_SECRET: shared,
        ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: shared }),
      }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseCustomerSessionEnv({
        APP_URL: "https://x.example",
        CUSTOMER_SESSION_SECRET: shared,
        BETTER_AUTH_SECRET: shared,
      }),
    ).toThrow(EnvValidationError);
  });
});

describe("süreç göstergesi (BUSINESS_RULES §11.1)", () => {
  const expected: Record<ApplicationStatus, string | null> = {
    AWAITING_DOCUMENTS: "done,current,upcoming,upcoming,upcoming",
    UNDER_REVIEW: "done,done,current,upcoming,upcoming",
    REVISION_REQUIRED: "done,current,upcoming,upcoming,upcoming",
    DOCUMENTS_APPROVED: "done,done,done,upcoming,upcoming",
    IN_PROCESS: "done,done,done,current,upcoming",
    COMPLETED: "done,done,done,done,done",
    CANCELLED: null,
  };
  it.each(APPLICATION_STATUSES)("%s eşlemesi", (status) => {
    const progress = processProgress(status);
    if (expected[status] === null) expect(progress).toEqual({ kind: "cancelled" });
    else if (progress.kind === "steps") {
      expect(progress.steps.map((step) => step.state).join(",")).toBe(expected[status]);
      expect(progress.revision).toBe(status === "REVISION_REQUIRED");
    } else expect.unreachable();
  });

  it("müşteri açıklamaları STATE_TRANSITIONS §1 ile aynı; yükleme yalnızca evrak bekleyen/düzeltme statülerinde", () => {
    const doc = readFileSync("docs/STATE_TRANSITIONS.md", "utf8");
    for (const status of APPLICATION_STATUSES) {
      expect(doc).toContain(`| \`${status}\` |`);
      expect(doc).toContain(CUSTOMER_STATUS_MESSAGE[status]);
    }
    expect(APPLICATION_STATUSES.filter(isCustomerEditable)).toEqual([
      "AWAITING_DOCUMENTS",
      "REVISION_REQUIRED",
    ]);
  });
});

describe("evrak ilerlemesi (BR-110…BR-114)", () => {
  const doc = (
    isRequired: boolean,
    status: Parameters<typeof documentCompletion>[0][number]["status"],
  ) => ({ isRequired, status });
  it("zorunlu evrak yoksa yüzde yok (sıfıra bölme yok)", () => {
    expect(documentCompletion([doc(false, "NOT_UPLOADED")])).toMatchObject({
      requiredTotal: 0,
      percent: null,
      total: 1,
    });
    expect(documentCompletion([])).toMatchObject({ percent: null, total: 0 });
  });
  it("aşağı yuvarlama, %100 yalnızca tamamda; isteğe bağlı ve düzeltme bekleyen sayılmaz", () => {
    expect(
      documentCompletion([
        doc(true, "UPLOADED"),
        doc(true, "NOT_UPLOADED"),
        doc(true, "NOT_UPLOADED"),
      ]).percent,
    ).toBe(33);
    expect(
      documentCompletion([
        doc(true, "UPLOADED"),
        doc(true, "APPROVED"),
        doc(true, "REVISION_REQUIRED"),
      ]),
    ).toMatchObject({
      percent: 66,
      requiredUploaded: 2,
      requiredMissing: 1,
      revisionCount: 1,
      requiredApproved: 1,
    });
    expect(
      documentCompletion([doc(true, "PENDING_REVIEW"), doc(false, "NOT_UPLOADED")]),
    ).toMatchObject({ percent: 100, requiredTotal: 1, total: 2 });
  });
});

describe("müşteri yolu statik güvenceleri", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const customerFiles = [
    ...files("src/features/customer-portal"),
    ...files("src/app/(customer)"),
    ...files("src/app/b"),
  ];

  it("personel kimlik doğrulaması, staff action/servisleri, iç not/audit tabloları kullanılmaz", () => {
    for (const file of customerFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /requireStaff|getCurrentStaff|@\/server\/auth|applicationInternalNotes|auditLogs|internal_notes|audit_logs/,
      );
    }
  });

  it("giriş rotası token'ı loglamaz; yönlendirme APP_URL'den, 303; sayfa render etmez", () => {
    const source = readFileSync("src/app/b/[token]/route.ts", "utf8");
    for (const call of source.matchAll(/console\.\w+\(([^;]*)\);/g))
      expect(call[1]).not.toMatch(/token\b|params|request\.url/);
    expect(source).toContain("new URL(appUrl).origin");
    expect(source).toContain("303");
    expect(source).not.toMatch(/request\.headers|x-forwarded/i);
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|writeAuditLog/);
  });

  it("portal DTO'sunda teknik kimlik, telefon, e-posta, token, dosya bilgisi yok", () => {
    const source = readFileSync("src/features/customer-portal/queries.ts", "utf8");
    const typeBlock = source.slice(
      source.indexOf("export type CustomerDocument"),
      source.indexOf("export async function"),
    );
    expect(typeBlock).not.toMatch(/\bid\b|phone|email|token|blob|sha256|fileId|version/i);
  });
});
