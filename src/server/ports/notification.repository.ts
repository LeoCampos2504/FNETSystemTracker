import type { Notification } from "@/contracts";

export interface NotificationRepository {
  listByUser(userId: string): Promise<Notification[]>;
}
