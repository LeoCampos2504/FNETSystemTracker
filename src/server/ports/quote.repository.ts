import type { QuoteStatus, Quote } from "@/contracts";

export interface QuoteListFilter {
  zoneId?: string;
  coordinatorId?: string;
  status?: QuoteStatus;
}

export interface QuoteRepository {
  list(filter?: QuoteListFilter): Promise<Quote[]>;
}
