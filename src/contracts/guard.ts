import type { ExternalSyncFields } from "./common";

/**
 * A guard (on-call) shift. Normally covers one crew but can be a temporary,
 * mixed-technician crew. Whether a task "belongs" to a guard is determined by
 * comparing the task's real time interval against [startAt, endAt] below,
 * never by a fixed "after 18:00" rule.
 */
export interface Guard extends ExternalSyncFields {
  id: string;
  zoneId: string;
  technicianIds: string[];
  startAt: string;
  endAt: string;
}

/** Aggregated read-model for a guard's activity, used by KPI/reporting screens. */
export interface GuardPerformance {
  guardId: string;
  correctivesCompleted: number;
  urgentCorrectivesCompleted: number;
  averageDurationMinutes: number;
}
