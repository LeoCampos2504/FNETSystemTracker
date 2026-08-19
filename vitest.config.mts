import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pinned explicitly so this suite's repository provider can never be
    // hijacked by a developer's local .env (set for `npm run dev` against
    // real Prisma, say) — dotenv (loaded transitively via
    // src/server/repositories/prisma/client.ts) does not override an
    // already-set env var, so this wins regardless of .env's contents.
    env: { FNET_REPOSITORY_PROVIDER: "memory" },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
