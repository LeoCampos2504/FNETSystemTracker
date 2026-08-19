import type { Guard, Task, TaskAssignment, TaskRejection } from "@/contracts";
import { CrewRole, ExternalSource, TaskCriticality, TaskStatus, TaskType } from "@/contracts";

let taskCounter = 0;

/** Builds a fully-shaped Task with sensible defaults, for KPI unit tests. */
export function makeTask(overrides: Partial<Task> & { assignments: TaskAssignment[] }): Task {
  taskCounter += 1;
  return {
    id: `test-task-${taskCounter}`,
    taskCode: `TEST-${taskCounter}`,
    formCode: null,
    type: TaskType.PREVENTIVE,
    description: "Test task",
    priority: "MEDIA",
    criticality: TaskCriticality.NORMAL,
    status: TaskStatus.APPROVED,
    scheduledDate: "2026-08-10",
    scheduledAt: "2026-08-10T09:00:00.000Z",
    siteId: "site-1",
    siteCode: "SITE-1",
    zoneId: "zone-1",
    coordinates: { latitude: 0, longitude: 0 },
    arrivalAt: null,
    departureAt: null,
    rejections: [],
    externalId: null,
    externalSource: ExternalSource.INTERNAL,
    sourceUpdatedAt: null,
    ...overrides,
  };
}

export function assignment(technicianId: string, crewRole: CrewRole = CrewRole.PRIMARY): TaskAssignment {
  return { technicianId, crewRole };
}

export function rejection(overrides: Partial<TaskRejection> & { taskId: string }): TaskRejection {
  return { id: `rej-${Math.random()}`, rejectedAt: "2026-08-05T10:00:00.000Z", reason: null, ...overrides };
}

export function makeGuard(overrides: Partial<Guard> & { technicianIds: string[] }): Guard {
  return {
    id: "test-guard-1",
    zoneId: "zone-1",
    startAt: "2026-08-10T18:00:00.000Z",
    endAt: "2026-08-11T08:00:00.000Z",
    externalId: null,
    externalSource: ExternalSource.INTERNAL,
    sourceUpdatedAt: null,
    ...overrides,
  };
}
