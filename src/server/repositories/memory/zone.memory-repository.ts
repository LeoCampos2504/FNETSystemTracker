import { mockCoordinators, mockSites, mockZones } from "@/mocks";
import type { ZoneRepository } from "@/server/ports";

export const zoneMemoryRepository: ZoneRepository = {
  async findById(id) {
    return mockZones.find((z) => z.id === id) ?? null;
  },
  async listByCoordinator(coordinatorId) {
    const coordinator = mockCoordinators.find((c) => c.id === coordinatorId);
    if (!coordinator) return [];
    return mockZones.filter((z) => coordinator.zoneIds.includes(z.id));
  },
  async listSites(zoneId) {
    return mockSites.filter((s) => s.zoneId === zoneId);
  },
};
