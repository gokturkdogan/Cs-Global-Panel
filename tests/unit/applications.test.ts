import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatPhoneForDisplay, normalizePhone } from "@/features/applications/domain/phone";
import {
  asApplicationNumber,
  buildApplicationSearchText,
  phoneDigitsQuery,
} from "@/features/applications/domain/search-text";
import { templateFingerprint } from "@/features/applications/domain/template-fingerprint";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "@/features/applications/domain/whatsapp";
import {
  accessLinkMutationSchema,
  applicationListFiltersSchema,
  applicationSearchSchema,
  createApplicationSchema,
  updateCustomerSchema,
} from "@/features/applications/schemas";
import { fieldErrorsOf } from "@/lib/field-errors";
import {
  AccessTokenCryptoError,
  buildAccessLink,
  decryptAccessToken,
  encryptAccessToken,
  generateAccessToken,
  hashAccessToken,
  isCanonicalAccessToken,
} from "@/server/access-tokens/crypto";
import { EnvValidationError, parseAccessTokenEnv } from "@/server/env";

const key = () => randomBytes(32);
const b64 = (buffer: Buffer) => buffer.toString("base64");

describe("erişim token'ı kriptografisi (SECURITY §3.2)", () => {
  const context = { applicationId: randomUUID(), tokenId: randomUUID() };
  const keys = new Map([["k1", key()]]);

  it("256 bit CSPRNG, base64url 43 karakter, kanonik ve benzersiz", () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateAccessToken));
    expect(tokens.size).toBe(2000);
    for (const token of [...tokens].slice(0, 50)) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(isCanonicalAccessToken(token)).toBe(true);
    }
    const source = readFileSync("src/server/access-tokens/crypto.ts", "utf8");
    expect(source).toContain("randomBytes(ACCESS_TOKEN_BYTES)");
    expect(source).not.toMatch(/Math\.random/);
  });

  it("kanonik olmayan/biçimsiz token reddedilir", () => {
    const token = generateAccessToken();
    const last = token.at(-1)!;
    // Son karakterin kullanılmayan bitleri değişirse aynı baytlar farklı metinle temsil edilir.
    const alias = token.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(isCanonicalAccessToken(alias)).toBe(
      Buffer.from(alias, "base64url").toString("base64url") === alias,
    );
    for (const bad of [
      "",
      "kısa",
      `${token}=`,
      token.slice(0, 42),
      `${token.slice(0, 42)}+`,
      `${token}A`,
    ]) {
      expect(isCanonicalAccessToken(bad)).toBe(false);
    }
    expect(() => hashAccessToken("x", key())).toThrow(AccessTokenCryptoError);
  });

  it("HMAC-SHA256 hex; anahtara bağlı", () => {
    const token = generateAccessToken();
    const hmacKey = key();
    expect(hashAccessToken(token, hmacKey)).toBe(
      createHmac("sha256", hmacKey).update(token).digest("hex"),
    );
    expect(hashAccessToken(token, hmacKey)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken(token, key())).not.toBe(hashAccessToken(token, hmacKey));
  });

  it("AES-256-GCM: tur, benzersiz IV, v1 biçimi; değiştirilmiş/yanlış anahtar/bağlam reddedilir", () => {
    const token = generateAccessToken();
    const a = encryptAccessToken(token, context, "k1", keys.get("k1")!);
    const b = encryptAccessToken(token, context, "k1", keys.get("k1")!);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1:k1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{58}:[A-Za-z0-9_-]{22}$/);
    expect(a).not.toContain(token);
    expect(decryptAccessToken(a, context, keys)).toBe(token);

    const parts = a.split(":");
    const flip = (index: number) => {
      const copy = [...parts];
      const bytes = Buffer.from(copy[index]!, "base64url");
      bytes[0]! ^= 1;
      copy[index] = bytes.toString("base64url");
      return copy.join(":");
    };
    const cases = [
      flip(2), // IV
      flip(3), // şifreli metin
      flip(4), // tag
      a.replace("v1:", "v2:"),
      a.replace(":k1:", ":k9:"),
      "v1:k1:abc",
      `${a}:extra`,
    ];
    for (const value of cases)
      expect(() => decryptAccessToken(value, context, keys)).toThrow(AccessTokenCryptoError);
    expect(() => decryptAccessToken(a, context, new Map([["k1", key()]]))).toThrow(
      AccessTokenCryptoError,
    );
    expect(() => decryptAccessToken(a, { ...context, applicationId: randomUUID() }, keys)).toThrow(
      AccessTokenCryptoError,
    );
    expect(() => decryptAccessToken(a, { ...context, tokenId: randomUUID() }, keys)).toThrow(
      AccessTokenCryptoError,
    );
    try {
      decryptAccessToken(flip(3), context, keys);
    } catch (error) {
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(parts[3]);
    }
  });

  it("bağlantı yalnızca APP_URL kökünden üretilir (yol/host girdisi etkilemez)", () => {
    const token = generateAccessToken();
    expect(buildAccessLink("https://panel.example.com", token)).toBe(
      `https://panel.example.com/b/${token}`,
    );
    expect(buildAccessLink("https://panel.example.com/alt/yol?x=1", token)).toBe(
      `https://panel.example.com/b/${token}`,
    );
    expect(() => buildAccessLink("https://panel.example.com", "../../etc")).toThrow(
      AccessTokenCryptoError,
    );
  });
});

