import type { Asset, AssetAssignment, MaintenanceEvent, StockMovement, StockRecord } from "@/contracts";
import { AssetCategory, ExternalSource } from "@/contracts";

export const mockAssets: Asset[] = [
  { id: "asset-ge-salta-01", code: "GE-SAL-01", name: "Grupo electrógeno Base Salta", category: AssetCategory.GENERATOR, organizationId: "org-fnet-ar", regionId: "region-north", zoneId: "zone-noa", baseId: "base-salta", status: "ACTIVE", assignedTechnicianId: "tech-01", externalId: "OPPEN-GE-001", externalSource: ExternalSource.OPPEN, sourceUpdatedAt: "2026-08-15T12:00:00.000Z" },
  { id: "asset-aa-cordoba-01", code: "AA-CBA-01", name: "Aire acondicionado Base Córdoba", category: AssetCategory.AIR_CONDITIONER, organizationId: "org-fnet-ar", regionId: "region-central", zoneId: "zone-centro", baseId: "base-cordoba", status: "MAINTENANCE", assignedTechnicianId: null, externalId: "OPPEN-AA-001", externalSource: ExternalSource.OPPEN, sourceUpdatedAt: "2026-08-15T12:00:00.000Z" },
  { id: "asset-bat-corrientes-01", code: "BAT-COR-01", name: "Batería de respaldo Corrientes", category: AssetCategory.BATTERY, organizationId: "org-fnet-ar", regionId: "region-north", zoneId: "zone-nea", baseId: "base-corrientes", status: "ACTIVE", assignedTechnicianId: null, externalId: "OPPEN-BAT-001", externalSource: ExternalSource.OPPEN, sourceUpdatedAt: "2026-08-15T12:00:00.000Z" },
];
export const mockAssetAssignments: AssetAssignment[] = [{ id: "asset-assignment-01", assetId: "asset-ge-salta-01", targetType: "USER", targetId: "tech-01", assignedAt: "2026-06-01T08:00:00.000Z", unassignedAt: null, actorUserId: "user-manager-1", reason: "Asignación de base" }];
export const mockMaintenanceEvents: MaintenanceEvent[] = [
  { id: "maintenance-ge-01", assetId: "asset-ge-salta-01", equipmentType: "GE", action: "SERVICE", performedAt: "2026-08-01T12:00:00.000Z", horometer: 5680, nextDueAt: "2027-02-01T12:00:00.000Z", nextDueHorometer: 6000, intervalMonths: 6, notes: "Service preventivo", source: "SYTEX" },
  { id: "maintenance-aa-01", assetId: "asset-aa-cordoba-01", equipmentType: "AA", action: "FILTER_CHANGE", performedAt: "2026-07-10T12:00:00.000Z", horometer: null, nextDueAt: "2027-01-10T12:00:00.000Z", nextDueHorometer: null, intervalMonths: 6, notes: null, source: "SYTEX" },
];
export const mockStockRecords: StockRecord[] = [
  { id: "stock-filter-oil-salta", supplyCode: "FILTER-OIL", description: "Filtro de aceite", organizationId: "org-fnet-ar", regionId: "region-north", zoneId: "zone-noa", baseId: "base-salta", quantityAvailable: 1, unit: "UN", source: "INTRAOPERATIVA" },
  { id: "stock-filter-air-cordoba", supplyCode: "FILTER-AIR", description: "Filtro de aire", organizationId: "org-fnet-ar", regionId: "region-central", zoneId: "zone-centro", baseId: "base-cordoba", quantityAvailable: 0, unit: "UN", source: "INTRAOPERATIVA" },
];
export const mockStockMovements: StockMovement[] = [
  { id: "movement-filter-oil-entry", supplyCode: "FILTER-OIL", organizationId: "org-fnet-ar", regionId: "region-north", zoneId: "zone-noa", baseId: "base-salta", movementType: "ENTRY", quantity: 1, occurredAt: "2026-08-15T12:00:00.000Z", source: "INTRAOPERATIVA" },
  { id: "movement-filter-air-purchase", supplyCode: "FILTER-AIR", organizationId: "org-fnet-ar", regionId: "region-central", zoneId: "zone-centro", baseId: "base-cordoba", movementType: "PURCHASE", quantity: 0, occurredAt: "2026-08-15T12:00:00.000Z", source: "INTRAOPERATIVA" },
];
