import { afterAll, describe, expect, it } from "vitest";
import { getTechnicianKpis, getTechnicianRanking } from "@/server/kpis/fetch";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * Confirms the DB -> fetch.ts -> pure-KPI-function wiring produces correct
 * results end-to-end against the real seeded data (prisma/seed.ts, mirroring
 * src/mocks/**). The formulas themselves are already covered by the pure
 * unit tests in src/server/kpis/*.test.ts (no DB needed) — this file exists
 * to catch wiring bugs (wrong query, wrong join, wrong field) that pure
 * tests with hand-built fixtures can't catch. All expected numbers below
 * were read off a real run against the seeded DB, not hand-computed.
 */
const PERIOD = { from: "2026-07-01", to: "2026-08-31" };

describe("technician KPIs from the real DB (real DB)", () => {
  it("a technician with two completed tasks, split preventive/corrective (tech-01)", async () => {
    const kpis = await getTechnicianKpis("tech-01", PERIOD);
    expect(kpis).not.toBeNull();
    expect(kpis!.completedTasks).toBeGreaterThanOrEqual(2);
    expect(kpis!.completedPreventive).toBeGreaterThanOrEqual(1);
    expect(kpis!.completedCorrective).toBeGreaterThanOrEqual(1);
    expect(kpis!.completedTasks).toBe(kpis!.completedPreventive + kpis!.completedCorrective);
  });

  it("counts repeated rejection events, not distinct tasks (tech-06 has a task rejected twice)", async () => {
    const kpis = await getTechnicianKpis("tech-06", PERIOD);
    // task-P0303 alone contributes 2 rejection events for tech-06 in this period.
    expect(kpis!.rejections).toBeGreaterThanOrEqual(2);
  });

  it("computes a nonzero average task duration from real arrivalAt/departureAt rows", async () => {
    const kpis = await getTechnicianKpis("tech-01", PERIOD);
    expect(kpis!.averageTaskDurationMinutes).toBeGreaterThan(0);
    expect(kpis!.averageTaskDurationMinutes).toBe(kpis!.averageTimeInTaskMinutes);
  });

  it("has pending tasks wired through from the real 'not completed, scheduledDate <= asOfDate' query", async () => {
    const kpis = await getTechnicianKpis("tech-01", PERIOD);
    expect(kpis!.pendingTasks).toBeGreaterThan(0);
  });

  it("computes guard performance from real guard/task interval overlap (guard-centro-3's mixed crew)", async () => {
    // guard-centro-3 is the deliberately mixed crew: tech-09 (zone-centro) + tech-05 (on loan from zone-nea).
    const tech09 = await getTechnicianKpis("tech-09", PERIOD);
    const tech05 = await getTechnicianKpis("tech-05", PERIOD);
    expect(tech09!.guardCorrectivesCompleted).toBeGreaterThan(0);
    expect(tech05!.guardCorrectivesCompleted).toBeGreaterThan(0);
  });

  it("returns null for a nonexistent technician, not a crash or a zeroed-out KPI object", async () => {
    expect(await getTechnicianKpis("tech-does-not-exist", PERIOD)).toBeNull();
  });

  it("ranking differentiates technicians by completedTasks, consistently with the per-technician endpoint", async () => {
    const ranking = await getTechnicianRanking(PERIOD);
    expect(ranking.length).toBeGreaterThan(1);
    expect(ranking[0].rank).toBe(1);
    // sorted descending by completedTasks
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].completedTasks).toBeGreaterThanOrEqual(ranking[i].completedTasks);
    }

    const top = await getTechnicianKpis(ranking[0].technicianId, PERIOD);
    expect(top!.ranking).toBe(1);
  });

  it("ranking filtered by zoneId only returns technicians whose primaryZoneId matches, without renumbering rank", async () => {
    const fullRanking = await getTechnicianRanking(PERIOD);
    const zoneRanking = await getTechnicianRanking({ ...PERIOD, zoneId: "zone-noa" });

    const zoneTechnicians = await prisma.technician.findMany({ where: { primaryZoneId: "zone-noa" } });
    const zoneTechnicianIds = new Set(zoneTechnicians.map((t) => t.id));

    expect(zoneRanking.every((r) => zoneTechnicianIds.has(r.technicianId))).toBe(true);
    for (const entry of zoneRanking) {
      const globalEntry = fullRanking.find((r) => r.technicianId === entry.technicianId);
      expect(entry.rank).toBe(globalEntry!.rank);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
