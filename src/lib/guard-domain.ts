/** Guard-duty rules shared by the screens and the monthly Excel. Pure: no server or database imports. */
export type DayKind = 'HABIL' | 'SABADO' | 'DOMINGO' | 'FERIADO';
export type GuardPeriodRow = { technician: string; from: string; to: string };
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
/** A guard period is valid when it does not run backwards and is not longer than MAX_GUARD_DAYS. */
export const validPeriod = (from: string, to: string) => from <= to && daysBetween(from, to).length <= MAX_GUARD_DAYS;
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
  const { from, to } = monthRange(month), holidaySet = new Set(holidays);
  const rows = new Map<string, GuardSummaryRow & { seen: Set<string>; periodSet: Set<string> }>();
  const row = (name: string) => {
    const key = normalizeName(name);
    if (!rows.has(key)) rows.set(key, { technician: name.trim(), periods: 0, days: 0, weekdays: 0, nonWorking: 0, tasks: 0, hours: 0, seen: new Set(), periodSet: new Set() });
    return rows.get(key)!;
  };
  for (const period of periods) {
    const entry = row(period.technician);
    for (const day of daysBetween(period.from, period.to)) {
      if (day < from || day > to || entry.seen.has(day)) continue;
      entry.seen.add(day); entry.periodSet.add(period.from + '_' + period.to); entry.days++;
      if (dayKind(day, holidaySet) === 'HABIL') entry.weekdays++; else entry.nonWorking++;
    }
  }
  // A crew shares its hours: every technician of the visit is credited with them.
  for (const visit of offHours) for (const name of visit.technicians) { const entry = row(name); entry.tasks++; entry.hours += visit.hours ?? 0; }
  return [...rows.values()].map(({ seen, periodSet, ...entry }) => { void seen; return { ...entry, periods: periodSet.size, hours: Math.round(entry.hours * 100) / 100 }; })
    .sort((a, b) => a.technician.localeCompare(b.technician, 'es'));
}
