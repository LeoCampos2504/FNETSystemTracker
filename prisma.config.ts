// Prisma 7 moved connection config out of schema.prisma. This file only
// configures the CLI (migrate/studio/seed) — application code still builds
// its own PrismaPg adapter explicitly, see src/server/repositories/prisma/client.ts.
//
// @prisma/config does not auto-load .env when evaluating this file, so we
// load it ourselves before defineConfig() resolves DATABASE_URL.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
