import { describe, expect, it } from "vitest";
import { TaskCriticality, TaskType } from "@/contracts";
import {
  mockCoordinators,
  mockGuards,
  mockNotifications,
  mockQuotes,
  mockSites,
  mockTasks,
  mockTechnicianKpis,
  mockTechnicianRanking,
  mockTechnicians,
  mockUsers,
  mockVehicles,
  mockZones,
} from "@/mocks";

describe("mock data shape and coverage", () => {
  it("has the expected organizational scale", () => {
    expect(mockZones.length).toBe(5);
    expect(mockCoordinators.length).toBe(3);
    expect(mockTechnicians.length).toBeGreaterThanOrEqual(12);
    expect(mockSites.length).toBeGreaterThanOrEqual(15);
    expect(mockVehicles.length).toBeGreaterThan(0);
  });

  it("has 30+ preventive and 15+ corrective tasks, with urgent correctives", () => {
    const preventive = mockTasks.filter((t) => t.type === TaskType.PREVENTIVE);
    const corrective = mockTasks.filter((t) => t.type === TaskType.CORRECTIVE);
    const urgentCorrective = corrective.filter((t) => t.criticality === TaskCriticality.URGENT);

    expect(preventive.length).toBeGreaterThanOrEqual(30);
    expect(corrective.length).toBeGreaterThanOrEqual(15);
    expect(urgentCorrective.length).toBeGreaterThanOrEqual(3);
  });

  it("every task has at least one assignment and a valid site/zone", () => {
    const siteIds = new Set(mockSites.map((s) => s.id));
    const zoneIds = new Set(mockZones.map((z) => z.id));

    for (const task of mockTasks) {
      expect(task.assignments.length).toBeGreaterThanOrEqual(1);
      expect(siteIds.has(task.siteId)).toBe(true);
      expect(zoneIds.has(task.zoneId)).toBe(true);
    }
  });

  it("has tasks with multiple rejection events", () => {
    const rejectionCounts = mockTasks.map((t) => t.rejections.length);
    const tasksWithRejections = rejectionCounts.filter((n) => n > 0);
    const tasksWithMultipleRejections = rejectionCounts.filter((n) => n >= 2);

    expect(tasksWithRejections.length).toBeGreaterThanOrEqual(3);
    expect(tasksWithMultipleRejections.length).toBeGreaterThanOrEqual(1);
  });

  it("covers 4 weeks of guards per zone", () => {
    for (const zone of mockZones) {
      const zoneGuards = mockGuards.filter((g) => g.zoneId === zone.id);
      expect(zoneGuards.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("has a technician KPI record and ranking entry for every technician", () => {
    expect(mockTechnicianKpis.length).toBe(mockTechnicians.length);
    expect(mockTechnicianRanking.length).toBe(mockTechnicians.length);

    const rankSet = new Set(mockTechnicianRanking.map((r) => r.rank));
    expect(rankSet.size).toBe(mockTechnicians.length);
  });

  it("has quotes and notifications", () => {
    expect(mockQuotes.length).toBeGreaterThan(0);
    expect(mockNotifications.length).toBeGreaterThan(0);
  });

  it("every user has a unique email", () => {
    const emails = mockUsers.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
