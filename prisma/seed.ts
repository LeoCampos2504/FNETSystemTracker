/**
 * Demo seed for FNET System Tracker. Reuses src/mocks/** as the source of
 * truth for demo data (already realistic and internally consistent — see
 * src/mocks/mocks.test.ts) instead of duplicating fixtures. Run with
 * `npm run db:seed` (or automatically after `prisma migrate dev`/`reset`).
 *
 * Idempotent: clears every table it manages (in FK-safe order) before
 * inserting, so re-running it resets the demo data.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  mockCoordinators,
  mockGuards,
  mockNotifications,
  mockQuotes,
  mockSites,
  mockTasks,
  mockTechnicians,
  mockUsers,
  mockVehicleAssignments,
  mockVehicles,
  mockZones,
} from "../src/mocks";
import { TaskStatus } from "../src/contracts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Run `npx prisma dev` and set it — see docs/DATABASE.md.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

/** Demo-only password for every seeded user. Never use in production. */
const DEMO_PASSWORD = "demo1234";

async function clearDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.vehicleAssignment.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.task.deleteMany(); // cascades TaskTechnician, TaskStatusHistory, TaskRejection
  await prisma.guard.deleteMany(); // cascades GuardTechnician
  await prisma.technician.deleteMany();
  await prisma.site.deleteMany();
  await prisma.coordinatorZone.deleteMany();
  await prisma.coordinator.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * mockUsers has no inactive fixture (every seeded technician/coordinator/
 * admin is active: true). AuthCredentialsRepository must not filter by
 * active — that policy belongs to AuthService — so one seeded user is
 * flipped to inactive here (only in the DB, src/mocks/** stays untouched)
 * to give that boundary something real to test against.
 */
const INACTIVE_DEMO_USER_ID = "user-tech-14";

async function seedUsers() {
  // Hashed per user, not once and reused: bcrypt salts each call
  // independently, so this is also what makes "two different users have
  // their own hash" a real, meaningful thing to test (see
  // prisma/tests/repositories/auth-credentials.test.ts) instead of
  // trivially true because every row shares one literal string.
  const data = await Promise.all(
    mockUsers.map(async (user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.id === INACTIVE_DEMO_USER_ID ? false : user.active,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    })),
  );
  await prisma.user.createMany({ data });
}

async function seedZones() {
  await prisma.zone.createMany({
    data: mockZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      code: zone.code,
      externalId: zone.externalId,
      externalSource: zone.externalSource,
      sourceUpdatedAt: zone.sourceUpdatedAt ? new Date(zone.sourceUpdatedAt) : null,
    })),
  });
}

async function seedCoordinatorsAndZones() {
  await prisma.coordinator.createMany({
    data: mockCoordinators.map((coordinator) => ({
      id: coordinator.id,
      userId: coordinator.userId,
      name: coordinator.name,
      externalId: coordinator.externalId,
      externalSource: coordinator.externalSource,
      sourceUpdatedAt: coordinator.sourceUpdatedAt ? new Date(coordinator.sourceUpdatedAt) : null,
    })),
  });

  await prisma.coordinatorZone.createMany({
    data: mockCoordinators.flatMap((coordinator) =>
      coordinator.zoneIds.map((zoneId) => ({ coordinatorId: coordinator.id, zoneId })),
    ),
  });
}

async function seedSites() {
  await prisma.site.createMany({
    data: mockSites.map((site) => ({
      id: site.id,
      code: site.code,
      name: site.name,
      zoneId: site.zoneId,
      latitude: site.coordinates.latitude,
      longitude: site.coordinates.longitude,
      address: site.address,
      externalId: site.externalId,
      externalSource: site.externalSource,
      sourceUpdatedAt: site.sourceUpdatedAt ? new Date(site.sourceUpdatedAt) : null,
    })),
  });
}

async function seedTechnicians() {
  await prisma.technician.createMany({
    data: mockTechnicians.map((technician) => ({
      id: technician.id,
      userId: technician.userId,
      name: technician.name,
      primaryZoneId: technician.primaryZoneId,
      onLoanZoneId: technician.onLoanZoneId,
      phone: technician.phone,
      active: technician.active,
      externalId: technician.externalId,
      externalSource: technician.externalSource,
      sourceUpdatedAt: technician.sourceUpdatedAt ? new Date(technician.sourceUpdatedAt) : null,
    })),
  });
}

