/** Guard-duty rules shared by the screens and the monthly Excel. Pure: no server or database imports. */
export type DayKind = 'HABIL' | 'SABADO' | 'DOMINGO' | 'FERIADO';
export type GuardWeekRow = { technician: string; weekStart: string };
export type OffHoursRow = { technicians: string[]; hours: number | null };
export type GuardSummaryRow = { technician: string; weeks: number; days: number; weekdays: number; saturdays: number; sundays: number; holidays: number; tasks: number; hours: number };

const utc = (day: string) => new Date(day + 'T00:00:00Z');
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (day: string, count: number) => { const date = utc(day); date.setUTCDate(date.getUTCDate() + count); return iso(date); };
export const isMonday = (day: string) => utc(day).getUTCDay() === 1;
/** Monday of the week that contains the day. */
export const mondayOf = (day: string) => addDays(day, -((utc(day).getUTCDay() + 6) % 7));
/** The seven days of a guard week, Monday to Sunday. */
export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
export const monthRange = (month: string) => { const [year, number] = month.split('-').map(Number); return { from: month + '-01', to: iso(new Date(Date.UTC(year, number, 0))) }; };
/** A holiday outranks the weekday it falls on, so every guard day lands in exactly one group. */
export function dayKind(day: string, holidays: ReadonlySet<string>): DayKind {
  if (holidays.has(day)) return 'FERIADO';
  const weekday = utc(day).getUTCDay();
  return weekday === 6 ? 'SABADO' : weekday === 0 ? 'DOMINGO' : 'HABIL';
}
export const normalizeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Per technician and month: guard days by kind, plus the hours spent on tasks outside working hours. Only days inside the month count. */
export function guardSummary(weeks: GuardWeekRow[], holidays: string[], offHours: OffHoursRow[], month: string): GuardSummaryRow[] {
  const { from, to } = monthRange(month), holidaySet = new Set(holidays);
  const rows = new Map<string, GuardSummaryRow & { seen: Set<string>; weekSet: Set<string> }>();
  const row = (name: string) => {
    const key = normalizeName(name);
    if (!rows.has(key)) rows.set(key, { technician: name.trim(), weeks: 0, days: 0, weekdays: 0, saturdays: 0, sundays: 0, holidays: 0, tasks: 0, hours: 0, seen: new Set(), weekSet: new Set() });
    return rows.get(key)!;
  };
  for (const week of weeks) {
    const entry = row(week.technician);
    for (const day of weekDays(week.weekStart)) {
      if (day < from || day > to || entry.seen.has(day)) continue;
      entry.seen.add(day); entry.weekSet.add(week.weekStart); entry.days++;
      const kind = dayKind(day, holidaySet);
      if (kind === 'FERIADO') entry.holidays++; else if (kind === 'SABADO') entry.saturdays++; else if (kind === 'DOMINGO') entry.sundays++; else entry.weekdays++;
    }
  }
  // A crew shares its hours: every technician of the visit is credited with them.
  for (const visit of offHours) for (const name of visit.technicians) { const entry = row(name); entry.tasks++; entry.hours += visit.hours ?? 0; }
  return [...rows.values()].map(({ seen, weekSet, ...entry }) => { void seen; return { ...entry, weeks: weekSet.size, hours: Math.round(entry.hours * 100) / 100 }; })
    .sort((a, b) => a.technician.localeCompare(b.technician, 'es'));
}
