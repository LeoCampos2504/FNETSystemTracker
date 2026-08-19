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
import {
  auditMemoryRepository,
  authCredentialsMemoryRepository,
  guardMemoryRepository,
  notificationMemoryRepository,
  quoteMemoryRepository,
  taskMemoryRepository,
  technicianMemoryRepository,
  userMemoryRepository,
  vehicleMemoryRepository,
  zoneMemoryRepository,
} from "@/server/repositories/memory";

/**
 * Single composition root: every service imports its repositories from here,
 * never from `repositories/memory` or `repositories/prisma` directly. When
 * Gino's Prisma repositories exist, swapping the values below is the only
 * change needed — no service/business-logic code changes.
 */
export const repositories: {
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
} = {
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