describe("token anahtarı ortam doğrulaması (D-081)", () => {
  const base = {
    APP_URL: "https://panel.example.com",
    ACCESS_TOKEN_HMAC_KEY: b64(key()),
    ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: b64(key()), k0: b64(key()) }),
    ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "k1",
    BETTER_AUTH_SECRET: "a".repeat(40),
  };

  it("geçerli yapılandırma: 32 baytlık anahtarlar, aktif anahtar haritada", () => {
    const env = parseAccessTokenEnv(base);
    expect(env.hmacKey).toHaveLength(32);
    expect([...env.encryptionKeys.keys()].sort()).toEqual(["k0", "k1"]);
    expect(env.activeKeyId).toBe("k1");
  });

  it.each([
    ["HMAC eksik", { ACCESS_TOKEN_HMAC_KEY: undefined }, "ACCESS_TOKEN_HMAC_KEY"],
    ["HMAC kısa", { ACCESS_TOKEN_HMAC_KEY: b64(randomBytes(16)) }, "ACCESS_TOKEN_HMAC_KEY"],
    ["HMAC base64 değil", { ACCESS_TOKEN_HMAC_KEY: "çok gizli değer!" }, "ACCESS_TOKEN_HMAC_KEY"],
    [
      "anahtarlar JSON değil",
      { ACCESS_TOKEN_ENCRYPTION_KEYS: "k1=abc" },
      "ACCESS_TOKEN_ENCRYPTION_KEYS",
    ],
    [
      "anahtar uzunluğu",
      { ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: b64(randomBytes(31)) }) },
      "ACCESS_TOKEN_ENCRYPTION_KEYS",
    ],
    [
      "geçersiz anahtar kimliği",
      { ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ "k 1": b64(key()) }) },
      "ACCESS_TOKEN_ENCRYPTION_KEYS",
    ],
    ["boş harita", { ACCESS_TOKEN_ENCRYPTION_KEYS: "{}" }, "ACCESS_TOKEN_ENCRYPTION_KEYS"],
    [
      "aktif kimlik yok",
      { ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "k7" },
      "ACCESS_TOKEN_ENCRYPTION_ACTIVE_KEY_ID",
    ],
  ])("%s → fail-closed, değer mesajda yok", (_name, override, variable) => {
    try {
      parseAccessTokenEnv({ ...base, ...override });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).variables).toContain(variable);
      expect(String(error)).not.toContain(base.ACCESS_TOKEN_HMAC_KEY);
    }
  });

  it("anahtarlar birbirinden ve auth secret'larından farklı olmalı", () => {
    const shared = b64(key());
    expect(() =>
      parseAccessTokenEnv({
        ...base,
        ACCESS_TOKEN_HMAC_KEY: shared,
        ACCESS_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: shared }),
      }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseAccessTokenEnv({ ...base, BETTER_AUTH_SECRET: base.ACCESS_TOKEN_HMAC_KEY }),
    ).toThrow(EnvValidationError);
  });
});

