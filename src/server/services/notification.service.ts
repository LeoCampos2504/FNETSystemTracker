import type { Notification, Task } from "@/contracts";
import { NotificationType, TaskCriticality, TaskType } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";

export interface NotificationService {
  listNotificationsForUser(userId: string): Promise<Notification[]>;
  notifyTaskAssignment(task: Task, technicianIds: string[]): Promise<void>;
  notifyScheduleChange(task: Task): Promise<void>;
  notifyGuardChange(guardId: string, technicianIds: string[]): Promise<void>;
}

type NotificationRepositories = Pick<BackendRepositories, "notification" | "technician">;

/** Pure factory: depends only on the `notification`/`technician` ports. */
export function createNotificationService(repositories: NotificationRepositories): NotificationService {
  async function notifyUser(
    userId: string,
    type: (typeof NotificationType)[keyof typeof NotificationType],
    title: string,
    message: string,
    relatedEntityType: string,
    relatedEntityId: string,
  ): Promise<void> {
    await repositories.notification.create({
      userId,
      type,
      title,
      message,
      readAt: null,
      relatedEntityType,
      relatedEntityId,
    });
  }

  async function userIdsForTechnicianIds(technicianIds: string[]): Promise<string[]> {
    const technicians = await Promise.all(technicianIds.map((id) => repositories.technician.findById(id)));
    return technicians.flatMap((t) => (t?.userId ? [t.userId] : []));
  }

  return {
    async listNotificationsForUser(userId) {
      return repositories.notification.listByUser(userId);
    },

    /**
     * Case: a technician is assigned/reassigned to a task.
     * `technicianIds` is the set to actually notify (normally just the ones
     * newly added to the crew) — the caller decides that, this function
     * doesn't assume "all current assignees" so it never re-notifies someone
     * whose assignment didn't change.
     */
    async notifyTaskAssignment(task, technicianIds) {
      const userIds = await userIdsForTechnicianIds(technicianIds);
      await Promise.all(
        userIds.map((userId) =>
          notifyUser(
            userId,
            NotificationType.NEW_TASK,
            "Nueva tarea asignada",
            `Se te asigno la tarea ${task.taskCode} para el ${task.scheduledDate}.`,
            "task",
            task.id,
          ),
        ),
      );

      if (task.type === TaskType.CORRECTIVE && task.criticality === TaskCriticality.URGENT) {
        await Promise.all(
          userIds.map((userId) =>
            notifyUser(
              userId,
              NotificationType.CORRECTIVE_URGENT,
              "Correctivo urgente",
              `El correctivo urgente ${task.taskCode} requiere atencion inmediata.`,
              "task",
              task.id,
            ),
          ),
        );
      }
    },

    /** Case: a task's scheduledDate changes (initial schedule or reschedule). */
    async notifyScheduleChange(task) {
      const userIds = await userIdsForTechnicianIds(task.assignments.map((a) => a.technicianId));
      await Promise.all(
        userIds.map((userId) =>
          notifyUser(
            userId,
            NotificationType.SCHEDULE_CHANGE,
            "Cronograma actualizado",
            `La tarea ${task.taskCode} fue programada para el ${task.scheduledDate}.`,
            "task",
            task.id,
          ),
        ),
      );
    },

    /** Case: a guard's crew or interval changes. */
    async notifyGuardChange(guardId, technicianIds) {
      const userIds = await userIdsForTechnicianIds(technicianIds);
      await Promise.all(
        userIds.map((userId) =>
          notifyUser(
            userId,
            NotificationType.GUARD_CHANGE,
            "Cambio de guardia",
            `Hubo un cambio en la guardia ${guardId}.`,
            "guard",
            guardId,
          ),
        ),
      );
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultNotificationService = createNotificationService(defaultRepositories);
export const { listNotificationsForUser, notifyTaskAssignment, notifyScheduleChange, notifyGuardChange } =
  defaultNotificationService;
