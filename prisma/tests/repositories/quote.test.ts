import { afterAll, describe, expect, it } from "vitest";
import { QuoteStatus } from "@/contracts";
import { quotePrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("quotePrismaRepository (real DB)", () => {
  it("list with no filter returns every seeded quote", async () => {
    const quotes = await quotePrismaRepository.list();
    expect(quotes.length).toBe(12);
  });

  it("list filters by status", async () => {
    const quotes = await quotePrismaRepository.list({ status: QuoteStatus.COMPLETED });
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((q) => q.status === QuoteStatus.COMPLETED)).toBe(true);
  });

  it("list filters by zoneId", async () => {
    const quotes = await quotePrismaRepository.list({ zoneId: "zone-cuyo" });
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((q) => q.zoneId === "zone-cuyo")).toBe(true);
  });

  it("list filters by coordinatorId via the zone->coordinator join", async () => {
    // coord-1 administers zone-noa and zone-nea.
    const quotes = await quotePrismaRepository.list({ coordinatorId: "coord-1" });
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((q) => q.zoneId === "zone-noa" || q.zoneId === "zone-nea")).toBe(true);
  });

  it("list combines filters (zone + status)", async () => {
    const quotes = await quotePrismaRepository.list({ zoneId: "zone-centro", status: QuoteStatus.COMPLETED });
    expect(quotes.every((q) => q.zoneId === "zone-centro" && q.status === QuoteStatus.COMPLETED)).toBe(true);
  });

  it("list returns an empty array when nothing matches", async () => {
    expect(await quotePrismaRepository.list({ zoneId: "zone-does-not-exist" })).toEqual([]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
