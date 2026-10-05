import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importInitialSupplySources } from "./import-initial-supply-sources.mjs";

const ownedMigrations = [
  "20260916_add_fnet_task_assignments",
  "20260924_add_app_users",
  "20260925_add_mendel_transactions",
  "20261004_add_mendel_form_references",
  "20261004_add_sytex_supply_imports",
  "20261004_add_supply_control",
  "20261005_add_coordinator_operations",
  "20261005_add_sytex_form_contexts",
  "20261005_add_visit_shifts",
  "20261005_add_site_maintenance",
  "20261005_add_form_links",
  "20261005_add_form_status_plan_date",
];
const ownedTables = new Set([
  "task_assignments", "task_assignment_history", "app_users", "app_sessions",
  "app_login_attempts", "mendel_transactions", "mendel_import_batches",
  "mendel_form_references",
  "sytex_supply_imports", "sytex_supply_import_items",
  "sytex_supply_form_contexts", "sytex_site_maintenance", "sytex_form_links",
  "supply_invoices", "supply_invoice_lines", "supply_invoice_attachments", "supply_invoice_events", "supply_handoffs", "supply_movements", "supply_consumption_forms",
  "ops_user_access", "ops_preferences", "ops_days", "ops_visits", "ops_visit_shifts", "ops_supply_reviews", "ops_review_files", "ops_events",
]);

export function readAppMigrations() {
  return ownedMigrations.map((name) => {
    const source = readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
    if (/^\s*(?:ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(source)) throw new Error("UNEXPECTED_APP_MIGRATION_STATEMENT");
    const tables = [...source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)" \(\n([\s\S]*?)\n\);/g)].map((match) => ({
      name: match[1],
      columns: [...match[2].matchAll(/^  "([^"]+)" /gm)].map((column) => column[1]),
    }));
    if (!tables.length || tables.some((table) => !ownedTables.has(table.name))) throw new Error("UNEXPECTED_APP_MIGRATION_TABLE");
    // Reuse existing application tables from earlier manual SQL installations.
    const sql = source
      .replace(/CREATE TABLE (?!IF NOT EXISTS)/g, "CREATE TABLE IF NOT EXISTS ")
      .replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g, (_, unique = "") => `CREATE ${unique}INDEX IF NOT EXISTS `);
    return { name, sql, tables, checksum: createHash("sha256").update(source).digest("hex") };
  });
}

export async function prepareAppDatabase(client, migrations = readAppMigrations(), report = console.log) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(680250134140)");
    await client.query(`CREATE TABLE IF NOT EXISTS "app_schema_migrations" (
      "name" TEXT PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const migration of migrations) {
      const previous = await client.query('SELECT "checksum" FROM "app_schema_migrations" WHERE "name" = $1', [migration.name]);
      if (previous.rows.length && previous.rows[0].checksum !== migration.checksum) throw new Error("APP_MIGRATION_CHECKSUM_CHANGED");
      if (!previous.rows.length) await client.query(migration.sql);
      for (const table of migration.tables) {
        const columns = table.columns.map((column) => `"${column}"`).join(", ");
        await client.query(`SELECT ${columns} FROM "${table.name}" LIMIT 0`);
      }
      if (!previous.rows.length) {
        await client.query('INSERT INTO "app_schema_migrations" ("name", "checksum") VALUES ($1, $2)', [migration.name, migration.checksum]);
      }
    }
    await client.query("COMMIT");
    report("Tablas de aplicación FNET preparadas. Las tablas sincronizadas de Sytex se cargan desde n8n.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    for (const migration of readAppMigrations()) console.log(`${migration.name}: ${migration.tables.map((table) => table.name).join(", ")}`);
    return;
  }
  if (existsSync(".env.local") && process.loadEnvFile) process.loadEnvFile(".env.local");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    await prepareAppDatabase(client);
    await importInitialSupplySources(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error("No se preparó la base de aplicación. Revisá la conexión, los permisos y las migraciones; la transacción se revierte si falla.");
    process.exitCode = 1;
  });
}
