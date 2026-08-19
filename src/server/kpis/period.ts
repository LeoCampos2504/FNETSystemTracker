/**
 * Resolves the [from, to] KPI window. Supports "día" (from === to), "mes"
 * (defaults to the current calendar month) and any custom range — callers
 * just pass whatever `from`/`to` they got from the query string.
 */
export function resolveDefaultPeriod(now: Date = new Date()): { periodStart: string; periodEnd: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { periodStart: toDateString(start), periodEnd: toDateString(end) };
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
