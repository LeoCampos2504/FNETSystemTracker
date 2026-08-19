import { describe, expect, it } from "vitest";
import { CrewRole, TaskStatus, TaskType } from "@/contracts";
import { computeTechnicianKpis } from "./technician-kpis";
import { assignment, makeTask, rejection } from "./test-helpers";

const PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-31" };

describe("computeTechnicianKpis", () => {
  it("a task with two technicians counts +1 completed for each of them", () => {
    const task = makeTask({
      status: TaskStatus.APPROVED,
      assignments: [assignment("tech-juan", CrewRole.PRIMARY), assignment("tech-pedro", CrewRole.COLLABORATOR)],
    });

    const juan = computeTechnicianKpis({
      technicianId: "tech-juan",
      tasks: [task],
      guardPerformances: [],
      ...PERIOD,
    });
    const pedro = computeTechnicianKpis({
      technicianId: "tech-pedro",
      tasks: [task],
      guardPerformances: [],
      ...PERIOD,
    });

    expect(juan.completedTasks).toBe(1);
    expect(pedro.completedTasks).toBe(1);
  });

  it("a single-technician task (exception crew) still counts as completed", () => {
    const task = makeTask({ status: TaskStatus.APPROVED, assignments: [assignment("tech-solo")] });

    const result = computeTechnicianKpis({
      technicianId: "tech-solo",
      tasks: [task],
      guardPerformances: [],
      ...PERIOD,
    });

    expect(result.completedTasks).toBe(1);
  });

  it("computes duration from arrivalAt/departureAt when both are present", () => {
    const task = makeTask({
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T09:00:00.000Z",
      departureAt: "2026-08-10T10:30:00.000Z",
    });

    const result = computeTechnicianKpis({ technicianId: "tech-1", tasks: [task], guardPerformances: [], ...PERIOD });

    expect(result.averageTaskDurationMinutes).toBe(90);
    expect(result.averageTimeInTaskMinutes).toBe(90);
  });

  it("ignores tasks missing arrivalAt or departureAt when averaging duration", () => {
    const withDuration = makeTask({
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-10T09:00:00.000Z",
      departureAt: "2026-08-10T10:00:00.000Z",
    });
    const missingDeparture = makeTask({
      assignments: [assignment("tech-1")],
      arrivalAt: "2026-08-11T09:00:00.000Z",
      departureAt: null,
    });
    const missingBoth = makeTask({ assignments: [assignment("tech-1")], arrivalAt: null, departureAt: null });

    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [withDuration, missingDeparture, missingBoth],
      guardPerformances: [],
      ...PERIOD,
    });

    // Only `withDuration` (60 minutes) should be averaged in.
    expect(result.averageTaskDurationMinutes).toBe(60);
  });

  it("counts a single rejection event", () => {
    const task = makeTask({
      assignments: [assignment("tech-1")],
      rejections: [rejection({ taskId: "t" })],
    });

    const result = computeTechnicianKpis({ technicianId: "tech-1", tasks: [task], guardPerformances: [], ...PERIOD });

    expect(result.rejections).toBe(1);
  });

  it("counts repeated rejections on the same task as separate events (rejected -> corrected -> rejected -> approved => 2)", () => {
    const task = makeTask({
      assignments: [assignment("tech-1")],
      status: TaskStatus.APPROVED,
      rejections: [
        rejection({ taskId: "t", rejectedAt: "2026-08-02T10:00:00.000Z" }),
        rejection({ taskId: "t", rejectedAt: "2026-08-05T10:00:00.000Z" }),
      ],
    });

    const result = computeTechnicianKpis({ technicianId: "tech-1", tasks: [task], guardPerformances: [], ...PERIOD });

    expect(result.rejections).toBe(2);
  });

  it("computes compliance as completed scheduled tasks / scheduled tasks * 100", () => {
    const completed = makeTask({ assignments: [assignment("tech-1")], status: TaskStatus.APPROVED });
    const notCompleted = makeTask({ assignments: [assignment("tech-1")], status: TaskStatus.OPEN });

    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [completed, notCompleted],
      guardPerformances: [],
      ...PERIOD,
    });

    expect(result.complianceRate).toBe(50);
  });

  it("returns 0% compliance instead of dividing by zero when there are no scheduled tasks in the period", () => {
    const result = computeTechnicianKpis({ technicianId: "tech-1", tasks: [], guardPerformances: [], ...PERIOD });

    expect(result.complianceRate).toBe(0);
    expect(result.preventiveComplianceRate).toBe(0);
  });

  it("separates preventive and corrective completed counts", () => {
    const preventive = makeTask({
      assignments: [assignment("tech-1")],
      type: TaskType.PREVENTIVE,
      status: TaskStatus.APPROVED,
    });
    const corrective = makeTask({
      assignments: [assignment("tech-1")],
      type: TaskType.CORRECTIVE,
      status: TaskStatus.APPROVED,
    });

    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [preventive, corrective],
      guardPerformances: [],
      ...PERIOD,
    });

    expect(result.completedPreventive).toBe(1);
    expect(result.completedCorrective).toBe(1);
    expect(result.completedTasks).toBe(2);
  });

  it("counts pending tasks as scheduledDate <= asOfDate and not completed/approved", () => {
    const overdueOpen = makeTask({
      assignments: [assignment("tech-1")],
      status: TaskStatus.OPEN,
      scheduledDate: "2026-08-05",
    });
    const overdueApproved = makeTask({
      assignments: [assignment("tech-1")],
      status: TaskStatus.APPROVED,
      scheduledDate: "2026-08-05",
    });
    const futureOpen = makeTask({
      assignments: [assignment("tech-1")],
      status: TaskStatus.OPEN,
      scheduledDate: "2026-09-05",
    });

    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [overdueOpen, overdueApproved, futureOpen],
      guardPerformances: [],
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOfDate: "2026-08-18",
    });

    expect(result.pendingTasks).toBe(1);
  });

  it("only counts tasks whose scheduledDate falls inside [periodStart, periodEnd]", () => {
    const inRange = makeTask({ assignments: [assignment("tech-1")], scheduledDate: "2026-08-15" });
    const beforeRange = makeTask({ assignments: [assignment("tech-1")], scheduledDate: "2026-07-31" });
    const afterRange = makeTask({ assignments: [assignment("tech-1")], scheduledDate: "2026-09-01" });

    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [inRange, beforeRange, afterRange],
      guardPerformances: [],
      ...PERIOD,
    });

    expect(result.completedTasks).toBe(1);
  });

  it("sums guardCorrectivesCompleted and guardUrgentCount from the supplied guard performances", () => {
    const result = computeTechnicianKpis({
      technicianId: "tech-1",
      tasks: [],
      guardPerformances: [
        { guardId: "g1", correctivesCompleted: 2, urgentCorrectivesCompleted: 1, averageDurationMinutes: 60 },
        { guardId: "g2", correctivesCompleted: 3, urgentCorrectivesCompleted: 0, averageDurationMinutes: 45 },
      ],
      ...PERIOD,
    });

    expect(result.guardCorrectivesCompleted).toBe(5);
    expect(result.guardUrgentCount).toBe(1);
  });
});
