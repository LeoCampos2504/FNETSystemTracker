import type { Guard, GuardPerformance, Task } from "@/contracts";
import { TaskCriticality, TaskStatus, TaskType } from "@/contracts";

const COMPLETED_STATUSES = new Set<string>([TaskStatus.APPROVED, TaskStatus.APPROVED_WITH_PENDING]);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A task "belongs" to a guard when its real arrival time falls inside the
 * guard's [startAt, endAt] interval. Never inferred from a fixed "after
 * 18:00" rule — see docs/PROJECT_CONTEXT.md#guardias.
 */
function isWithinGuardInterval(task: Task, guard: Guard): boolean {
  if (!task.arrivalAt) return false;
  const arrival = new Date(task.arrivalAt).getTime();
  return arrival >= new Date(guard.startAt).getTime() && arrival <= new Date(guard.endAt).getTime();
}

/**
 * Pure computation: given a guard and the corrective tasks in its zone, work
 * out how many correctives (and urgent correctives) the guard crew completed
 * during the shift, and their average duration. `zoneTasks` should be all
 * tasks in the guard's zone — this function filters down to the ones that
 * actually happened during the guard's interval and were worked by a
 * technician on the guard crew.
 */
export function computeGuardPerformance(guard: Guard, zoneTasks: Task[]): GuardPerformance {
  const guardTechnicianIds = new Set(guard.technicianIds);

  const correctiveTasks = zoneTasks.filter(
    (t) =>
      t.type === TaskType.CORRECTIVE &&
      COMPLETED_STATUSES.has(t.status) &&
      isWithinGuardInterval(t, guard) &&
      t.assignments.some((a) => guardTechnicianIds.has(a.technicianId)),
  );

  const durations = correctiveTasks
    .filter((t) => t.arrivalAt && t.departureAt)
    .map((t) => (new Date(t.departureAt!).getTime() - new Date(t.arrivalAt!).getTime()) / 60_000)
    .filter((minutes) => minutes >= 0);

  return {
    guardId: guard.id,
    correctivesCompleted: correctiveTasks.length,
    urgentCorrectivesCompleted: correctiveTasks.filter((t) => t.criticality === TaskCriticality.URGENT).length,
    averageDurationMinutes: durations.length > 0 ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
  };
}
