import { mockGuardPerformances, mockGuards } from "@/mocks";
import type { Guard } from "@/contracts";
import type { GuardListFilter, GuardRepository } from "@/server/ports";

const guardsStore: Guard[] = mockGuards.map((guard) => ({ ...guard, technicianIds: [...guard.technicianIds] }));

export const guardMemoryRepository: GuardRepository = {
  async findById(id) {
    return guardsStore.find((g) => g.id === id) ?? null;
  },
  async list(filter: GuardListFilter = {}) {
    return guardsStore.filter(
      (g) =>
        (!filter.zoneId || g.zoneId === filter.zoneId) &&
        (!filter.technicianId || g.technicianIds.includes(filter.technicianId)),
    );
  },
  async getPerformance(guardId) {
    return mockGuardPerformances.find((p) => p.guardId === guardId) ?? null;
  },
  async updateTechnicians(guardId, technicianIds) {
    const guard = guardsStore.find((g) => g.id === guardId);
    if (!guard) throw new Error(`Guard not found: ${guardId}`);
    guard.technicianIds = technicianIds;
    return guard;
  },
};
