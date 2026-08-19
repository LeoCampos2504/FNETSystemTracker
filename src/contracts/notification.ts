import type { NotificationType } from "./enums";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  /** Optional link back to the entity that triggered this notification. */
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}
