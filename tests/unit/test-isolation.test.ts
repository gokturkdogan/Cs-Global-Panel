import { afterEach, describe, expect, it } from "vitest";

import {
  guardSharedDatabaseClient,
  SharedDatabaseWriteError,
  statementKind,
} from "../support/db-guard";
import { fingerprintDiff } from "../support/data-fingerprint";
import { assertIsolationTargetConsistent, isIsolatedTestDatabase } from "../support/isolation";

/** PHASE 10.2 (D-129) — ortak veritabanı test koruması: negatif testler (gerçek veritabanı yok). */

function fakeClient(failOn?: RegExp) {
  const sent: string[] = [];
  const client = {
    query: async (text: string | { text: string }) => {
      const sql = typeof text === "string" ? text : text.text;
      sent.push(sql);
      if (failOn?.test(sql)) throw Object.assign(new Error("denied"), { code: "42501" });
      return { rows: [], rowCount: 0 };
    },
  };
  return { client: guardSharedDatabaseClient(client), sent };
}

describe("ifade sınıflandırması", () => {
  it.each([
    ["SELECT 1", "read"],
    ["  -- yorum\n select * from audit_logs", "read"],
    ["/* x */ SHOW server_version", "read"],
    ["WITH x AS (SELECT 1) SELECT * FROM x", "read"],
    ["WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x", "write"],
    ["EXPLAIN SELECT 1", "read"],
    ["EXPLAIN ANALYZE DELETE FROM t", "write"],
    ["SELECT * INTO TEMP t FROM x", "write"],
    ["INSERT INTO audit_logs VALUES (1)", "write"],
    ["update t set a = 1", "write"],
    ["TRUNCATE audit_logs", "write"],
    ["CREATE TRIGGER x", "write"],
    ["GRANT SELECT ON t TO r", "write"],
    ["BEGIN ISOLATION LEVEL REPEATABLE READ", "begin"],
    ["COMMIT", "commit"],
    ["END", "commit"],
    ["ROLLBACK", "rollback"],
    ["ROLLBACK TO SAVEPOINT a", "savepoint"],
    ["SAVEPOINT a", "savepoint"],
  ])("%s → %s", (sql, kind) => {
    expect(statementKind(sql)).toBe(kind);
  });
});

describe("ortak veritabanı istemci koruması (D-129)", () => {
  it("transaction dışındaki yazma BEGIN…ROLLBACK içine alınır (kalıcı etki yok)", async () => {
    const { client, sent } = fakeClient();
    await client.query("INSERT INTO audit_logs (action) VALUES ('TEST_EVENT')");
    expect(sent).toEqual([
      "BEGIN",
      "INSERT INTO audit_logs (action) VALUES ('TEST_EVENT')",
      "ROLLBACK",
    ]);
  });

  it("yetki hatası korunur ve yine ROLLBACK gönderilir", async () => {
    const { client, sent } = fakeClient(/^UPDATE/);
    await expect(client.query("UPDATE audit_logs SET action = 'X'")).rejects.toMatchObject({
      code: "42501",
    });
    expect(sent.at(-1)).toBe("ROLLBACK");
  });

  it("yazma içeren transaction COMMIT edilemez; ROLLBACK gönderilir", async () => {
    const { client, sent } = fakeClient();
    await client.query("BEGIN");
    await client.query({ text: "DELETE FROM applications WHERE id = $1" });
    await expect(client.query("COMMIT")).rejects.toBeInstanceOf(SharedDatabaseWriteError);
    expect(sent).toEqual(["BEGIN", "DELETE FROM applications WHERE id = $1", "ROLLBACK"]);
  });

  it("salt okunur transaction ve okuma ifadeleri dokunulmadan geçer", async () => {
    const { client, sent } = fakeClient();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SELECT 1");
    await client.query("COMMIT");
    await client.query("SELECT 2");
    expect(sent).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ",
      "SELECT 1",
      "COMMIT",
      "SELECT 2",
    ]);
  });

  it("yalnızca onaylı kısa ömürlü teknik tablolar (D-067) commit edilebilir", async () => {
    const { client, sent } = fakeClient();
    await client.query(
      'insert into "rate_limit_buckets" ("key") values ($1) on conflict do update',
    );
    await client.query("DELETE FROM sessions WHERE id = 'test-session-x'");
    await client.query('UPDATE "public"."audit_logs" SET action = $1');
    expect(sent).toEqual([
      'insert into "rate_limit_buckets" ("key") values ($1) on conflict do update',
      "DELETE FROM sessions WHERE id = 'test-session-x'",
      "BEGIN",
      'UPDATE "public"."audit_logs" SET action = $1',
      "ROLLBACK",
    ]);
  });

  it("transaction içindeki yazma ROLLBACK ile kapatılabilir", async () => {
    const { client, sent } = fakeClient();
    await client.query("BEGIN");
    await client.query("INSERT INTO t VALUES (1)");
    await client.query("ROLLBACK");
    await client.query("SELECT 1");
    expect(sent).toEqual(["BEGIN", "INSERT INTO t VALUES (1)", "ROLLBACK", "SELECT 1"]);
  });
});

