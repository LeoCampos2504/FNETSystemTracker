import type { Coordinates, ExternalSyncFields } from "./common";
import type { CrewRole, TaskCriticality, TaskStatus, TaskType } from "./enums";

export interface TaskAssignment {
  technicianId: string;
  crewRole: CrewRole;
}

export interface TaskRejection {
  id: string;
  taskId: string;
  rejectedAt: string;
  reason: string | null;
}

export interface Task extends ExternalSyncFields {
  id: string;
  taskCode: string;
  formCode: string | null;
  type: TaskType;
  description: string;
  /** Free-form business priority (e.g. "1", "Alta"), distinct from criticality. */
  priority: string;
  criticality: TaskCriticality;
  status: TaskStatus;
  /** Day the coordinator scheduled the task for. */
  scheduledDate: string;
  /** Actual/planned start timestamp, when known. */
  scheduledAt: string | null;
  siteId: string;
  siteCode: string;
  zoneId: string;
  coordinates: Coordinates;
  /**
   * Normally two entries (PRIMARY + COLLABORATOR); a single PRIMARY entry
   * is an allowed exception. Must never be empty.
   */
  assignments: TaskAssignment[];
  arrivalAt: string | null;
  departureAt: string | null;
  rejections: TaskRejection[];
}
