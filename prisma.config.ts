import { defineConfig, env } from "prisma/config";
import { existsSync } from "node:fs";

const nodeProcess = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};
if (existsSync(".env.local")) {
  nodeProcess.loadEnvFile?.(".env.local");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
