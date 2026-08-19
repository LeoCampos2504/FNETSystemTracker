import { mockTechnicians } from "@/mocks";
import type { TechnicianRepository } from "@/server/ports";

export const technicianMemoryRepository: TechnicianRepository = {
  async findById(id) {
    return mockTechnicians.find((t) => t.id === id) ?? null;
  },
  async listByZone(zoneId) {
    return mockTechnicians.filter((t) => t.primaryZoneId === zoneId || t.onLoanZoneId === zoneId);
  },
};
