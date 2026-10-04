import type { ExternalSyncFields } from "./common";

export const AssetCategory = {
  GENERATOR: "GENERATOR",
  AIR_CONDITIONER: "AIR_CONDITIONER",
  BATTERY: "BATTERY",
  OTHER: "OTHER",
} as const;
export type AssetCategory = (typeof AssetCategory)[keyof typeof AssetCategory];

export const AssetAssignmentTarget = {
  USER: "USER",
  BASE: "BASE",
  ZONE: "ZONE",
  REGION: "REGION",
  UNASSIGNED: "UNASSIGNED",
} as const;
export type AssetAssignmentTarget = (typeof AssetAssignmentTarget)[keyof typeof AssetAssignmentTarget];

export interface Asset extends ExternalSyncFields {
  id: string;
  code: string;
  name: string;
  category: AssetCategory;
  organizationId: string;
  regionId: string;
  zoneId: string;
  baseId: string | null;
  status: "ACTIVE" | "MAINTENANCE" | "OUT_OF_SERVICE";
  assignedTechnicianId: string | null;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  targetType: AssetAssignmentTarget;
  targetId: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  actorUserId: string | null;
  reason: string | null;
}
