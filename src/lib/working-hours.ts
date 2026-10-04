import { OPERATIONAL_TIMEZONE, operationalDateTimeToDate, operationalDateTimeToEpoch } from "./operational-timezone";

export interface HolidayCalendar {
  isHoliday(date: Date): boolean;
}

export interface WorkingHoursSchedule {
  startMinute: number;
  endMinute: number;
  weekdays: readonly number[];
}

export const DEFAULT_WORKING_HOURS: WorkingHoursSchedule = {
  startMinute: 8 * 60,
  endMinute: 18 * 60,
  weekdays: [1, 2, 3, 4, 5],
};

function operationalDateParts(value: string | Date): { year: number; month: number; day: number; weekday: number } {
  const instant = operationalDateTimeToDate(value);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: OPERATIONAL_TIMEZONE, calendar: "iso8601", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(dateFormatter.formatToParts(instant).map(({ type, value: partValue }) => [type, partValue]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday };
}

function operationalDateString(value: string | Date): string {
  const parts = operationalDateParts(value);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addOperationalDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Counts only scheduled working minutes; holidays come from a replaceable dependency. */
export function calculateWorkingMinutes(
  start: string | Date,
  end: string | Date,
  calendar: HolidayCalendar,
  schedule: WorkingHoursSchedule = DEFAULT_WORKING_HOURS,
): number {
  const startEpoch = operationalDateTimeToEpoch(start);
  const endEpoch = operationalDateTimeToEpoch(end);
  if (endEpoch <= startEpoch) return 0;
  let total = 0;
  const firstDay = operationalDateString(start);
  const lastDay = operationalDateString(end);
  for (let day = firstDay; ; day = addOperationalDays(day, 1)) {
    const dayParts = operationalDateParts(`${day}T12:00`);
    const dayMarker = new Date(Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day));
    if (schedule.weekdays.includes(dayParts.weekday) && !calendar.isHoliday(dayMarker)) {
      const windowStart = operationalDateTimeToEpoch(`${day}T${String(Math.floor(schedule.startMinute / 60)).padStart(2, "0")}:${String(schedule.startMinute % 60).padStart(2, "0")}`);
      const windowEnd = operationalDateTimeToEpoch(`${day}T${String(Math.floor(schedule.endMinute / 60)).padStart(2, "0")}:${String(schedule.endMinute % 60).padStart(2, "0")}`);
      const overlapStart = Math.max(startEpoch, windowStart);
      const overlapEnd = Math.min(endEpoch, windowEnd);
      if (overlapEnd > overlapStart) total += Math.floor((overlapEnd - overlapStart) / 60_000);
    }
    if (day === lastDay) break;
  }
  return total;
}

export function isWithinWorkingHours(date: string | Date, calendar: HolidayCalendar, schedule = DEFAULT_WORKING_HOURS): boolean {
  const instant = operationalDateTimeToDate(date);
  const parts = operationalDateParts(instant);
  const dayMarker = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (calendar.isHoliday(dayMarker) || !schedule.weekdays.includes(parts.weekday)) return false;
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: OPERATIONAL_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const timeParts = Object.fromEntries(localTime.map(({ type, value }) => [type, value]));
  const minute = Number(timeParts.hour) * 60 + Number(timeParts.minute);
  return minute >= schedule.startMinute && minute < schedule.endMinute;
}

export function isOutsideWorkingHours(date: string | Date, calendar: HolidayCalendar, schedule = DEFAULT_WORKING_HOURS): boolean {
  return !isWithinWorkingHours(date, calendar, schedule);
}
