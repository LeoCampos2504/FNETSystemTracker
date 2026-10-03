import { UserRole } from "@/contracts";
import type { OperationalResource, UserScope } from "@/contracts";

export interface ScopedEntity {
  organizationId?: string | null;
  regionId?: string | null;
  zoneId?: string | null;
  baseId?: string | null;
  technicianIds?: readonly string[];
  ownerUserId?: string | null;
}

export interface ScopeTaskLike {
  id: string;
  zoneId: string;
  regionId?: string | null;
  baseId?: string | null;
  organizationId?: string | null;
  assignments: readonly { technicianId: string }[];
}

function includes(values: readonly string[], value: string | null | undefined): boolean {
  return value !== null && value !== undefined && values.includes(value);
}

/** Shared policy used by adapters and server services. Fail closed for unknown scope data. */
export function scopeAllowsResource(scope: UserScope, resource: ScopedEntity): boolean {
  if (scope.role === UserRole.ADMIN) return true;
  if (scope.role === UserRole.TECHNICIAN) {
    return Boolean(scope.technicianId && (resource.technicianIds?.includes(scope.technicianId) || resource.ownerUserId === scope.userId));
  }
  if (scope.role === UserRole.COORDINATOR) {
    return includes(scope.zoneIds, resource.zoneId) || includes(scope.baseIds, resource.baseId);
  }
  if (scope.role === UserRole.MANAGER) {
    const hasSubOrganizationScope = scope.regionIds.length > 0 || scope.zoneIds.length > 0 || scope.baseIds.length > 0;
    return hasSubOrganizationScope
      ? includes(scope.regionIds, resource.regionId) || includes(scope.zoneIds, resource.zoneId) || includes(scope.baseIds, resource.baseId)
      : includes(scope.organizationIds, resource.organizationId);
  }
  return false;
}

export function filterForScope<T extends ScopedEntity>(items: readonly T[], scope: UserScope): T[] {
  return items.filter((item) => scopeAllowsResource(scope, item));
}

export interface ScopedZoneLike {
  id: string;
  regionId?: string | null;
  baseIds?: readonly string[];
}

export interface ScopedCrewLike {
  zoneId: string;
  primaryId: string;
  collaboratorId: string;
  floaterId?: string;
}

export interface ScopedVehicleLike {
  assignedTechnicianId: string | null;
}

export interface ScopedTechnicianLike {
  id: string;
  primaryZoneId: string;
  onLoanZoneId?: string | null;
}

export interface ScopedGuardLike {
  zoneId: string;
  technicianIds: readonly string[];
}

/** Collections that represent zones use the same UserScope hierarchy as resources. */
export function filterZonesForScope<T extends ScopedZoneLike>(zones: readonly T[], scope: UserScope): T[] {
  return zones.filter((zone) => scope.role === UserRole.ADMIN
    || includes(scope.zoneIds, zone.id)
    || includes(scope.regionIds, zone.regionId)
    || (zone.baseIds ?? []).some((baseId) => includes(scope.baseIds, baseId)));
}

export function filterCrewsForScope<T extends ScopedCrewLike>(crews: readonly T[], scope: UserScope): T[] {
  return crews.filter((crew) => scope.role === UserRole.ADMIN
    || includes(scope.zoneIds, crew.zoneId)
    || Boolean(scope.technicianId && [crew.primaryId, crew.collaboratorId, crew.floaterId].includes(scope.technicianId)));
}

export function filterVehiclesForScope<T extends ScopedVehicleLike, TTechnician extends ScopedTechnicianLike>(
  vehicles: readonly T[],
  technicians: readonly TTechnician[],
  scope: UserScope,
  resourceForZone: (zoneId: string, technicianIds: string[]) => ScopedEntity,
): T[] {
  return vehicles.filter((vehicle) => {
    if (!vehicle.assignedTechnicianId) return scope.role === UserRole.ADMIN;
    const technician = technicians.find((item) => item.id === vehicle.assignedTechnicianId);
    if (!technician) return false;
    const zoneId = technician.onLoanZoneId ?? technician.primaryZoneId;
    return scopeAllowsResource(scope, resourceForZone(zoneId, [technician.id]));
  });
}

export function filterGuardsForScope<T extends ScopedGuardLike>(
  guards: readonly T[],
  scope: UserScope,
  resourceForZone: (zoneId: string, technicianIds: string[]) => ScopedEntity,
): T[] {
  return guards.filter((guard) => scopeAllowsResource(scope, resourceForZone(guard.zoneId, [...guard.technicianIds])));
}

export function taskScopeResource(task: ScopeTaskLike): OperationalResource {
  return {
    id: task.id,
    label: task.id,
    resourceType: "TASK",
    organizationId: task.organizationId ?? "org-fnet-ar",
    regionId: task.regionId ?? "",
    zoneId: task.zoneId,
    baseId: task.baseId ?? null,
    technicianIds: task.assignments.map((assignment) => assignment.technicianId),
    ownerUserId: null,
    source: "SYTEX",
  };
}

export function filterTasksForScope<T extends ScopeTaskLike>(tasks: readonly T[], scope: UserScope): T[] {
  return tasks.filter((task) => scopeAllowsResource(scope, taskScopeResource(task)));
}

export function roleLabel(role: UserScope["role"] | string): string {
  return role === UserRole.TECHNICIAN ? "Técnico" : role === UserRole.COORDINATOR ? "Coordinador" : role === UserRole.MANAGER ? "Gerente" : "Administrador";
}

export function scopeLabel(scope: UserScope, zoneNames: readonly string[]): string {
  if (scope.role === UserRole.ADMIN) return "Global";
  const prefix = scope.role === UserRole.TECHNICIAN || scope.zoneIds.length === 1 ? "Mi zona" : "Mis zonas";
  return `${prefix} · ${zoneNames.length > 0 ? zoneNames.join(" + ") : "sin zonas"}`;
}
