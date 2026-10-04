import type { ExternalSyncFields } from "./common";

export interface GuardDuty extends ExternalSyncFields {
  id: string;
  organizationId: string;
  regionId: string;
  zoneId: string;
  baseId: string | null;
  startAt: string;
  endAt: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
}

export interface GuardDutySegment {
  id: string;
  guardDutyId: string;
  startAt: string;
  endAt: string;
  technicianIds: string[];
  source: "BIZFLOW" | "INTERNAL";
}

export interface GuardDutyHistoryEntry {
  id: string;
  guardDutyId: string;
  changedAt: string;
  actorUserId: string | null;
  beforeTechnicianIds: string[];
  afterTechnicianIds: string[];
  reason: string | null;
}
