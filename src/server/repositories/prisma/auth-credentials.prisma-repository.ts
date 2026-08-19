import type { AuthCredentialsRepository } from "@/server/ports";
import { prisma } from "./client";

export const authCredentialsPrismaRepository: AuthCredentialsRepository = {
  async getPasswordHash(userId) {
    // `select` fetches only the one column — never the full User row, and
    // definitely never exposed as part of a User-shaped return value.
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    return row?.passwordHash ?? null;
  },
};
