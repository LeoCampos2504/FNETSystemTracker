import type { ZoneRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapSite, mapZone, zoneInclude } from "./mappers";

export const zonePrismaRepository: ZoneRepository = {
  async findById(id) {
    const row = await prisma.zone.findUnique({ where: { id }, include: zoneInclude });
    return row ? mapZone(row) : null;
  },

  async listByCoordinator(coordinatorId) {
    const rows = await prisma.zone.findMany({
      where: { coordinators: { some: { coordinatorId } } },
      include: zoneInclude,
      orderBy: { name: "asc" },
    });
    return rows.map(mapZone);
  },

  async listSites(zoneId) {
    const rows = await prisma.site.findMany({ where: { zoneId }, orderBy: { code: "asc" } });
    return rows.map(mapSite);
  },
};
