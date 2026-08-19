import { mockGuardPerformances, mockGuards } from "@/mocks";
import type { Guard } from "@/contracts";
import { ExternalSource } from "@/contracts";
import type { GuardListFilter, GuardRepository } from "@/server/ports";

const guardsStore: Guard[] = mockGuards.map((guard) => ({ ...guard, technicianIds: [...guard.technicianIds] }));
let nextId = guardsStore.length + 1;

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
  async create(input) {
    const guard: Guard = {
      id: `guard-mem-${nextId++}`,
      zoneId: input.zoneId,
      technicianIds: input.technicianIds,
      startAt: input.startAt,
      endAt: input.endAt,
      externalId: null,
      externalSource: ExternalSource.INTERNAL,
      sourceUpdatedAt: null,
    };
    guardsStore.push(guard);
    return guard;
  },
  async update(guardId, patch) {
    const guard = guardsStore.find((g) => g.id === guardId);
    if (!guard) throw new Error(`Guard not found: ${guardId}`);
    if (patch.zoneId !== undefined) guard.zoneId = patch.zoneId;
    if (patch.technicianIds !== undefined) guard.technicianIds = patch.technicianIds;
    if (patch.startAt !== undefined) guard.startAt = patch.startAt;
    if (patch.endAt !== undefined) guard.endAt = patch.endAt;
    return guard;
  },
};
