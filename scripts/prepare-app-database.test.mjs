import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prepareAppDatabase, readAppMigrations } from "./prepare-app-database.mjs";

describe("Railway application database preparation", () => {
  it("supports a migrations-only deploy without replaying initial source imports", () => {
    const source = readFileSync(new URL("./prepare-app-database.mjs", import.meta.url), "utf8");
    expect(source).toContain('if (!process.argv.includes("--migrations-only")) await importInitialSupplySources(client)');
    const sql = readFileSync(new URL("../prisma/migrations/20261016_add_mendel_zone_control/migration.sql", import.meta.url), "utf8");
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
    expect([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1])).toEqual(["fnet_mendel_zone_expenses", "fnet_mendel_zone_access", "fnet_mendel_zone_decisions"]);
  });
  it("only prepares owned tables and preserves the Sytex sources", () => {
    const migrations = readAppMigrations();
    expect(migrations.flatMap((migration) => migration.tables.map((table) => table.name)).sort()).toEqual([
      "fnet_mendel_zone_expenses", "fnet_mendel_zone_access", "fnet_mendel_zone_decisions",
      "app_login_attempts", "app_sessions", "app_users", "mendel_form_references",
      "mendel_import_batches", "mendel_transactions", "task_assignment_history", "task_assignments",
      "sytex_supply_import_items", "sytex_supply_imports",
      "sytex_supply_form_contexts", "sytex_site_maintenance", "sytex_form_links", "sytex_form_states", "sytex_task_dates", "sytex_site_answers",
      "supply_invoices", "supply_invoice_lines", "supply_invoice_attachments", "supply_invoice_events", "supply_handoffs", "supply_movements", "supply_consumption_forms",
      "ops_user_access", "ops_preferences", "ops_days", "ops_visits", "ops_visit_shifts", "ops_supply_reviews", "ops_review_files", "ops_events",
      "ops_guard_weeks", "ops_guard_periods", "ops_holidays", "ops_visit_hours", "ops_ctic_users",
    ].sort());
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
