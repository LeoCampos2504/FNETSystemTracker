-- Persistence/integrity hardening pass (see docs/DATABASE.md):
--  1. externalId uniqueness moves from a bare per-column constraint to a
--     composite (externalSource, externalId) constraint on every synced
--     entity — a plain `externalId @unique` incorrectly rejects two
--     unrelated rows from different source systems (Sytex/BizFlow/
--     MaxTracker) that happen to share an id string in the same table.
--  2. Every timestamp column (other than tasks.scheduledDate, a pure
--     calendar date) moves from `timestamp` (timezone-naive) to
--     `timestamptz`, matching what the app actually stores/reads (UTC
--     instants) instead of silently depending on session timezone.
--  3. A handful of indexes added to match real query shapes used by
--     src/server/repositories/prisma/** and src/server/kpis/fetch.ts
--     (vehicle "current assignment" lookups, notification list-by-user
--     ordering, quote list ordering, audit log by actor/period).
-- Verified against the local dev DB before writing this file: zero existing
-- rows violate the new (externalSource, externalId) uniqueness (see the
-- audit report for this block).

-- DropIndex
DROP INDEX "coordinators_externalId_key";

-- DropIndex
DROP INDEX "guards_externalId_key";

-- DropIndex
DROP INDEX "notifications_userId_idx";

-- DropIndex
DROP INDEX "quotes_externalId_key";

-- DropIndex
DROP INDEX "sites_externalId_key";

-- DropIndex
DROP INDEX "tasks_externalId_key";

-- DropIndex
DROP INDEX "technicians_externalId_key";

-- DropIndex
DROP INDEX "vehicles_externalId_key";

-- DropIndex
DROP INDEX "zones_externalId_key";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "coordinator_zones" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "coordinators" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "guard_technicians" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "guards" ALTER COLUMN "startAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "endAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "task_rejections" ALTER COLUMN "rejectedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "task_status_history" ALTER COLUMN "changedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "task_technicians" ALTER COLUMN "assignedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "scheduledAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "arrivalAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "departureAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "technicians" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "vehicle_assignments" ALTER COLUMN "startAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "endAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "zones" ALTER COLUMN "sourceUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coordinators_externalSource_externalId_key" ON "coordinators"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "guards_externalSource_externalId_key" ON "guards"("externalSource", "externalId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "quotes_createdAt_idx" ON "quotes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_externalSource_externalId_key" ON "quotes"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "sites_externalSource_externalId_key" ON "sites"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_externalSource_externalId_key" ON "tasks"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_externalSource_externalId_key" ON "technicians"("externalSource", "externalId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_technicianId_endAt_idx" ON "vehicle_assignments"("technicianId", "endAt");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicleId_endAt_idx" ON "vehicle_assignments"("vehicleId", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_externalSource_externalId_key" ON "vehicles"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "zones_externalSource_externalId_key" ON "zones"("externalSource", "externalId");

