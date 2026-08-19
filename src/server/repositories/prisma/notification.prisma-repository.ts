import type { NotificationRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapNotification } from "./mappers";

export const notificationPrismaRepository: NotificationRepository = {
  async listByUser(userId) {
    const rows = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapNotification);
  },

  async create(entry) {
    const row = await prisma.notification.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        title: entry.title,
        message: entry.message,
        entityType: entry.relatedEntityType,
        entityId: entry.relatedEntityId,
        readAt: entry.readAt,
      },
    });
    return mapNotification(row);
  },
};
