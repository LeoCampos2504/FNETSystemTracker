import type { Quote } from "@/contracts";
import type { BackendRepositories, QuoteListFilter } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";
import { notFound } from "@/server/http/errors";

export interface QuoteService {
  listQuotes(filter: QuoteListFilter): Promise<Quote[]>;
  getQuoteById(quoteId: string): Promise<Quote>;
}

type QuoteRepositories = Pick<BackendRepositories, "quote">;

/** Pure factory: depends only on the `quote` port. */
export function createQuoteService(repositories: QuoteRepositories): QuoteService {
  return {
    async listQuotes(filter) {
      return repositories.quote.list(filter);
    },

    async getQuoteById(quoteId) {
      const quote = await repositories.quote.findById(quoteId);
      if (!quote) throw notFound(`Quote not found: ${quoteId}`);
      return quote;
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultQuoteService = createQuoteService(defaultRepositories);
export const { listQuotes, getQuoteById } = defaultQuoteService;
