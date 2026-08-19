import { afterAll, describe, expect, it } from "vitest";
import { auditPrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("auditPrismaRepository (real DB)", () => {
  it("listByEntity returns the seeded audit rows for that entity", async () => {
    const entries = await auditPrismaRepository.listByEntity("Task", "task-P0006");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor: "user-coord-1", action: "TASK_STATUS_CHANGED" });
    expect(entries[0].before).toEqual({ status: "IN_REVIEW" });
    expect(entries[0].after).toEqual({ status: "APPROVED" });
  });

  it("listByEntity returns an empty array for an entity with no history", async () => {
    expect(await auditPrismaRepository.listByEntity("Task", "task-does-not-exist")).toEqual([]);
  });

  it("append persists actor/action/entity/entityId/before/after and stamps id + timestamp", async () => {
    const created = await auditPrismaRepository.append({
      actor: "user-coord-1",
      action: "TEST_ACTION",
      entity: "Task",
      entityId: "task-integration-test-marker",
      before: { status: "OPEN" },
      after: { status: "IN_PROGRESS" },
    });

    expect(created.id).toBeTruthy();
    expect(created.timestamp).toBeTruthy();
    expect(created).toMatchObject({
      actor: "user-coord-1",
      action: "TEST_ACTION",
      entity: "Task",
      entityId: "task-integration-test-marker",
    });

    const fetched = await auditPrismaRepository.listByEntity("Task", "task-integration-test-marker");
    expect(fetched).toHaveLength(1);
    expect(fetched[0].before).toEqual({ status: "OPEN" });
    expect(fetched[0].after).toEqual({ status: "IN_PROGRESS" });

    // cleanup — this row isn't part of the seed baseline.
    await prisma.auditLog.delete({ where: { id: created.id } });
  });

  it("append persists null before/after as null, not a JSON literal string", async () => {
    const created = await auditPrismaRepository.append({
      actor: "user-coord-1",
      action: "TEST_ACTION_NO_SNAPSHOT",
      entity: "Zone",
      entityId: "zone-integration-test-marker",
      before: null,
      after: null,
    });

    expect(created.before).toBeNull();
    expect(created.after).toBeNull();

    await prisma.auditLog.delete({ where: { id: created.id } });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
