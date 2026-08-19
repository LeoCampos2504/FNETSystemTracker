/**
 * Fixed "today" reference used across mocks so demo data (today's tasks,
 * pending-from-previous-days, guard weeks) stays consistent between modules.
 * Not related to the real system clock.
 */
export const MOCK_TODAY = new Date("2026-08-18T00:00:00.000Z");

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
