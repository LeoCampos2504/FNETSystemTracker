/**
 * Small in-memory repository implementations backed by src/mocks. They let
 * Leo build and run API routes/services without waiting on Gino's Prisma
 * repositories (src/server/repositories/prisma/**, not created yet). Not a
 * substitute for real business logic or persistence.
 */
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
