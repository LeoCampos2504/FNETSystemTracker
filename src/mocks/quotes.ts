import type { Quote } from "@/contracts";
import { ExternalSource, QuoteStatus } from "@/contracts";
import { MOCK_TODAY, addDaysUtc } from "./constants";

interface QuoteSeed {
  id: string;
  zoneId: string;
  projectId: string | null;
  status: (typeof QuoteStatus)[keyof typeof QuoteStatus];
  createdOffset: number;
  updatedOffset: number;
}

const seeds: QuoteSeed[] = [
  { id: "quote-001", zoneId: "zone-noa", projectId: "proj-fibra-noa", status: QuoteStatus.OPEN, createdOffset: -1, updatedOffset: -1 },
  { id: "quote-002", zoneId: "zone-noa", projectId: "proj-fibra-noa", status: QuoteStatus.OPEN, createdOffset: -3, updatedOffset: -3 },
  { id: "quote-003", zoneId: "zone-nea", projectId: null, status: QuoteStatus.IN_PROGRESS, createdOffset: -6, updatedOffset: -2 },
  { id: "quote-004", zoneId: "zone-cuyo", projectId: "proj-torres-cuyo", status: QuoteStatus.WAITING, createdOffset: -10, updatedOffset: -4 },
  { id: "quote-005", zoneId: "zone-cuyo", projectId: "proj-torres-cuyo", status: QuoteStatus.OPEN, createdOffset: -1, updatedOffset: -1 },
  { id: "quote-006", zoneId: "zone-centro", projectId: null, status: QuoteStatus.COMPLETED_WITH_PENDING, createdOffset: -20, updatedOffset: -5 },
  { id: "quote-007", zoneId: "zone-centro", projectId: "proj-datacenter-ctr", status: QuoteStatus.COMPLETED, createdOffset: -25, updatedOffset: -12 },
  { id: "quote-008", zoneId: "zone-centro", projectId: "proj-datacenter-ctr", status: QuoteStatus.COMPLETED, createdOffset: -30, updatedOffset: -18 },
  { id: "quote-009", zoneId: "zone-patagonia", projectId: null, status: QuoteStatus.OPEN, createdOffset: -2, updatedOffset: -2 },
  { id: "quote-010", zoneId: "zone-patagonia", projectId: "proj-antenas-pat", status: QuoteStatus.IN_PROGRESS, createdOffset: -8, updatedOffset: -1 },
  { id: "quote-011", zoneId: "zone-nea", projectId: null, status: QuoteStatus.COMPLETED, createdOffset: -40, updatedOffset: -22 },
  { id: "quote-012", zoneId: "zone-noa", projectId: null, status: QuoteStatus.COMPLETED, createdOffset: -35, updatedOffset: -19 },
];

export const mockQuotes: Quote[] = seeds.map((seed) => ({
  id: seed.id,
  code: seed.id.replace("quote-", "COT-"),
  zoneId: seed.zoneId,
  projectId: seed.projectId,
  status: seed.status,
  createdAt: addDaysUtc(MOCK_TODAY, seed.createdOffset).toISOString(),
  updatedAt: addDaysUtc(MOCK_TODAY, seed.updatedOffset).toISOString(),
  externalId: `SYTEX-QUOTE-${seed.id.slice(-3)}`,
  externalSource: ExternalSource.SYTEX,
  sourceUpdatedAt: addDaysUtc(MOCK_TODAY, seed.updatedOffset).toISOString(),
}));