/**
 * Mocks only carry the current status, not a real transition history.
 * Synthesize a minimal, plausible TaskStatusHistory: an OPEN entry, and — if
 * the task moved past OPEN — a second entry for the current status. Good
 * enough for demo purposes; real history will come from Sytex sync events.
 */
function synthesizeStatusHistory(task: (typeof mockTasks)[number]) {
  const openedAt = task.sourceUpdatedAt ?? task.scheduledAt ?? `${task.scheduledDate}T08:00:00.000Z`;
  const history: { status: (typeof task)["status"]; changedAt: Date }[] = [
    { status: TaskStatus.OPEN, changedAt: new Date(openedAt) },
  ];
  if (task.status !== TaskStatus.OPEN) {
    const changedAt = task.departureAt ?? task.arrivalAt ?? task.scheduledAt ?? openedAt;
    history.push({ status: task.status, changedAt: new Date(changedAt) });
  }
  return history;
}

async function seedTasks() {
  for (const task of mockTasks) {
    await prisma.task.create({
      data: {
        id: task.id,
        taskCode: task.taskCode,
        formCode: task.formCode,
        type: task.type,
        description: task.description,
        priority: task.priority,
        criticality: task.criticality,
        status: task.status,
        scheduledDate: new Date(`${task.scheduledDate}T00:00:00.000Z`),
        scheduledAt: task.scheduledAt ? new Date(task.scheduledAt) : null,
        siteId: task.siteId,
        siteCode: task.siteCode,
        zoneId: task.zoneId,
        latitude: task.coordinates.latitude,
        longitude: task.coordinates.longitude,
        arrivalAt: task.arrivalAt ? new Date(task.arrivalAt) : null,
        departureAt: task.departureAt ? new Date(task.departureAt) : null,
        externalId: task.externalId,
        externalSource: task.externalSource,
        sourceUpdatedAt: task.sourceUpdatedAt ? new Date(task.sourceUpdatedAt) : null,
        technicians: {
          createMany: {
            data: task.assignments.map((a) => ({ technicianId: a.technicianId, role: a.crewRole })),
          },
        },
        rejections: {
          createMany: {
            data: task.rejections.map((r) => ({
              id: r.id,
              rejectedAt: new Date(r.rejectedAt),
              reason: r.reason,
            })),
          },
        },
        statusHistory: { createMany: { data: synthesizeStatusHistory(task) } },
      },
    });
  }
}

async function seedGuards() {
  for (const guard of mockGuards) {
    await prisma.guard.create({
      data: {
        id: guard.id,
        zoneId: guard.zoneId,
        startAt: new Date(guard.startAt),
        endAt: new Date(guard.endAt),
        externalId: guard.externalId,
        externalSource: guard.externalSource,
        sourceUpdatedAt: guard.sourceUpdatedAt ? new Date(guard.sourceUpdatedAt) : null,
        technicians: {
          createMany: { data: guard.technicianIds.map((technicianId) => ({ technicianId })) },
        },
      },
    });
  }
}

