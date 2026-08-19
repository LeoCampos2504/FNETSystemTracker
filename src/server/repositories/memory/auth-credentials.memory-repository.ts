import bcrypt from "bcryptjs";
import { MOCK_DEMO_PASSWORD, mockUsers } from "@/mocks";
import type { AuthCredentialsRepository } from "@/server/ports";

// Every demo user shares the same password (see src/mocks/users.ts). Hashed
// once at module load so nothing here ever stores or compares plain text.
const DEMO_HASH = bcrypt.hashSync(MOCK_DEMO_PASSWORD, 10);

const hashesByUserId = new Map<string, string>(mockUsers.map((u) => [u.id, DEMO_HASH]));

export const authCredentialsMemoryRepository: AuthCredentialsRepository = {
  async getPasswordHash(userId) {
    return hashesByUserId.get(userId) ?? null;
  },
};
