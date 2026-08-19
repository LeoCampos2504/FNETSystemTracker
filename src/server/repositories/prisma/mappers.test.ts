import { describe, expect, it } from "vitest";
import { CrewRole, ExternalSource, TaskCriticality, TaskStatus, TaskType, VehicleStatus } from "@/contracts";
import {
  mapAuditLog,
  mapCoordinator,
  mapGuard,
  mapNotification,
  mapQuote,
  mapSite,
  mapTask,
  mapTechnician,
  mapUser,
  mapVehicle,
  mapVehicleAssignment,
  mapZone,
} from "./mappers";

/**
 * Pure unit tests for the Prisma-row -> contract-shape mappers. Hand-built
 * "row" fixtures stand in for what Prisma would actually return (real Date
 * objects, enum strings, nested include arrays) — no DB needed. These catch
 * the classic mapper bug classes: wrong field names, dropped nulls, bad
 * date formatting, wrong array ordering.
 */

describe("mapTask", () => {
  const baseRow = {
    id: "task-1",
    taskCode: "PM-NOA-0001",
    formCode: null as string | null,
    type: TaskType.PREVENTIVE,
    description: "Test",
    priority: "MEDIA",
    criticality: TaskCriticality.NORMAL,
    status: TaskStatus.APPROVED,
    scheduledDate: new Date("2026-08-15T00:00:00.000Z"),
    scheduledAt: new Date("2026-08-15T09:00:00.000Z"),
    siteId: "site-1",
    siteCode: "SITE-1",
    zoneId: "zone-1",
    latitude: -24.5,
    longitude: -65.1,
    arrivalAt: new Date("2026-08-15T09:05:00.000Z"),
    departureAt: new Date("2026-08-15T10:00:00.000Z"),
    externalId: "SYTEX-1",
    externalSource: ExternalSource.SYTEX,
    sourceUpdatedAt: new Date("2026-08-14T12:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-15T10:00:00.000Z"),
    technicians: [
      { taskId: "task-1", technicianId: "tech-collab", role: CrewRole.COLLABORATOR, assignedAt: new Date() },
      { taskId: "task-1", technicianId: "tech-primary", role: CrewRole.PRIMARY, assignedAt: new Date() },
    ],
    rejections: [
      { id: "rej-2", taskId: "task-1", rejectedAt: new Date("2026-08-10T00:00:00.000Z"), reason: "second", createdAt: new Date() },
      { id: "rej-1", taskId: "task-1", rejectedAt: new Date("2026-08-05T00:00:00.000Z"), reason: "first", createdAt: new Date() },
    ],
  };

  it("extracts scheduledDate as a plain YYYY-MM-DD string", () => {
    expect(mapTask(baseRow).scheduledDate).toBe("2026-08-15");
  });

  it("converts nullable timestamps to ISO strings, and preserves null when absent", () => {
    const mapped = mapTask(baseRow);
    expect(mapped.scheduledAt).toBe("2026-08-15T09:00:00.000Z");
    expect(mapped.arrivalAt).toBe("2026-08-15T09:05:00.000Z");
    expect(mapped.departureAt).toBe("2026-08-15T10:00:00.000Z");
    expect(mapped.sourceUpdatedAt).toBe("2026-08-14T12:00:00.000Z");

    const withoutTimestamps = mapTask({ ...baseRow, arrivalAt: null, departureAt: null, sourceUpdatedAt: null });
    expect(withoutTimestamps.arrivalAt).toBeNull();
    expect(withoutTimestamps.departureAt).toBeNull();
    expect(withoutTimestamps.sourceUpdatedAt).toBeNull();
  });

  it("builds the coordinates object from flat latitude/longitude columns", () => {
    expect(mapTask(baseRow).coordinates).toEqual({ latitude: -24.5, longitude: -65.1 });
  });

  it("sorts assignments PRIMARY first regardless of row order", () => {
    const mapped = mapTask(baseRow);
    expect(mapped.assignments).toEqual([
      { technicianId: "tech-primary", crewRole: CrewRole.PRIMARY },
      { technicianId: "tech-collab", crewRole: CrewRole.COLLABORATOR },
    ]);
  });

  it("sorts rejections chronologically and keeps every event (never collapses to a count)", () => {
    const mapped = mapTask(baseRow);
    expect(mapped.rejections).toHaveLength(2);
    expect(mapped.rejections.map((r) => r.id)).toEqual(["rej-1", "rej-2"]);
    expect(mapped.rejections[0].reason).toBe("first");
  });

  it("preserves externalId/externalSource/sourceUpdatedAt and formCode null", () => {
    const mapped = mapTask(baseRow);
    expect(mapped.externalId).toBe("SYTEX-1");
    expect(mapped.externalSource).toBe(ExternalSource.SYTEX);
    expect(mapped.formCode).toBeNull();
  });
});

