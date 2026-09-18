import { defineConfig, env } from "prisma/config";
import { existsSync } from "node:fs";

// Prisma CLI does not load Next.js's .env.local convention automatically.
// Load it only for local development; Railway provides DATABASE_URL through
// the process environment and does not need a physical .env.local file.
const nodeProcess = process as NodeJS.Process & { loadEnvFile?: (path?: string) => void };
if (existsSync(".env.local")) {
  nodeProcess.loadEnvFile?.(".env.local");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
