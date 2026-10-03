import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { mockScopeForRole } from "@/mocks/national";
import { getLeaveForDate, getWorkdayForDate } from "./bizflow-rules";
import { buildGuardSegments, getGuardAt, hasOverlappingGuardSegments, validateGuardTechnicians } from "./guard-duty-rules";
import { getEligibleTechniciansForZone, GuardPlanningService, LocalGuardPlanningRepository, type GuardPlanningRecord } from "./guard-planning";
import { isOutsideHoursClassification, OperationalTimeClassification, classifyOperationalActivity } from "./operational-time";
import { isOutsideWorkingHours, type HolidayCalendar } from "./working-hours";
import { mockLeaveRecords, mockWorkdayRecords } from "@/mocks/bizflow";
import type { GuardDuty, GuardDutySegment } from "@/contracts";

const calendar: HolidayCalendar = { isHoliday: () => false };
const fakeStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
};

function seededRecord(): GuardPlanningRecord {
  const duty: GuardDuty = { id: "guard-test", organizationId: "org-fnet-ar", regionId: "region-north", zoneId: "zone-noa", baseId: "base-salta", startAt: "2026-08-17T08:00:00.000Z", endAt: "2026-08-24T08:00:00.000Z", status: "PLANNED", externalId: null, externalSource: "INTERNAL", sourceUpdatedAt: null };
  const built = buildGuardSegments(duty.id, duty.startAt, duty.endAt, ["tech-01", "tech-02"]);
  return { duty, segments: built.segments, history: built.history };
}

