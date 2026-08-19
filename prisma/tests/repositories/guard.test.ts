import { afterAll, describe, expect, it } from "vitest";
import { guardPrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("guardPrismaRepository (real DB)", () => {
  it("findById returns a seeded guard with its crew", async () => {
    const guard = await guardPrismaRepository.findById("guard-noa-1");
    expect(guard).toMatchObject({ id: "guard-noa-1", zoneId: "zone-noa" });
    expect(guard!.technicianIds.length).toBeGreaterThan(0);
  });

  it("findById returns null for a nonexistent guard", async () => {
    expect(await guardPrismaRepository.findById("guard-does-not-exist")).toBeNull();
  });

  it("list filters by zoneId", async () => {
    const guards = await guardPrismaRepository.list({ zoneId: "zone-noa" });
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.every((g) => g.zoneId === "zone-noa")).toBe(true);
  });

  it("list filters by technicianId", async () => {
    const guards = await guardPrismaRepository.list({ technicianId: "tech-01" });
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.every((g) => g.technicianIds.includes("tech-01"))).toBe(true);
  });

  it("getPerformance derives correctivesCompleted from real task/guard interval overlap, not a fixed 18:00 rule", async () => {
    const perf = await guardPrismaRepository.getPerformance("guard-centro-3");
    expect(perf).not.toBeNull();
    expect(perf!.guardId).toBe("guard-centro-3");
    expect(perf!.correctivesCompleted).toBeGreaterThanOrEqual(0);
    expect(perf!.averageDurationMinutes).toBeGreaterThanOrEqual(0);
  });

  it("getPerformance returns null for a nonexistent guard", async () => {
    expect(await guardPrismaRepository.getPerformance("guard-does-not-exist")).toBeNull();
  });

  it("updateTechnicians replaces the crew and is durable", async () => {
    const original = await guardPrismaRepository.findById("guard-nea-2");
    expect(original).not.toBeNull();

    const updated = await guardPrismaRepository.updateTechnicians("guard-nea-2", ["tech-13"]);
    expect(updated.technicianIds).toEqual(["tech-13"]);

    const reFetched = await guardPrismaRepository.findById("guard-nea-2");
    expect(reFetched!.technicianIds).toEqual(["tech-13"]);

    // restore
    await guardPrismaRepository.updateTechnicians("guard-nea-2", original!.technicianIds);
  });

  it("updateTechnicians rejects a duplicate technicianId in the same guard (composite PK enforced by the DB)", async () => {
    const original = await guardPrismaRepository.findById("guard-cuyo-2");
    expect(original).not.toBeNull();

    await expect(guardPrismaRepository.updateTechnicians("guard-cuyo-2", ["tech-06", "tech-06"])).rejects.toThrow();

    const reFetched = await guardPrismaRepository.findById("guard-cuyo-2");
    expect(reFetched!.technicianIds).toEqual(original!.technicianIds);
  });

  it("create persists a new guard with its crew and is durable", async () => {
    const created = await guardPrismaRepository.create({
      zoneId: "zone-noa",
      technicianIds: ["tech-01", "tech-02"],
      startAt: "2026-06-01T08:00:00.000Z",
      endAt: "2026-06-08T08:00:00.000Z",
    });

    expect(created.zoneId).toBe("zone-noa");
    expect(created.technicianIds.sort()).toEqual(["tech-01", "tech-02"]);
    expect(created.startAt).toBe("2026-06-01T08:00:00.000Z");
    expect(created.endAt).toBe("2026-06-08T08:00:00.000Z");

    const reFetched = await guardPrismaRepository.findById(created.id);
    expect(reFetched).not.toBeNull();
    expect(reFetched!.technicianIds.sort()).toEqual(["tech-01", "tech-02"]);
  });

  it("update patches zone/dates without touching the crew when technicianIds is omitted", async () => {
    const original = await guardPrismaRepository.findById("guard-nea-2");
    expect(original).not.toBeNull();

    const updated = await guardPrismaRepository.update("guard-nea-2", { endAt: "2099-01-01T00:00:00.000Z" });
    expect(updated.endAt).toBe("2099-01-01T00:00:00.000Z");
    expect(updated.zoneId).toBe(original!.zoneId);
    expect(updated.technicianIds.sort()).toEqual(original!.technicianIds.sort());

    // restore
    await guardPrismaRepository.update("guard-nea-2", { endAt: original!.endAt });
  });

  it("update replaces the crew when technicianIds is provided", async () => {
    const original = await guardPrismaRepository.findById("guard-nea-2");
    expect(original).not.toBeNull();

    const updated = await guardPrismaRepository.update("guard-nea-2", { technicianIds: ["tech-13"] });
    expect(updated.technicianIds).toEqual(["tech-13"]);

    // restore
    await guardPrismaRepository.update("guard-nea-2", { technicianIds: original!.technicianIds });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
