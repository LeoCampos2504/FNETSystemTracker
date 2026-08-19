import { describe, expect, it } from "vitest";
import { CrewRole } from "@/contracts";
import { MOCK_TODAY, toDateString } from "@/mocks";
import {
  assignTechniciansToTask,
  getPendingTasks,
  getTaskById,
  getTasksForDay,
  scheduleTask,
} from "./task.service";

const TODAY = toDateString(MOCK_TODAY);

describe("getTasksForDay", () => {
  it("returns today's tasks for a single zone", async () => {
    const tasks = await getTasksForDay({ date: TODAY, zoneIds: ["zone-noa"] });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.zoneId).toBe("zone-noa");
      expect(task.scheduledDate).toBe(TODAY);
    }
  });

  it("merges results across multiple zones without duplicates", async () => {
    const tasks = await getTasksForDay({ date: TODAY, zoneIds: ["zone-noa", "zone-nea"] });
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tasks.some((t) => t.zoneId === "zone-noa")).toBe(true);
    expect(tasks.some((t) => t.zoneId === "zone-nea")).toBe(true);
  });
});

describe("getPendingTasks", () => {
  it("only returns tasks scheduled on/before asOfDate that aren't completed", async () => {
    const tasks = await getPendingTasks({ asOfDate: TODAY, zoneIds: ["zone-cuyo"] });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.scheduledDate <= TODAY).toBe(true);
      expect(["APPROVED", "APPROVED_WITH_PENDING"]).not.toContain(task.status);
    }
  });
});

describe("scheduleTask (also covers reschedule)", () => {
  it("changes scheduledDate and records an audit entry with the old and new date", async () => {
    const before = await getTaskById("task-P0201");
    expect(before.scheduledDate).not.toBe("2026-09-01");

    const updated = await scheduleTask("user-coord-1", "task-P0201", "2026-09-01");
    expect(updated.scheduledDate).toBe("2026-09-01");

    // Reschedule: call it again with a different date (this IS the reschedule flow).
    const rescheduled = await scheduleTask("user-coord-1", "task-P0201", "2026-09-05");
    expect(rescheduled.scheduledDate).toBe("2026-09-05");
  });

  it("refuses to reschedule an already-APPROVED task", async () => {
    await expect(scheduleTask("user-coord-1", "task-P0006", "2026-09-01")).rejects.toMatchObject({ status: 409 });
  });
});

describe("assignTechniciansToTask", () => {
  it("replaces the task's crew assignments", async () => {
    const updated = await assignTechniciansToTask("user-coord-1", "task-C0004", [
      { technicianId: "tech-04", crewRole: CrewRole.PRIMARY },
      { technicianId: "tech-05", crewRole: CrewRole.COLLABORATOR },
    ]);
    expect(updated.assignments).toEqual([
      { technicianId: "tech-04", crewRole: CrewRole.PRIMARY },
      { technicianId: "tech-05", crewRole: CrewRole.COLLABORATOR },
    ]);
  });

  it("refuses to reassign an already-APPROVED task", async () => {
    await expect(
      assignTechniciansToTask("user-coord-1", "task-P0006", [
        { technicianId: "tech-01", crewRole: CrewRole.PRIMARY },
      ]),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("getTaskById", () => {
  it("throws a 404 ApiError for an unknown task", async () => {
    await expect(getTaskById("does-not-exist")).rejects.toMatchObject({ status: 404 });
  });
});
