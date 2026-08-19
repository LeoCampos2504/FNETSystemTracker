import { mockCoordinators, mockQuotes } from "@/mocks";
import type { QuoteListFilter, QuoteRepository } from "@/server/ports";

export const quoteMemoryRepository: QuoteRepository = {
  async list(filter: QuoteListFilter = {}) {
    const coordinatorZoneIds = filter.coordinatorId
      ? new Set(mockCoordinators.find((c) => c.id === filter.coordinatorId)?.zoneIds ?? [])
      : null;
    return mockQuotes.filter(
      (q) =>
        (!filter.zoneId || q.zoneId === filter.zoneId) &&
        (!filter.status || q.status === filter.status) &&
        (!filter.projectId || q.projectId === filter.projectId) &&
        (!filter.from || q.createdAt >= filter.from) &&
        (!filter.to || q.createdAt <= filter.to) &&
        (!coordinatorZoneIds || coordinatorZoneIds.has(q.zoneId)),
    );
  },
  async findById(id) {
    return mockQuotes.find((q) => q.id === id) ?? null;
  },
};
