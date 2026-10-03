import type { LeaveRecord, WorkdayRecord } from "@/contracts";
import { operationalDateTimeToEpoch } from "./operational-timezone";

export function getWorkdayForDate(records: readonly WorkdayRecord[], resourceId: string, date: string): WorkdayRecord | null {
  return records.find((record) => (record.resourceId === resourceId || record.technicianId === resourceId) && (record.date === date || record.workDate === date)) ?? null;
}

export function getLeaveForDate(records: readonly LeaveRecord[], resourceId: string, date: string): LeaveRecord | null {
  const target = operationalDateTimeToEpoch(`${date}T12:00:00`);
  return records.find((record) => {
    const active = record.status === "APPROVED";
    const start = operationalDateTimeToEpoch(record.startAt ?? `${record.startDate}T00:00:00`);
    const end = operationalDateTimeToEpoch(record.endAt ?? `${record.endDate}T23:59:59.999`);
    return active && (record.resourceId === resourceId || record.technicianId === resourceId) && target >= start && target <= end;
  }) ?? null;
}