describe("telefon normalizasyonu (BR-07)", () => {
  it.each([
    ["0532 111 22 33", "+905321112233"],
    ["5321112233", "+905321112233"],
    ["+90 (532) 111-22-33", "+905321112233"],
    ["0212 555 12 34", "+902125551234"],
    ["+49 1512 3456789", "+4915123456789"],
    ["+1 202 555 0143", "+12025550143"],
  ])("%s → %s", (input, e164) => {
    expect(normalizePhone(input)?.e164).toBe(e164);
  });

  it.each(["123", "0532", "abc", "+90 000 000 00 00", "", "+999 1234567"])(
    "geçersiz: %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it("arama biçimleri ve görüntüleme", () => {
    expect(normalizePhone("0532 111 22 33")?.searchForms).toEqual([
      "905321112233",
      "5321112233",
      "05321112233",
    ]);
    expect(formatPhoneForDisplay("+905321112233")).toBe("+90 532 111 22 33");
  });
});

describe("arama yardımcıları (BR-80)", () => {
  it("arama metni Türkçe katlanır; numara ve telefon sorguları", () => {
    expect(
      buildApplicationSearchText({
        firstName: "Çağla",
        lastName: "IŞIK",
        email: "c@example.invalid",
        phoneSearchForms: ["905321112233"],
      }),
    ).toBe("cagla isik c@example.invalid 905321112233");
    expect(asApplicationNumber(" cs-2026-000123 ")).toBe("CS-2026-000123");
    expect(asApplicationNumber("CS-26-1")).toBeNull();
    expect(phoneDigitsQuery("0532 111-22-33")).toBe("05321112233");
    expect(phoneDigitsQuery("+90")).toBeNull();
    expect(phoneDigitsQuery("ayşe")).toBeNull();
  });
});

describe("WhatsApp (OD-21, BR-160, BR-161)", () => {
  const input = {
    firstName: "Çağla",
    lastName: "Işık",
    serviceName: "Almanya Çalışma Vizesi",
    accessLink: "https://panel.example.com/b/TOKEN",
  };

  it("mesaj BUSINESS_RULES BR-161 şablonuyla birebir aynı", () => {
    const rules = readFileSync("docs/BUSINESS_RULES.md", "utf8");
    const block = /BR-161[\s\S]*?```\n([\s\S]*?)```/
      .exec(rules)![1]!
      .split("\n")
      .map((line) => line.replace(/^ {2}/, ""))
      .join("\n")
      .trimEnd()
      .replace("[FIRST_NAME]", input.firstName)
      .replace("[LAST_NAME]", input.lastName)
      .replace("[SERVICE_NAME]", input.serviceName)
      .replace("[APPLICATION_LINK]", input.accessLink);
    expect(buildWhatsAppMessage(input)).toBe(block);
  });

  it("wa.me biçimi: + olmadan rakamlar, URL-encoded metin; sabit alan adı", () => {
    const message = buildWhatsAppMessage(input);
    const url = buildWhatsAppUrl("+905321112233", message);
    expect(url.startsWith("https://wa.me/905321112233?text=")).toBe(true);
    expect(new URL(url).host).toBe("wa.me");
    expect(decodeURIComponent(url.split("?text=")[1]!)).toBe(message);
    expect(url).not.toMatch(/[\s\n]/);
    expect(() => buildWhatsAppUrl("05321112233", message)).toThrow();
    expect(() => buildWhatsAppUrl("+90 532", message)).toThrow();
  });
});

