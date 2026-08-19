import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * prisma/seed.ts clears its own tables before inserting, so running it twice
 * in a row should leave every table at the exact same row count — no
 * duplicated users/technicians/tasks/assignments/guards/vehicles/quotes/
 * notifications. This actually re-runs the seed script (not just re-imports
 * the counts from a single run), so it's a real end-to-end idempotency
 * check, not a proxy for one.
 */
// Sequential, not Promise.all: the local `prisma dev` embedded server is a
// lightweight dev-only process (see docs/DATABASE.md) — firing 17 counts
// concurrently right after a seed child-process's connection just closed
// occasionally surfaced "Connection terminated unexpectedly" here. A real
// production Postgres wouldn't need this; it's a concession to the
// lightweight local dev database, not a design choice for the query itself.
async function countAll() {
  const tableCounters = {
    users: () => prisma.user.count(),
    technicians: () => prisma.technician.count(),
    coordinators: () => prisma.coordinator.count(),
    zones: () => prisma.zone.count(),
    coordinatorZones: () => prisma.coordinatorZone.count(),
    sites: () => prisma.site.count(),
    tasks: () => prisma.task.count(),
    taskTechnicians: () => prisma.taskTechnician.count(),
    taskStatusHistory: () => prisma.taskStatusHistory.count(),
    taskRejections: () => prisma.taskRejection.count(),
    guards: () => prisma.guard.count(),
    guardTechnicians: () => prisma.guardTechnician.count(),
    vehicles: () => prisma.vehicle.count(),
    vehicleAssignments: () => prisma.vehicleAssignment.count(),
    quotes: () => prisma.quote.count(),
    notifications: () => prisma.notification.count(),
    auditLogs: () => prisma.auditLog.count(),
  } as const;

  const result = {} as Record<keyof typeof tableCounters, number>;
  for (const key of Object.keys(tableCounters) as (keyof typeof tableCounters)[]) {
    result[key] = await withRetry(tableCounters[key]);
  }
  return result;
}

/** Retries once after a short delay on a transient connection error. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn("Transient DB error, retrying once:", error);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fn();
  }
}

function runSeed() {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "pipe", env: process.env, shell: true });
}

describe("prisma/seed.ts idempotency (real DB)", () => {
  it("running the seed twice produces identical row counts across every table", async () => {
    runSeed();
    const first = await countAll();

    runSeed();
    const second = await countAll();

    expect(second).toEqual(first);
    // sanity: this isn't just two empty runs agreeing on zero.
    expect(first.tasks).toBeGreaterThan(0);
    expect(first.users).toBeGreaterThan(0);
  }, 60_000);

  it("running the seed a third time is still stable", async () => {
    const before = await countAll();
    runSeed();
    const after = await countAll();
    expect(after).toEqual(before);
  }, 60_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});
