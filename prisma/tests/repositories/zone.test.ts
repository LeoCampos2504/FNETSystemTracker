import { afterAll, describe, expect, it } from "vitest";
import { zonePrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("zonePrismaRepository (real DB)", () => {
  it("findById returns a seeded zone with its coordinatorIds", async () => {
    const zone = await zonePrismaRepository.findById("zone-centro");
    expect(zone).not.toBeNull();
    expect(zone!.coordinatorIds).toEqual(expect.arrayContaining(["coord-2", "coord-3"]));
  });

  it("findById returns null for a nonexistent zone", async () => {
    expect(await zonePrismaRepository.findById("zone-does-not-exist")).toBeNull();
  });

  it("listByCoordinator returns every zone a coordinator administers", async () => {
    const zones = await zonePrismaRepository.listByCoordinator("coord-1");
    expect(zones.map((z) => z.id)).toEqual(expect.arrayContaining(["zone-noa", "zone-nea"]));
  });

  it("listByCoordinator returns an empty array for a nonexistent coordinator", async () => {
    expect(await zonePrismaRepository.listByCoordinator("coord-does-not-exist")).toEqual([]);
  });

  it("listSites returns only sites belonging to that zone", async () => {
    const sites = await zonePrismaRepository.listSites("zone-noa");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => s.zoneId === "zone-noa")).toBe(true);
  });

  it("listSites returns an empty array for a zone with no sites", async () => {
    expect(await zonePrismaRepository.listSites("zone-does-not-exist")).toEqual([]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
