import { afterAll, describe, expect, it } from "vitest";
import { createPrismaRepositories } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * Exercises a representative real operation from several adapters, but
 * called through the factory-constructed object (not by importing each
 * *.prisma-repository.ts directly, the way prisma/tests/repositories/**
 * does). This is the "10 adapters wired together as a coherent set against
 * a real DB" smoke test — the individual adapter test files already cover
 * behavior in depth.
 */
describe("createPrismaRepositories (real DB)", () => {
  it("wires all 10 adapters to working, real-DB-backed implementations", async () => {
    const repos = createPrismaRepositories();

    const user = await repos.user.findById("user-admin-1");
    expect(user).toMatchObject({ id: "user-admin-1" });

    const technician = await repos.technician.findById("tech-01");
    expect(technician).toMatchObject({ id: "tech-01" });

    const task = await repos.task.findById("task-P0001");
    expect(task).toMatchObject({ id: "task-P0001" });

    const guard = await repos.guard.findById("guard-noa-1");
    expect(guard).toMatchObject({ id: "guard-noa-1" });

    const vehicle = await repos.vehicle.findById("veh-01");
    expect(vehicle).toMatchObject({ id: "veh-01" });

    const zone = await repos.zone.findById("zone-noa");
    expect(zone).toMatchObject({ id: "zone-noa" });

    const quotes = await repos.quote.list({ zoneId: "zone-noa" });
    expect(quotes.length).toBeGreaterThan(0);

    const notifications = await repos.notification.listByUser("user-tech-01");
    expect(notifications.length).toBeGreaterThan(0);

    const auditEntries = await repos.audit.listByEntity("Task", "task-P0006");
    expect(auditEntries.length).toBeGreaterThan(0);

    const hash = await repos.authCredentials.getPasswordHash("user-admin-1");
    expect(hash).not.toBeNull();
  });

  it("findById-style lookups return null for a nonexistent id through the factory too (not an exception)", async () => {
    const repos = createPrismaRepositories();

    await expect(repos.user.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.technician.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.task.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.guard.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.vehicle.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.zone.findById("does-not-exist")).resolves.toBeNull();
    await expect(repos.authCredentials.getPasswordHash("does-not-exist")).resolves.toBeNull();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