describe("mapGuard", () => {
  it("derives technicianIds from the join rows and formats the interval as ISO", () => {
    const row = {
      id: "guard-1",
      zoneId: "zone-1",
      startAt: new Date("2026-08-10T18:00:00.000Z"),
      endAt: new Date("2026-08-11T08:00:00.000Z"),
      createdBy: null,
      externalId: null,
      externalSource: ExternalSource.INTERNAL,
      sourceUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      technicians: [
        { guardId: "guard-1", technicianId: "tech-1", createdAt: new Date() },
        { guardId: "guard-1", technicianId: "tech-2", createdAt: new Date() },
      ],
    };

    const mapped = mapGuard(row);

    expect(mapped.technicianIds).toEqual(["tech-1", "tech-2"]);
    expect(mapped.startAt).toBe("2026-08-10T18:00:00.000Z");
    expect(mapped.endAt).toBe("2026-08-11T08:00:00.000Z");
  });
});

describe("mapVehicle", () => {
  const baseRow = {
    id: "veh-1",
    plate: "AB123CD",
    brand: "Toyota",
    model: "Hilux",
    mileageKm: 1000,
    status: VehicleStatus.ACTIVE,
    externalId: null,
    externalSource: ExternalSource.MAXTRACKER,
    sourceUpdatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("derives assignedTechnicianId from the (already-filtered) open assignment", () => {
    const mapped = mapVehicle({
      ...baseRow,
      assignments: [{ id: "va-1", vehicleId: "veh-1", technicianId: "tech-1", startAt: new Date(), endAt: null, createdAt: new Date() }],
    });
    expect(mapped.assignedTechnicianId).toBe("tech-1");
  });

  it("returns null when there is no open assignment", () => {
    const mapped = mapVehicle({ ...baseRow, assignments: [] });
    expect(mapped.assignedTechnicianId).toBeNull();
  });
});

describe("mapVehicleAssignment", () => {
  it("preserves null endAt for the current assignment and formats dates as ISO", () => {
    const mapped = mapVehicleAssignment({
      id: "va-1",
      vehicleId: "veh-1",
      technicianId: "tech-1",
      startAt: new Date("2026-01-01T00:00:00.000Z"),
      endAt: null,
      createdAt: new Date(),
    });
    expect(mapped.startAt).toBe("2026-01-01T00:00:00.000Z");
    expect(mapped.endAt).toBeNull();
  });
});

describe("mapNotification", () => {
  it("renames entityType/entityId to relatedEntityType/relatedEntityId", () => {
    const mapped = mapNotification({
      id: "notif-1",
      userId: "user-1",
      type: "NEW_TASK" as never,
      title: "t",
      message: "m",
      entityType: "task",
      entityId: "task-1",
      readAt: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(mapped.relatedEntityType).toBe("task");
    expect(mapped.relatedEntityId).toBe("task-1");
    expect(mapped.readAt).toBeNull();
  });
});

describe("mapAuditLog", () => {
  it("renames actorId to actor, createdAt to timestamp, and passes through before/after untouched", () => {
    const mapped = mapAuditLog({
      id: "audit-1",
      actorId: "user-coord-1",
      action: "TASK_STATUS_CHANGED",
      entity: "Task",
      entityId: "task-1",
      before: { status: "OPEN" },
      after: { status: "APPROVED" },
      createdAt: new Date("2026-08-18T09:10:00.000Z"),
    });
    expect(mapped.actor).toBe("user-coord-1");
    expect(mapped.timestamp).toBe("2026-08-18T09:10:00.000Z");
    expect(mapped.before).toEqual({ status: "OPEN" });
    expect(mapped.after).toEqual({ status: "APPROVED" });
  });

  it("maps null before/after to null, not undefined", () => {
    const mapped = mapAuditLog({
      id: "audit-2",
      actorId: "user-1",
      action: "X",
      entity: "Y",
      entityId: "z",
      before: null,
      after: null,
      createdAt: new Date(),
    });
    expect(mapped.before).toBeNull();
    expect(mapped.after).toBeNull();
  });
});

describe("mapUser", () => {
  it("derives technicianId/coordinatorId from the included relation, null when absent", () => {
    const asTechnician = mapUser({
      id: "user-1",
      email: "a@fnet.local",
      name: "A",
      passwordHash: "hash",
      role: "TECHNICIAN" as never,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      technician: { id: "tech-1" } as never,
      coordinator: null,
    });
    expect(asTechnician.technicianId).toBe("tech-1");
    expect(asTechnician.coordinatorId).toBeNull();

    const admin = mapUser({
      id: "user-2",
      email: "admin@fnet.local",
      name: "Admin",
      passwordHash: "hash",
      role: "ADMIN" as never,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      technician: null,
      coordinator: null,
    });
    expect(admin.technicianId).toBeNull();
    expect(admin.coordinatorId).toBeNull();
    // passwordHash must never leak into the contract shape.
    expect(admin).not.toHaveProperty("passwordHash");
  });
});

describe("mapTechnician / mapCoordinator / mapZone / mapSite / mapQuote — field-name sanity", () => {
  it("mapTechnician", () => {
    const mapped = mapTechnician({
      id: "tech-1",
      userId: "user-1",
      name: "Bruno",
      phone: "+54 9 11 0000-0000",
      primaryZoneId: "zone-noa",
      onLoanZoneId: null,
      active: true,
      externalId: "BF-1",
      externalSource: ExternalSource.BIZFLOW,
      sourceUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(mapped).toMatchObject({
      id: "tech-1",
      userId: "user-1",
      primaryZoneId: "zone-noa",
      onLoanZoneId: null,
      phone: "+54 9 11 0000-0000",
      active: true,
    });
  });

  it("mapCoordinator derives zoneIds from the join rows", () => {
    const mapped = mapCoordinator({
      id: "coord-1",
      userId: "user-coord-1",
      name: "Ana",
      externalId: null,
      externalSource: ExternalSource.BIZFLOW,
      sourceUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      zones: [
        { coordinatorId: "coord-1", zoneId: "zone-noa", createdAt: new Date() },
        { coordinatorId: "coord-1", zoneId: "zone-nea", createdAt: new Date() },
      ],
    });
    expect(mapped.zoneIds).toEqual(["zone-noa", "zone-nea"]);
  });

  it("mapZone derives coordinatorIds from the join rows", () => {
    const mapped = mapZone({
      id: "zone-noa",
      name: "NOA",
      code: "NOA",
      project: null,
      externalId: null,
      externalSource: ExternalSource.BIZFLOW,
      sourceUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      coordinators: [{ coordinatorId: "coord-1", zoneId: "zone-noa", createdAt: new Date() }],
    });
    expect(mapped.coordinatorIds).toEqual(["coord-1"]);
  });

  it("mapSite builds coordinates from flat columns", () => {
    const mapped = mapSite({
      id: "site-1",
      code: "NOA-001",
      name: "Salta - Sitio 1",
      zoneId: "zone-noa",
      latitude: -24.78,
      longitude: -65.42,
      address: null,
      metadata: null,
      externalId: null,
      externalSource: ExternalSource.SYTEX,
      sourceUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(mapped.coordinates).toEqual({ latitude: -24.78, longitude: -65.42 });
  });

  it("mapQuote formats createdAt/updatedAt as ISO", () => {
    const mapped = mapQuote({
      id: "quote-1",
      code: "COT-001",
      projectId: null,
      zoneId: "zone-noa",
      coordinatorId: null,
      status: "OPEN" as never,
      externalId: null,
      externalSource: ExternalSource.SYTEX,
      sourceUpdatedAt: null,
      createdAt: new Date("2026-08-17T00:00:00.000Z"),
      updatedAt: new Date("2026-08-17T00:00:00.000Z"),
    });
    expect(mapped.createdAt).toBe("2026-08-17T00:00:00.000Z");
    expect(mapped.updatedAt).toBe("2026-08-17T00:00:00.000Z");
  });
});
