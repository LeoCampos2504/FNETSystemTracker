import type { BackendRepositories } from "@/server/ports";
import { createRepositoriesForProvider, resolveRepositoryProvider } from "@/server/repository-provider";

/**
 * Single composition root: the `BackendRepositories` every service's default
 * export is bound to — see the "Default instance..." comment at the bottom
 * of each `*.service.ts` file. Which concrete repositories back it (memory or
 * Prisma) is decided once here, via `FNET_REPOSITORY_PROVIDER`
 * (see src/server/repository-provider.ts) — it does not require touching any
 * service or route.
 *
 * Deliberately the ONLY thing this file exports. `createBackendContainer`
 * (src/server/backend-container.ts) needs service-factory imports that in
 * turn import `repositories` from here for their own default wiring — if
 * both lived in this one file, that would be a real circular import
 * (verified: it breaks at runtime, not just in theory). Keeping this file
 * to just the repositories value, with zero imports from `services/**`,
 * keeps the dependency graph one-directional: services -> container -> provider.
 */
export const repositories: BackendRepositories = createRepositoriesForProvider(resolveRepositoryProvider());
