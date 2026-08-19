import type { AuditRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapAuditLog } from "./mappers";
import type { Prisma } from "@/generated/prisma/client";

export const auditPrismaRepository: AuditRepository = {
  async append(entry) {
    const row = await prisma.auditLog.create({
      data: {
        actorId: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: (entry.before as Prisma.InputJsonValue | null) ?? undefined,
        after: (entry.after as Prisma.InputJsonValue | null) ?? undefined,
      },
    });
    return mapAuditLog(row);
  },

  async listByEntity(entity, entityId) {
    const rows = await prisma.auditLog.findMany({ where: { entity, entityId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapAuditLog);
  },
};
