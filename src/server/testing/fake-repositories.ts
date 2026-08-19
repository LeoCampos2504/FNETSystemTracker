import type {
  AuditLog,
  Guard,
  GuardPerformance,
  Notification,
  Quote,
  Site,
  Task,
  TaskStatus,
  Technician,
  User,
  Vehicle,
  Zone,
} from "@/contracts";
import { ExternalSource, TaskStatus as TaskStatusEnum } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";

/**
 * A second, independent, minimal implementation of every port — NOT a copy
 * of src/server/repositories/memory/**. Its only purpose is proving real
 * dependency injection: a service that (by mistake) fell back to the
 * memory singleton instead of using what it was given would see completely
 * different data than what's seeded here, and mutations made through it
 * must never show up in the real memory repositories (see
 * backend-container.test.ts). Each call returns a fresh, private set of
 * arrays — two calls never share state with each other or with
 * src/server/repositories/memory/**.
 */
export interface FakeRepositoriesSeed {
  users?: User[];
  technicians?: Technician[];
  zones?: Zone[];
  tasks?: Task[];
  passwordHashes?: Record<string, string>;
}

const COMPLETED_STATUSES = new Set<TaskStatus>([TaskStatusEnum.APPROVED, TaskStatusEnum.APPROVED_WITH_PENDING]);

export function createFakeRepositories(seed: FakeRepositoriesSeed = {}): BackendRepositories {
  const users = [...(seed.users ?? [])];
  const technicians = [...(seed.technicians ?? [])];
  const zones = [...(seed.zones ?? [])];
  const tasks = [...(seed.tasks ?? [])];
  const passwordHashes = new Map(Object.entries(seed.passwordHashes ?? {}));

  const guards: Guard[] = [];
  const vehicles: Vehicle[] = [];
  const sites: Site[] = [];
  const quotes: Quote[] = [];
  const notifications: Notification[] = [];
  const auditLogs: AuditLog[] = [];
  let nextGuardId = 1;
  let nextNotificationId = 1;
  let nextAuditId = 1;

  function matchesTaskFilter(task: Task, filter: { technicianId?: string; zoneId?: string }): boolean {
    if (filter.technicianId && !task.assignments.some((a) => a.technicianId === filter.technicianId)) return false;
    if (filter.zoneId && task.zoneId !== filter.zoneId) return false;
    return true;
  }

  return {
    user: {
      async findById(id) {
        return users.find((u) => u.id === id) ?? null;
      },
      async findByEmail(email) {
        return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
      },
    },

    technician: {
      async findById(id) {
        return technicians.find((t) => t.id === id) ?? null;
      },
      async listByZone(zoneId) {
        return technicians.filter((t) => t.primaryZoneId === zoneId || t.onLoanZoneId === zoneId);
      },
    },

    task: {
      async findById(id) {
        return tasks.find((t) => t.id === id) ?? null;
      },
      async listByDate(date, filter = {}) {
        return tasks.filter((t) => t.scheduledDate === date && matchesTaskFilter(t, filter));
      },
      async listPending(asOfDate, filter = {}) {
        return tasks.filter(
          (t) => t.scheduledDate <= asOfDate && !COMPLETED_STATUSES.has(t.status) && matchesTaskFilter(t, filter),
        );
      },
      async updateAssignments(taskId, assignments) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        task.assignments = assignments;
        return task;
      },
      async updateSchedule(taskId, scheduledDate) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        task.scheduledDate = scheduledDate;
        return task;
      },
      async updateStatus(taskId, status) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        task.status = status;
        return task;
      },
    },

    guard: {
      async findById(id) {
        return guards.find((g) => g.id === id) ?? null;
      },
      async list(filter = {}) {
        return guards.filter(
          (g) =>
            (!filter.zoneId || g.zoneId === filter.zoneId) &&
            (!filter.technicianId || g.technicianIds.includes(filter.technicianId)),
        );
      },
      async getPerformance(guardId): Promise<GuardPerformance | null> {
        return guards.some((g) => g.id === guardId)
          ? { guardId, correctivesCompleted: 0, urgentCorrectivesCompleted: 0, averageDurationMinutes: 0 }
          : null;
      },
      async updateTechnicians(guardId, technicianIds) {
        const guard = guards.find((g) => g.id === guardId);
        if (!guard) throw new Error(`Guard not found: ${guardId}`);
        guard.technicianIds = technicianIds;
        return guard;
      },
      async create(input) {
        const guard: Guard = {
          id: `fake-guard-${nextGuardId++}`,
          zoneId: input.zoneId,
          technicianIds: input.technicianIds,
          startAt: input.startAt,
          endAt: input.endAt,
          externalId: null,
          externalSource: ExternalSource.INTERNAL,
          sourceUpdatedAt: null,
        };
        guards.push(guard);
        return guard;
      },
      async update(guardId, patch) {
        const guard = guards.find((g) => g.id === guardId);
        if (!guard) throw new Error(`Guard not found: ${guardId}`);
        if (patch.zoneId !== undefined) guard.zoneId = patch.zoneId;
        if (patch.technicianIds !== undefined) guard.technicianIds = patch.technicianIds;
        if (patch.startAt !== undefined) guard.startAt = patch.startAt;
        if (patch.endAt !== undefined) guard.endAt = patch.endAt;
        return guard;
      },
    },

    vehicle: {
      async findById(id) {
        return vehicles.find((v) => v.id === id) ?? null;
      },
      async findByTechnician(technicianId) {
        return vehicles.find((v) => v.assignedTechnicianId === technicianId) ?? null;
      },
    },

    zone: {
      async findById(id) {
        return zones.find((z) => z.id === id) ?? null;
      },
      async listByCoordinator(coordinatorId) {
        return zones.filter((z) => z.coordinatorIds.includes(coordinatorId));
      },
      async listSites(zoneId) {
        return sites.filter((s) => s.zoneId === zoneId);
      },
    },

    quote: {
      async list() {
        return quotes;
      },
      async findById(id) {
        return quotes.find((q) => q.id === id) ?? null;
      },
    },

    notification: {
      async listByUser(userId) {
        return notifications.filter((n) => n.userId === userId);
      },
      async create(entry) {
        const notification: Notification = { ...entry, id: `fake-notif-${nextNotificationId++}`, createdAt: new Date().toISOString() };
        notifications.push(notification);
        return notification;
      },
    },

    audit: {
      async append(entry) {
        const record: AuditLog = { ...entry, id: `fake-audit-${nextAuditId++}`, timestamp: new Date().toISOString() };
        auditLogs.push(record);
        return record;
      },
      async listByEntity(entity, entityId) {
        return auditLogs.filter((a) => a.entity === entity && a.entityId === entityId);
      },
    },

    authCredentials: {
      async getPasswordHash(userId) {
        return passwordHashes.get(userId) ?? null;
      },
    },
  };
}
