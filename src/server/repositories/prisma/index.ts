/**
 * Prisma-backed repository implementations of src/server/ports/**. Same
 * contracts as src/server/repositories/memory/**, backed by a real database
 * instead of src/mocks. See docs/DATABASE.md for how to run one locally.
 */
export { userPrismaRepository } from "./user.prisma-repository";
export { technicianPrismaRepository } from "./technician.prisma-repository";
export { taskPrismaRepository } from "./task.prisma-repository";
export { guardPrismaRepository } from "./guard.prisma-repository";
export { vehiclePrismaRepository } from "./vehicle.prisma-repository";
export { zonePrismaRepository } from "./zone.prisma-repository";
export { quotePrismaRepository } from "./quote.prisma-repository";
export { notificationPrismaRepository } from "./notification.prisma-repository";
export { auditPrismaRepository } from "./audit.prisma-repository";
export { authCredentialsPrismaRepository } from "./auth-credentials.prisma-repository";
export { createPrismaRepositories } from "./factory";
export type { PrismaRepositories } from "./factory";
export { prisma } from "./client";
