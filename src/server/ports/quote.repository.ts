import type { QuoteStatus, Quote } from "@/contracts";

export interface QuoteListFilter {
  zoneId?: string;
  coordinatorId?: string;
  status?: QuoteStatus;
  projectId?: string;
  /** Inclusive createdAt range, ISO date strings. */
  from?: string;
  to?: string;
}

export interface QuoteRepository {
  list(filter?: QuoteListFilter): Promise<Quote[]>;
  findById(id: string): Promise<Quote | null>;
}
