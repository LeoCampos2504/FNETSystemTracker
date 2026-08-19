import { mockNotifications } from "@/mocks";
import type { NotificationRepository } from "@/server/ports";

export const notificationMemoryRepository: NotificationRepository = {
  async listByUser(userId) {
    return mockNotifications.filter((n) => n.userId === userId);
  },
};
