import { describe, expect, it } from "vitest";
import { CrewRole, ExternalSource, TaskCriticality, TaskStatus, TaskType, UserRole } from "@/contracts";
import { repositories } from "@/server/container";
import { createBackendContainer } from "@/server/backend-container";
import { createMemoryRepositories } from "@/server/repositories/memory";
import { createFakeRepositories } from "@/server/testing/fake-repositories";
import { hashPassword } from "@/server/auth/password";
import { getTaskById as defaultGetTaskById } from "@/server/services/task.service";

describe("createMemoryRepositories", () => {
  it("returns a BackendRepositories backed by the real demo data", async () => {
    const memoryRepos = createMemoryRepositories();
    const technician = await memoryRepos.technician.findById("tech-01");
    expect(technician?.id).toBe("tech-01");
  });
});

describe("createBackendContainer", () => {
  it("accepts a BackendRepositories-shaped set and builds all 9 services", () => {
    const container = createBackendContainer(createMemoryRepositories());
    expect(container.authService).toBeDefined();
    expect(container.taskService).toBeDefined();
    expect(container.guardService).toBeDefined();
    expect(container.notificationService).toBeDefined();
    expect(container.auditService).toBeDefined();
    expect(container.coordinationService).toBeDefined();
    expect(container.technicianService).toBeDefined();
    expect(container.vehicleService).toBeDefined();
    expect(container.quoteService).toBeDefined();
  });

  it("a container built from the default memory repositories behaves the same as the app's default (flat) service exports", async () => {
    const container = createBackendContainer(createMemoryRepositories());
    const viaContainer = await container.taskService.getTaskById("task-P0001");
    const viaDefaultExport = await defaultGetTaskById("task-P0001");
    expect(viaContainer).toEqual(viaDefaultExport);
  });
});

function buildFakeSeed() {
  return {
    users: [
      {
        id: "fake-user-1",
        email: "fake@test.local",
        name: "Fake Technician",
        role: UserRole.TECHNICIAN,
        technicianId: "fake-tech-1",
        coordinatorId: null,
        active: true,
      },
    ],
    technicians: [
      {
        id: "fake-tech-1",
        userId: "fake-user-1",
        name: "Fake Technician",
        primaryZoneId: "fake-zone-1",
        onLoanZoneId: null,
        phone: null,
        active: true,
        externalId: null,
        externalSource: ExternalSource.INTERNAL,
        sourceUpdatedAt: null,
      },
    ],
    zones: [
      {
        id: "fake-zone-1",
        name: "Fake Zone",
        code: "FAKE",
        coordinatorIds: [],
        externalId: null,
        externalSource: ExternalSource.INTERNAL,
        sourceUpdatedAt: null,
      },
    ],
    tasks: [
      {
        id: "fake-task-1",
        taskCode: "FAKE-001",
        formCode: null,
        type: TaskType.PREVENTIVE,
        description: "fake task for isolation testing",
        priority: "MEDIA",
        criticality: TaskCriticality.NORMAL,
        status: TaskStatus.OPEN,
        scheduledDate: "2026-01-01",
        scheduledAt: "2026-01-01T09:00:00.000Z",
        siteId: "fake-site-1",
        siteCode: "FAKE-SITE",
        zoneId: "fake-zone-1",
        coordinates: { latitude: 0, longitude: 0 },
        assignments: [{ technicianId: "fake-tech-1", crewRole: CrewRole.PRIMARY }],
        arrivalAt: null,
        departureAt: null,
        rejections: [],
        externalId: null,
        externalSource: ExternalSource.INTERNAL,
        sourceUpdatedAt: null,
      },
    ],
    passwordHashes: { "fake-user-1": hashPassword("fake-pw-123") },
  };
}

describe("two independent containers stay isolated", () => {
  it("mutating a guard through container B never appears in container A (real memory), and vice versa", async () => {
    const containerA = createBackendContainer(createMemoryRepositories()); // real memory
    const fakeRepos = createFakeRepositories(buildFakeSeed());
    const containerB = createBackendContainer(fakeRepos); // isolated fake

    const realGuardCountBefore = (await containerA.guardService.listGuards({})).length;

    const fakeGuard = await containerB.guardService.createGuard("fake-user-1", {
      zoneId: "fake-zone-1",
      technicianIds: ["fake-tech-1"],
      startAt: "2026-02-01T08:00:00.000Z",
      endAt: "2026-02-08T08:00:00.000Z",
    });

    // The mutation through B must not leak into A's (real memory) guard list.
    const realGuardsAfter = await containerA.guardService.listGuards({});
    expect(realGuardsAfter).toHaveLength(realGuardCountBefore);
    expect(realGuardsAfter.some((g) => g.id === fakeGuard.id)).toBe(false);

    // And a real guard id must not be visible through B (proves guardService
    // actually used the injected fake repo, not a hidden memory fallback).
    expect(await containerB.guardService.findGuardById("guard-noa-1")).toBeNull();
  });

  it("authService uses the injected user/authCredentials repos, not the default memory ones", async () => {
    const containerA = createBackendContainer(createMemoryRepositories()); // real memory
    const containerB = createBackendContainer(createFakeRepositories(buildFakeSeed()));

    // Only container B's fake repos know this user.
    const { session } = await containerB.authService.login("fake@test.local", "fake-pw-123");
    expect(session.user.id).toBe("fake-user-1");

    // The exact same credentials must be rejected by the real-memory container.
    await expect(containerA.authService.login("fake@test.local", "fake-pw-123")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("task mutations audit/notify through the injected repos, invisible to the other container", async () => {
    const fakeRepos = createFakeRepositories(buildFakeSeed());
    const containerB = createBackendContainer(fakeRepos);

    await containerB.taskService.scheduleTask("fake-user-1", "fake-task-1", "2026-03-01");

    // Visible through the fake repos this container was built with...
    const fakeAuditEntries = await fakeRepos.audit.listByEntity("Task", "fake-task-1");
    expect(fakeAuditEntries).toHaveLength(1);
    const fakeNotifications = await fakeRepos.notification.listByUser("fake-user-1");
    expect(fakeNotifications.some((n) => n.relatedEntityId === "fake-task-1")).toBe(true);

    // ...and completely absent from the real memory repositories (proves the
    // mutation went through the injected repos, not a hidden default).
    const realAuditEntries = await repositories.audit.listByEntity("Task", "fake-task-1");
    expect(realAuditEntries).toHaveLength(0);
  });
});
