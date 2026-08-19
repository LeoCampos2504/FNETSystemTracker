import { describe, expect, it } from "vitest";
import { createPrismaRepositories } from "./factory";
import { userPrismaRepository } from "./user.prisma-repository";
import { technicianPrismaRepository } from "./technician.prisma-repository";
import { taskPrismaRepository } from "./task.prisma-repository";
import { guardPrismaRepository } from "./guard.prisma-repository";
import { vehiclePrismaRepository } from "./vehicle.prisma-repository";
import { zonePrismaRepository } from "./zone.prisma-repository";
import { quotePrismaRepository } from "./quote.prisma-repository";
import { notificationPrismaRepository } from "./notification.prisma-repository";
import { auditPrismaRepository } from "./audit.prisma-repository";
import { authCredentialsPrismaRepository } from "./auth-credentials.prisma-repository";

/**
 * Pure/no-DB: constructing the factory's object doesn't touch the database
 * (each field is just an already-built adapter reference). This is the
 * "fail immediately if someone forgets to register an adapter" check that
 * runs on every `npm test`, not just `npm run test:db`.
 */
describe("createPrismaRepositories", () => {
  it("exposes exactly the 10 expected keys, nothing more, nothing less", () => {
    const repos = createPrismaRepositories();
    const expectedKeys = [
      "user",
      "technician",
      "task",
      "guard",
      "vehicle",
      "zone",
      "quote",
      "notification",
      "audit",
      "authCredentials",
    ].sort();
    expect(Object.keys(repos).sort()).toEqual(expectedKeys);
  });

  it("wires each field to the actual matching adapter singleton (not a stub/placeholder)", () => {
    const repos = createPrismaRepositories();
    expect(repos.user).toBe(userPrismaRepository);
    expect(repos.technician).toBe(technicianPrismaRepository);
    expect(repos.task).toBe(taskPrismaRepository);
    expect(repos.guard).toBe(guardPrismaRepository);
    expect(repos.vehicle).toBe(vehiclePrismaRepository);
    expect(repos.zone).toBe(zonePrismaRepository);
    expect(repos.quote).toBe(quotePrismaRepository);
    expect(repos.notification).toBe(notificationPrismaRepository);
    expect(repos.audit).toBe(auditPrismaRepository);
    expect(repos.authCredentials).toBe(authCredentialsPrismaRepository);
  });

  it("every adapter exposes only async functions (no accidental data leakage as plain fields)", () => {
    const repos = createPrismaRepositories();
    for (const [name, adapter] of Object.entries(repos)) {
      for (const [methodName, value] of Object.entries(adapter as Record<string, unknown>)) {
        expect(typeof value, `${name}.${methodName} should be a function`).toBe("function");
      }
    }
  });

  it("calling the factory twice returns the same underlying singletons (no per-call reconstruction)", () => {
    const first = createPrismaRepositories();
    const second = createPrismaRepositories();
    expect(second.user).toBe(first.user);
    expect(second.authCredentials).toBe(first.authCredentials);
  });
});
