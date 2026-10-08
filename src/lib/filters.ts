/**
 * Shared screen filters: zones with their sub-zones (Excel-style checkbox list) and a date range picked in a calendar.
 * Pure helpers, so the rules can be tested without a browser.
 */

/**
 * `places` holds what is ticked: "NOA" means the whole zone, "NOA|Metán" one sub-zone of it ("NOA|" = the tasks of
 * NOA that Sytex gives without sub-zone). Empty means every zone. `type` is PREVENTIVO, CORRECTIVO, OTRO or empty.
 */
export type ZoneSelection = { places: string[]; type: string };
/** Inclusive days as YYYY-MM-DD; an empty end leaves that side open. Both empty: no date filter. */
export type DateRange = { from: string; to: string };

export const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
export const placeKey = (zone: string, subZone?: string) => subZone === undefined ? zone : zone + "|" + subZone;
export const placeZone = (place: string) => place.split("|")[0];
/** "NOA - MPC Mantenimiento…" → "NOA". */
export const zoneCode = (project: string) => { const cut = project.indexOf(" - "); return (cut > 0 ? project.slice(0, cut) : project).trim().toUpperCase(); };
export const selectedZones = (places: string[]) => new Set(places.map(placeZone));

/**
 * Whether a record of `zone` passes the ticked places. `subZone` undefined means the screen does not know sub-zones
 * (insumos without task, guardias…): then ticking any part of the zone is enough.
 */
export function placeMatches(zone: string, subZone: string | null | undefined, places: string[]) {
  if (!places.length || places.includes(zone)) return true;
  const prefix = zone + "|", subs = places.filter((place) => place.startsWith(prefix));
  if (!subs.length) return false;
  if (subZone === undefined) return true;
  const wanted = fold(subZone ?? "");
  return subs.some((place) => fold(place.slice(prefix.length)) === wanted);
}

/** Known sub-zones per zone, merged without duplicates (Metán and METAN are the same one). Returns null when nothing new. */
export function mergeSubZones(known: Record<string, string[]>, pairs: { zone: string; subZone: string | null | undefined }[]) {
  let next: Record<string, string[]> | null = null;
  for (const { zone, subZone } of pairs) {
    if (!zone || subZone === undefined) continue;
    const name = (subZone ?? "").trim(), list = (next ?? known)[zone] ?? [];
    if (list.some((existing) => fold(existing) === fold(name))) continue;
    next = next ?? { ...known };
    next[zone] = [...list, name].sort((a, b) => a.localeCompare(b, "es"));
  }
  return next;
}

export const inDateRange = (date: string | null | undefined, range: DateRange) => {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
};

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = (day: string) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10) || "1"));
export const lastDayOfMonth = (month: string) => isoDay(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
export const monthRange = (month: string): DateRange => ({ from: month + "-01", to: lastDayOfMonth(month) });
export const addMonths = (month: string, delta: number) => { const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };

/** Weeks of a month starting on Monday; null fills the days of the neighbour months. */
export function monthWeeks(month: string): (string | null)[][] {
  const first = parse(month + "-01"), offset = (first.getDay() + 6) % 7, days = Number(lastDayOfMonth(month).slice(8));
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => month + "-" + pad(i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const shortDay = (day: string) => Number(day.slice(8)) + " " + MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3) + " " + day.slice(0, 4);
export const monthName = (month: string) => { const name = MONTHS[Number(month.slice(5, 7)) - 1]; return name.charAt(0).toUpperCase() + name.slice(1) + " " + month.slice(0, 4); };

/** "Todas las fechas", "8 oct 2026", "Octubre 2026" or "1 oct 2026 – 15 oct 2026". */
export function rangeLabel(range: DateRange) {
  if (!range.from && !range.to) return "Todas las fechas";
  if (range.from && range.to) {
    if (range.from === range.to) return shortDay(range.from);
    const month = range.from.slice(0, 7);
    if (range.from === month + "-01" && range.to === lastDayOfMonth(month)) return monthName(month);
    return shortDay(range.from) + " – " + shortDay(range.to);
  }
  return range.from ? "Desde " + shortDay(range.from) : "Hasta " + shortDay(range.to);
}

/** The week (Monday to Sunday) of a day. */
export function weekRange(day: string): DateRange {
  const d = parse(day), monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return { from: isoDay(monday), to: isoDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
}

/** A task counts on the day it was really done; one still open counts on its plan date. */
export const taskDay = (task: { completedDate?: string | null; scheduledDate: string }) => task.completedDate || task.scheduledDate;
