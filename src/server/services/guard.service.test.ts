import { describe, expect, it } from "vitest";
import { repositories } from "@/server/container";
import { listNotificationsForUser } from "./notification.service";
import {
  assignGuardTechnicians,
  createGuard,
  findGuardById,
  getGuardById,
  getGuardPerformance,
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

describe("findGuardById", () => {
  it("resolves null instead of throwing for an unknown guard (backs Api.getGuardPerformance)", async () => {
    expect(await findGuardById("does-not-exist")).toBeNull();
  });

  it("resolves the guard when it exists", async () => {
    expect((await findGuardById("guard-noa-1"))?.id).toBe("guard-noa-1");
  });
});

describe("getGuardPerformance", () => {
  it("resolves null instead of throwing when the guard itself doesn't exist (backs Api.getGuardPerformance)", async () => {
    expect(await getGuardPerformance("does-not-exist")).toBeNull();
  });

  it("resolves the performance record for a real guard", async () => {
    const performance = await getGuardPerformance("guard-noa-1");
    expect(performance?.guardId).toBe("guard-noa-1");
  });
});

describe("audit before/after coherence", () => {
  // Regression test: guard.memory-repository.ts mutates a guard in place and
  // returns that same reference, so a naive "read before.field after the
  // mutating call" would make the audit's "before" equal to "after".
  it("updateGuard audits the ORIGINAL crew as 'before', not the new one", async () => {
    const original = await getGuardById("guard-nea-1");
    const originalTechnicianIds = [...original.technicianIds];

    await updateGuard("user-coord-1", "guard-nea-1", { technicianIds: ["tech-04"] });

    const entries = await repositories.audit.listByEntity("Guard", "guard-nea-1");
    const entry = entries.at(-1)!;
    expect((entry.before as { technicianIds: string[] }).technicianIds).toEqual(originalTechnicianIds);
    expect((entry.after as { technicianIds: string[] }).technicianIds).toEqual(["tech-04"]);
    expect(entry.before).not.toEqual(entry.after);
  });
});

describe("validation: unknown references", () => {
  it("rejects createGuard with an unknown technicianId", async () => {
    await expect(
      createGuard("user-coord-1", {
        zoneId: "zone-noa",
        technicianIds: ["does-not-exist"],
        startAt: "2026-09-01T08:00:00.000Z",
        endAt: "2026-09-08T08:00:00.000Z",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects createGuard with an unknown zoneId", async () => {
    await expect(
      createGuard("user-coord-1", {
        zoneId: "does-not-exist",
        technicianIds: ["tech-01"],
        startAt: "2026-09-01T08:00:00.000Z",
        endAt: "2026-09-08T08:00:00.000Z",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects updateGuard with an unknown technicianId", async () => {
    await expect(
      updateGuard("user-coord-1", "guard-nea-2", { technicianIds: ["does-not-exist"] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("notification side effects avoid duplicates", () => {
  it("only notifies technician(s) newly added to the crew, and a no-op re-assignment notifies nobody", async () => {
    // guard-cuyo-3 starts as tech-06/tech-07 (see src/mocks/guards.ts).
    await updateGuard("user-coord-2", "guard-cuyo-3", { technicianIds: ["tech-06", "tech-08"] });
    const tech08NotificationsAfterFirst = await listNotificationsForUser("user-tech-08");
    const firstCount = tech08NotificationsAfterFirst.filter((n) => n.relatedEntityId === "guard-cuyo-3").length;
    expect(firstCount).toBeGreaterThan(0);

    const tech06NotificationsAfterFirst = await listNotificationsForUser("user-tech-06");
    const tech06CountAfterFirst = tech06NotificationsAfterFirst.filter(
      (n) => n.relatedEntityId === "guard-cuyo-3",
    ).length;
    expect(tech06CountAfterFirst).toBe(0); // tech-06 was already on the guard, not "added"

    // No-op: re-assign the exact same crew.
    await updateGuard("user-coord-2", "guard-cuyo-3", { technicianIds: ["tech-06", "tech-08"] });
    const tech08NotificationsAfterSecond = await listNotificationsForUser("user-tech-08");
    const secondCount = tech08NotificationsAfterSecond.filter((n) => n.relatedEntityId === "guard-cuyo-3").length;
    expect(secondCount).toBe(firstCount); // no duplicate for the no-op
  });
});
