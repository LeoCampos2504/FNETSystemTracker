import "dotenv/config";
import { execFileSync } from "node:child_process";

/**
 * Runs once before the whole `npm run test:db` suite: reseeds the local DB
 * so every test file starts from the same known state (the same data
 * prisma/seed.ts always produces). Individual test files that mutate rows
 * are responsible for restoring them in `afterAll` (see task/guard tests).
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Run `npx prisma dev` and put the printed DATABASE_URL in .env " +
        "before `npm run test:db` — see docs/DATABASE.md.",
    );
  }
  await runSeedWithRetry();
}

/**
 * The local `prisma dev` embedded server occasionally drops a connection
 * ("Connection terminated unexpectedly") under this suite's connection
 * churn — many short-lived PrismaClient instances across globalSetup, 15+
 * test files, and the seed-idempotency test's own repeated seed runs, all
 * against one lightweight dev-only process. A real Postgres instance
 * doesn't need this. One retry after a short pause has been enough in
 * practice; see docs/DATABASE.md.
 */
async function runSeedWithRetry(attemptsLeft = 2): Promise<void> {
  try {
    execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", env: process.env, shell: true });
  } catch (error) {
    if (attemptsLeft <= 1) throw error;
    console.warn("Seed failed (likely a transient local dev-DB connection drop), retrying once...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await runSeedWithRetry(attemptsLeft - 1);
  }
}
