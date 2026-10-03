import type { AssetCategory } from "./asset";

export const MaintenanceEquipmentType = {
  GE: "GE",
  AA: "AA",
  BATTERY: "BATTERY",
} as const;
export type MaintenanceEquipmentType = (typeof MaintenanceEquipmentType)[keyof typeof MaintenanceEquipmentType];

export const MAINTENANCE_INTERVAL_MONTHS = [6, 12, 24] as const;
export type MaintenanceIntervalMonths = (typeof MAINTENANCE_INTERVAL_MONTHS)[number];

export interface MaintenanceEvent {
  id: string;
  assetId: string;
  equipmentType: MaintenanceEquipmentType;
  action: "SERVICE" | "OIL_CHANGE" | "FILTER_CHANGE" | "BATTERY_REPLACEMENT";
  performedAt: string;
  horometer: number | null;
  nextDueAt: string | null;
  nextDueHorometer: number | null;
  intervalMonths: MaintenanceIntervalMonths | null;
  notes: string | null;
  source: "SYTEX" | "INTERNAL";
}

export interface MaintenanceHistory extends MaintenanceEvent {
  recordedBy: string | null;
}

/** FNET-owned master: what each equipment type needs. */
export interface EquipmentSupplyProfile {
  id: string;
  assetCategory: AssetCategory;
  supplyCode: string;
  description: string;
  quantity: number;
  intervalMonths: MaintenanceIntervalMonths | null;
  active: boolean;
}

/** FNET derives this from an equipment profile and the current maintenance need. */
export interface MaintenanceRequirement {
  id: string;
  equipmentSupplyProfileId: string;
  assetCategory: AssetCategory;
  maintenanceEventId: string | null;
  assetId: string | null;
  zoneId: string | null;
  supplyCode: string;
  description: string;
  quantity: number;
  siteId: string | null;
  dueAt: string | null;
  source: "FNET";
}

export type SupplyRequirement = MaintenanceRequirement;

/** Intraoperativa-owned current stock and movement data. */
export interface StockRecord {
  id: string;
  supplyCode: string;
  description: string;
  organizationId: string;
  regionId: string;
  zoneId: string;
  baseId: string | null;
  quantityAvailable: number;
  unit: string;
  source: "INTRAOPERATIVA";
}

export interface StockMovement {
  id: string;
  supplyCode: string;
  organizationId: string;
  regionId: string;
  zoneId: string;
  baseId: string | null;
  movementType: "PURCHASE" | "ENTRY" | "EXIT" | "DELIVERY" | "ADJUSTMENT";
  quantity: number;
  occurredAt: string;
  source: "INTRAOPERATIVA";
}

export interface StockCoverage {
  requirementId: string;
  supplyCode: string;
  requiredQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
  covered: boolean;
  scopeZoneId: string | null;
  calculatedBy: "FNET";
}