describe("izolasyon hedefi (fail-closed)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("işaret var ama uzak veritabanı → izole sayılmaz ve çalıştırma durdurulur", () => {
    process.env.ISOLATED_TEST_DB = "1";
    process.env.DATABASE_URL_UNPOOLED =
      "postgresql://owner_role:x@ep-example-123456.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full";
    process.env.DATABASE_URL =
      "postgresql://cs_app_runtime:x@ep-example-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full";
    expect(isIsolatedTestDatabase()).toBe(false);
    expect(() => assertIsolationTargetConsistent()).toThrow(/mutasyon testleri başlatılmadı/);
  });

  it("işaret var ama yerel veritabanının adı izole değil → durdurulur", () => {
    process.env.ISOLATED_TEST_DB = "1";
    process.env.DATABASE_URL_UNPOOLED = "postgresql://owner_role:x@127.0.0.1:5432/neondb";
    process.env.DATABASE_URL = "postgresql://cs_app_runtime:x@127.0.0.1:5432/neondb";
    expect(() => assertIsolationTargetConsistent()).toThrow();
  });

  it("işaret yoksa (Neon-güvenli mod) çalıştırma durdurulmaz", () => {
    delete process.env.ISOLATED_TEST_DB;
    expect(() => assertIsolationTargetConsistent()).not.toThrow();
  });

  it("parmak izi farkı yalnızca değişen anahtarları verir", () => {
    expect(fingerprintDiff({ audit: 155, users: 2 }, { audit: 156, users: 2 })).toEqual(["audit"]);
  });
});

describe("E2E konsol hatası toplayıcı — dar WebKit istisnası (D-131)", async () => {
  const { collectErrors } = await import("../e2e/console-errors");
  type Handler = (arg: unknown) => void;
  function fakePage(browser: "webkit" | "chromium") {
    const handlers: Record<string, Handler[]> = {};
    const page = {
      on: (event: string, handler: Handler) => (handlers[event] ??= []).push(handler),
      context: () => ({ browser: () => ({ browserType: () => ({ name: () => browser }) }) }),
    };
    const emit = (event: string, arg: unknown) => handlers[event]?.forEach((h) => h(arg));
    const consoleError = (text: string) =>
      emit("console", { type: () => "error", text: () => text });
    const failed = (url: string) => emit("requestfailed", { url: () => url });
    const response = (url: string) => emit("response", { url: () => url });
    return { page, consoleError, failed, response, emit };
  }
  const rsc = "http://localhost:3200/dashboard/audit-logs?_rsc=abc123";
  const blocked = `Fetch API cannot load ${rsc} due to access control checks.`;

  it("WebKit + yerel RSC önceden yükleme + yanıtsız ağ hatası → yok sayılır (iki olay sırasında da)", () => {
    const a = fakePage("webkit");
    const errorsA = collectErrors(a.page as never);
    a.consoleError(blocked);
    a.failed(rsc);
    expect(errorsA).toEqual([]);
    const b = fakePage("webkit");
    const errorsB = collectErrors(b.page as never);
    b.failed(rsc);
    b.consoleError(blocked);
    expect(errorsB).toEqual([]);
  });

  it("yanıt alınmışsa (ör. kökenler arası yönlendirme 3xx) hata yakalanır", () => {
    const f = fakePage("webkit");
    const errors = collectErrors(f.page as never);
    f.response(rsc);
    f.failed(rsc);
    f.consoleError(blocked);
    expect(errors).toEqual([blocked]);
  });

  it("istek hatası olmadan, RSC dışı URL'de, başka tarayıcıda veya başka mesajda hata yakalanır", () => {
    const noFailure = fakePage("webkit");
    const e1 = collectErrors(noFailure.page as never);
    noFailure.consoleError(blocked);
    expect(e1).toEqual([blocked]);

    const other = fakePage("webkit");
    const e2 = collectErrors(other.page as never);
    const api = "http://localhost:3200/api/files/x";
    other.failed(api);
    other.consoleError(`Fetch API cannot load ${api} due to access control checks.`);
    expect(e2).toHaveLength(1);

    const chrome = fakePage("chromium");
    const e3 = collectErrors(chrome.page as never);
    chrome.failed(rsc);
    chrome.consoleError(blocked);
    expect(e3).toEqual([blocked]);

    const csp = fakePage("webkit");
    const e4 = collectErrors(csp.page as never);
    csp.failed(rsc);
    csp.consoleError("Refused to load the script because it violates the Content Security Policy");
    csp.consoleError(
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
    );
    csp.emit("pageerror", new Error("boom"));
    expect(e4).toHaveLength(3);

    const foreign = fakePage("webkit");
    const e5 = collectErrors(foreign.page as never);
    const evil = "https://evil.example/dashboard?_rsc=1";
    foreign.failed(evil);
    foreign.consoleError(`Fetch API cannot load ${evil} due to access control checks.`);
    expect(e5).toHaveLength(1);
  });
});