describe("şablon parmak izi (D-079)", () => {
  const service = { id: randomUUID(), version: 1 };
  const reqs = [
    { id: randomUUID(), version: 1, sortOrder: 10 },
    { id: randomUUID(), version: 1, sortOrder: 20 },
  ];
  it("hizmet version, evrak version, sıra ve küme değişikliklerini yakalar", () => {
    const base = templateFingerprint(service, reqs);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(templateFingerprint(service, reqs)).toBe(base);
    expect(templateFingerprint({ ...service, version: 2 }, reqs)).not.toBe(base);
    expect(templateFingerprint(service, [{ ...reqs[0]!, version: 2 }, reqs[1]!])).not.toBe(base);
    expect(templateFingerprint(service, [{ ...reqs[0]!, sortOrder: 30 }, reqs[1]!])).not.toBe(base);
    expect(templateFingerprint(service, [reqs[0]!])).not.toBe(base);
    expect(templateFingerprint(service, [reqs[1]!, reqs[0]!])).not.toBe(base);
  });
});

describe("başvuru şemaları", () => {
  const valid = {
    firstName: "  Çağla  Nur ",
    lastName: "O'Brien-Işık",
    phone: "0532 111 22 33",
    email: "  Cagla@Example.INVALID ",
    serviceId: randomUUID(),
    idempotencyKey: randomUUID(),
    templateFingerprint: "a".repeat(64),
  };

  it("adlar normalize; e-posta küçük harf; uluslararası adlar kabul", () => {
    const parsed = createApplicationSchema.parse(valid);
    expect(parsed).toMatchObject({
      firstName: "Çağla Nur",
      lastName: "O'Brien-Işık",
      email: "cagla@example.invalid",
    });
    for (const name of ["José", "Zoë", "李", "Jean-Luc", "Ömer Faruk", "D'Angelo"]) {
      expect(createApplicationSchema.safeParse({ ...valid, firstName: name }).success, name).toBe(
        true,
      );
    }
  });

  it.each([
    ["firstName", "", "Ad zorunludur."],
    ["firstName", "   ", "Ad zorunludur."],
    ["lastName", "Ali123", "Yalnızca harf"],
    ["lastName", "<script>", "Yalnızca harf"],
    ["firstName", "a".repeat(101), "En fazla 100"],
    ["phone", "", "Telefon numarası zorunludur."],
    ["phone", "0532;DROP", "Geçerli bir telefon"],
    ["email", "kullanici@", "Geçerli bir e-posta"],
    ["email", "a b@example.invalid", "Geçerli bir e-posta"],
    ["email", `${"a".repeat(250)}@example.invalid`, "Geçerli bir e-posta"],
  ])("%s=%j reddedilir", (field, value, message) => {
    const result = createApplicationSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error)[field]).toContain(message);
  });

  it.each([
    ["status", { status: "COMPLETED" }],
    ["serviceNameSnapshot", { serviceNameSnapshot: "Sahte" }],
    ["requirements", { requirements: [{ title: "Sahte evrak" }] }],
    ["actorUserId", { actorUserId: "baskasi" }],
    ["createdByUserId", { createdByUserId: "baskasi" }],
    ["accessToken", { accessToken: "x".repeat(43) }],
    ["applicationNumber", { applicationNumber: "CS-2026-000001" }],
  ])("mass assignment: %s reddedilir", (_name, extra) => {
    expect(createApplicationSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    expect(
      updateCustomerSchema.safeParse({
        applicationId: randomUUID(),
        expectedVersion: 1,
        firstName: "A",
        lastName: "B",
        phone: "05321112233",
        email: "a@example.invalid",
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("kimlik, parmak izi, token kimliği ve filtreler doğrulanır", () => {
    expect(createApplicationSchema.safeParse({ ...valid, serviceId: "1 OR 1=1" }).success).toBe(
      false,
    );
    expect(
      createApplicationSchema.safeParse({ ...valid, templateFingerprint: "xyz" }).success,
    ).toBe(false);
    expect(
      accessLinkMutationSchema.safeParse({
        applicationId: randomUUID(),
        expectedActiveTokenId: null,
      }).success,
    ).toBe(true);
    expect(accessLinkMutationSchema.safeParse({ applicationId: randomUUID() }).success).toBe(false);
    expect(
      applicationListFiltersSchema.parse({
        status: "HACK",
        serviceId: "x",
        page: "-3",
        pageSize: "1000",
      }),
    ).toEqual({ status: "ALL", serviceId: "", page: 1, pageSize: 20 });
    expect(
      applicationListFiltersSchema.parse({ status: "UNDER_REVIEW", page: "3", pageSize: "50" }),
    ).toMatchObject({ status: "UNDER_REVIEW", page: 3, pageSize: 50 });
    expect(
      applicationSearchSchema.safeParse({
        q: "x".repeat(101),
        status: "ALL",
        serviceId: "",
        page: 1,
        pageSize: 20,
      }).success,
    ).toBe(false);
    expect(
      applicationSearchSchema.safeParse({
        q: "a",
        status: "ALL",
        serviceId: "",
        page: 1,
        pageSize: 1000,
      }).success,
    ).toBe(false);
  });
});

describe("başvuru katmanı statik güvenceleri", () => {
  const actions = readFileSync("src/features/applications/actions.ts", "utf8");
  const service = readFileSync("src/features/applications/service.ts", "utf8");
  const queries = readFileSync("src/features/applications/queries.ts", "utf8");

  it("her action requireStaff + Zod ile başlar", () => {
    const bodies = actions.split("export async function ").slice(1);
    expect(bodies).toHaveLength(8);
    for (const body of bodies) {
      expect(body).toMatch(/await requireStaff\(\);/);
      expect(body).toMatch(/Schema\.safeParse\(input\)/);
    }
  });

  it("audit aynı transaction'da; token/bağlantı/kişisel veri log veya audit metadata'sına yazılmaz", () => {
    expect(service).not.toContain("writeAuditLog(db");
    for (const match of service.matchAll(/metadata: \{([^}]*)\}/g)) {
      expect(match[1]).toMatch(
        /^\s*(serviceId: service\.id|accessTokenId: [\w.]+|changedFields)\s*,?\s*$/,
      );
    }
    for (const source of [actions, service, queries]) {
      expect(source).not.toMatch(/console\.(log|info|debug)/);
      // Log çağrılarının veri kısmı (sabit etiket metni hariç) yalnızca hata kodu/değişken adı içerir.
      for (const call of source.matchAll(/console\.error\(\s*(?:`[^`]*`|"[^"]*"),([^;]*)\);/g)) {
        expect(call[1]).not.toMatch(/token|accessLink|phone|email|firstName|message|input/i);
      }
    }
  });

  it("listede token hash'i/şifreli kopya/arama metni istemciye gitmez", () => {
    const listBlock = queries.slice(
      queries.indexOf("export async function listApplications"),
      queries.indexOf("// ---------------------------------------------------------------- Detay"),
    );
    expect(listBlock).not.toMatch(/tokenHash|tokenCiphertext|searchText: applications/);
  });

  it("istemci bileşenleri sunucu modüllerini (yalnızca tip dışında) içe aktarmaz", () => {
    const dir = "src/features/applications/components";
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      if (!source.startsWith('"use client"')) continue;
      expect(source, file).not.toMatch(
        /^import (?!type)[^;]*from "(?:@\/server\/|\.\.\/service|\.\.\/queries|\.\.\/domain\/phone)/m,
      );
    }
  });
});
