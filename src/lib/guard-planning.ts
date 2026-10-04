import type { GuardDuty, GuardDutyHistoryEntry, GuardDutySegment, Technician, UserScope } from "@/contracts";
import { UserRole } from "@/contracts";
import { mockGuards } from "@/mocks/guards";
import { mockBizFlowResources } from "@/mocks/bizflow";
import { mockTechnicians } from "@/mocks/technicians";
import { hierarchyForZone, scopedResourceForZone } from "@/mocks/national";
import { getGuardAt, buildGuardSegments, validateGuardTechnicians, validateGuardWindow, type GuardChange } from "./guard-duty-rules";
import { filterForScope } from "./scope";
import { operationalDateTimeToEpoch } from "./operational-timezone";

export interface GuardPlanningRecord {
  duty: GuardDuty;
  segments: GuardDutySegment[];
  history: GuardDutyHistoryEntry[];
  note?: string | null;
}

export interface GuardPlanningRepository {
  list(): Promise<GuardPlanningRecord[]>;
  save(record: GuardPlanningRecord): Promise<void>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "fnet.mock.guard-planning.v1";

function seedRecords(): GuardPlanningRecord[] {
  return mockGuards.map((guard) => {
    const hierarchy = hierarchyForZone(guard.zoneId);
    const duty: GuardDuty = { id: guard.id, organizationId: hierarchy.organizationId, regionId: hierarchy.regionId, zoneId: guard.zoneId, baseId: hierarchy.id, startAt: guard.startAt, endAt: guard.endAt, status: "PLANNED", externalId: guard.externalId, externalSource: guard.externalSource, sourceUpdatedAt: guard.sourceUpdatedAt };
    const built = buildGuardSegments(guard.id, guard.startAt, guard.endAt, guard.technicianIds);
    return { duty, segments: built.segments, history: built.history };
  });
}

export class LocalGuardPlanningRepository implements GuardPlanningRepository {
  private records: GuardPlanningRecord[] | null = null;
  constructor(private readonly storage?: StorageLike) {}

  private getStorage(): StorageLike | undefined {
    return this.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  }

