import type {
  AuditLog,
  Coordinator,
  Guard,
  Notification,
  Quote,
  Site,
  Task,
  Technician,
  User,
  Vehicle,
  VehicleAssignment,
  Zone,
} from "@/contracts";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Maps Prisma model rows (with the relations each contract needs) back to the
 * exact shapes in src/contracts/**. Keeping this in one place means the
 * repositories below stay thin, and a future contract-shape change only
 * touches this file plus the affected repository.
 */

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const taskInclude = {
  technicians: true,
  rejections: true,
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    taskCode: row.taskCode,
    formCode: row.formCode,
    type: row.type,
    description: row.description,
    priority: row.priority,
    criticality: row.criticality,
    status: row.status,
    scheduledDate: toDateOnly(row.scheduledDate),
    scheduledAt: toIso(row.scheduledAt),
    siteId: row.siteId,
    siteCode: row.siteCode,
    zoneId: row.zoneId,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    assignments: [...row.technicians]
      .sort((a, b) => (a.role === b.role ? 0 : a.role === "PRIMARY" ? -1 : 1))
      .map((t) => ({ technicianId: t.technicianId, crewRole: t.role })),
    arrivalAt: toIso(row.arrivalAt),
    departureAt: toIso(row.departureAt),
    rejections: [...row.rejections]
      .sort((a, b) => a.rejectedAt.getTime() - b.rejectedAt.getTime())
      .map((r) => ({ id: r.id, taskId: r.taskId, rejectedAt: r.rejectedAt.toISOString(), reason: r.reason })),
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export const guardInclude = {
  technicians: true,
} satisfies Prisma.GuardInclude;

type GuardRow = Prisma.GuardGetPayload<{ include: typeof guardInclude }>;

export function mapGuard(row: GuardRow): Guard {
  return {
    id: row.id,
    zoneId: row.zoneId,
    technicianIds: row.technicians.map((t) => t.technicianId),
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export function mapTechnician(row: Prisma.TechnicianGetPayload<object>): Technician {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    primaryZoneId: row.primaryZoneId,
    onLoanZoneId: row.onLoanZoneId,
    phone: row.phone,
    active: row.active,
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export const coordinatorInclude = {
  zones: true,
} satisfies Prisma.CoordinatorInclude;

type CoordinatorRow = Prisma.CoordinatorGetPayload<{ include: typeof coordinatorInclude }>;

export function mapCoordinator(row: CoordinatorRow): Coordinator {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    zoneIds: row.zones.map((z) => z.zoneId),
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export const zoneInclude = {
  coordinators: true,
} satisfies Prisma.ZoneInclude;

type ZoneRow = Prisma.ZoneGetPayload<{ include: typeof zoneInclude }>;

export function mapZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    coordinatorIds: row.coordinators.map((c) => c.coordinatorId),
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export function mapSite(row: Prisma.SiteGetPayload<object>): Site {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    zoneId: row.zoneId,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    address: row.address,
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

/** Vehicle's current holder is derived from assignments (endAt: null), never stored as its own column. */
export const vehicleInclude = {
  assignments: { where: { endAt: null } },
} satisfies Prisma.VehicleInclude;

type VehicleRow = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

export function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    mileageKm: row.mileageKm,
    status: row.status,
    assignedTechnicianId: row.assignments[0]?.technicianId ?? null,
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export function mapVehicleAssignment(row: Prisma.VehicleAssignmentGetPayload<object>): VehicleAssignment {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    technicianId: row.technicianId,
    startAt: row.startAt.toISOString(),
    endAt: toIso(row.endAt),
  };
}

export function mapQuote(row: Prisma.QuoteGetPayload<object>): Quote {
  return {
    id: row.id,
    code: row.code,
    zoneId: row.zoneId,
    projectId: row.projectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    externalId: row.externalId,
    externalSource: row.externalSource,
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
  };
}

export function mapNotification(row: Prisma.NotificationGetPayload<object>): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: toIso(row.readAt),
    relatedEntityType: row.entityType,
    relatedEntityId: row.entityId,
  };
}

export function mapAuditLog(row: Prisma.AuditLogGetPayload<object>): AuditLog {
  return {
    id: row.id,
    actor: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    timestamp: row.createdAt.toISOString(),
  };
}

export function mapUser(row: Prisma.UserGetPayload<{ include: { technician: true; coordinator: true } }>): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    technicianId: row.technician?.id ?? null,
    coordinatorId: row.coordinator?.id ?? null,
    active: row.active,
  };
}
