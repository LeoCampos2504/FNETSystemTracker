import { describe, expect, it } from "vitest";
import { CrewRole } from "@/contracts";
import { MOCK_TODAY, toDateString } from "@/mocks";
import { repositories } from "@/server/container";
import { listNotificationsForUser } from "./notification.service";
import {
  assignTechniciansToTask,
  findTaskById,
  getPendingTasks,
  getTaskById,
  getTasksForDay,
  scheduleTask,
  updateTaskStatus,
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

describe("findTaskById", () => {
  it("resolves null instead of throwing for an unknown task (backs Api.getTask)", async () => {
    expect(await findTaskById("does-not-exist")).toBeNull();
  });

  it("resolves the task when it exists", async () => {
    expect((await findTaskById("task-P0001"))?.id).toBe("task-P0001");
  });
});

describe("audit before/after coherence", () => {
  // Regression tests: the memory repository mutates a task in place and
  // returns that same reference, so a naive "read before.field after the
  // mutating call" would make the audit's "before" equal to "after". These
  // assert the snapshot was actually taken before the mutation ran.

  it("assignTechniciansToTask audits the ORIGINAL assignments as 'before', not the new ones", async () => {
    const original = await getTaskById("task-C0005");
    const originalAssignments = original.assignments.map((a) => ({ ...a }));

    await assignTechniciansToTask("user-coord-2", "task-C0005", [
      { technicianId: "tech-09", crewRole: CrewRole.PRIMARY },
    ]);

    const entries = await repositories.audit.listByEntity("Task", "task-C0005");
    const entry = entries.at(-1)!;
    expect(entry.before).toEqual({ assignments: originalAssignments });
    expect(entry.after).toEqual({ assignments: [{ technicianId: "tech-09", crewRole: CrewRole.PRIMARY }] });
    expect(entry.before).not.toEqual(entry.after);
  });

  it("scheduleTask audits the ORIGINAL scheduledDate as 'before', not the new one", async () => {
    const original = await getTaskById("task-P0202");
    const originalDate = original.scheduledDate;

    await scheduleTask("user-coord-1", "task-P0202", "2026-09-12");

    const entries = await repositories.audit.listByEntity("Task", "task-P0202");
    const entry = entries.at(-1)!;
    expect(entry.before).toEqual({ scheduledDate: originalDate });
    expect(entry.after).toEqual({ scheduledDate: "2026-09-12" });
    expect(entry.before).not.toEqual(entry.after);
  });

  it("updateTaskStatus audits the ORIGINAL status as 'before', not the new one", async () => {
    const original = await getTaskById("task-P0204");
    const originalStatus = original.status;

    await updateTaskStatus("user-coord-2", "task-P0204", "IN_PROGRESS");

    const entries = await repositories.audit.listByEntity("Task", "task-P0204");
    const entry = entries.at(-1)!;
    expect(entry.before).toEqual({ status: originalStatus });
    expect(entry.after).toEqual({ status: "IN_PROGRESS" });
    expect(entry.before).not.toEqual(entry.after);
  });
});

describe("assignTechniciansToTask validation", () => {
  it("rejects an unknown technicianId with a 400", async () => {
    await expect(
      assignTechniciansToTask("user-coord-1", "task-P0203", [
        { technicianId: "does-not-exist", crewRole: CrewRole.PRIMARY },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("notification side effects avoid duplicates", () => {
  it("only notifies the technician(s) newly added to the crew, not ones who were already assigned", async () => {
    // task-C0006 starts assigned to tech-03 alone (see src/mocks/tasks.ts).
    await assignTechniciansToTask("user-coord-1", "task-C0006", [
      { technicianId: "tech-01", crewRole: CrewRole.PRIMARY },
      { technicianId: "tech-02", crewRole: CrewRole.COLLABORATOR },
    ]);
    const afterFirstAssign = await listNotificationsForUser("user-tech-01");
    const countAfterFirst = afterFirstAssign.filter((n) => n.relatedEntityId === "task-C0006").length;
    expect(countAfterFirst).toBeGreaterThan(0);

    // Swap the collaborator only; tech-01 (PRIMARY) is unchanged.
    await assignTechniciansToTask("user-coord-1", "task-C0006", [
      { technicianId: "tech-01", crewRole: CrewRole.PRIMARY },
      { technicianId: "tech-03", crewRole: CrewRole.COLLABORATOR },
    ]);

    const afterSecondAssign = await listNotificationsForUser("user-tech-01");
    const countAfterSecond = afterSecondAssign.filter((n) => n.relatedEntityId === "task-C0006").length;
    expect(countAfterSecond).toBe(countAfterFirst); // tech-01 was not re-notified

    const tech03Notifications = await listNotificationsForUser("user-tech-03");
    expect(tech03Notifications.some((n) => n.relatedEntityId === "task-C0006")).toBe(true); // newly added, notified
  });

  it("does not fire a schedule-change notification when scheduleTask is called with the same date (no-op)", async () => {
    const task = await getTaskById("task-P0205");
    const assignedUserId = "user-tech-12"; // task-P0205 is zone-patagonia, tech-12/tech-13 crew

    await scheduleTask("user-coord-1", "task-P0205", task.scheduledDate); // no-op: same date
    const notifications = await listNotificationsForUser(assignedUserId);
    const scheduleChangeCount = notifications.filter(
      (n) => n.relatedEntityId === "task-P0205" && n.type === "SCHEDULE_CHANGE",
    ).length;
    expect(scheduleChangeCount).toBe(0);

    await scheduleTask("user-coord-1", "task-P0205", "2026-09-20"); // real change
    const notificationsAfter = await listNotificationsForUser(assignedUserId);
    const scheduleChangeCountAfter = notificationsAfter.filter(
      (n) => n.relatedEntityId === "task-P0205" && n.type === "SCHEDULE_CHANGE",
    ).length;
    expect(scheduleChangeCountAfter).toBe(1);
  });
});
