import { describe, expect, it } from "vitest";
import { calculateWorkingMinutes, isWithinWorkingHours } from "./working-hours";
const noHolidays = { isHoliday: () => false };
const holidayFriday = { isHoliday: (date: Date) => date.getUTCDay() === 5 };
describe("working hours", () => {
  it("counts configured working minutes and excludes weekends", () => {
    expect(calculateWorkingMinutes("2026-08-17T08:00", "2026-08-18T10:00", noHolidays)).toBe(12 * 60);
    expect(isWithinWorkingHours("2026-08-15T10:00", noHolidays)).toBe(false);
  });
  it("delegates holidays to the calendar dependency", () => {
    expect(calculateWorkingMinutes("2026-08-21T08:00", "2026-08-21T18:00", holidayFriday)).toBe(0);
  });

  it("keeps Argentina operational boundaries inclusive/exclusive", () => {
    expect(isWithinWorkingHours("2026-08-17T07:59", noHolidays)).toBe(false);
    expect(isWithinWorkingHours("2026-08-17T08:00", noHolidays)).toBe(true);
    expect(isWithinWorkingHours("2026-08-17T17:59", noHolidays)).toBe(true);
    expect(isWithinWorkingHours("2026-08-17T18:01", noHolidays)).toBe(false);
  });
});
