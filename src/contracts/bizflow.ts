import type { ExternalSyncFields } from "./common";

export const WorkdayStatus = {
  NOT_STARTED: "NOT_STARTED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ABSENT: "ABSENT",
  LEAVE: "LEAVE",
  VACATION: "VACATION",
  STARTED: "STARTED",
  FINISHED: "FINISHED",
} as const;
export type WorkdayStatus = (typeof WorkdayStatus)[keyof typeof WorkdayStatus];

export interface BizFlowResource extends ExternalSyncFields {
  id: string;
  technicianId: string;
  resourceType: "TECHNICIAN" | "COORDINATOR" | "VEHICLE_OPERATOR";
  active: boolean;
  zoneId: string;
}

export interface WorkdayRecord extends ExternalSyncFields {
  id: string;
  resourceId: string;
  date: string;
  loginAt: string | null;
  workdayStartedAt: string | null;
  workdayEndedAt: string | null;
  status: WorkdayStatus;
  source: "BIZFLOW" | "INTERNAL";
  technicianId: string;
  workDate: string;
  loggedInAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  loggedOutAt: string | null;
}

export interface LeaveRecord extends ExternalSyncFields {
  id: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  source: "BIZFLOW" | "INTERNAL";
  type: "VACATION" | "SICK_LEAVE" | "LICENSE" | "OTHER";
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  technicianId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface EmploymentRecord extends ExternalSyncFields {
  id: string;
  technicianId: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ON_LEAVE";
  effectiveFrom: string;
  effectiveTo: string | null;
}
