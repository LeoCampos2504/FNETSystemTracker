import type { Quote } from "@/contracts";
import type { QuoteListFilter } from "@/server/ports";
import { repositories } from "@/server/container";
import { notFound } from "@/server/http/errors";

export async function listQuotes(filter: QuoteListFilter): Promise<Quote[]> {
  return repositories.quote.list(filter);
}

export async function getQuoteById(quoteId: string): Promise<Quote> {
  const quote = await repositories.quote.findById(quoteId);
  if (!quote) throw notFound(`Quote not found: ${quoteId}`);
  return quote;
}
