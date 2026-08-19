import type { AuditRepository } from "./audit.repository";
import type { AuthCredentialsRepository } from "./auth-credentials.repository";
import type { GuardRepository } from "./guard.repository";
import type { NotificationRepository } from "./notification.repository";
import type { QuoteRepository } from "./quote.repository";
import type { TaskRepository } from "./task.repository";
import type { TechnicianRepository } from "./technician.repository";
import type { UserRepository } from "./user.repository";
import type { VehicleRepository } from "./vehicle.repository";
import type { ZoneRepository } from "./zone.repository";

/**
 * Every repository port the backend needs, in one shape. Services and the
 * container depend on this — never on a concrete implementation (memory
 * today, Prisma eventually). A service that only needs a subset should type
 * its parameter as `Pick<BackendRepositories, "task" | "technician">` etc.
 * rather than requiring the whole set, so its real dependencies stay visible
 * at the type level.
 */
export interface BackendRepositories {
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
