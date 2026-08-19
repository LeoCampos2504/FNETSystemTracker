import type { GuardPerformance, Task, TechnicianKpis } from "@/contracts";
import { TaskStatus, TaskType } from "@/contracts";

const COMPLETED_STATUSES = new Set<string>([TaskStatus.APPROVED, TaskStatus.APPROVED_WITH_PENDING]);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type TechnicianKpisWithoutRanking = Omit<TechnicianKpis, "ranking">;

export interface ComputeTechnicianKpisInput {
  technicianId: string;
  /** Every task the technician is assigned to, any scheduledDate — pending is evaluated across all of them, not just the requested period. */
  tasks: Task[];
  /** Performance of every guard shift the technician was part of (any period; callers usually pre-filter to guards overlapping the period). */
  guardPerformances: GuardPerformance[];
  periodStart: string;
  periodEnd: string;
  /** "fecha consultada" for the pending calculation (KPI7). Defaults to periodEnd. */
  asOfDate?: string;
}

/**
 * Pure KPI computation for one technician over [periodStart, periodEnd].
 * Formulas match docs/PROJECT_CONTEXT.md#kpis-de-técnicos and
 * docs/KPI_DEFINITIONS.md. No I/O — callers (src/server/kpis/fetch.ts) load
 * the raw tasks/guard performances from Prisma and pass them in here.
 */
export function computeTechnicianKpis(input: ComputeTechnicianKpisInput): TechnicianKpisWithoutRanking {
  const { technicianId, tasks, guardPerformances, periodStart, periodEnd } = input;
  const asOfDate = input.asOfDate ?? periodEnd;

  const tasksInPeriod = tasks.filter((t) => t.scheduledDate >= periodStart && t.scheduledDate <= periodEnd);

  const completed = tasksInPeriod.filter((t) => COMPLETED_STATUSES.has(t.status));
  const completedPreventive = completed.filter((t) => t.type === TaskType.PREVENTIVE);
  const completedCorrective = completed.filter((t) => t.type === TaskType.CORRECTIVE);
  const preventiveScheduled = tasksInPeriod.filter((t) => t.type === TaskType.PREVENTIVE);

  // Pending (KPI7) looks at ALL of the technician's tasks, not just the
  // requested period: a task scheduled last month that's still open is still
  // pending today.
  const pending = tasks.filter((t) => t.scheduledDate <= asOfDate && !COMPLETED_STATUSES.has(t.status));

  const rejections = tasksInPeriod.reduce((sum, t) => sum + t.rejections.length, 0);

  const durations = tasksInPeriod
    .filter((t) => t.arrivalAt && t.departureAt)
    .map((t) => (new Date(t.departureAt!).getTime() - new Date(t.arrivalAt!).getTime()) / 60_000)
    .filter((minutes) => minutes >= 0);
  const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // MVP "active work days" proxy: distinct scheduledDate values in the
  // period. Not real attendance data — see docs/KPI_DEFINITIONS.md.
  const scheduledDays = new Set(tasksInPeriod.map((t) => t.scheduledDate)).size || 1;

  const guardCorrectivesCompleted = guardPerformances.reduce((sum, p) => sum + p.correctivesCompleted, 0);
  const guardUrgentCount = guardPerformances.reduce((sum, p) => sum + p.urgentCorrectivesCompleted, 0);

  return {
    technicianId,
    periodStart,
    periodEnd,
    completedTasks: completed.length,
    completedPreventive: completedPreventive.length,
    completedCorrective: completedCorrective.length,
    pendingTasks: pending.length,
    complianceRate: tasksInPeriod.length > 0 ? round1((completed.length / tasksInPeriod.length) * 100) : 0,
    preventiveComplianceRate:
      preventiveScheduled.length > 0 ? round1((completedPreventive.length / preventiveScheduled.length) * 100) : 0,
    rejections,
    averageTaskDurationMinutes: round1(averageDuration),
    dailyProductivity: round1(completed.length / scheduledDays),
    guardCorrectivesCompleted,
    guardUrgentCount,
    // Same figure as averageTaskDurationMinutes — the contract exposes both
    // names (TechnicianKpis is frozen), no distinct formula for this one yet.
    averageTimeInTaskMinutes: round1(averageDuration),
    tasksPerDay: round1(tasksInPeriod.length / scheduledDays),
  };
}