  private load(): GuardPlanningRecord[] {
    if (this.records) return this.records;
    const stored = this.getStorage()?.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GuardPlanningRecord[];
        if (Array.isArray(parsed)) return (this.records = parsed);
      } catch {
        // Corrupt demo storage falls back to sanitized fixtures.
      }
    }
    return (this.records = seedRecords());
  }

  async list(): Promise<GuardPlanningRecord[]> {
    return this.load().map((record) => ({ ...record, segments: record.segments.map((segment) => ({ ...segment, technicianIds: [...segment.technicianIds] })), history: record.history.map((entry) => ({ ...entry, beforeTechnicianIds: [...entry.beforeTechnicianIds], afterTechnicianIds: [...entry.afterTechnicianIds] })) }));
  }

  async save(record: GuardPlanningRecord): Promise<void> {
    const records = this.load();
    const index = records.findIndex((item) => item.duty.id === record.duty.id);
    if (index === -1) records.push(record);
    else records[index] = record;
    this.records = records;
    this.getStorage()?.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

export interface CreateGuardInput {
  zoneId: string;
  startAt: string;
  endAt: string;
  technicianIds: string[];
  note?: string | null;
}

export interface ReplaceGuardInput {
  guardDutyId: string;
  effectiveAt: string;
  technicianIds: string[];
  actorUserId: string;
  reason?: string | null;
}

function assertScopeCanManage(scope: UserScope): void {
  if (scope.role !== UserRole.COORDINATOR && scope.role !== UserRole.ADMIN) throw new Error("Solo Coordinador y Administrador pueden gestionar guardias en el prototipo.");
}

function assertZoneInScope(scope: UserScope, zoneId: string): void {
  if (filterForScope([scopedResourceForZone(zoneId)], scope).length === 0) throw new Error("La zona está fuera del UserScope activo.");
}

function resourceForTechnician(technicianId: string) {
  return mockBizFlowResources.find((resource) => resource.technicianId === technicianId) ?? null;
}

function assertTechniciansEligible(scope: UserScope, zoneId: string, technicianIds: readonly string[]): void {
  for (const technicianId of technicianIds) {
    const technician = mockTechnicians.find((item) => item.id === technicianId);
    if (!technician) throw new Error(`El técnico ${technicianId} no existe en BizFlow.`);
    const resource = resourceForTechnician(technicianId);
    if (!resource || !resource.active || !technician.active) throw new Error(`El técnico ${technicianId} no está habilitado.`);
    if (resource.zoneId !== zoneId) throw new Error(`El técnico ${technician.name} no es elegible para la zona seleccionada.`);
    if (filterForScope([scopedResourceForZone(zoneId, [technicianId])], scope).length === 0) throw new Error(`El técnico ${technician.name} está fuera del UserScope activo.`);
  }
}

export function getEligibleTechniciansForZone(scope: UserScope, zoneId: string): Technician[] {
  return mockTechnicians.filter((technician) => {
    const resource = resourceForTechnician(technician.id);
    return Boolean(resource?.active && technician.active && resource.zoneId === zoneId && filterForScope([scopedResourceForZone(zoneId, [technician.id])], scope).length > 0);
  });
}

export class GuardPlanningService {
  constructor(private readonly repository: GuardPlanningRepository) {}

  async listForScope(scope: UserScope): Promise<GuardPlanningRecord[]> {
    const records = await this.repository.list();
    return records.filter((record) => filterForScope([scopedResourceForZone(record.duty.zoneId, [...new Set(record.segments.flatMap((segment) => segment.technicianIds))])], scope).length > 0);
  }

  async getGuardAt(scope: UserScope, dateTime: string): Promise<{ record: GuardPlanningRecord; segment: GuardDutySegment } | null> {
    const records = await this.listForScope(scope);
    for (const record of records) {
      const segment = getGuardAt(dateTime, record.segments);
      if (segment && (!scope.technicianId || segment.technicianIds.includes(scope.technicianId))) return { record, segment };
    }
    return null;
  }

  async create(scope: UserScope, input: CreateGuardInput): Promise<GuardPlanningRecord> {
    assertScopeCanManage(scope);
    assertZoneInScope(scope, input.zoneId);
    const windowValidation = validateGuardWindow(input.startAt, input.endAt);
    if (!windowValidation.valid) throw new Error(windowValidation.reason);
    const technicianValidation = validateGuardTechnicians(input.technicianIds);
    if (!technicianValidation.valid) throw new Error(technicianValidation.reason);
    assertTechniciansEligible(scope, input.zoneId, input.technicianIds);
    const id = `fnet-guard-${Date.now()}`;
    const hierarchy = hierarchyForZone(input.zoneId);
    const duty: GuardDuty = { id, organizationId: hierarchy.organizationId, regionId: hierarchy.regionId, zoneId: input.zoneId, baseId: hierarchy.id, startAt: input.startAt, endAt: input.endAt, status: "PLANNED", externalId: null, externalSource: "INTERNAL", sourceUpdatedAt: null };
    const built = buildGuardSegments(id, input.startAt, input.endAt, input.technicianIds);
    const record = { duty, segments: built.segments, history: built.history, note: input.note ?? null };
    await this.repository.save(record);
    return record;
  }

  async replace(scope: UserScope, input: ReplaceGuardInput): Promise<GuardPlanningRecord> {
    assertScopeCanManage(scope);
    const records = await this.repository.list();
    const record = records.find((item) => item.duty.id === input.guardDutyId);
    if (!record) throw new Error("Guardia no encontrada.");
    assertZoneInScope(scope, record.duty.zoneId);
    const technicianValidation = validateGuardTechnicians(input.technicianIds);
    if (!technicianValidation.valid) throw new Error(technicianValidation.reason);
    assertTechniciansEligible(scope, record.duty.zoneId, input.technicianIds);
    const change: GuardChange = { at: input.effectiveAt, technicianIds: input.technicianIds, actorUserId: input.actorUserId, reason: input.reason };
    const current = getGuardAt(input.effectiveAt, record.segments);
    if (!current) throw new Error("El cambio debe estar dentro de un tramo vigente.");
    if (record.history.some((entry) => operationalDateTimeToEpoch(entry.changedAt) === operationalDateTimeToEpoch(input.effectiveAt))) throw new Error("Ya existe un cambio histórico en ese instante; el histórico es inmutable.");
    const changes = record.history.map((entry) => ({ at: entry.changedAt, technicianIds: entry.afterTechnicianIds, actorUserId: entry.actorUserId, reason: entry.reason }));
    const rebuilt = buildGuardSegments(record.duty.id, record.duty.startAt, record.duty.endAt, record.segments[0].technicianIds, [...changes, change]);
    const updated = { ...record, segments: rebuilt.segments, history: rebuilt.history };
    await this.repository.save(updated);
    return updated;
  }
}

export const mockGuardPlanningService = new GuardPlanningService(new LocalGuardPlanningRepository());
