import { mockVehicles } from "@/mocks";
import type { VehicleRepository } from "@/server/ports";

export const vehicleMemoryRepository: VehicleRepository = {
  async findById(id) {
    return mockVehicles.find((v) => v.id === id) ?? null;
  },
  async findByTechnician(technicianId) {
    return mockVehicles.find((v) => v.assignedTechnicianId === technicianId) ?? null;
  },
};
