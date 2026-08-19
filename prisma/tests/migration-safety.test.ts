import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Static, allowlist-based review — not a SQL parser. Scans every migration
 * for the handful of genuinely destructive operations named in the task
 * (DROP TABLE, DROP COLUMN, TRUNCATE, unconditional DELETE). A migration
 * that legitimately needs one of these must add an entry to
 * REVIEWED_DESTRUCTIVE_MIGRATIONS below with a one-line reason — the test
 * fails loudly otherwise, so a destructive statement can never slip into a
 * migration file unreviewed. DROP INDEX/DROP CONSTRAINT and ordinary
 * ALTER COLUMN aren't flagged: they don't delete rows.
 */
const DANGEROUS_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { name: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { name: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
  // A DELETE with no WHERE clause on the same statement — a real DELETE ...
  // WHERE is fine and won't match this (naive but sufficient: it only
  // triggers on the literal "DELETE FROM <table>;" shape with no WHERE
  // before the terminating semicolon).
  { name: "unconditional DELETE", pattern: /\bDELETE\s+FROM\s+"?\w+"?\s*;/i },
];

/**
 * Migration folder name -> why an otherwise-dangerous-looking statement in
 * it is actually fine. Empty today — neither existing migration needs one.
 */
const REVIEWED_DESTRUCTIVE_MIGRATIONS: Record<string, string> = {
  // "20261231000000_example": "Dropped an unused staging column; verified empty in every environment before merging.",
};

describe("migration safety: static scan for unreviewed destructive operations", () => {
  const migrationsDir = path.resolve(__dirname, "../migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  it("found migrations to scan (sanity check the scan itself isn't silently scanning nothing)", () => {
    expect(migrationFolders.length).toBeGreaterThanOrEqual(2);
  });

  for (const folder of migrationFolders) {
    it(`${folder}: no unreviewed DROP TABLE / DROP COLUMN / TRUNCATE / unconditional DELETE`, () => {
      const sqlPath = path.join(migrationsDir, folder, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf-8");

      const hits = DANGEROUS_PATTERNS.filter(({ pattern }) => pattern.test(sql)).map((h) => h.name);
      if (hits.length === 0) return;

      expect(
        REVIEWED_DESTRUCTIVE_MIGRATIONS,
        `${folder} contains: ${hits.join(", ")}. Add a reviewed-with-reason entry to ` +
          `REVIEWED_DESTRUCTIVE_MIGRATIONS in this test file (after a human actually reviews it), or fix the migration.`,
      ).toHaveProperty(folder);
    });
  }
});
