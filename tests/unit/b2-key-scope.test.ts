import { describe, expect, it } from "vitest";

import { classifyCheckFailure, summarizeKeyScope } from "../../scripts/storage/key-scope";

/**
 * PHASE 12.1 — `storage:inspect` b2_authorize_account v4 uyumu. Yanıt örnekleri resmî belgedeki v4
 * yapısına göre sentetiktir (gerçek kimlik/secret yok).
 */
const ENDPOINT = "https://s3.eu-central-003.backblazeb2.com";
const v4 = (allowed: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  accountId: "acc",
  authorizationToken: "SENTETIK-TOKEN",
  applicationKeyExpirationTimestamp: null,
  apiInfo: { storageApi: { apiUrl: "https://api003.example", s3ApiUrl: ENDPOINT, allowed } },
  ...extra,
});

describe("summarizeKeyScope — v4 allowed.{buckets,capabilities,namePrefix}", () => {
  it("en az yetkili tek bucket anahtarı: eksik/fazla/beklenmeyen yok, bucket ve uç nokta eşleşir", () => {
    const scope = summarizeKeyScope(
      v4({
        buckets: [{ id: "b1", name: "cs-global-documents" }],
        capabilities: ["writeFiles", "readFiles", "listFiles", "deleteFiles"],
        namePrefix: null,
      }),
      "cs-global-documents",
      ENDPOINT,
    );
    expect(scope).toEqual({
      capabilities: ["deleteFiles", "listFiles", "readFiles", "writeFiles"],
      buckets: ["cs-global-documents"],
      restrictedToExpectedBucket: true,
      namePrefix: null,
      expires: "yok",
      s3EndpointMatches: true,
      missingRequired: [],
      excessRisky: [],
      unexpected: [],
    });
    expect(JSON.stringify(scope)).not.toContain("SENTETIK-TOKEN");
  });

  it("eski 'Read and Write' anahtarı: riskli ve beklenmeyen yetkiler raporlanır", () => {
    const scope = summarizeKeyScope(
      v4({
        buckets: [{ id: "b1", name: "cs-global-documents" }],
        capabilities: [
          "listFiles",
          "readFiles",
          "writeFiles",
          "deleteFiles",
          "writeBuckets",
          "shareFiles",
          "readBucketLogging",
        ],
        namePrefix: null,
      }),
      "cs-global-documents",
      ENDPOINT,
    );
    expect(scope.excessRisky).toEqual(["writeBuckets", "shareFiles"]);
    expect(scope.unexpected).toEqual(["readBucketLogging"]);
  });

  it("bucket kısıtı yok / birden fazla bucket / önek / farklı uç nokta / eksik yetki / süreli anahtar", () => {
    const caps = ["listFiles", "readFiles"];
    expect(
      summarizeKeyScope(v4({ buckets: null, capabilities: caps }), "x", ENDPOINT),
    ).toMatchObject({
      buckets: null,
      restrictedToExpectedBucket: false,
      missingRequired: ["writeFiles", "deleteFiles"],
    });
    expect(
      summarizeKeyScope(
        v4({
          buckets: [
            { id: "1", name: "x" },
            { id: "2", name: "y" },
          ],
          capabilities: caps,
        }),
        "x",
        ENDPOINT,
      ).restrictedToExpectedBucket,
    ).toBe(false);
    const prefixed = summarizeKeyScope(
      v4(
        { buckets: [{ id: "1", name: "x" }], capabilities: caps, namePrefix: "applications/" },
        { applicationKeyExpirationTimestamp: 1_900_000_000_000 },
      ),
      "x",
      "https://s3.us-west-004.backblazeb2.com",
    );
    expect(prefixed).toMatchObject({
      namePrefix: "applications/",
      expires: "var",
      s3EndpointMatches: false,
    });
  });

  it("v3 biçimli veya bozuk yanıt kapsamı doğrulanmış saymaz (fail-closed)", () => {
    const legacy = summarizeKeyScope(
      { apiInfo: { storageApi: { capabilities: ["listFiles"], bucketName: "x" } } },
      "x",
      ENDPOINT,
    );
    expect(legacy.restrictedToExpectedBucket).toBe(false);
    expect(legacy.missingRequired).toHaveLength(4);
    expect(summarizeKeyScope(null, "x", ENDPOINT).restrictedToExpectedBucket).toBe(false);
  });
});

describe("classifyCheckFailure — beklenen 403 ile gerçek hata ayrımı", () => {
  const minimal = ["deleteFiles", "listFiles", "readFiles", "writeFiles"];
  it("yetki yokken 403 beklenen; yetki varken 403, başka durum veya kapsam bilinmiyorsa gerçek hata", () => {
    expect(classifyCheckFailure(403, "AccessDenied", "readBuckets", minimal)).toMatch(
      /^BEKLENEN 403/,
    );
    expect(classifyCheckFailure(403, "AccessDenied", "listFiles", minimal)).toBe(
      "HATA 403 AccessDenied",
    );
    expect(classifyCheckFailure(500, "InternalError", "readBuckets", minimal)).toBe(
      "HATA 500 InternalError",
    );
    expect(classifyCheckFailure(undefined, "TimeoutError", "readBuckets", minimal)).toBe(
      "HATA TimeoutError",
    );
    expect(classifyCheckFailure(403, "AccessDenied", "readBuckets", null)).toBe(
      "HATA 403 AccessDenied",
    );
  });
});
