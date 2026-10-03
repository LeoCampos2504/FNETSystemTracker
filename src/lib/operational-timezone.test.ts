import { describe, expect, it } from "vitest";
import { getLeaveForDate } from "./bizflow-rules";
import type { LeaveRecord } from "@/contracts";
import { DEFAULT_NEW_GUARD_END, DEFAULT_NEW_GUARD_START, formatOperationalDate, formatOperationalTime, operationalDateKey, operationalDateTimeToInput, operationalDateTimeToUtc, OPERATIONAL_TIMEZONE } from "./operational-timezone";

describe("operational Argentina timezone", () => {
  it("declares the pilot timezone and presents 08:00 without shifting it", () => {
    expect(OPERATIONAL_TIMEZONE).toBe("America/Argentina/Buenos_Aires");
    expect(formatOperationalTime("2026-08-18T08:00")).toBe("08:00");
  });

  it("presents 18:00 as the operational end boundary", () => {
    expect(formatOperationalTime("2026-08-18T18:00")).toBe("18:00");
  });

  it("round-trips datetime-local as Argentina operational time", () => {
    const selected = "2026-08-20T08:00";
    const persistedUtc = operationalDateTimeToUtc(selected);
    expect(persistedUtc).toBe("2026-08-20T11:00:00.000Z");
    expect(operationalDateTimeToInput(persistedUtc)).toBe(selected);
  });

  it("keeps the new guard defaults at 08:00 local", () => {
    expect(operationalDateTimeToInput(DEFAULT_NEW_GUARD_START)).toBe("2026-08-24T08:00");
    expect(operationalDateTimeToInput(DEFAULT_NEW_GUARD_END)).toBe("2026-08-31T08:00");
  });

  it("resolves a UTC instant across midnight to the operational date", () => {
    expect(operationalDateKey("2026-08-18T01:30:00.000Z")).toBe("2026-08-17");
  });

  it("uses that operational date when checking a leave record", () => {
    const leave: LeaveRecord = { id: "leave-test", resourceId: "tech-01", technicianId: "tech-01", startAt: "2026-08-17T00:00", endAt: "2026-08-17T23:59:59.999", startDate: "2026-08-17", endDate: "2026-08-17", source: "BIZFLOW", type: "LICENSE", status: "APPROVED", reason: null, externalId: null, externalSource: "BIZFLOW", sourceUpdatedAt: null };
    const operationalDate = operationalDateKey("2026-08-18T01:30:00.000Z");
    expect(getLeaveForDate([leave], "tech-01", operationalDate)).toBe(leave);
    expect(getLeaveForDate([leave], "tech-01", "2026-08-18")).toBeNull();
  });

  it("formats a civil date without host timezone conversion", () => {
    expect(formatOperationalDate("2026-08-18")).toBe("18/08");
  });

  it("converts an explicitly UTC instant into Argentina local time", () => {
    expect(formatOperationalTime("2026-08-18T11:00:00.000Z")).toBe("08:00");
  });
});
