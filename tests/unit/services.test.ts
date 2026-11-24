import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createRequirementSchema,
  createServiceSchema,
  fieldErrorsOf,
  moveRequirementSchema,
  serviceListFiltersSchema,
  setServiceActiveSchema,
  updateRequirementSchema,
  updateServiceSchema,
} from "@/features/services/schemas";
import { escapeLikePattern, normalizeSearchText } from "@/lib/search";

const id = randomUUID();

describe("Türkçe arama normalizasyonu (BR-80)", () => {
  it.each([
    ["İSTANBUL", "istanbul"],
    ["IŞIK", "isik"],
    ["Öğrenci Çalışma", "ogrenci calisma"],
    ["ılık  ŞÜPHE", "ilik suphe"],
    ["  Kâğıt  ", "kagit"],
    ["İ̇zmir", "izmir"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it("veritabanı translate eşlemesi JS katlamasıyla aynıdır", () => {
    const source = readFileSync("src/features/services/queries.ts", "utf8");
    const match =
      /translate\(lower\(\$\{services\.name\}\), \$\{"([^"]+)"\}, \$\{"([^"]+)"\}\)/.exec(source);
    expect(match).not.toBeNull();
    const from = JSON.parse(`"${match![1]}"`) as string;
    const to = match![2]!;
    expect([...from].slice(0, to.length).map((char) => normalizeSearchText(char))).toEqual([...to]);
    expect(from.endsWith("̇")).toBe(true); // birleşik nokta silinir
  });

  it("LIKE özel karakterleri kaçışlanır", () => {
    expect(escapeLikePattern("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});

describe("hizmet şemaları", () => {
  it("ad: kırpılır, iç boşluklar tekleşir, Türkçe ve izinli noktalama kabul edilir", () => {
    const parsed = createServiceSchema.parse({
      name: "  Almanya   Çalışma Vizesi — (Mavi Kart) ",
      description: "",
      isActive: false,
    });
    expect(parsed).toEqual({
      name: "Almanya Çalışma Vizesi — (Mavi Kart)",
      description: null,
      isActive: false,
    });
  });

  it.each([
    ["", "Hizmet adı zorunludur."],
    ["   ", "Hizmet adı zorunludur."],
    ["A", "Hizmet adı 2–150 karakter olmalıdır."],
    ["x".repeat(151), "Hizmet adı 2–150 karakter olmalıdır."],
    ["<b>Vize</b>", "Yalnızca harf"],
    ["-Vize", "Yalnızca harf"],
    ["Vize;DROP", "Yalnızca harf"],
  ])("geçersiz ad %j reddedilir", (name, message) => {
    const result = createServiceSchema.safeParse({ name, description: "", isActive: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error).name).toContain(message);
  });

  it("uzunluk Unicode kod noktasıyla ölçülür (veritabanı char_length ile aynı)", () => {
    expect(
      createServiceSchema.safeParse({ name: "Ğ".repeat(150), description: "", isActive: true })
        .success,
    ).toBe(true);
    expect(
      createServiceSchema.safeParse({ name: "Ğ".repeat(151), description: "", isActive: true })
        .success,
    ).toBe(false);
  });

  it("çok satırlı metin: satır sonu korunur, CRLF normalize edilir, kontrol karakteri reddedilir, HTML aynen düz metin", () => {
    const parsed = createRequirementSchema.parse({
      serviceId: id,
      title: "Pasaport",
      description: "",
      instructions: "Satır 1\r\nSatır 2\n<script>alert(1)</script>",
      isRequired: true,
    });
    expect(parsed.instructions).toBe("Satır 1\nSatır 2\n<script>alert(1)</script>");
    const bad = createRequirementSchema.safeParse({
      serviceId: id,
      title: "Pasaport",
      description: "",
      instructions: "a\u0000b",
      isRequired: true,
    });
    expect(bad.success).toBe(false);
    if (!bad.success)
      expect(fieldErrorsOf(bad.error).instructions).toBe("Metin geçersiz karakter içeriyor.");
    const long = createRequirementSchema.safeParse({
      serviceId: id,
      title: "Pasaport",
      description: "",
      instructions: "x".repeat(4001),
      isRequired: true,
    });
    expect(long.success).toBe(false);
  });

  it.each([
    ["createdByUserId", { createdByUserId: "baskasi" }],
    ["updatedByUserId", { updatedByUserId: "baskasi" }],
    ["actorUserId", { actorUserId: "baskasi" }],
    ["role", { role: "admin" }],
    ["maxFileSizeBytes (sabit PDF politikası)", { maxFileSizeBytes: 999_999_999 }],
    ["allowedMimeType", { allowedMimeType: "image/png" }],
    ["version", { version: 99 }],
  ])("mass assignment: bilinmeyen alan %s reddedilir", (_name, extra) => {
    const service = createServiceSchema.safeParse({
      name: "Vize",
      description: "",
      isActive: true,
      ...extra,
    });
    const requirement = updateRequirementSchema.safeParse({
      serviceId: id,
      requirementId: id,
      expectedVersion: 1,
      title: "Pasaport",
      description: "",
      instructions: "",
      isRequired: true,
      ...extra,
    });
    expect(service.success).toBe(false);
    expect(requirement.success).toBe(false);
    if (!service.success)
      expect(fieldErrorsOf(service.error)._form).toBe("Lütfen işaretli alanları kontrol edin.");
  });

  it("kimlik, version ve yön doğrulanır", () => {
    expect(
      updateServiceSchema.safeParse({
        serviceId: "1 OR 1=1",
        name: "Vize",
        description: "",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      updateServiceSchema.safeParse({
        serviceId: id,
        name: "Vize",
        description: "",
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      setServiceActiveSchema.safeParse({ serviceId: id, isActive: "true", expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      moveRequirementSchema.safeParse({ serviceId: id, requirementId: id, direction: "top" })
        .success,
    ).toBe(false);
    expect(
      moveRequirementSchema.safeParse({
        serviceId: id,
        requirementId: id,
        direction: "up",
        sortOrder: -5,
      }).success,
    ).toBe(false);
  });

  it("liste filtreleri: geçersiz değerler varsayılana döner, arama 100 karakterle sınırlı", () => {
    expect(serviceListFiltersSchema.parse({ q: 5, status: "hepsi" })).toEqual({
      q: "",
      status: "all",
    });
    expect(
      serviceListFiltersSchema.parse({ q: ` ${"a".repeat(150)} `, status: "inactive" }).q,
    ).toHaveLength(100);
  });
});

describe("hizmet katmanı statik güvenceleri", () => {
  const actions = readFileSync("src/features/services/actions.ts", "utf8");
  const service = readFileSync("src/features/services/service.ts", "utf8");
  const queries = readFileSync("src/features/services/queries.ts", "utf8");

  it("her action ortak `run` üzerinden requireStaff + Zod'dan geçer", () => {
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
    expect(exported).toHaveLength(7);
    for (const name of exported) {
      const body = actions
        .slice(actions.indexOf(`function ${name}`))
        .split("export async function")[0]!;
      expect(body).toMatch(/return run\(\s*\w+Schema,/);
    }
    expect(actions).toContain("const staff = await requireStaff();");
    expect(actions).toContain("{ userId: staff.userId }");
  });

  it("şablon mutasyonları başvuru/snapshot tablolarına yazmaz; audit aynı transaction'da (tx)", () => {
    expect(service).not.toMatch(
      /applications|applicationDocumentRequirements|application_document_requirements/,
    );
    expect(service).not.toContain("writeAuditLog(db");
    expect([...service.matchAll(/writeAuditLog\(tx,/g)]).toHaveLength(7);
  });

  it("okuma sorguları oluşturan/güncelleyen kimliğini istemciye göndermez", () => {
    expect(queries).not.toMatch(/createdByUserId|updatedByUserId/);
  });
});