async function seedVehicles() {
  await prisma.vehicle.createMany({
    data: mockVehicles.map((vehicle) => ({
      id: vehicle.id,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      mileageKm: vehicle.mileageKm,
      status: vehicle.status,
      externalId: vehicle.externalId,
      externalSource: vehicle.externalSource,
      sourceUpdatedAt: vehicle.sourceUpdatedAt ? new Date(vehicle.sourceUpdatedAt) : null,
    })),
  });

  // mockVehicleAssignments only documents the assignments that actually
  // changed hands (veh-01, veh-04). The Prisma model derives a vehicle's
  // current holder purely from VehicleAssignment (endAt: null) — never a
  // stored column — so every other vehicle's mockVehicles.assignedTechnicianId
  // needs a synthesized "current since" row here to stay consistent.
  const explicitlyAssignedVehicleIds = new Set(mockVehicleAssignments.map((a) => a.vehicleId));
  const syntheticAssignments = mockVehicles
    .filter((v) => v.assignedTechnicianId && !explicitlyAssignedVehicleIds.has(v.id))
    .map((v, index) => ({
      id: `va-syn-${v.id}`,
      vehicleId: v.id,
      technicianId: v.assignedTechnicianId!,
      startAt: new Date(Date.UTC(2026, 3, 1 + index)), // staggered "since April 2026" placeholders
      endAt: null as Date | null,
    }));

  await prisma.vehicleAssignment.createMany({
    data: [
      ...mockVehicleAssignments.map((a) => ({
        id: a.id,
        vehicleId: a.vehicleId,
        technicianId: a.technicianId,
        startAt: new Date(a.startAt),
        endAt: a.endAt ? new Date(a.endAt) : null,
      })),
      ...syntheticAssignments,
    ],
  });
}

async function seedQuotes() {
  await prisma.quote.createMany({
    data: mockQuotes.map((quote) => ({
      id: quote.id,
      code: quote.code,
      zoneId: quote.zoneId,
      projectId: quote.projectId,
      status: quote.status,
      createdAt: new Date(quote.createdAt),
      updatedAt: new Date(quote.updatedAt),
      externalId: quote.externalId,
      externalSource: quote.externalSource,
      sourceUpdatedAt: quote.sourceUpdatedAt ? new Date(quote.sourceUpdatedAt) : null,
    })),
  });
}

async function seedNotifications() {
  await prisma.notification.createMany({
    data: mockNotifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.relatedEntityType,
      entityId: n.relatedEntityId,
      readAt: n.readAt ? new Date(n.readAt) : null,
      createdAt: new Date(n.createdAt),
    })),
  });
}

async function seedAuditLog() {
  await prisma.auditLog.createMany({
    data: [
      {
        id: "audit-001",
        actorId: "user-coord-1",
        action: "TASK_STATUS_CHANGED",
        entity: "Task",
        entityId: "task-P0006",
        before: { status: "IN_REVIEW" },
        after: { status: "APPROVED" },
        createdAt: new Date("2026-08-18T09:10:00.000Z"),
      },
      {
        id: "audit-002",
        actorId: "user-coord-2",
        action: "GUARD_REASSIGNED",
        entity: "Guard",
        entityId: "guard-centro-3",
        before: { technicianIds: ["tech-09", "tech-10"] },
        after: { technicianIds: ["tech-09", "tech-05"] },
        createdAt: new Date("2026-08-13T08:00:00.000Z"),
      },
    ],
  });
}

async function main() {
  console.log("Clearing existing data...");
  await clearDatabase();

  console.log("Seeding users...");
  await seedUsers();
  console.log("Seeding zones...");
  await seedZones();
  console.log("Seeding coordinators...");
  await seedCoordinatorsAndZones();
  console.log("Seeding sites...");
  await seedSites();
  console.log("Seeding technicians...");
  await seedTechnicians();
  console.log("Seeding tasks (technicians, status history, rejections)...");
  await seedTasks();
  console.log("Seeding guards...");
  await seedGuards();
  console.log("Seeding vehicles and assignments...");
  await seedVehicles();
  console.log("Seeding quotes...");
  await seedQuotes();
  console.log("Seeding notifications...");
  await seedNotifications();
  console.log("Seeding audit log...");
  await seedAuditLog();

  // Sequential, not Promise.all: a burst of concurrent queries right after
  // ~50+ sequential inserts is what was tripping "Connection terminated
  // unexpectedly" against the local `prisma dev` embedded server (see the
  // same fix in prisma/tests/seed-idempotency.test.ts and docs/DATABASE.md).
  const users = await prisma.user.count();
  const tasks = await prisma.task.count();
  const guards = await prisma.guard.count();
  const vehicles = await prisma.vehicle.count();
  console.log(`Done. users=${users} tasks=${tasks} guards=${guards} vehicles=${vehicles}`);
  console.log(`Demo login: any seeded email (e.g. admin@fnet.local) / password "${DEMO_PASSWORD}" (DEMO ONLY).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
