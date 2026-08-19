import type { NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { getSessionFromRequest, type SessionClaims } from "@/server/auth/session";
import { repositories } from "@/server/container";
import { forbidden, notAuthenticated } from "./errors";

export async function requireSession(request: NextRequest): Promise<SessionClaims> {
  const session = await getSessionFromRequest(request);
  if (!session) throw notAuthenticated();
  return session;
}

export function requireRole(session: SessionClaims, roles: readonly UserRole[]): void {
  if (!roles.includes(session.role)) {
    throw forbidden(`This action requires one of: ${roles.join(", ")}`);
  }
}

/** True for ADMIN, or for a COORDINATOR whose zones include zoneId. */
export async function canAccessZone(session: SessionClaims, zoneId: string): Promise<boolean> {
  if (session.role === UserRole.ADMIN) return true;
  if (session.role !== UserRole.COORDINATOR || !session.coordinatorId) return false;
  const zones = await repositories.zone.listByCoordinator(session.coordinatorId);
  return zones.some((z) => z.id === zoneId);
}

export async function requireZoneAccess(session: SessionClaims, zoneId: string): Promise<void> {
  if (!(await canAccessZone(session, zoneId))) {
    throw forbidden("You do not have access to this zone");
  }
}

/** True for ADMIN, the technician themself, or a COORDINATOR who owns the technician's zone. */
export async function canAccessTechnician(session: SessionClaims, technicianId: string): Promise<boolean> {
  if (session.role === UserRole.ADMIN) return true;
  if (session.role === UserRole.TECHNICIAN) return session.technicianId === technicianId;
  if (session.role === UserRole.COORDINATOR) {
    const technician = await repositories.technician.findById(technicianId);
    if (!technician) return false;
    return (
      (await canAccessZone(session, technician.primaryZoneId)) ||
      (technician.onLoanZoneId ? await canAccessZone(session, technician.onLoanZoneId) : false)
    );
  }
  return false;
}

export async function requireTechnicianAccess(session: SessionClaims, technicianId: string): Promise<void> {
  if (!(await canAccessTechnician(session, technicianId))) {
    throw forbidden("You do not have access to this technician");
  }
}

/** Coordinators/Admins only — technicians never mutate tasks/guards from this app. */
export function requireCoordinatorOrAdmin(session: SessionClaims): void {
  requireRole(session, [UserRole.COORDINATOR, UserRole.ADMIN]);
}
