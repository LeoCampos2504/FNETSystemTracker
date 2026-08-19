import type { Task, TaskAssignment, TaskStatus } from "@/contracts";
import { TaskStatus as TaskStatusEnum } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { createAuditService, type AuditService } from "./audit.service";
import { createNotificationService, type NotificationService } from "./notification.service";

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

export interface PendingTaskFilter {
  technicianId?: string;
  zoneIds?: string[];
  asOfDate: string;
}

export interface TaskService {
  getTasksForDay(filter: TaskDayFilter): Promise<Task[]>;
  getPendingTasks(filter: PendingTaskFilter): Promise<Task[]>;
  getTaskById(taskId: string): Promise<Task>;
  findTaskById(taskId: string): Promise<Task | null>;
  assignTechniciansToTask(actorId: string, taskId: string, assignments: TaskAssignment[]): Promise<Task>;
  scheduleTask(actorId: string, taskId: string, scheduledDate: string): Promise<Task>;
  updateTaskStatus(actorId: string, taskId: string, status: TaskStatus): Promise<Task>;
}

type TaskServiceRepositories = Pick<BackendRepositories, "task" | "technician">;
type TaskServiceDeps = Pick<AuditService, "recordAudit"> & Pick<NotificationService, "notifyTaskAssignment" | "notifyScheduleChange">;

/**
 * Pure factory: depends only on the `task`/`technician` ports plus the audit
 * and notification capabilities it needs (injected, not imported globally —
 * that's what lets a test prove this never falls back to a hidden memory
 * singleton). Zero knowledge of memory vs. Prisma.
 *
 * Memory repositories mutate their stored record in place and return that
 * SAME reference (see task.memory-repository.ts). That means a `before`
 * object fetched earlier in a function silently reflects the NEW values by
 * the time it's read after the repository call — so every "before" snapshot
 * below is captured into a plain value/array copy BEFORE the mutating
 * repository call runs, never read off `before`/`updated` after it.
 */
export function createTaskService(repositories: TaskServiceRepositories, deps: TaskServiceDeps): TaskService {
  async function getTaskById(taskId: string): Promise<Task> {
    const task = await repositories.task.findById(taskId);
    if (!task) throw notFound(`Task not found: ${taskId}`);
    return task;
  }

  function assertMutable(task: Task): void {
    if (task.status === TaskStatusEnum.APPROVED) {
      throw conflict(`Task ${task.id} is APPROVED and can no longer be modified from here`);
    }
  }

  return {
    async getTasksForDay(filter) {
      if (!filter.zoneIds || filter.zoneIds.length === 0) {
        return repositories.task.listByDate(filter.date, { technicianId: filter.technicianId });
      }
      const perZone = await Promise.all(
        filter.zoneIds.map((zoneId) =>
          repositories.task.listByDate(filter.date, { technicianId: filter.technicianId, zoneId }),
        ),
      );
      return dedupeById(perZone.flat());
    },

    async getPendingTasks(filter) {
      if (!filter.zoneIds || filter.zoneIds.length === 0) {
        return repositories.task.listPending(filter.asOfDate, { technicianId: filter.technicianId });
      }
      const perZone = await Promise.all(
        filter.zoneIds.map((zoneId) =>
          repositories.task.listPending(filter.asOfDate, { technicianId: filter.technicianId, zoneId }),
        ),
      );
      return dedupeById(perZone.flat());
    },

    getTaskById,

    /**
     * Non-throwing counterpart for `Api.getTask(): Promise<Task | null>` —
     * the only route this backs is `GET /api/tasks/:id`. Every other caller
     * wants the throwing `getTaskById` (mutations legitimately 404 on a
     * missing task; that contract op has no null variant).
     */
    async findTaskById(taskId) {
      return repositories.task.findById(taskId);
    },

    async assignTechniciansToTask(actorId, taskId, assignments) {
      const before = await getTaskById(taskId);
      assertMutable(before);

      const previousAssignments = before.assignments.map((a) => ({ ...a }));
      const previousTechnicianIds = new Set(previousAssignments.map((a) => a.technicianId));

      const technicians = await Promise.all(assignments.map((a) => repositories.technician.findById(a.technicianId)));
      const unknownTechnicianIds = assignments.filter((_, i) => !technicians[i]).map((a) => a.technicianId);
      if (unknownTechnicianIds.length > 0) {
        throw badRequest(`Unknown technicianId(s): ${unknownTechnicianIds.join(", ")}`);
      }

      const updated = await repositories.task.updateAssignments(taskId, assignments);
      await deps.recordAudit(
        actorId,
        "TASK_ASSIGNMENTS_UPDATED",
        "Task",
        taskId,
        { assignments: previousAssignments },
        { assignments: updated.assignments.map((a) => ({ ...a })) },
      );

      // Only notify technicians who are newly part of the crew, so a no-op
      // or partial reassignment (e.g. swapping just the COLLABORATOR)
      // doesn't re-spam someone who was already on the task.
      const newlyAddedTechnicianIds = assignments.map((a) => a.technicianId).filter((id) => !previousTechnicianIds.has(id));
      if (newlyAddedTechnicianIds.length > 0) {
        await deps.notifyTaskAssignment(updated, newlyAddedTechnicianIds);
      }

      return updated;
    },

    async scheduleTask(actorId, taskId, scheduledDate) {
      const before = await getTaskById(taskId);
      assertMutable(before);
      const previousScheduledDate = before.scheduledDate;
      const dateActuallyChanged = previousScheduledDate !== scheduledDate;

      const updated = await repositories.task.updateSchedule(taskId, scheduledDate);
      await deps.recordAudit(
        actorId,
        "TASK_SCHEDULED",
        "Task",
        taskId,
        { scheduledDate: previousScheduledDate },
        { scheduledDate: updated.scheduledDate },
      );

      if (dateActuallyChanged) {
        await deps.notifyScheduleChange(updated);
      }
      return updated;
    },

    /**
     * Status is intentionally NOT constrained to a rigid transition graph:
     * Sytex will be the authoritative source of task status in the future,
     * and hard-coding a workflow here could contradict it. We only require
     * the target value to be a valid TaskStatus (enforced by zod at the
     * route) and that the task still exists.
     */
    async updateTaskStatus(actorId, taskId, status) {
      const before = await getTaskById(taskId);
      const previousStatus = before.status;

      const updated = await repositories.task.updateStatus(taskId, status);
      await deps.recordAudit(actorId, "TASK_STATUS_CHANGED", "Task", taskId, { status: previousStatus }, { status: updated.status });
      return updated;
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// and its own default audit/notification services — preserves today's call
// sites (flat function imports) untouched. Swapping the backing
// implementation later only means changing what `repositories` in
// `@/server/container` points to; this file needs no changes.
const defaultAuditService = createAuditService(defaultRepositories);
const defaultNotificationService = createNotificationService(defaultRepositories);
const defaultTaskService = createTaskService(defaultRepositories, {
  recordAudit: defaultAuditService.recordAudit,
  notifyTaskAssignment: defaultNotificationService.notifyTaskAssignment,
  notifyScheduleChange: defaultNotificationService.notifyScheduleChange,
});
export const { getTasksForDay, getPendingTasks, getTaskById, findTaskById, assignTechniciansToTask, scheduleTask, updateTaskStatus } =
  defaultTaskService;
