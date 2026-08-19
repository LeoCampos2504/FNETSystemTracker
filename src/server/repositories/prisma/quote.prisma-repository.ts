import type { QuoteListFilter, QuoteRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapQuote } from "./mappers";
import type { Prisma } from "@/generated/prisma/client";

export const quotePrismaRepository: QuoteRepository = {
  async list(filter: QuoteListFilter = {}) {
    const where: Prisma.QuoteWhereInput = {
      ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.coordinatorId
        ? { zone: { coordinators: { some: { coordinatorId: filter.coordinatorId } } } }
        : {}),
    };
    const rows = await prisma.quote.findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map(mapQuote);
  },
};
