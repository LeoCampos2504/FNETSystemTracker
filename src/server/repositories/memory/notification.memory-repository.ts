import { mockNotifications } from "@/mocks";
import type { Notification } from "@/contracts";
import type { NotificationRepository } from "@/server/ports";

const notificationsStore: Notification[] = [...mockNotifications];
let nextId = notificationsStore.length + 1;

export const notificationMemoryRepository: NotificationRepository = {
  async listByUser(userId) {
    return notificationsStore.filter((n) => n.userId === userId);
  },
  async create(entry) {
    const notification: Notification = {
      ...entry,
      id: `notif-mem-${nextId++}`,
      createdAt: new Date().toISOString(),
    };
    notificationsStore.push(notification);
    return notification;
  },
};
