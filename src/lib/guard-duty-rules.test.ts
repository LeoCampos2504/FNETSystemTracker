import { describe, expect, it } from "vitest";
import { buildGuardSegments, getGuardAt, getGuardSegmentTemporalStatus, GuardSegmentTemporalStatus } from "./guard-duty-rules";
describe("guard duty segments", () => {
  it("keeps historical crew changes and actor", () => {
    const result = buildGuardSegments("guard-1", "2026-08-17T08:00:00Z", "2026-08-19T08:00:00Z", [{ at: "2026-08-17T08:00:00Z", technicianIds: ["tech-a", "tech-b"], actorUserId: null }, { at: "2026-08-18T08:00:00Z", technicianIds: ["tech-a", "tech-c"], actorUserId: "user-coord-1" }]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].technicianIds).toEqual(["tech-a", "tech-b"]);
    expect(result.history[0].beforeTechnicianIds).toEqual(["tech-a", "tech-b"]);
    expect(result.history[0].afterTechnicianIds).toEqual(["tech-a", "tech-c"]);
    expect(result.history[0].actorUserId).toBe("user-coord-1");
  });

  it("keeps multiple replacements in order without replacing history", () => {
    const result = buildGuardSegments("guard-2", "2026-08-17T08:00:00Z", "2026-08-24T08:00:00Z", ["tech-a", "tech-b"], [
      { at: "2026-08-18T08:00:00Z", technicianIds: ["tech-a", "tech-c"], actorUserId: "actor-1" },
      { at: "2026-08-20T08:00:00Z", technicianIds: ["tech-c", "tech-d"], actorUserId: "actor-2" },
    ]);
    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((segment) => segment.technicianIds)).toEqual([["tech-a", "tech-b"], ["tech-a", "tech-c"], ["tech-c", "tech-d"]]);
    expect(result.history.map((entry) => entry.actorUserId)).toEqual(["actor-1", "actor-2"]);
  });

  it("rejects equivalent duplicate effective timestamps and uses epoch ordering", () => {
    expect(() => buildGuardSegments("guard-3", "2026-08-17T08:00:00Z", "2026-08-24T08:00:00Z", ["tech-a", "tech-b"], [
      { at: "2026-08-18T08:00:00Z", technicianIds: ["tech-a", "tech-c"], actorUserId: "actor-1" },
      { at: "2026-08-18T05:00:00-03:00", technicianIds: ["tech-c", "tech-d"], actorUserId: "actor-2" },
    ])).toThrow("histórico es inmutable");
    const result = buildGuardSegments("guard-4", "2026-08-17T08:00:00Z", "2026-08-24T08:00:00Z", ["tech-a", "tech-b"], [
      { at: "2026-08-19T05:00:00-03:00", technicianIds: ["tech-a", "tech-c"], actorUserId: "actor-1" },
      { at: "2026-08-18T08:00:00Z", technicianIds: ["tech-c", "tech-d"], actorUserId: "actor-2" },
    ]);
    expect(result.history.map((entry) => entry.changedAt)).toEqual(["2026-08-18T08:00:00Z", "2026-08-19T05:00:00-03:00"]);
  });

  it("classifies past, current and future segments against an explicit evaluation instant", () => {
    const result = buildGuardSegments("guard-5", "2026-08-17T08:00:00Z", "2026-08-24T08:00:00Z", ["tech-a", "tech-b"], [{ at: "2026-08-18T08:00:00Z", technicianIds: ["tech-a", "tech-c"], actorUserId: null }]);
    expect(getGuardSegmentTemporalStatus(result.segments[0], "2026-08-18T12:00:00Z")).toBe(GuardSegmentTemporalStatus.PAST);
    expect(getGuardSegmentTemporalStatus(result.segments[1], "2026-08-18T12:00:00Z")).toBe(GuardSegmentTemporalStatus.CURRENT);
    expect(getGuardSegmentTemporalStatus(result.segments[1], "2026-08-17T12:00:00Z")).toBe(GuardSegmentTemporalStatus.FUTURE);
  });

  it("starts an operational 08:00 guard exactly at 08:00 Argentina", () => {
    const result = buildGuardSegments("guard-local", "2026-08-17T08:00", "2026-08-24T08:00", ["tech-a", "tech-b"]);
    expect(getGuardAt("2026-08-17T07:59", result.segments)).toBeNull();
    expect(getGuardAt("2026-08-17T08:00", result.segments)?.id).toBe("guard-local-segment-1");
    expect(getGuardAt("2026-08-17T11:00:00.000Z", result.segments)?.id).toBe("guard-local-segment-1");
  });
});
