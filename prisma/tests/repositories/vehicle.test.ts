import { afterAll, describe, expect, it } from "vitest";
import { vehiclePrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("vehiclePrismaRepository (real DB)", () => {
  it("findById returns a seeded vehicle with assignedTechnicianId derived from the open assignment", async () => {
    const vehicle = await vehiclePrismaRepository.findById("veh-01");
    expect(vehicle).toMatchObject({ id: "veh-01", plate: "AB101CD", assignedTechnicianId: "tech-01" });
  });

  it("findById returns null for a nonexistent vehicle", async () => {
    expect(await vehiclePrismaRepository.findById("veh-does-not-exist")).toBeNull();
  });

  it("findById returns assignedTechnicianId: null for an unassigned vehicle (veh-08, OUT_OF_SERVICE)", async () => {
    const vehicle = await vehiclePrismaRepository.findById("veh-08");
    expect(vehicle).toMatchObject({ assignedTechnicianId: null });
  });

  it("findByTechnician returns the vehicle currently held by that technician", async () => {
    const vehicle = await vehiclePrismaRepository.findByTechnician("tech-01");
    expect(vehicle?.id).toBe("veh-01");
  });

  it("findByTechnician returns null for a technician with no vehicle", async () => {
    // tech-02, tech-07, tech-13, tech-14 (etc.) are never assigned a vehicle in the seed.
    expect(await vehiclePrismaRepository.findByTechnician("tech-02")).toBeNull();
  });

  it("veh-04's current holder reflects the most recent (non-historical) VehicleAssignment row, not the older one", async () => {
    // seed: va-02 (tech-11, ended) then va-03 (tech-09, still open) for veh-04.
    const vehicle = await vehiclePrismaRepository.findById("veh-04");
    expect(vehicle?.assignedTechnicianId).toBe("tech-09");
    const viaOldHolder = await vehiclePrismaRepository.findByTechnician("tech-11");
    expect(viaOldHolder).toBeNull();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
