import { describe, expect, it } from "vitest";
import { TaskCriticality, TaskStatus, TaskType } from "@/contracts";
import { computeGuardPerformance } from "./guard-performance";
import { assignment, makeGuard, makeTask } from "./test-helpers";

describe("computeGuardPerformance", () => {
  const guard = makeGuard({
    technicianIds: ["tech-1", "tech-2"],
    zoneId: "zone-1",
    startAt: "2026-08-10T18:00:00.000Z",
    endAt: "2026-08-11T08:00:00.000Z",
  });

  it("counts a completed corrective whose arrival falls inside the guard interval", () => {
    const task = makeTask({
      type: TaskType.CORRECTIVE,
      status: TaskStatus.APPROVED,
      zoneId: "zone-1",
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T20:00:00.000Z",
      departureAt: "2026-08-10T21:00:00.000Z",
    });

    const performance = computeGuardPerformance(guard, [task]);

    expect(performance.correctivesCompleted).toBe(1);
    expect(performance.averageDurationMinutes).toBe(60);
  });

  it("does not use a fixed 'after 18:00' rule — a task outside [startAt, endAt] is excluded even if late", () => {
    const task = makeTask({
      type: TaskType.CORRECTIVE,
      status: TaskStatus.APPROVED,
      zoneId: "zone-1",
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T19:00:00.000Z", // after 18:00, but this guard starts later than that in the test below
      departureAt: "2026-08-10T20:00:00.000Z",
    });
    const laterStartingGuard = makeGuard({
      technicianIds: ["tech-1"],
      startAt: "2026-08-10T22:00:00.000Z",
      endAt: "2026-08-11T08:00:00.000Z",
    });

    const performance = computeGuardPerformance(laterStartingGuard, [task]);

    expect(performance.correctivesCompleted).toBe(0);
  });

  it("excludes tasks worked by a technician outside the guard crew", () => {
    const task = makeTask({
      type: TaskType.CORRECTIVE,
      status: TaskStatus.APPROVED,
      assignments: [assignment("tech-outsider")],
      arrivalAt: "2026-08-10T20:00:00.000Z",
      departureAt: "2026-08-10T21:00:00.000Z",
    });

    const performance = computeGuardPerformance(guard, [task]);

    expect(performance.correctivesCompleted).toBe(0);
  });

  it("excludes preventive tasks and non-completed tasks", () => {
    const preventive = makeTask({
      type: TaskType.PREVENTIVE,
      status: TaskStatus.APPROVED,
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T20:00:00.000Z",
      departureAt: "2026-08-10T21:00:00.000Z",
    });
    const notCompleted = makeTask({
      type: TaskType.CORRECTIVE,
      status: TaskStatus.IN_PROGRESS,
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T20:00:00.000Z",
      departureAt: null,
    });

    const performance = computeGuardPerformance(guard, [preventive, notCompleted]);

    expect(performance.correctivesCompleted).toBe(0);
  });

  it("counts urgent correctives separately", () => {
    const urgent = makeTask({
      type: TaskType.CORRECTIVE,
      criticality: TaskCriticality.URGENT,
      status: TaskStatus.APPROVED,
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T20:00:00.000Z",
      departureAt: "2026-08-10T20:30:00.000Z",
    });
    const normal = makeTask({
      type: TaskType.CORRECTIVE,
      criticality: TaskCriticality.NORMAL,
      status: TaskStatus.APPROVED,
      assignments: [assignment("tech-2")],
      arrivalAt: "2026-08-10T21:00:00.000Z",
      departureAt: "2026-08-10T21:45:00.000Z",
    });

    const performance = computeGuardPerformance(guard, [urgent, normal]);

    expect(performance.correctivesCompleted).toBe(2);
    expect(performance.urgentCorrectivesCompleted).toBe(1);
  });

  it("returns 0 average duration instead of NaN when there are no matching tasks", () => {
    const performance = computeGuardPerformance(guard, []);

    expect(performance.correctivesCompleted).toBe(0);
    expect(performance.averageDurationMinutes).toBe(0);
  });
});
