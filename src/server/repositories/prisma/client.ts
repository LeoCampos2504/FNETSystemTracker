// Next.js loads .env on its own, but this module also runs under plain
// tsx/vitest (scripts, tests) where nothing else loads it — load it here so
// DATABASE_URL is available either way. A no-op if something already loaded it.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Shared PrismaClient for all Prisma repositories. Prisma 7 no longer reads
 * the connection URL from schema.prisma — it must be passed explicitly via a
 * driver adapter. `@prisma/adapter-pg` talks plain Postgres wire protocol, so
 * it works unchanged against `prisma dev` locally and a real PostgreSQL
 * instance in production (see docs/DATABASE.md).
 *
 * Cached on `globalThis` so Next.js dev hot-reload doesn't open a new
 * connection pool on every module reload.
 */
declare global {
  var __fnetPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Run `npx prisma dev` locally (or point it at a real " +
        "PostgreSQL instance) and set DATABASE_URL — see docs/DATABASE.md.",
    );
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalThis.__fnetPrisma) {
    const client = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__fnetPrisma = client;
    }
    return client;
  }
  return globalThis.__fnetPrisma;
}

/**
 * Lazy by design: constructing the real client (and its DATABASE_URL check)
 * only happens on first actual use, not on import. This lets code that only
 * conditionally needs Prisma (the repository provider selector) import this
 * module unconditionally without requiring DATABASE_URL to be set when the
 * memory provider is the one actually in use.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
});
