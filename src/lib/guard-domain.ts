/** Guard-duty rules shared by the screens and the monthly Excel. Pure: no server or database imports. */
import { operationalDateKey, operationalDateTimeToEpoch, operationalDateTimeToInput } from './operational-timezone';
export type DayKind = 'HABIL' | 'SABADO' | 'DOMINGO' | 'FERIADO';
export type GuardPeriodRow = { technician: string; from: string; to: string; startAt?: string; endAt?: string; crewId?: string };
export type OffHoursRow = { technicians: string[]; hours: number | null };
/** nonWorking = Saturdays, Sundays and holidays, each day counted once. */
export type GuardSummaryRow = { technician: string; periods: number; days: number; weekdays: number; nonWorking: number; tasks: number; hours: number };
export const MAX_GUARD_DAYS = 92;

const utc = (day: string) => new Date(day + 'T00:00:00Z');
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (day: string, count: number) => { const date = utc(day); date.setUTCDate(date.getUTCDate() + count); return iso(date); };
/** Monday of the week that contains the day. */
export const mondayOf = (day: string) => addDays(day, -((utc(day).getUTCDay() + 6) % 7));
/** Every day from `from` to `to`, both included; empty when the range is reversed. */
export const daysBetween = (from: string, to: string) => { const days: string[] = []; for (let d = from; d <= to && days.length <= 400; d = addDays(d, 1)) days.push(d); return days; };
export const weekdayName = (day: string) => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][utc(day).getUTCDay()];
/** Guard-only half-open interval. Holidays still use inclusive daysBetween. */
export const guardDays = (from: string, to: string) => from < to ? daysBetween(from, addDays(to, -1)) : [];
export const validPeriod = (from: string, to: string) => from < to && guardDays(from, to).length <= MAX_GUARD_DAYS;
export const guardStart = (day: string) => day + 'T08:00';
export const newGuardWindow = (day: string) => ({ startAt: guardStart(day), endAt: guardStart(addDays(day, 7)) });
export const guardIsCurrent = (period: GuardPeriodRow, at: string | Date) => {
  const now = operationalDateTimeToEpoch(at);
  return now >= operationalDateTimeToEpoch(period.startAt ?? guardStart(period.from)) && now < operationalDateTimeToEpoch(period.endAt ?? guardStart(period.to));
};
export const monthRange = (month: string) => { const [year, number] = month.split('-').map(Number); return { from: month + '-01', to: iso(new Date(Date.UTC(year, number, 0))) }; };
/** A holiday outranks the weekday it falls on, so every guard day lands in exactly one group. */
export function dayKind(day: string, holidays: ReadonlySet<string>): DayKind {
  if (holidays.has(day)) return 'FERIADO';
  const weekday = utc(day).getUTCDay();
  return weekday === 6 ? 'SABADO' : weekday === 0 ? 'DOMINGO' : 'HABIL';
}
export const normalizeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Per technician and month: guard days (working vs non-working) plus the hours spent on tasks outside working hours. Only days inside the month count, and a day is counted once per technician. */
export function guardSummary(periods: GuardPeriodRow[], holidays: string[], offHours: OffHoursRow[], month: string): GuardSummaryRow[] {
  const holidaySet = new Set(holidays);
  const rows = new Map<string, GuardSummaryRow & { periodSet: Set<string> }>();
  const row = (name: string) => {
    const key = normalizeName(name);
    if (!rows.has(key)) rows.set(key, { technician: name.trim(), periods: 0, days: 0, weekdays: 0, nonWorking: 0, tasks: 0, hours: 0, periodSet: new Set() });
    return rows.get(key)!;
  };
  for (const coverage of guardDailyCoverage(periods, month)) {
    const entry = row(coverage.technician);
    coverage.periodKeys.forEach(key => entry.periodSet.add(key));
    entry.days += coverage.days;
    if (dayKind(coverage.day, holidaySet) === 'HABIL') entry.weekdays += coverage.days; else entry.nonWorking += coverage.days;
  }
  // A crew shares its hours: every technician of the visit is credited with them.
  for (const visit of offHours) for (const name of new Map(visit.technicians.map(name => [normalizeName(name), name])).values()) { const entry = row(name); entry.tasks++; entry.hours += visit.hours ?? 0; }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return [...rows.values()].map(({ periodSet, ...entry }) => ({ ...entry, periods: periodSet.size, days: round(entry.days), weekdays: round(entry.weekdays), nonWorking: round(entry.nonWorking), hours: Math.round(entry.hours * 100) / 100 }))
    .sort((a, b) => a.technician.localeCompare(b.technician, 'es'));
}

/** Actual coverage, unioned per technician and operational service day (08:00–08:00).
 * Fractions are elapsed coverage, NOT a payroll/proration policy. Never credit two full days for a partial handover. */
export function guardDailyCoverage(periods: GuardPeriodRow[], month: string) {
  const range = monthRange(month);
  const buckets = new Map<string, { technician: string; day: string; intervals: [number, number][]; periodKeys: Set<string> }>();
  for (const period of periods) {
    const start = operationalDateTimeToEpoch(period.startAt ?? guardStart(period.from));
    const end = operationalDateTimeToEpoch(period.endAt ?? guardStart(period.to));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    let first = operationalDateKey(new Date(start));
    if (operationalDateTimeToInput(new Date(start)).slice(11) < '08:00') first = addDays(first, -1);
    for (const day of daysBetween(first < range.from ? range.from : first, range.to)) {
      const left = Math.max(start, operationalDateTimeToEpoch(guardStart(day)));
      const right = Math.min(end, operationalDateTimeToEpoch(guardStart(addDays(day, 1))));
      if (left >= right) continue;
      const key = normalizeName(period.technician) + '|' + day;
      if (!buckets.has(key)) buckets.set(key, { technician: period.technician, day, intervals: [], periodKeys: new Set() });
      const bucket = buckets.get(key)!;
      bucket.intervals.push([left, right]);
      bucket.periodKeys.add(period.crewId ?? period.from + '_' + period.to);
    }
  }
  return [...buckets.values()].map(({ technician, day, intervals, periodKeys }) => {
    let total = 0, end = -Infinity;
    for (const [a, b] of intervals.sort((x, y) => x[0] - y[0])) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
    const hours = total / 3600000;
    return { technician, day, hours, days: total / (operationalDateTimeToEpoch(guardStart(addDays(day, 1))) - operationalDateTimeToEpoch(guardStart(day))), periodKeys: [...periodKeys] };
  }).sort((a, b) => a.technician.localeCompare(b.technician, 'es') || a.day.localeCompare(b.day));
}
