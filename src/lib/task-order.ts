import { TaskStatus } from "@/contracts";
import type { Task } from "@/contracts";

/** Lower comes first: what is still to be done goes before what is already finished. */
const RANK: Record<string, number> = {
  [TaskStatus.IN_PROGRESS]: 0, [TaskStatus.OPEN]: 0, [TaskStatus.REJECTED]: 0,
  [TaskStatus.IN_REVIEW]: 1, [TaskStatus.SENT]: 1,
  [TaskStatus.APPROVED_WITH_PENDING]: 2, [TaskStatus.APPROVED]: 3, [TaskStatus.CANCELLED]: 4,
};
export function taskRank(status: string): number { return RANK[status] ?? 0; }
/** Tasks that still need work (not sent for review, approved or cancelled). */
export function isUnfinished(status: string): boolean { return taskRank(status) === 0; }

type Dated = Pick<Task, "status" | "scheduledAt" | "scheduledDate" | "requestDate">;
function taskTime(task: Dated): number {
  const value = task.scheduledAt ?? task.requestDate ?? (/^\d{4}-\d{2}-\d{2}$/.test(task.scheduledDate) ? task.scheduledDate : null);
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

/** Unfinished first, then by most recent date; tasks without any date go last of their group. */
export function sortTasksForDisplay<T extends Dated>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => taskRank(a.status) - taskRank(b.status) || taskTime(b) - taskTime(a));
}

/** Only real web links are offered to open; anything else from the source is ignored. */
export function sytexLink(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url.trim()) ? url.trim() : null;
}

export function displayDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Sin fecha";
}
