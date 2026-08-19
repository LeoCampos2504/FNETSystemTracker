/**
 * Shared enums for FNET System Tracker.
 * Source of truth for all roles (Euge/Leo/Gino). Do not fork or duplicate.
 */

export const UserRole = {
  TECHNICIAN: "TECHNICIAN",
  COORDINATOR: "COORDINATOR",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TaskType = {
  PREVENTIVE: "PREVENTIVE",
  CORRECTIVE: "CORRECTIVE",
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  SENT: "SENT",
  REJECTED: "REJECTED",
  APPROVED_WITH_PENDING: "APPROVED_WITH_PENDING",
  APPROVED: "APPROVED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskCriticality = {
  NORMAL: "NORMAL",
  URGENT: "URGENT",
} as const;
export type TaskCriticality = (typeof TaskCriticality)[keyof typeof TaskCriticality];

export const CrewRole = {
  PRIMARY: "PRIMARY",
  COLLABORATOR: "COLLABORATOR",
} as const;
export type CrewRole = (typeof CrewRole)[keyof typeof CrewRole];

export const QuoteStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING: "WAITING",
  COMPLETED_WITH_PENDING: "COMPLETED_WITH_PENDING",
  COMPLETED: "COMPLETED",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const ExternalSource = {
  SYTEX: "SYTEX",
  BIZFLOW: "BIZFLOW",
  MAXTRACKER: "MAXTRACKER",
  INTERNAL: "INTERNAL",
} as const;
export type ExternalSource = (typeof ExternalSource)[keyof typeof ExternalSource];

export const VehicleStatus = {
  ACTIVE: "ACTIVE",
  MAINTENANCE: "MAINTENANCE",
  OUT_OF_SERVICE: "OUT_OF_SERVICE",
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const NotificationType = {
  NEW_TASK: "NEW_TASK",
  CORRECTIVE_URGENT: "CORRECTIVE_URGENT",
  GUARD_CHANGE: "GUARD_CHANGE",
  VEHICLE_CHANGE: "VEHICLE_CHANGE",
  SCHEDULE_CHANGE: "SCHEDULE_CHANGE",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
