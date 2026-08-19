import type { QuoteListFilter, QuoteRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapQuote } from "./mappers";
import type { Prisma } from "@/generated/prisma/client";

export const quotePrismaRepository: QuoteRepository = {
  async list(filter: QuoteListFilter = {}) {
    const where: Prisma.QuoteWhereInput = {
      ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
      ...(filter.coordinatorId
        ? { zone: { coordinators: { some: { coordinatorId: filter.coordinatorId } } } }
        : {}),
    };
    const rows = await prisma.quote.findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map(mapQuote);
  },

  async findById(id) {
    const row = await prisma.quote.findUnique({ where: { id } });
    return row ? mapQuote(row) : null;
  },
};
