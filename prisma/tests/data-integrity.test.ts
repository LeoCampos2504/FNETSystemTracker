import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * Regression tests for the two schema decisions made in the
 * harden_persistence_integrity migration (see docs/DATABASE.md). Both were
 * also manually verified once during a real init -> hardening upgrade
 * against pre-existing data (see the block's external report) — these are
 * the permanent, ongoing checks against the always-current schema.
 */
describe("composite (externalSource, externalId) uniqueness (real DB)", () => {
  const zoneIdsToClean: string[] = [];

  afterAll(async () => {
    if (zoneIdsToClean.length > 0) {
      await prisma.zone.deleteMany({ where: { id: { in: zoneIdsToClean } } });
    }
  });

  it("rejects an exact duplicate (same externalSource, same externalId)", async () => {
    const externalId = `dup-check-${Date.now()}`;
    const first = await prisma.zone.create({
      data: { id: `zone-dup-a-${Date.now()}`, name: "Dup A", code: `DUP-A-${Date.now()}`, externalId, externalSource: "SYTEX" },
    });
    zoneIdsToClean.push(first.id);

    await expect(
      prisma.zone.create({
        data: { id: `zone-dup-b-${Date.now()}`, name: "Dup B", code: `DUP-B-${Date.now()}`, externalId, externalSource: "SYTEX" },
      }),
    ).rejects.toThrow();
  });

  it("allows two different source systems to independently use the same externalId string", async () => {
    const externalId = `cross-source-${Date.now()}`;
    const sytexRow = await prisma.zone.create({
      data: { id: `zone-cross-sytex-${Date.now()}`, name: "Cross Sytex", code: `CROSS-SYTEX-${Date.now()}`, externalId, externalSource: "SYTEX" },
    });
    const bizflowRow = await prisma.zone.create({
      data: { id: `zone-cross-bizflow-${Date.now()}`, name: "Cross Bizflow", code: `CROSS-BIZFLOW-${Date.now()}`, externalId, externalSource: "BIZFLOW" },
    });
    zoneIdsToClean.push(sytexRow.id, bizflowRow.id);

    expect(sytexRow.externalId).toBe(bizflowRow.externalId);
    expect(sytexRow.externalSource).not.toBe(bizflowRow.externalSource);
  });
});

describe("timestamptz round-trip: write a UTC instant, read back the same instant (real DB)", () => {
  it("Task timestamps (arrivalAt/departureAt) survive round-trip exactly", async () => {
    const arrivalAt = new Date("2026-03-14T15:09:26.535Z");
    const departureAt = new Date("2026-03-14T16:09:26.535Z");

    const task = await prisma.task.findFirst({ where: { arrivalAt: { not: null }, departureAt: { not: null } } });
    expect(task).not.toBeNull();

    const updated = await prisma.task.update({
      where: { id: task!.id },
      data: { arrivalAt, departureAt },
    });

    expect(updated.arrivalAt?.toISOString()).toBe(arrivalAt.toISOString());
    expect(updated.departureAt?.toISOString()).toBe(departureAt.toISOString());

    const reFetched = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(reFetched!.arrivalAt?.toISOString()).toBe(arrivalAt.toISOString());
    expect(reFetched!.departureAt?.toISOString()).toBe(departureAt.toISOString());

    // restore the original values so this doesn't leave demo data mutated
    await prisma.task.update({ where: { id: task!.id }, data: { arrivalAt: task!.arrivalAt, departureAt: task!.departureAt } });
  });

  it("Guard timestamps (startAt/endAt) survive round-trip exactly", async () => {
    const startAt = new Date("2026-11-05T08:00:00.000Z");
    const endAt = new Date("2026-11-06T08:00:00.000Z");

    const guard = await prisma.guard.findFirst();
    expect(guard).not.toBeNull();
    const original = { startAt: guard!.startAt, endAt: guard!.endAt };

    const updated = await prisma.guard.update({ where: { id: guard!.id }, data: { startAt, endAt } });
    expect(updated.startAt.toISOString()).toBe(startAt.toISOString());
    expect(updated.endAt.toISOString()).toBe(endAt.toISOString());

    await prisma.guard.update({ where: { id: guard!.id }, data: original });
  });

  it("AuditLog timestamps (createdAt) survive round-trip exactly", async () => {
    const createdAt = new Date("2026-06-21T23:59:59.999Z");
    const created = await prisma.auditLog.create({
      data: {
        actorId: "test-actor",
        action: "TIMESTAMPTZ_ROUNDTRIP_TEST",
        entity: "Test",
        entityId: "test-entity",
        createdAt,
      },
    });

    expect(created.createdAt.toISOString()).toBe(createdAt.toISOString());

    const reFetched = await prisma.auditLog.findUnique({ where: { id: created.id } });
    expect(reFetched!.createdAt.toISOString()).toBe(createdAt.toISOString());

    await prisma.auditLog.delete({ where: { id: created.id } });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
