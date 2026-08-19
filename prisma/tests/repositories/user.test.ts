import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { userPrismaRepository } from "@/server/repositories/prisma";

describe("userPrismaRepository (real DB)", () => {
  it("findById returns the seeded admin user with the right shape", async () => {
    const user = await userPrismaRepository.findById("user-admin-1");
    expect(user).toMatchObject({
      id: "user-admin-1",
      email: "admin@fnet.local",
      role: UserRole.ADMIN,
      technicianId: null,
      coordinatorId: null,
      active: true,
    });
  });

  it("findById returns null for a nonexistent id", async () => {
    expect(await userPrismaRepository.findById("user-does-not-exist")).toBeNull();
  });

  it("findByEmail resolves a technician user and links technicianId", async () => {
    const user = await userPrismaRepository.findByEmail("tech-01@fnet.local");
    expect(user).toMatchObject({ role: UserRole.TECHNICIAN, technicianId: "tech-01" });
  });

  it("findByEmail is case-insensitive", async () => {
    const user = await userPrismaRepository.findByEmail("ADMIN@FNET.LOCAL");
    expect(user?.id).toBe("user-admin-1");
  });

  it("findByEmail returns null for an unknown address", async () => {
    expect(await userPrismaRepository.findByEmail("nobody@fnet.local")).toBeNull();
  });

  it("never leaks passwordHash — the port's User shape has no such field", async () => {
    const user = await userPrismaRepository.findById("user-admin-1");
    expect(user).not.toHaveProperty("passwordHash");
  });
});
