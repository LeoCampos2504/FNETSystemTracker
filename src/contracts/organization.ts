import type { ISODateTimeString } from "./common";
import type { UserRole } from "./enums";

/** National hierarchy. Pilot zones are fixture data, not application rules. */
export interface Organization {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  active: boolean;
}

export interface Region {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  active: boolean;
}

export interface OperationalBase {
  id: string;
  organizationId: string;
  regionId: string;
  zoneId: string;
  code: string;
  name: string;
  city: string;
  active: boolean;
}

export type Base = OperationalBase;

export type Role = UserRole;

export interface UserScope {
  userId: string;
  role: Role;
  organizationIds: string[];
  regionIds: string[];
  zoneIds: string[];
  baseIds: string[];
  technicianId: string | null;
  coordinatorId: string | null;
  grantedAt: ISODateTimeString;
}

export interface OperationalResource {
  id: string;
  label: string;
  resourceType: "TASK" | "ASSET" | "VEHICLE" | "GUARD" | "STOCK" | "MAINTENANCE";
  organizationId: string;
  regionId: string;
  zoneId: string;
  baseId: string | null;
  technicianIds: string[];
  ownerUserId: string | null;
  source: string;
}
