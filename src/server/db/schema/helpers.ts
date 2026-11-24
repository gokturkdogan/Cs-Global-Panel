import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

/** `column IN ('A', 'B')` CHECK ifadesi. Değerler kod sabitleridir, kullanıcı girdisi değildir. */
export function inList(column: AnyColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  return sql`${column} IN (${sql.raw(list)})`;
}

/** `timestamptz` (UTC) kolonu. */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" });
}

/** `created_at` / `updated_at` — `updated_at` veritabanı trigger'ı ile güncellenir. */
export function auditTimestamps() {
  return {
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  };
}
