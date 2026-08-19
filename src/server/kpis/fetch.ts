import type { TechnicianKpis, TechnicianRankingEntry } from "@/contracts";
import { prisma } from "@/server/repositories/prisma/client";
import { guardInclude, mapGuard, mapTask, taskInclude } from "@/server/repositories/prisma/mappers";
import { computeGuardPerformance } from "./guard-performance";
import { computeTechnicianKpis } from "./technician-kpis";
import { assignRanking } from "./ranking";
import { resolveDefaultPeriod } from "./period";

export interface KpiPeriodParams {
  from?: string;
  to?: string;
}

function resolvePeriod(params: KpiPeriodParams): { periodStart: string; periodEnd: string } {
  if (params.from && params.to) return { periodStart: params.from, periodEnd: params.to };
  if (params.from && !params.to) return { periodStart: params.from, periodEnd: params.from };
  return resolveDefaultPeriod();
}

async function loadGuardPerformancesByTechnician(
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, ReturnType<typeof computeGuardPerformance>[]>> {
  const guardRows = await prisma.guard.findMany({
    where: {
      startAt: { lte: new Date(`${periodEnd}T23:59:59.999Z`) },
      endAt: { gte: new Date(`${periodStart}T00:00:00.000Z`) },
    },
    include: guardInclude,
  });
  const guards = guardRows.map(mapGuard);
  if (guards.length === 0) return new Map();

  const zoneIds = [...new Set(guards.map((g) => g.zoneId))];
  const zoneTaskRows = await prisma.task.findMany({ where: { zoneId: { in: zoneIds } }, include: taskInclude });
  const zoneTasks = zoneTaskRows.map(mapTask);
  const zoneTasksByZoneId = new Map<string, typeof zoneTasks>();
  for (const task of zoneTasks) {
    const bucket = zoneTasksByZoneId.get(task.zoneId) ?? [];
    bucket.push(task);
    zoneTasksByZoneId.set(task.zoneId, bucket);
  }

  const performanceByTechnicianId = new Map<string, ReturnType<typeof computeGuardPerformance>[]>();
  for (const guard of guards) {
    const performance = computeGuardPerformance(guard, zoneTasksByZoneId.get(guard.zoneId) ?? []);
    for (const technicianId of guard.technicianIds) {
      const bucket = performanceByTechnicianId.get(technicianId) ?? [];
      bucket.push(performance);
      performanceByTechnicianId.set(technicianId, bucket);
    }
  }
  return performanceByTechnicianId;
}

/**
 * Computes KPIs for every technician over the same period, so ranking (KPI11)
 * is always comparing like with like. Used by both the single-technician and
 * the ranking endpoints.
 */
export async function computeAllTechnicianKpis(params: KpiPeriodParams = {}): Promise<TechnicianKpis[]> {
  const { periodStart, periodEnd } = resolvePeriod(params);

  const [technicians, taskRows, guardPerformancesByTechnician] = await Promise.all([
    prisma.technician.findMany(),
    prisma.task.findMany({ include: taskInclude }),
    loadGuardPerformancesByTechnician(periodStart, periodEnd),
  ]);

  const tasks = taskRows.map(mapTask);
  const tasksByTechnicianId = new Map<string, typeof tasks>();
  for (const task of tasks) {
    for (const assignment of task.assignments) {
      const bucket = tasksByTechnicianId.get(assignment.technicianId) ?? [];
      bucket.push(task);
      tasksByTechnicianId.set(assignment.technicianId, bucket);
    }
  }

  const kpisWithoutRanking = technicians.map((technician) =>
    computeTechnicianKpis({
      technicianId: technician.id,
      tasks: tasksByTechnicianId.get(technician.id) ?? [],
      guardPerformances: guardPerformancesByTechnician.get(technician.id) ?? [],
      periodStart,
      periodEnd,
    }),
  );

  return assignRanking(kpisWithoutRanking);
}

export async function getTechnicianKpis(
  technicianId: string,
  params: KpiPeriodParams = {},
): Promise<TechnicianKpis | null> {
  const technician = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!technician) return null;

  const allKpis = await computeAllTechnicianKpis(params);
  return allKpis.find((kpi) => kpi.technicianId === technicianId) ?? null;
}

/**
 * Matches mock-api's behavior exactly: rank is computed across ALL
 * technicians first, then the list is filtered down to the requested zone
 * (by primary zone) without recomputing rank numbers.
 */
export async function getTechnicianRanking(
  params: KpiPeriodParams & { zoneId?: string },
): Promise<TechnicianRankingEntry[]> {
  const allKpis = await computeAllTechnicianKpis(params);
  const sorted = [...allKpis].sort((a, b) => a.ranking - b.ranking);

  let allowedTechnicianIds: Set<string> | null = null;
  if (params.zoneId) {
    const zoneTechnicians = await prisma.technician.findMany({ where: { primaryZoneId: params.zoneId } });
    allowedTechnicianIds = new Set(zoneTechnicians.map((t) => t.id));
  }

  return sorted
    .filter((kpi) => !allowedTechnicianIds || allowedTechnicianIds.has(kpi.technicianId))
    .map((kpi) => ({
      technicianId: kpi.technicianId,
      rank: kpi.ranking,
      completedTasks: kpi.completedTasks,
      complianceRate: kpi.complianceRate,
    }));
}
