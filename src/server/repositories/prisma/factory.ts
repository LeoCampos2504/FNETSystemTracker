import type {
  AuditRepository,
  AuthCredentialsRepository,
  GuardRepository,
  NotificationRepository,
  QuoteRepository,
  TaskRepository,
  TechnicianRepository,
  UserRepository,
  VehicleRepository,
  ZoneRepository,
} from "@/server/ports";
import { userPrismaRepository } from "./user.prisma-repository";
import { technicianPrismaRepository } from "./technician.prisma-repository";
import { taskPrismaRepository } from "./task.prisma-repository";
import { guardPrismaRepository } from "./guard.prisma-repository";
import { vehiclePrismaRepository } from "./vehicle.prisma-repository";
import { zonePrismaRepository } from "./zone.prisma-repository";
import { quotePrismaRepository } from "./quote.prisma-repository";
import { notificationPrismaRepository } from "./notification.prisma-repository";
import { auditPrismaRepository } from "./audit.prisma-repository";
import { authCredentialsPrismaRepository } from "./auth-credentials.prisma-repository";

/**
 * Every port Prisma has an adapter for, keyed the way a composition root
 * would want to inject them. This type is deliberately NOT named
 * `BackendRepositories` — that type belongs to Leo's container (a separate
 * branch, not merged here); this is only Prisma's side of the handshake.
 * Each field is typed to the real port interface, so if any *.prisma-repository.ts
 * stops structurally satisfying its port, this file fails to compile —
 * that's the "TypeScript checks it structurally" guarantee, not a runtime
 * assertion.
 */
export interface PrismaRepositories {
  user: UserRepository;
  technician: TechnicianRepository;
  task: TaskRepository;
  guard: GuardRepository;
  vehicle: VehicleRepository;
  zone: ZoneRepository;
  quote: QuoteRepository;
  notification: NotificationRepository;
  audit: AuditRepository;
  authCredentials: AuthCredentialsRepository;
}

/**
 * Builds the full set of Prisma-backed repositories. All ten share the one
 * PrismaClient singleton (see ./client.ts) — this does not open a new
 * connection or create any state; it's just an object literal grouping
 * already-constructed adapters. Safe to call more than once.
 *
 * Not a DI framework, no decorators/reflection — Leo's composition root can
 * just do `const repos = createPrismaRepositories()` and wire each field
 * into whatever container shape the backend expects.
 */
export function createPrismaRepositories(): PrismaRepositories {
  return {
    user: userPrismaRepository,
    technician: technicianPrismaRepository,
    task: taskPrismaRepository,
    guard: guardPrismaRepository,
    vehicle: vehiclePrismaRepository,
    zone: zonePrismaRepository,
    quote: quotePrismaRepository,
    notification: notificationPrismaRepository,
    audit: auditPrismaRepository,
    authCredentials: authCredentialsPrismaRepository,
  };
}
