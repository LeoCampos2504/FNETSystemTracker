import type { TaskAssignment, TaskStatus } from "@/contracts";
import { TaskStatus as TaskStatusEnum } from "@/contracts";
import type { TaskListFilter, TaskRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapTask, taskInclude } from "./mappers";
import type { Prisma } from "@/generated/prisma/client";

const COMPLETED_STATUSES: TaskStatus[] = [TaskStatusEnum.APPROVED, TaskStatusEnum.APPROVED_WITH_PENDING];

function parseDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function whereForFilter(filter: TaskListFilter): Prisma.TaskWhereInput {
  return {
    ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
    ...(filter.technicianId ? { technicians: { some: { technicianId: filter.technicianId } } } : {}),
  };
}

export const taskPrismaRepository: TaskRepository = {
  async findById(id) {
    const row = await prisma.task.findUnique({ where: { id }, include: taskInclude });
    return row ? mapTask(row) : null;
  },

  async listByDate(date, filter = {}) {
    const rows = await prisma.task.findMany({
      where: { scheduledDate: parseDateOnly(date), ...whereForFilter(filter) },
      include: taskInclude,
      orderBy: { scheduledAt: "asc" },
    });
    return rows.map(mapTask);
  },

  async listPending(asOfDate, filter = {}) {
    const rows = await prisma.task.findMany({
      where: {
        scheduledDate: { lte: parseDateOnly(asOfDate) },
        status: { notIn: COMPLETED_STATUSES },
        ...whereForFilter(filter),
      },
      include: taskInclude,
      orderBy: { scheduledDate: "asc" },
    });
    return rows.map(mapTask);
  },

  async updateAssignments(taskId, assignments: TaskAssignment[]) {
    await prisma.$transaction([
      prisma.taskTechnician.deleteMany({ where: { taskId } }),
      prisma.taskTechnician.createMany({
        data: assignments.map((a) => ({ taskId, technicianId: a.technicianId, role: a.crewRole })),
      }),
    ]);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return mapTask(row);
  },

  async updateSchedule(taskId, scheduledDate) {
    const row = await prisma.task.update({
      where: { id: taskId },
      data: { scheduledDate: parseDateOnly(scheduledDate) },
      include: taskInclude,
    });
    return mapTask(row);
  },

  async updateStatus(taskId, status) {
    const [row] = await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: { status }, include: taskInclude }),
      prisma.taskStatusHistory.create({ data: { taskId, status } }),
    ]);
    return mapTask(row);
  },
};
