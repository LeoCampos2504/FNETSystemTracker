import type { BackendRepositories } from "@/server/ports";
import { createMemoryRepositories } from "@/server/repositories/memory";
import { createPrismaRepositories } from "@/server/repositories/prisma/factory";

export const REPOSITORY_PROVIDERS = ["memory", "prisma"] as const;
export type RepositoryProvider = (typeof REPOSITORY_PROVIDERS)[number];

function isRepositoryProvider(value: string): value is RepositoryProvider {
  return (REPOSITORY_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Explicit, fail-fast provider selection — no DI framework, no implicit
 * "DATABASE_URL is set so use Prisma" inference. Unset defaults to "memory"
 * so the existing unit test suite (and any environment without a database)
 * keeps working unchanged; an invalid value throws immediately at import
 * time instead of silently falling back, since a typo here would otherwise
 * point the whole backend at the wrong data source without anyone noticing.
 */
export function resolveRepositoryProvider(env: Partial<NodeJS.ProcessEnv> = process.env): RepositoryProvider {
  const raw = env.FNET_REPOSITORY_PROVIDER?.trim();
  if (!raw) return "memory";
  if (!isRepositoryProvider(raw)) {
    throw new Error(
      `Invalid FNET_REPOSITORY_PROVIDER: "${raw}". Expected one of: ${REPOSITORY_PROVIDERS.join(", ")}.`,
    );
  }
  return raw;
}

/**
 * Builds the `BackendRepositories` for the given provider. `createPrismaRepositories()`
 * is typed here as a `BackendRepositories` via a plain assignment (no cast) —
 * if `PrismaRepositories` (src/server/repositories/prisma/factory.ts) ever
 * stops structurally matching `BackendRepositories`, this file fails to
 * compile.
 */
export function createRepositoriesForProvider(provider: RepositoryProvider): BackendRepositories {
  switch (provider) {
    case "memory":
      return createMemoryRepositories();
    case "prisma": {
      const prismaRepositories: BackendRepositories = createPrismaRepositories();
      return prismaRepositories;
    }
  }
}
