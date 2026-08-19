import { describe, expect, it } from "vitest";
import {
  assignGuardTechnicians,
  createGuard,
  getGuardById,
  listGuards,
  updateGuard,
} from "./guard.service";

describe("listGuards", () => {
  it("filters guards by zone", async () => {
    const guards = await listGuards({ zoneIds: ["zone-noa"] });
    expect(guards.length).toBeGreaterThan(0);
    for (const guard of guards) expect(guard.zoneId).toBe("zone-noa");
  });

  it("filters guards by technician (finds the mixed temporary crew)", async () => {
    const guards = await listGuards({ technicianId: "tech-05" });
    expect(guards.some((g) => g.id === "guard-centro-3")).toBe(true);
  });
});

describe("createGuard", () => {
  it("creates a guard with a temporary/mixed crew of up to 2 technicians", async () => {
    const guard = await createGuard("user-coord-2", {
      zoneId: "zone-cuyo",
      technicianIds: ["tech-06", "tech-11"],
      startAt: "2026-09-01T08:00:00.000Z",
      endAt: "2026-09-08T08:00:00.000Z",
    });
    expect(guard.id).toEqual(expect.any(String));
    expect(guard.technicianIds).toEqual(["tech-06", "tech-11"]);

    const fetched = await getGuardById(guard.id);
    expect(fetched).toEqual(guard);
  });
});

describe("updateGuard", () => {
  it("rejects an interval where endAt is not after startAt", async () => {
    await expect(
      updateGuard("user-coord-1", "guard-noa-1", { startAt: "2026-08-20T08:00:00.000Z", endAt: "2026-08-19T08:00:00.000Z" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws a 404 for an unknown guard", async () => {
    await expect(getGuardById("does-not-exist")).rejects.toMatchObject({ status: 404 });
  });
});

describe("assignGuardTechnicians", () => {
  it("supports a single technician exceptionally", async () => {
    const updated = await assignGuardTechnicians("user-coord-1", "guard-noa-4", ["tech-03"]);
    expect(updated.technicianIds).toEqual(["tech-03"]);
  });
});
