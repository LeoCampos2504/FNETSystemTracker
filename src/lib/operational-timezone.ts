export const OPERATIONAL_TIMEZONE = "America/Argentina/Buenos_Aires" as const;
export const DEFAULT_NEW_GUARD_START = "2026-08-24T08:00";
export const DEFAULT_NEW_GUARD_END = "2026-08-31T08:00";

type DateTimeParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const explicitTimezonePattern = /(Z|[+-]\d{2}:?\d{2})$/i;

function hasExplicitTimezone(value: string): boolean {
  return explicitTimezonePattern.test(value);
}

function localParts(value: string): DateTimeParts {
  const match = value.match(localDateTimePattern);
  if (!match) throw new Error(`Fecha/hora operativa inválida: ${value}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "").padEnd(3, "0") || 0),
  };
}

function formatterForTimezone(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function partsFromInstant(instant: Date, timeZone: string): DateTimeParts {
  const parts = Object.fromEntries(formatterForTimezone(timeZone).formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: instant.getUTCMilliseconds(),
  };
}

function timezoneOffsetMilliseconds(instantMs: number, timeZone: string): number {
  const parts = partsFromInstant(new Date(instantMs), timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond) - instantMs;
}

function localDateTimeToInstant(value: string, timeZone: string): Date {
  const parts = localParts(value);
  let instantMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  // Re-evaluate the offset after applying it so this also works for zones with
  // daylight-saving transitions when another organization adopts this helper.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instantMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond) - timezoneOffsetMilliseconds(instantMs, timeZone);
  }
  return new Date(instantMs);
}

/** Converts an operational local datetime or an explicit instant into a Date. */
export function operationalDateTimeToDate(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (hasExplicitTimezone(value)) return new Date(value);
  return localDateTimeToInstant(value, timeZone);
}

export function operationalDateTimeToEpoch(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): number {
  return operationalDateTimeToDate(value, timeZone).getTime();
}

/** Converts a local operational selection into a UTC instant for persistence. */
export function operationalDateTimeToUtc(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): string {
  return operationalDateTimeToDate(value, timeZone).toISOString();
}

/** Keeps datetime-local values in the operational timezone during editing. */
export function operationalDateTimeToInput(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): string {
  const parts = partsFromInstant(operationalDateTimeToDate(value, timeZone), timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatOperationalTime(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): string {
  const parts = partsFromInstant(operationalDateTimeToDate(value, timeZone), timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatOperationalDateTime(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone }).format(operationalDateTimeToDate(value, timeZone));
}

/** Returns the civil date in the operational timezone, never the host timezone. */
export function operationalDateKey(value: string | Date, timeZone = OPERATIONAL_TIMEZONE): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = partsFromInstant(operationalDateTimeToDate(value, timeZone), timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Formats a civil date without interpreting it as a timestamp. */
export function formatOperationalDate(value: string, timeZone = OPERATIONAL_TIMEZONE): string {
  const [year, month, day] = operationalDateKey(value, timeZone).split("-").map(Number);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).formatToParts(new Date(Date.UTC(year, month - 1, day, 12))).map(({ type, value: partValue }) => [type, partValue]));
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`;
}
