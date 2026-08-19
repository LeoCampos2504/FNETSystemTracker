/**
 * Small in-memory repository implementations backed by src/mocks. They let
 * Leo build and run API routes/services without waiting on Gino's Prisma
 * repositories (src/server/repositories/prisma/**, not created yet). Not a
 * substitute for real business logic or persistence.
 */
import type { BackendRepositories } from "@/server/ports";
import { userMemoryRepository } from "./user.memory-repository";
import { technicianMemoryRepository } from "./technician.memory-repository";
import { taskMemoryRepository } from "./task.memory-repository";
import { guardMemoryRepository } from "./guard.memory-repository";
import { vehicleMemoryRepository } from "./vehicle.memory-repository";
import { zoneMemoryRepository } from "./zone.memory-repository";
import { quoteMemoryRepository } from "./quote.memory-repository";
import { notificationMemoryRepository } from "./notification.memory-repository";
import { auditMemoryRepository } from "./audit.memory-repository";
import { authCredentialsMemoryRepository } from "./auth-credentials.memory-repository";

export { userMemoryRepository } from "./user.memory-repository";
export { technicianMemoryRepository } from "./technician.memory-repository";
export { taskMemoryRepository } from "./task.memory-repository";
export { guardMemoryRepository } from "./guard.memory-repository";
export { vehicleMemoryRepository } from "./vehicle.memory-repository";
export { zoneMemoryRepository } from "./zone.memory-repository";
export { quoteMemoryRepository } from "./quote.memory-repository";
export { notificationMemoryRepository } from "./notification.memory-repository";
export { auditMemoryRepository } from "./audit.memory-repository";
export { authCredentialsMemoryRepository } from "./auth-credentials.memory-repository";

/**
 * Builds the current set of memory repositories as a `BackendRepositories`.
 * These are still the module-level singletons each `*.memory-repository.ts`
 * file creates at import time (same store, same data every call) — this
 * factory doesn't reset or fork state, it just packages the existing
 * instances into the shape `createBackendContainer` expects. It exists so
 * `container.ts` (and tests) can build a `BackendRepositories` without
 * hand-assembling the object inline.
 */
export function createMemoryRepositories(): BackendRepositories {
  return {
    user: userMemoryRepository,
    technician: technicianMemoryRepository,
    task: taskMemoryRepository,
    guard: guardMemoryRepository,
    vehicle: vehicleMemoryRepository,
    zone: zoneMemoryRepository,
    quote: quoteMemoryRepository,
    notification: notificationMemoryRepository,
    audit: auditMemoryRepository,
    authCredentials: authCredentialsMemoryRepository,
  };
}
