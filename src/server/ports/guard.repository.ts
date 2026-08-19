import type { Guard, GuardPerformance } from "@/contracts";

export interface GuardListFilter {
  zoneId?: string;
  technicianId?: string;
}

export interface CreateGuardInput {
  zoneId: string;
  technicianIds: string[];
  startAt: string;
  endAt: string;
}

export interface UpdateGuardInput {
  zoneId?: string;
  technicianIds?: string[];
  startAt?: string;
  endAt?: string;
}

export interface GuardRepository {
  findById(id: string): Promise<Guard | null>;
  list(filter?: GuardListFilter): Promise<Guard[]>;
  getPerformance(guardId: string): Promise<GuardPerformance | null>;
  updateTechnicians(guardId: string, technicianIds: string[]): Promise<Guard>;
  create(input: CreateGuardInput): Promise<Guard>;
  update(guardId: string, patch: UpdateGuardInput): Promise<Guard>;
}
