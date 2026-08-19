import type { GuardListFilter, GuardRepository } from "@/server/ports";
import { prisma } from "./client";
import { guardInclude, mapGuard, taskInclude, mapTask } from "./mappers";
import { computeGuardPerformance } from "@/server/kpis/guard-performance";
import type { Prisma } from "@/generated/prisma/client";

function whereForFilter(filter: GuardListFilter): Prisma.GuardWhereInput {
  return {
    ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
    ...(filter.technicianId ? { technicians: { some: { technicianId: filter.technicianId } } } : {}),
  };
}

export const guardPrismaRepository: GuardRepository = {
  async findById(id) {
    const row = await prisma.guard.findUnique({ where: { id }, include: guardInclude });
    return row ? mapGuard(row) : null;
  },

  async list(filter = {}) {
    const rows = await prisma.guard.findMany({
      where: whereForFilter(filter),
      include: guardInclude,
      orderBy: { startAt: "desc" },
    });
    return rows.map(mapGuard);
  },

  async getPerformance(guardId) {
    const guardRow = await prisma.guard.findUnique({ where: { id: guardId }, include: guardInclude });
    if (!guardRow) return null;
    const guard = mapGuard(guardRow);
    const zoneTaskRows = await prisma.task.findMany({ where: { zoneId: guard.zoneId }, include: taskInclude });
    return computeGuardPerformance(guard, zoneTaskRows.map(mapTask));
  },

  async updateTechnicians(guardId, technicianIds) {
    await prisma.$transaction([
      prisma.guardTechnician.deleteMany({ where: { guardId } }),
      prisma.guardTechnician.createMany({ data: technicianIds.map((technicianId) => ({ guardId, technicianId })) }),
    ]);
    const row = await prisma.guard.findUniqueOrThrow({ where: { id: guardId }, include: guardInclude });
    return mapGuard(row);
  },

  async create(input) {
    const row = await prisma.guard.create({
      data: {
        zoneId: input.zoneId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        technicians: { create: input.technicianIds.map((technicianId) => ({ technicianId })) },
      },
      include: guardInclude,
    });
    return mapGuard(row);
  },

  async update(guardId, patch) {
    if (patch.technicianIds) {
      await prisma.$transaction([
        prisma.guardTechnician.deleteMany({ where: { guardId } }),
        prisma.guardTechnician.createMany({
          data: patch.technicianIds.map((technicianId) => ({ guardId, technicianId })),
        }),
      ]);
    }
    const row = await prisma.guard.update({
      where: { id: guardId },
      data: {
        ...(patch.zoneId ? { zoneId: patch.zoneId } : {}),
        ...(patch.startAt ? { startAt: new Date(patch.startAt) } : {}),
        ...(patch.endAt ? { endAt: new Date(patch.endAt) } : {}),
      },
      include: guardInclude,
    });
    return mapGuard(row);
  },
};
