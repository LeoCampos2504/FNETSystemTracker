import type { Task, TaskAssignment, TaskStatus } from "@/contracts";
import { TaskStatus as TaskStatusEnum } from "@/contracts";
import { repositories } from "@/server/container";
import { conflict, notFound } from "@/server/http/errors";
import { recordAudit } from "./audit.service";
import { notifyScheduleChange, notifyTaskAssignment } from "./notification.service";

function dedupeById(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return [...byId.values()];
}

export interface TaskDayFilter {
  technicianId?: string;
  /** When set, results are merged across all these zones (coordinator with multiple zones, no explicit zoneId filter). */
  zoneIds?: string[];
  date: string;
}

export async function getTasksForDay(filter: TaskDayFilter): Promise<Task[]> {
  if (!filter.zoneIds || filter.zoneIds.length === 0) {
    return repositories.task.listByDate(filter.date, { technicianId: filter.technicianId });
  }
  const perZone = await Promise.all(
    filter.zoneIds.map((zoneId) =>
      repositories.task.listByDate(filter.date, { technicianId: filter.technicianId, zoneId }),
    ),
  );
  return dedupeById(perZone.flat());
}

export interface PendingTaskFilter {
  technicianId?: string;
  zoneIds?: string[];
  asOfDate: string;
}

export async function getPendingTasks(filter: PendingTaskFilter): Promise<Task[]> {
  if (!filter.zoneIds || filter.zoneIds.length === 0) {
    return repositories.task.listPending(filter.asOfDate, { technicianId: filter.technicianId });
  }
  const perZone = await Promise.all(
    filter.zoneIds.map((zoneId) =>
      repositories.task.listPending(filter.asOfDate, { technicianId: filter.technicianId, zoneId }),
    ),
  );
  return dedupeById(perZone.flat());
}

export async function getTaskById(taskId: string): Promise<Task> {
  const task = await repositories.task.findById(taskId);
  if (!task) throw notFound(`Task not found: ${taskId}`);
  return task;
}

function assertMutable(task: Task): void {
  if (task.status === TaskStatusEnum.APPROVED) {
    throw conflict(`Task ${task.id} is APPROVED and can no longer be modified from here`);
  }
}

export async function assignTechniciansToTask(
  actorId: string,
  taskId: string,
  assignments: TaskAssignment[],
): Promise<Task> {
  const before = await getTaskById(taskId);
  assertMutable(before);

  const updated = await repositories.task.updateAssignments(taskId, assignments);
  await recordAudit(
    actorId,
    "TASK_ASSIGNMENTS_UPDATED",
    "Task",
    taskId,
    { assignments: before.assignments },
    { assignments: updated.assignments },
  );
  await notifyTaskAssignment(updated);
  return updated;
}

export async function scheduleTask(actorId: string, taskId: string, scheduledDate: string): Promise<Task> {
  const before = await getTaskById(taskId);
  assertMutable(before);

  const updated = await repositories.task.updateSchedule(taskId, scheduledDate);
  await recordAudit(
    actorId,
    "TASK_SCHEDULED",
    "Task",
    taskId,
    { scheduledDate: before.scheduledDate },
    { scheduledDate: updated.scheduledDate },
  );
  await notifyScheduleChange(updated);
  return updated;
}

/**
 * Status is intentionally NOT constrained to a rigid transition graph:
 * Sytex will be the authoritative source of task status in the future, and
 * hard-coding a workflow here could contradict it. We only require the
 * target value to be a valid TaskStatus (enforced by zod at the route) and
 * that the task still exists.
 */
export async function updateTaskStatus(actorId: string, taskId: string, status: TaskStatus): Promise<Task> {
  const before = await getTaskById(taskId);
  const updated = await repositories.task.updateStatus(taskId, status);
  await recordAudit(actorId, "TASK_STATUS_CHANGED", "Task", taskId, { status: before.status }, { status: updated.status });
  return updated;
}
