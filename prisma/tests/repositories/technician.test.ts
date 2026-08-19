import { describe, expect, it } from "vitest";
import { technicianPrismaRepository } from "@/server/repositories/prisma";

describe("technicianPrismaRepository (real DB)", () => {
  it("findById returns a seeded technician", async () => {
    const tech = await technicianPrismaRepository.findById("tech-01");
    expect(tech).toMatchObject({ id: "tech-01", name: "Bruno Alvarez", primaryZoneId: "zone-noa", active: true });
  });

  it("findById returns null for a nonexistent id", async () => {
    expect(await technicianPrismaRepository.findById("tech-does-not-exist")).toBeNull();
  });

  it("listByZone includes technicians whose primaryZoneId matches", async () => {
    const techs = await technicianPrismaRepository.listByZone("zone-noa");
    expect(techs.map((t) => t.id)).toEqual(expect.arrayContaining(["tech-01", "tech-02", "tech-03"]));
  });

  it("listByZone also includes technicians on loan to that zone (tech-05 -> zone-centro)", async () => {
    const techs = await technicianPrismaRepository.listByZone("zone-centro");
    expect(techs.some((t) => t.id === "tech-05")).toBe(true);
    // and tech-05's own primary zone record still says zone-nea — the loan never overwrote it.
    const tech05 = await technicianPrismaRepository.findById("tech-05");
    expect(tech05).toMatchObject({ primaryZoneId: "zone-nea", onLoanZoneId: "zone-centro" });
  });

  it("listByZone returns an empty array for a zone with no technicians", async () => {
    expect(await technicianPrismaRepository.listByZone("zone-does-not-exist")).toEqual([]);
  });
});
