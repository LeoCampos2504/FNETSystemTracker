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
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", env: process.env, shell: true });
}
