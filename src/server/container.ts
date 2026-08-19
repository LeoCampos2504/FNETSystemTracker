import type { BackendRepositories } from "@/server/ports";
import { createMemoryRepositories } from "@/server/repositories/memory";

/**
 * Single composition root: the default (memory, for now) `BackendRepositories`
 * every service's default export is bound to — see the "Default instance..."
 * comment at the bottom of each `*.service.ts` file. Swapping memory for
 * Prisma later means changing what this points to; it does not require
 * touching any service or route.
 *
 * Deliberately the ONLY thing this file exports. `createBackendContainer`
 * (src/server/backend-container.ts) needs service-factory imports that in
 * turn import `repositories` from here for their own default wiring — if
 * both lived in this one file, that would be a real circular import
 * (verified: it breaks at runtime, not just in theory). Keeping this file
 * to just the repositories value, with zero imports from `services/**`,
 * keeps the dependency graph one-directional: services -> container -> memory.
 */
export const repositories: BackendRepositories = createMemoryRepositories();
