import { afterAll, describe, expect, it } from "vitest";
import { CrewRole, TaskStatus } from "@/contracts";
import { taskPrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("taskPrismaRepository (real DB)", () => {
  describe("reads", () => {
    it("findById returns a seeded task with assignments and rejections attached", async () => {
      // P0303 (preventiveHistorical) is seeded with rejectionsCount: 2.
      const task = await taskPrismaRepository.findById("task-P0303");
      expect(task).not.toBeNull();
      expect(task!.assignments.length).toBeGreaterThanOrEqual(1);
      expect(task!.rejections).toHaveLength(2);
    });

    it("findById returns null for a nonexistent id", async () => {
      expect(await taskPrismaRepository.findById("task-does-not-exist")).toBeNull();
    });

    it("listByDate returns today's seeded tasks for the seed's reference date", async () => {
      const tasks = await taskPrismaRepository.listByDate("2026-08-18");
      expect(tasks.some((t) => t.id === "task-P0001")).toBe(true);
      expect(tasks.some((t) => t.id === "task-C0001")).toBe(true);
    });

    it("listByDate filters by zoneId", async () => {
      const tasks = await taskPrismaRepository.listByDate("2026-08-18", { zoneId: "zone-noa" });
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((t) => t.zoneId === "zone-noa")).toBe(true);
    });

    it("listByDate filters by technicianId", async () => {
      const tasks = await taskPrismaRepository.listByDate("2026-08-18", { technicianId: "tech-01" });
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((t) => t.assignments.some((a) => a.technicianId === "tech-01"))).toBe(true);
    });

    it("listByDate returns nothing for a date with no scheduled tasks", async () => {
      expect(await taskPrismaRepository.listByDate("2099-01-01")).toEqual([]);
    });

    it("listPending returns tasks scheduled on/before asOfDate that aren't completed/approved", async () => {
      const pending = await taskPrismaRepository.listPending("2026-08-18");
      expect(pending.some((t) => t.id === "task-P0201")).toBe(true); // preventivePastPending, status OPEN
      // no APPROVED/APPROVED_WITH_PENDING task should ever show up as pending
      expect(pending.every((t) => t.status !== TaskStatus.APPROVED && t.status !== TaskStatus.APPROVED_WITH_PENDING)).toBe(true);
    });

    it("listPending excludes tasks scheduled after asOfDate", async () => {
      const pending = await taskPrismaRepository.listPending("2026-08-18");
      // preventiveUpcoming tasks are scheduled 1+ days after the seed's reference date.
      expect(pending.some((t) => t.id === "task-P0101")).toBe(false);
    });
  });

  describe("mutations", () => {
    it("updateSchedule persists the new scheduledDate", async () => {
      const original = await taskPrismaRepository.findById("task-P0101");
      expect(original).not.toBeNull();

      const updated = await taskPrismaRepository.updateSchedule("task-P0101", "2026-09-01");
      expect(updated.scheduledDate).toBe("2026-09-01");

      const reFetched = await taskPrismaRepository.findById("task-P0101");
      expect(reFetched!.scheduledDate).toBe("2026-09-01");

      // restore
      await taskPrismaRepository.updateSchedule("task-P0101", original!.scheduledDate);
    });

    it("updateStatus persists the new status AND appends a TaskStatusHistory row", async () => {
      // task-C0104 is seeded with scheduledDate 2026-08-14 (clearly in the
      // past relative to whenever this test runs) — not a preventiveUpcoming
      // task like P01xx, whose scheduledDate can land in the *future*
      // relative to real wall-clock time and would make a freshly-inserted
      // `changedAt: now()` row sort BEFORE the seeded one.
      const original = await taskPrismaRepository.findById("task-C0104");
      const historyBefore = await prisma.taskStatusHistory.count({ where: { taskId: "task-C0104" } });

      const updated = await taskPrismaRepository.updateStatus("task-C0104", TaskStatus.IN_PROGRESS);
      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);

      const historyAfter = await prisma.taskStatusHistory.count({ where: { taskId: "task-C0104" } });
      expect(historyAfter).toBe(historyBefore + 1);

      const latestHistoryRow = await prisma.taskStatusHistory.findFirst({
        where: { taskId: "task-C0104" },
        orderBy: { changedAt: "desc" },
      });
      expect(latestHistoryRow?.status).toBe(TaskStatus.IN_PROGRESS);

      // restore
      await taskPrismaRepository.updateStatus("task-C0104", original!.status);
    });

    it("updateAssignments replaces the crew and the change is durable", async () => {
      const original = await taskPrismaRepository.findById("task-P0104");
      expect(original).not.toBeNull();

      const updated = await taskPrismaRepository.updateAssignments("task-P0104", [
        { technicianId: "tech-11", crewRole: CrewRole.PRIMARY },
      ]);
      expect(updated.assignments).toEqual([{ technicianId: "tech-11", crewRole: CrewRole.PRIMARY }]);

      const reFetched = await taskPrismaRepository.findById("task-P0104");
      expect(reFetched!.assignments).toEqual([{ technicianId: "tech-11", crewRole: CrewRole.PRIMARY }]);

      // restore
      await taskPrismaRepository.updateAssignments("task-P0104", original!.assignments);
    });

    it("updateAssignments rejects a duplicate technicianId in the same task and leaves the task unchanged (composite PK enforced by the DB)", async () => {
      const original = await taskPrismaRepository.findById("task-P0105");
      expect(original).not.toBeNull();

      await expect(
        taskPrismaRepository.updateAssignments("task-P0105", [
          { technicianId: "tech-10", crewRole: CrewRole.PRIMARY },
          { technicianId: "tech-10", crewRole: CrewRole.COLLABORATOR },
        ]),
      ).rejects.toThrow();

      // the failed write was inside a transaction — original assignments must still be intact.
      const reFetched = await taskPrismaRepository.findById("task-P0105");
      expect(reFetched!.assignments).toEqual(original!.assignments);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
