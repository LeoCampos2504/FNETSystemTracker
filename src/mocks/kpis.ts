import type { TechnicianKpis, TechnicianRankingEntry } from "@/contracts";
import { TaskStatus, TaskType } from "@/contracts";
import { mockTasks } from "./tasks";
import { mockTechnicians } from "./technicians";
import { mockGuards, mockGuardPerformances } from "./guards";
import { MOCK_TODAY, toDateString } from "./constants";

const COMPLETED_STATUSES = new Set<string>([TaskStatus.APPROVED, TaskStatus.APPROVED_WITH_PENDING]);
const periodStart = "2026-08-01";
const periodEnd = "2026-08-31";
const todayStr = toDateString(MOCK_TODAY);

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Derived from `mockTasks`/`mockGuards` so the numbers stay consistent with
 * the rest of the demo data. Real KPI computation is owned by Gino under
 * `src/server/kpis/**` and does not have to reuse this logic.
 */
const provisionalKpis: Omit<TechnicianKpis, "ranking">[] = mockTechnicians.map((technician) => {
  const tasksForTech = mockTasks.filter((task) =>
    task.assignments.some((a) => a.technicianId === technician.id),
  );
  const completed = tasksForTech.filter((t) => COMPLETED_STATUSES.has(t.status));
  const completedPreventive = completed.filter((t) => t.type === TaskType.PREVENTIVE);
  const completedCorrective = completed.filter((t) => t.type === TaskType.CORRECTIVE);
  const preventiveScheduled = tasksForTech.filter((t) => t.type === TaskType.PREVENTIVE);
  const pending = tasksForTech.filter(
    (t) => t.scheduledDate <= todayStr && !COMPLETED_STATUSES.has(t.status),
  );
  const rejections = tasksForTech.reduce((sum, t) => sum + t.rejections.length, 0);

  const durations = tasksForTech
    .filter((t) => t.arrivalAt && t.departureAt)
    .map((t) => (new Date(t.departureAt!).getTime() - new Date(t.arrivalAt!).getTime()) / 60_000);
  const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const scheduledDays = new Set(tasksForTech.map((t) => t.scheduledDate)).size || 1;

  const guardsForTech = mockGuards.filter((g) => g.technicianIds.includes(technician.id));
  const guardPerf = mockGuardPerformances.filter((p) => guardsForTech.some((g) => g.id === p.guardId));
  const guardCorrectivesCompleted = guardPerf.reduce((sum, p) => sum + p.correctivesCompleted, 0);
  const guardUrgentCount = guardPerf.reduce((sum, p) => sum + p.urgentCorrectivesCompleted, 0);

  return {
    technicianId: technician.id,
    periodStart,
    periodEnd,
    completedTasks: completed.length,
    completedPreventive: completedPreventive.length,
    completedCorrective: completedCorrective.length,
    pendingTasks: pending.length,
    complianceRate: tasksForTech.length > 0 ? round((completed.length / tasksForTech.length) * 100) : 0,
    preventiveComplianceRate:
      preventiveScheduled.length > 0 ? round((completedPreventive.length / preventiveScheduled.length) * 100) : 0,
    rejections,
    averageTaskDurationMinutes: round(averageDuration),
    dailyProductivity: round(completed.length / scheduledDays),
    guardCorrectivesCompleted,
    guardUrgentCount,
    averageTimeInTaskMinutes: round(averageDuration),
    tasksPerDay: round(tasksForTech.length / scheduledDays),
  };
});

const rankByTechnicianId = new Map(
  [...provisionalKpis]
    .sort((a, b) => b.completedTasks - a.completedTasks || a.technicianId.localeCompare(b.technicianId))
    .map((kpi, index) => [kpi.technicianId, index + 1]),
);

export const mockTechnicianKpis: TechnicianKpis[] = provisionalKpis.map((kpi) => ({
  ...kpi,
  ranking: rankByTechnicianId.get(kpi.technicianId)!,
}));

export const mockTechnicianRanking: TechnicianRankingEntry[] = [...mockTechnicianKpis]
  .sort((a, b) => a.ranking - b.ranking)
  .map((kpi) => ({
    technicianId: kpi.technicianId,
    rank: kpi.ranking,
    completedTasks: kpi.completedTasks,
    complianceRate: kpi.complianceRate,
  }));
