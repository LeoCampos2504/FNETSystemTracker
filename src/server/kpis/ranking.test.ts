import { describe, expect, it } from "vitest";
import { assignRanking, toRankingEntries } from "./ranking";
import type { TechnicianKpisWithoutRanking } from "./technician-kpis";

function kpi(overrides: Partial<TechnicianKpisWithoutRanking> & { technicianId: string }): TechnicianKpisWithoutRanking {
  return {
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    completedTasks: 0,
    completedPreventive: 0,
    completedCorrective: 0,
    pendingTasks: 0,
    complianceRate: 0,
    preventiveComplianceRate: 0,
    rejections: 0,
    averageTaskDurationMinutes: 0,
    dailyProductivity: 0,
    guardCorrectivesCompleted: 0,
    guardUrgentCount: 0,
    averageTimeInTaskMinutes: 0,
    tasksPerDay: 0,
    ...overrides,
  };
}

describe("assignRanking", () => {
  it("ranks technicians by completed tasks, descending", () => {
    const ranked = assignRanking([
      kpi({ technicianId: "low", completedTasks: 2 }),
      kpi({ technicianId: "high", completedTasks: 10 }),
      kpi({ technicianId: "mid", completedTasks: 5 }),
    ]);

    const byId = Object.fromEntries(ranked.map((k) => [k.technicianId, k.ranking]));
    expect(byId.high).toBe(1);
    expect(byId.mid).toBe(2);
    expect(byId.low).toBe(3);
  });

  it("breaks ties by technicianId for a stable order", () => {
    const ranked = assignRanking([
      kpi({ technicianId: "tech-b", completedTasks: 3 }),
      kpi({ technicianId: "tech-a", completedTasks: 3 }),
    ]);

    const byId = Object.fromEntries(ranked.map((k) => [k.technicianId, k.ranking]));
    expect(byId["tech-a"]).toBe(1);
    expect(byId["tech-b"]).toBe(2);
  });

  it("toRankingEntries carries rank, completedTasks and complianceRate in rank order", () => {
    const ranked = assignRanking([
      kpi({ technicianId: "a", completedTasks: 1, complianceRate: 50 }),
      kpi({ technicianId: "b", completedTasks: 4, complianceRate: 80 }),
    ]);

    const entries = toRankingEntries(ranked);

    expect(entries).toEqual([
      { technicianId: "b", rank: 1, completedTasks: 4, complianceRate: 80 },
      { technicianId: "a", rank: 2, completedTasks: 1, complianceRate: 50 },
    ]);
  });
});
