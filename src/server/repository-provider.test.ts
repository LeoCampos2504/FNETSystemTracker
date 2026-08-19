import { describe, expect, it } from "vitest";
import type { BackendRepositories } from "@/server/ports";
import { createPrismaRepositories } from "@/server/repositories/prisma/factory";
import { createRepositoriesForProvider, resolveRepositoryProvider } from "@/server/repository-provider";

describe("resolveRepositoryProvider", () => {
  it("defaults to memory when FNET_REPOSITORY_PROVIDER is unset", () => {
    expect(resolveRepositoryProvider({})).toBe("memory");
  });

  it("accepts an explicit memory value", () => {
    expect(resolveRepositoryProvider({ FNET_REPOSITORY_PROVIDER: "memory" })).toBe("memory");
  });

  it("accepts an explicit prisma value", () => {
    expect(resolveRepositoryProvider({ FNET_REPOSITORY_PROVIDER: "prisma" })).toBe("prisma");
  });

  it("fails fast on an invalid value instead of silently falling back to memory", () => {
    expect(() => resolveRepositoryProvider({ FNET_REPOSITORY_PROVIDER: "banana" })).toThrow(
      /Invalid FNET_REPOSITORY_PROVIDER/,
    );
  });
});

describe("createRepositoriesForProvider", () => {
  it("builds real memory repositories for 'memory' (no DB involved)", async () => {
    const repos = createRepositoriesForProvider("memory");
    const technician = await repos.technician.findById("tech-01");
    expect(technician?.id).toBe("tech-01");
  });

  it("builds the Prisma repository set for 'prisma' without touching a real DB (construction only)", () => {
    // Only wiring the object together, never calling a method on it — this
    // must not require DATABASE_URL/a running database, unlike the actual
    // DB-backed exercise in prisma/tests/**.
    const repos = createRepositoriesForProvider("prisma");
    expect(repos.guard).toBeDefined();
    expect(repos.notification).toBeDefined();
    expect(repos.quote).toBeDefined();
  });
});

describe("createPrismaRepositories structural compatibility with BackendRepositories", () => {
  it("is assignable to BackendRepositories with no unsafe cast (fails to compile otherwise)", () => {
    const prismaRepositories: BackendRepositories = createPrismaRepositories();
    expect(prismaRepositories).toBeDefined();
  });
});
