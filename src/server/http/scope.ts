import { UserRole } from "@/contracts";
import type { SessionClaims } from "@/server/auth/session";
import { repositories } from "@/server/container";
import { canAccessTechnician, canAccessZone } from "./auth-guards";
import { forbidden } from "./errors";

export interface ScopeQuery {
  technicianId?: string;
  zoneId?: string;
}

export interface ResolvedScope {
  technicianId?: string;
  /** undefined = no zone restriction (ADMIN with no zoneId filter). */
  zoneIds?: string[];
}

/**
 * Turns a raw technicianId/zoneId query into the filter a service should
 * actually run with, per role:
 *  - TECHNICIAN: always forced to themself, 403 if they asked for someone else.
 *  - COORDINATOR: a given zoneId/technicianId must belong to them (403
 *    otherwise); with no filter at all, scoped to all of their zones.
 *  - ADMIN: whatever was asked, no restriction.
 */
export async function resolveScope(session: SessionClaims, query: ScopeQuery): Promise<ResolvedScope> {
  if (session.role === UserRole.TECHNICIAN) {
    if (!session.technicianId) throw forbidden("Session has no technician profile");
    if (query.technicianId && query.technicianId !== session.technicianId) {
      throw forbidden("Technicians can only query their own data");
    }
    return { technicianId: session.technicianId };
  }

  if (session.role === UserRole.COORDINATOR) {
    if (!session.coordinatorId) throw forbidden("Session has no coordinator profile");

    if (query.technicianId && !(await canAccessTechnician(session, query.technicianId))) {
      throw forbidden("You do not have access to this technician");
    }

    if (query.zoneId) {
      if (!(await canAccessZone(session, query.zoneId))) {
        throw forbidden("You do not have access to this zone");
      }
      return { technicianId: query.technicianId, zoneIds: [query.zoneId] };
    }

    const zones = await repositories.zone.listByCoordinator(session.coordinatorId);
    return { technicianId: query.technicianId, zoneIds: zones.map((z) => z.id) };
  }

  // ADMIN
  return {
    technicianId: query.technicianId,
    zoneIds: query.zoneId ? [query.zoneId] : undefined,
  };
}
