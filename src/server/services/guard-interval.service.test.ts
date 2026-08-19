import { describe, expect, it } from "vitest";
import { isTaskWithinGuard } from "./guard-interval.service";

const guard = { startAt: "2026-08-14T18:00:00.000Z", endAt: "2026-08-21T08:00:00.000Z" };

describe("isTaskWithinGuard", () => {
  it("is true when the task interval is completely inside the guard interval", () => {
    const task = { arrivalAt: "2026-08-16T09:00:00.000Z", departureAt: "2026-08-16T10:30:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is true when the task starts before the guard and ends inside it", () => {
    const task = { arrivalAt: "2026-08-14T10:00:00.000Z", departureAt: "2026-08-14T20:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is true when the task starts inside the guard and ends after it", () => {
    const task = { arrivalAt: "2026-08-21T06:00:00.000Z", departureAt: "2026-08-21T12:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is false when the task interval is entirely outside the guard interval", () => {
    const task = { arrivalAt: "2026-08-10T09:00:00.000Z", departureAt: "2026-08-10T10:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(false);
  });

  it("is true on the exact boundary (task starts exactly when the guard ends)", () => {
    const task = { arrivalAt: "2026-08-21T08:00:00.000Z", departureAt: "2026-08-21T09:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is true on the exact boundary (task starts exactly when the guard starts)", () => {
    const task = { arrivalAt: "2026-08-14T18:00:00.000Z", departureAt: "2026-08-14T19:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is true on the exact boundary (task ends exactly when the guard ends)", () => {
    const task = { arrivalAt: "2026-08-21T06:00:00.000Z", departureAt: "2026-08-21T08:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is true when the task fully contains the guard interval (starts before, ends after)", () => {
    const task = { arrivalAt: "2026-08-10T00:00:00.000Z", departureAt: "2026-08-25T00:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is false when the task interval is entirely after the guard interval", () => {
    const task = { arrivalAt: "2026-08-25T09:00:00.000Z", departureAt: "2026-08-25T10:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(false);
  });

  it("does NOT use a fixed 'hour >= 18' rule — an 08:00-17:00 task on a guard day still overlaps a guard covering part of it", () => {
    const dayGuard = { startAt: "2026-08-16T16:00:00.000Z", endAt: "2026-08-17T08:00:00.000Z" };
    const task = { arrivalAt: "2026-08-16T08:00:00.000Z", departureAt: "2026-08-16T17:00:00.000Z", scheduledAt: null };
    expect(isTaskWithinGuard(task, dayGuard)).toBe(true);
  });

  it("falls back to scheduledAt as a point-in-time when the task hasn't been worked yet", () => {
    const task = { arrivalAt: null, departureAt: null, scheduledAt: "2026-08-16T09:00:00.000Z" };
    expect(isTaskWithinGuard(task, guard)).toBe(true);
  });

  it("is false when there is no timing information at all", () => {
    const task = { arrivalAt: null, departureAt: null, scheduledAt: null };
    expect(isTaskWithinGuard(task, guard)).toBe(false);
  });
});
