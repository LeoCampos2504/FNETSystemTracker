import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate config for DB-backed integration tests (prisma/tests/**). These
 * need a real local Postgres (`npx prisma dev`) with DATABASE_URL set — kept
 * out of the default `vitest.config.mts`/`npm test` glob so Leo and Euge's
 * test runs never depend on a database being up. Run with `npm run test:db`.
 *
 * `fileParallelism: false` because these files share one real database and
 * some mutate seeded rows (restoring them in afterAll) — running test files
 * concurrently against the same DB would race.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["prisma/tests/**/*.test.ts"],
    globalSetup: ["prisma/tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
