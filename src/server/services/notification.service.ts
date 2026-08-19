import type { Notification, Task } from "@/contracts";
import { NotificationType, TaskCriticality, TaskType } from "@/contracts";
import { repositories } from "@/server/container";

export async function listNotificationsForUser(userId: string): Promise<Notification[]> {
  return repositories.notification.listByUser(userId);
}

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

/** Case: a technician is assigned/reassigned to a task. */
export async function notifyTaskAssignment(task: Task): Promise<void> {
  const userIds = await userIdsForTechnicianIds(task.assignments.map((a) => a.technicianId));
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
}

/** Case: a task's scheduledDate changes (initial schedule or reschedule). */
export async function notifyScheduleChange(task: Task): Promise<void> {
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
}

/** Case: a guard's crew or interval changes. */
export async function notifyGuardChange(guardId: string, technicianIds: string[]): Promise<void> {
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
}
