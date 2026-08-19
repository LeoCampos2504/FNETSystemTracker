import type { Notification } from "@/contracts";

export interface NotificationRepository {
  listByUser(userId: string): Promise<Notification[]>;
  create(entry: Omit<Notification, "id" | "createdAt">): Promise<Notification>;
}
