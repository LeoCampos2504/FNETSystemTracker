import { mockUsers } from "@/mocks";
import type { UserRepository } from "@/server/ports";

export const userMemoryRepository: UserRepository = {
  async findById(id) {
    return mockUsers.find((u) => u.id === id) ?? null;
  },
  async findByEmail(email) {
    return mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
};
