import { afterAll, describe, expect, it } from "vitest";
import { notificationPrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

describe("notificationPrismaRepository (real DB)", () => {
  it("listByUser returns only that user's notifications", async () => {
    const notifications = await notificationPrismaRepository.listByUser("user-tech-01");
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((n) => n.userId === "user-tech-01")).toBe(true);
  });

  it("listByUser orders newest first", async () => {
    const notifications = await notificationPrismaRepository.listByUser("user-tech-01");
    const timestamps = notifications.map((n) => new Date(n.createdAt).getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it("listByUser returns an empty array for a user with no notifications", async () => {
    expect(await notificationPrismaRepository.listByUser("user-does-not-exist")).toEqual([]);
  });

  it("preserves readAt (null for unread, ISO string for read)", async () => {
    const notifications = await notificationPrismaRepository.listByUser("user-tech-01");
    expect(notifications.some((n) => n.readAt === null)).toBe(true);
    expect(notifications.some((n) => n.readAt !== null)).toBe(true);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
