import type { UserRepository } from "@/server/ports";
import { prisma } from "./client";
import { mapUser } from "./mappers";

const userInclude = { technician: true, coordinator: true } as const;

export const userPrismaRepository: UserRepository = {
  async findById(id) {
    const row = await prisma.user.findUnique({ where: { id }, include: userInclude });
    return row ? mapUser(row) : null;
  },

  async findByEmail(email) {
    const row = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: userInclude,
    });
    return row ? mapUser(row) : null;
  },
};
