import { describe, expect, it, vi } from "vitest";
import { prepareAppDatabase, readAppMigrations } from "./prepare-app-database.mjs";

describe("Railway application database preparation", () => {
  it("only prepares owned tables and preserves the Sytex sources", () => {
    const migrations = readAppMigrations();
    expect(migrations.flatMap((migration) => migration.tables.map((table) => table.name)).sort()).toEqual([
      "app_login_attempts", "app_sessions", "app_users", "mendel_form_references",
      "mendel_import_batches", "mendel_transactions", "task_assignment_history", "task_assignments",
    ]);
    for (const { sql } of migrations) {
      expect(sql).not.toMatch(/^\s*(?:ALTER|DROP|TRUNCATE|DELETE|UPDATE)\b/im);
      expect(sql).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "(?:correctivos|preventivos|cotizaciones|insumos|pendientes_visita|cargas_combustible_ge)"/);
      expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    }
  });

  it("does not reapply an installation already recorded with the same checksum", async () => {
    const migrations = readAppMigrations();
    const query = vi.fn(async (sql, values) => ({ rows: sql.startsWith('SELECT "checksum"') ? [{ checksum: migrations.find((migration) => migration.name === values[0]).checksum }] : [] }));
    await prepareAppDatabase({ query }, migrations, () => {});
    expect(query.mock.calls.some(([sql]) => migrations.some((migration) => migration.sql === sql))).toBe(false);
    expect(query.mock.calls.at(-1)[0]).toBe("COMMIT");
  });

  it("rolls back the whole installation if an existing table is incompatible", async () => {
    const query = vi.fn(async (sql) => {
      if (sql.startsWith('SELECT "id"')) throw new Error("column missing");
      return { rows: [] };
    });
    await expect(prepareAppDatabase({ query }, readAppMigrations(), () => {})).rejects.toThrow("column missing");
    expect(query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });

  it("rejects changed migration history instead of overwriting it", async () => {
    const query = vi.fn(async (sql) => ({ rows: sql.startsWith('SELECT "checksum"') ? [{ checksum: "different" }] : [] }));
    await expect(prepareAppDatabase({ query }, readAppMigrations(), () => {})).rejects.toThrow("APP_MIGRATION_CHECKSUM_CHANGED");
    expect(query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });
});