describe("P1-T02 guard planning and BizFlow mock", () => {
  it("technician, coordinator, manager and admin receive only their guard scope", async () => {
    const repository = new LocalGuardPlanningRepository(fakeStorage());
    await repository.save(seededRecord());
    const service = new GuardPlanningService(repository);
    expect((await service.listForScope(mockScopeForRole(UserRole.TECHNICIAN))).every((record) => record.segments.some((segment) => segment.technicianIds.includes("tech-01")))).toBe(true);
    expect((await service.listForScope(mockScopeForRole(UserRole.COORDINATOR))).every((record) => ["zone-noa", "zone-nea"].includes(record.duty.zoneId))).toBe(true);
    expect((await service.listForScope(mockScopeForRole(UserRole.MANAGER))).some((record) => ["zone-noa", "zone-nea", "zone-cuyo", "zone-centro"].includes(record.duty.zoneId))).toBe(true);
    expect((await service.listForScope(mockScopeForRole(UserRole.ADMIN))).some((record) => record.duty.zoneId === "zone-noa")).toBe(true);
    const patagoniaScope = { ...mockScopeForRole(UserRole.COORDINATOR), regionIds: ["region-south"], baseIds: ["base-neuquen"], zoneIds: ["zone-patagonia"] };
    expect((await service.listForScope(patagoniaScope)).some((record) => record.duty.zoneId === "zone-noa")).toBe(false);
  });

  it("mid-week replacement preserves the previous segment and resolves getGuardAt", async () => {
    const repository = new LocalGuardPlanningRepository(fakeStorage());
    await repository.save(seededRecord());
    const service = new GuardPlanningService(repository);
    const updated = await service.replace(mockScopeForRole(UserRole.COORDINATOR), { guardDutyId: "guard-test", effectiveAt: "2026-08-20T08:00:00.000Z", technicianIds: ["tech-03", "tech-02"], actorUserId: "user-coord-1", reason: "Reemplazo operativo" });
    expect(updated.segments).toHaveLength(2);
    expect(getGuardAt("2026-08-19T10:00:00.000Z", updated.segments)?.technicianIds).toEqual(["tech-01", "tech-02"]);
    expect(getGuardAt("2026-08-21T10:00:00.000Z", updated.segments)?.technicianIds).toEqual(["tech-03", "tech-02"]);
    expect(updated.history[0].actorUserId).toBe("user-coord-1");
    expect(hasOverlappingGuardSegments(updated.segments)).toBe(false);
    const technicianService = new GuardPlanningService(repository);
    expect((await technicianService.getGuardAt(mockScopeForRole(UserRole.TECHNICIAN), "2026-08-19T10:00:00.000Z"))?.segment.technicianIds).toEqual(["tech-01", "tech-02"]);
  });

  it("rejects invalid overlaps, zero windows and duplicate technician slots", () => {
    expect(validateGuardTechnicians(["tech-01", "tech-01"]).valid).toBe(false);
    expect(() => buildGuardSegments("guard-invalid", "2026-08-17T08:00:00Z", "2026-08-17T08:00:00Z", ["tech-01", "tech-02"])).toThrow();
    const overlap: GuardDutySegment[] = [
      { id: "one", guardDutyId: "guard", startAt: "2026-08-17T08:00:00Z", endAt: "2026-08-20T08:00:00Z", technicianIds: ["tech-01", "tech-02"], source: "INTERNAL" },
      { id: "two", guardDutyId: "guard", startAt: "2026-08-19T08:00:00Z", endAt: "2026-08-24T08:00:00Z", technicianIds: ["tech-03", "tech-04"], source: "INTERNAL" },
    ];
    expect(hasOverlappingGuardSegments(overlap)).toBe(true);
  });

  it("does not let a coordinator create a guard outside its UserScope and persists demo changes", async () => {
    const storage = fakeStorage();
    const repository = new LocalGuardPlanningRepository(storage);
    const service = new GuardPlanningService(repository);
    await expect(service.create(mockScopeForRole(UserRole.COORDINATOR), { zoneId: "zone-patagonia", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["tech-12", "tech-13"] })).rejects.toThrow("UserScope");
    await service.create(mockScopeForRole(UserRole.COORDINATOR), { zoneId: "zone-noa", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["tech-01", "tech-02"] });
    const reloaded = new GuardPlanningService(new LocalGuardPlanningRepository(storage));
    expect((await reloaded.listForScope(mockScopeForRole(UserRole.COORDINATOR))).some((record) => record.duty.startAt === "2026-08-24T08:00:00.000Z")).toBe(true);
  });

  it("keeps every mid-week replacement and rejects duplicate effective timestamps without mutation", async () => {
    const storage = fakeStorage();
    const repository = new LocalGuardPlanningRepository(storage);
    const service = new GuardPlanningService(repository);
    const created = await service.create(mockScopeForRole(UserRole.COORDINATOR), { zoneId: "zone-noa", startAt: "2026-08-17T08:00:00.000Z", endAt: "2026-08-24T08:00:00.000Z", technicianIds: ["tech-01", "tech-02"] });
    const first = await service.replace(mockScopeForRole(UserRole.COORDINATOR), { guardDutyId: created.duty.id, effectiveAt: "2026-08-18T08:00:00.000Z", technicianIds: ["tech-01", "tech-03"], actorUserId: "actor-1" });
    const second = await service.replace(mockScopeForRole(UserRole.COORDINATOR), { guardDutyId: created.duty.id, effectiveAt: "2026-08-20T08:00:00.000Z", technicianIds: ["tech-03", "tech-02"], actorUserId: "actor-2" });
    expect(first.history).toHaveLength(1);
    expect(second.segments).toHaveLength(3);
    expect(second.history).toHaveLength(2);
    await expect(service.replace(mockScopeForRole(UserRole.COORDINATOR), { guardDutyId: created.duty.id, effectiveAt: "2026-08-18T05:00:00-03:00", technicianIds: ["tech-02", "tech-03"], actorUserId: "actor-3" })).rejects.toThrow("histórico es inmutable");
    const unchanged = (await repository.list()).find((record) => record.duty.id === created.duty.id);
    expect(unchanged?.history).toHaveLength(2);
  });

  it("validates known, scoped and zone-eligible technicians in the service", async () => {
    const scope = mockScopeForRole(UserRole.COORDINATOR);
    const service = new GuardPlanningService(new LocalGuardPlanningRepository(fakeStorage()));
    expect(getEligibleTechniciansForZone(scope, "zone-noa").map((technician) => technician.id)).toEqual(["tech-01", "tech-02", "tech-03"]);
    await expect(service.create(scope, { zoneId: "zone-noa", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["missing-tech", "tech-01"] })).rejects.toThrow("no existe");
    await expect(service.create(scope, { zoneId: "zone-patagonia", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["tech-12", "tech-13"] })).rejects.toThrow("UserScope");
    await expect(service.create(scope, { zoneId: "zone-noa", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["tech-04", "tech-05"] })).rejects.toThrow("no es elegible");
    await expect(service.create(scope, { zoneId: "zone-noa", startAt: "2026-08-24T08:00:00.000Z", endAt: "2026-08-25T08:00:00.000Z", technicianIds: ["tech-01", "tech-01"] })).rejects.toThrow("distintos");
  });

  it("queries canonical workday and leave records by date", () => {
    expect(getWorkdayForDate(mockWorkdayRecords, "tech-01", "2026-08-18")?.workdayStartedAt).toContain("08:00");
    expect(getLeaveForDate(mockLeaveRecords, "tech-05", "2026-08-21")?.type).toBe("LICENSE");
    expect(getLeaveForDate(mockLeaveRecords, "tech-05", "2026-08-23")).toBeNull();
  });

  it("reuses working-hours and classifies Sytex activity with or without guard", () => {
    const segments = buildGuardSegments("guard", "2026-08-17T08:00:00Z", "2026-08-24T08:00:00Z", ["tech-01", "tech-02"]).segments;
    expect(isOutsideWorkingHours("2026-08-17T10:00", calendar)).toBe(false);
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T10:00", technicianId: "tech-01", segments, calendar }).classification).toBe(OperationalTimeClassification.WITHIN_WORKING_HOURS);
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T22:00:00Z", technicianId: "tech-01", segments, calendar }).classification).toBe(OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD);
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T22:00:00Z", technicianId: "tech-09", segments, calendar }).classification).toBe(OperationalTimeClassification.OUTSIDE_WORKING_HOURS_NOT_ON_GUARD);
    expect(classifyOperationalActivity({ activityAt: "2026-08-18T19:31", technicianId: "tech-01", segments, calendar }).classification).toBe(OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD);
    expect(classifyOperationalActivity({ activityAt: "2026-08-22T12:00:00Z", technicianId: "tech-01", segments, calendar }).classification).toBe(OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD);
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T22:00:00Z", technicianId: null, segments, calendar }).classification).toBe(OperationalTimeClassification.UNASSIGNED);
    expect(isOutsideHoursClassification(OperationalTimeClassification.WITHIN_WORKING_HOURS)).toBe(false);
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T10:00", technicianId: "tech-01", segments, calendar, onLeave: true }).classification).toBe(OperationalTimeClassification.ON_LEAVE_CONFLICT);
    const holidayCalendar: HolidayCalendar = { isHoliday: (date) => date.toISOString().startsWith("2026-08-17") };
    expect(classifyOperationalActivity({ activityAt: "2026-08-17T10:00", technicianId: "tech-01", segments, calendar: holidayCalendar }).classification).toBe(OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD);
  });
});
