import type { VehicleRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapVehicle, vehicleInclude } from "./mappers";

export const vehiclePrismaRepository: VehicleRepository = {
  async findById(id) {
    const row = await prisma.vehicle.findUnique({ where: { id }, include: vehicleInclude });
    return row ? mapVehicle(row) : null;
  },

  async findByTechnician(technicianId) {
    const row = await prisma.vehicle.findFirst({
      where: { assignments: { some: { technicianId, endAt: null } } },
      include: vehicleInclude,
    });
    return row ? mapVehicle(row) : null;
  },
};
