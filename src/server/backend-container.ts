import type { BackendRepositories } from "@/server/ports";
import { createAuditService, type AuditService } from "@/server/services/audit.service";
import { createNotificationService, type NotificationService } from "@/server/services/notification.service";
import { createAuthService, type AuthService } from "@/server/services/auth.service";
import { createTaskService, type TaskService } from "@/server/services/task.service";
import { createGuardService, type GuardService } from "@/server/services/guard.service";
import { createCoordinationService, type CoordinationService } from "@/server/services/coordination.service";
import { createTechnicianService, type TechnicianService } from "@/server/services/technician.service";
import { createVehicleService, type VehicleService } from "@/server/services/vehicle.service";
import { createQuoteService, type QuoteService } from "@/server/services/quote.service";

export interface BackendContainer {
  auditService: AuditService;
  notificationService: NotificationService;
  authService: AuthService;
  taskService: TaskService;
  guardService: GuardService;
  coordinationService: CoordinationService;
  technicianService: TechnicianService;
  vehicleService: VehicleService;
  quoteService: QuoteService;
}

/**
 * Builds a fully independent set of services from a given repository set.
 * This is the general-purpose factory: pass it `createMemoryRepositories()`
 * (what `@/server/container`'s `repositories` already does), a hand-rolled
 * fake/spy set for tests, or — once Gino's adapters exist — a Prisma-backed
 * `BackendRepositories`. No service or route needs to change either way;
 * only whoever calls `createBackendContainer` decides what backs it.
 *
 * Not wired up as the app's default container (that's still the simpler
 * per-service default exports in each `*.service.ts`, to keep every
 * existing route import untouched) — this exists so tests can prove real
 * dependency injection (two containers, isolated) and as the integration
 * point Gino's future Prisma wiring should use.
 *
 * Deliberately kept in its own file, separate from `@/server/container`:
 * this file imports service factories, which each import `repositories`
 * (a value) from `@/server/container` for their own default wiring. If this
 * function lived in `container.ts` too, that would make `container.ts`
 * import from services while services import from `container.ts` — a real
 * circular import that breaks at module-evaluation time (verified: it
 * throws "Cannot access '...' before initialization"), not just a
 * theoretical concern. Keeping the two files apart means this one only
 * needs the `BackendRepositories` *type* (erased at compile time, never a
 * runtime cycle), never the `repositories` value.
 */
export function createBackendContainer(repositories: BackendRepositories): BackendContainer {
  const auditService = createAuditService(repositories);
  const notificationService = createNotificationService(repositories);
  const authService = createAuthService(repositories);
  const taskService = createTaskService(repositories, {
    recordAudit: auditService.recordAudit,
    notifyTaskAssignment: notificationService.notifyTaskAssignment,
    notifyScheduleChange: notificationService.notifyScheduleChange,
  });
  const guardService = createGuardService(repositories, {
    recordAudit: auditService.recordAudit,
    notifyGuardChange: notificationService.notifyGuardChange,
  });
  const coordinationService = createCoordinationService(repositories);
  const technicianService = createTechnicianService(repositories);
  const vehicleService = createVehicleService(repositories);
  const quoteService = createQuoteService(repositories);

  return {
    auditService,
    notificationService,
    authService,
    taskService,
    guardService,
    coordinationService,
    technicianService,
    vehicleService,
    quoteService,
  };
}
