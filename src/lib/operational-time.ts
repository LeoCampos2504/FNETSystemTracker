import type { GuardDutySegment, Task } from "@/contracts";
import { getGuardAt } from "./guard-duty-rules";
import { DEFAULT_WORKING_HOURS, isOutsideWorkingHours, type HolidayCalendar, type WorkingHoursSchedule } from "./working-hours";

export const OperationalTimeClassification = {
  WITHIN_WORKING_HOURS: "WITHIN_WORKING_HOURS",
  OUTSIDE_WORKING_HOURS_ON_GUARD: "OUTSIDE_WORKING_HOURS_ON_GUARD",
  OUTSIDE_WORKING_HOURS_NOT_ON_GUARD: "OUTSIDE_WORKING_HOURS_NOT_ON_GUARD",
  ON_LEAVE_CONFLICT: "ON_LEAVE_CONFLICT",
  UNASSIGNED: "UNASSIGNED",
} as const;
export type OperationalTimeClassification = (typeof OperationalTimeClassification)[keyof typeof OperationalTimeClassification];

export function isOutsideHoursClassification(classification: OperationalTimeClassification): boolean {
  return classification !== OperationalTimeClassification.WITHIN_WORKING_HOURS;
}

export interface OperationalActivityInput {
  activityAt: string;
  technicianId: string | null;
  segments: readonly GuardDutySegment[];
  calendar: HolidayCalendar;
  schedule?: WorkingHoursSchedule;
  onLeave?: boolean;
}

export interface ClassifiedOperationalActivity extends OperationalActivityInput {
  classification: OperationalTimeClassification;
  guardSegmentId: string | null;
}

export function classifyOperationalActivity(input: OperationalActivityInput): ClassifiedOperationalActivity {
  const schedule = input.schedule ?? DEFAULT_WORKING_HOURS;
  if (!input.technicianId) return { ...input, classification: OperationalTimeClassification.UNASSIGNED, guardSegmentId: null };
  if (input.onLeave) return { ...input, classification: OperationalTimeClassification.ON_LEAVE_CONFLICT, guardSegmentId: null };
  if (!isOutsideWorkingHours(input.activityAt, input.calendar, schedule)) {
    return { ...input, classification: OperationalTimeClassification.WITHIN_WORKING_HOURS, guardSegmentId: null };
  }
  const guardSegment = getGuardAt(input.activityAt, input.segments);
  const onGuard = Boolean(guardSegment?.technicianIds.includes(input.technicianId));
  return { ...input, classification: onGuard ? OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD : OperationalTimeClassification.OUTSIDE_WORKING_HOURS_NOT_ON_GUARD, guardSegmentId: guardSegment?.id ?? null };
}

export function classifyTaskActivity(task: Pick<Task, "scheduledAt" | "assignments">, segments: readonly GuardDutySegment[], calendar: HolidayCalendar, technicianId?: string | null, schedule?: WorkingHoursSchedule): ClassifiedOperationalActivity {
  return classifyOperationalActivity({ activityAt: task.scheduledAt ?? "", technicianId: technicianId ?? task.assignments[0]?.technicianId ?? null, segments, calendar, schedule });
}
