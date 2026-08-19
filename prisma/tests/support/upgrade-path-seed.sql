-- Representative data inserted against the schema state produced by ONLY
-- the "init" migration (before harden_persistence_integrity), used once to
-- prove the upgrade migration preserves data. Not part of the demo seed.
INSERT INTO "users" (id, email, name, "passwordHash", role, active, "createdAt", "updatedAt")
VALUES
  ('upgrade-user-1', 'upgrade-1@example.test', 'Upgrade User One', 'not-a-real-hash', 'TECHNICIAN', true, '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000'),
  ('upgrade-user-2', 'upgrade-2@example.test', 'Upgrade User Two', 'not-a-real-hash', 'TECHNICIAN', true, '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "zones" (id, name, code, "externalId", "externalSource", "createdAt", "updatedAt")
VALUES
  ('upgrade-zone-1', 'Upgrade Zone One', 'UPG-1', 'sytex-shared-id-999', 'SYTEX', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000'),
  ('upgrade-zone-2', 'Upgrade Zone Two', 'UPG-2', NULL, 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "technicians" (id, "userId", name, "primaryZoneId", active, "externalSource", "createdAt", "updatedAt")
VALUES
  ('upgrade-tech-1', 'upgrade-user-1', 'Upgrade Tech One', 'upgrade-zone-1', true, 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000'),
  ('upgrade-tech-2', 'upgrade-user-2', 'Upgrade Tech Two', 'upgrade-zone-2', true, 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "sites" (id, code, name, "zoneId", latitude, longitude, "externalSource", "createdAt", "updatedAt")
VALUES ('upgrade-site-1', 'UPG-SITE-1', 'Upgrade Site One', 'upgrade-zone-1', -24.5, -65.1, 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "tasks" (
  id, "taskCode", type, description, priority, criticality, status,
  "scheduledDate", "scheduledAt", "siteId", "siteCode", "zoneId", latitude, longitude,
  "arrivalAt", "departureAt", "externalSource", "createdAt", "updatedAt"
) VALUES (
  'upgrade-task-1', 'UPG-TASK-1', 'PREVENTIVE', 'Upgrade path test task', 'MEDIA', 'NORMAL', 'APPROVED',
  '2026-01-15', '2026-01-15T09:00:00.000', 'upgrade-site-1', 'UPG-SITE-1', 'upgrade-zone-1', -24.5, -65.1,
  '2026-01-15T09:05:00.000', '2026-01-15T10:05:00.000', 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000'
);

INSERT INTO "guards" (id, "zoneId", "startAt", "endAt", "externalSource", "createdAt", "updatedAt")
VALUES ('upgrade-guard-1', 'upgrade-zone-1', '2026-01-15T18:00:00.000', '2026-01-16T08:00:00.000', 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "vehicles" (id, plate, brand, model, "mileageKm", status, "externalSource", "createdAt", "updatedAt")
VALUES ('upgrade-vehicle-1', 'UPG001TEST', 'TestBrand', 'TestModel', 1000, 'ACTIVE', 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');

INSERT INTO "quotes" (id, code, "zoneId", status, "externalSource", "createdAt", "updatedAt")
VALUES ('upgrade-quote-1', 'UPG-QUOTE-1', 'upgrade-zone-1', 'OPEN', 'INTERNAL', '2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000');
