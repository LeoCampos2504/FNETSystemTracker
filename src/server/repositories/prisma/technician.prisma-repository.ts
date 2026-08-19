import type { TechnicianRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapTechnician } from "./mappers";

export const technicianPrismaRepository: TechnicianRepository = {
  async findById(id) {
    const row = await prisma.technician.findUnique({ where: { id } });
    return row ? mapTechnician(row) : null;
  },

  async listByZone(zoneId) {
    const rows = await prisma.technician.findMany({
      where: { OR: [{ primaryZoneId: zoneId }, { onLoanZoneId: zoneId }] },
      orderBy: { name: "asc" },
    });
    return rows.map(mapTechnician);
  },
};
