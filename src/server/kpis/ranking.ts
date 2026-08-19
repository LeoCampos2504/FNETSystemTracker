import type { TechnicianKpis, TechnicianRankingEntry } from "@/contracts";
import type { TechnicianKpisWithoutRanking } from "./technician-kpis";

/**
 * KPI11 — no secret scoring formula for the prototype: rank by completed
 * tasks desc, ties broken by technicianId for a stable order.
 */
export function assignRanking(kpisList: TechnicianKpisWithoutRanking[]): TechnicianKpis[] {
  const sorted = [...kpisList].sort(
    (a, b) => b.completedTasks - a.completedTasks || a.technicianId.localeCompare(b.technicianId),
  );
  const rankByTechnicianId = new Map(sorted.map((kpi, index) => [kpi.technicianId, index + 1]));
  return kpisList.map((kpi) => ({ ...kpi, ranking: rankByTechnicianId.get(kpi.technicianId)! }));
}

export function toRankingEntries(kpisList: TechnicianKpis[]): TechnicianRankingEntry[] {
  return [...kpisList]
    .sort((a, b) => a.ranking - b.ranking)
    .map((kpi) => ({
      technicianId: kpi.technicianId,
      rank: kpi.ranking,
      completedTasks: kpi.completedTasks,
      complianceRate: kpi.complianceRate,
    }));
}
