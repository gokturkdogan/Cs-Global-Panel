import type pg from "pg";

/** drizzle.config.ts ile aynı değerler. */
export const MIGRATIONS_FOLDER = "./src/server/db/migrations";
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";

export async function countAppliedMigrations(client: pg.ClientBase): Promise<number> {
  const exists = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`],
  );
  if (exists.rows[0]?.exists !== true) return 0;
  const result = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  );
  return result.rows[0]?.count ?? 0;
}
