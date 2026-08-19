import type { NotificationRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapNotification } from "./mappers";

export const notificationPrismaRepository: NotificationRepository = {
  async listByUser(userId) {
    const rows = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapNotification);
  },
};
