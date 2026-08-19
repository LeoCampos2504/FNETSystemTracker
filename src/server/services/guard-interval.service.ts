import type { Guard, Task } from "@/contracts";

type TaskTimingFields = Pick<Task, "arrivalAt" | "departureAt" | "scheduledAt">;
type GuardIntervalFields = Pick<Guard, "startAt" | "endAt">;

/**
 * The task's real time interval: [arrivalAt, departureAt] when the crew
 * actually worked it, falling back to a single instant at scheduledAt when
 * it hasn't happened yet. Returns null when there's nothing to compare
 * (no arrival and no scheduled time at all).
 */
function getTaskInterval(task: TaskTimingFields): { start: number; end: number } | null {
  const startIso = task.arrivalAt ?? task.scheduledAt;
  if (!startIso) return null;
  const endIso = task.departureAt ?? startIso;
  return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() };
}

/**
 * Whether a task's real time interval overlaps a guard's registered
 * [startAt, endAt] interval. This is the ONLY correct way to decide if a
 * task "belongs" to a guard — never a fixed "hour >= 18" check (see
 * docs/PROJECT_CONTEXT.md, "Guardias"). Boundaries are inclusive: a task
 * that starts exactly when the guard ends still counts.
 */
export function isTaskWithinGuard(task: TaskTimingFields, guard: GuardIntervalFields): boolean {
  const taskInterval = getTaskInterval(task);
  if (!taskInterval) return false;

  const guardStart = new Date(guard.startAt).getTime();
  const guardEnd = new Date(guard.endAt).getTime();

  return taskInterval.start <= guardEnd && taskInterval.end >= guardStart;
}
