import type { NextRequest } from "next/server";
import type { Technician } from "@/contracts";
import { UserRole } from "@/contracts";
import { getSessionFromRequest, type SessionClaims } from "@/server/auth/session";
import { repositories } from "@/server/container";
import { forbidden, notAuthenticated } from "./errors";

/**
 * A cryptographically valid JWT only proves the session was valid AT LOGIN.
 * Re-checking the user here (cheap on the in-memory repo) closes the gap
 * where an account gets deactivated mid-session but its still-unexpired
 * token would otherwise keep working for up to SESSION_TTL_SECONDS.
 */
export async function requireSession(request: NextRequest): Promise<SessionClaims> {
  const session = await getSessionFromRequest(request);
  if (!session) throw notAuthenticated();

  const user = await repositories.user.findById(session.sub);
  if (!user || !user.active) {
    throw notAuthenticated("Session is no longer valid");
  }

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

/**
 * Same rule as `canAccessTechnician`, but against an already-fetched
 * technician record — for routes that need the record either way (so they
 * can resolve "not found" -> null themselves instead of a 403/404), this
 * avoids a second repository lookup and duplicating the zone logic.
 */
export async function canAccessTechnicianRecord(session: SessionClaims, technician: Technician): Promise<boolean> {
  if (session.role === UserRole.ADMIN) return true;
  if (session.role === UserRole.TECHNICIAN) return session.technicianId === technician.id;
  if (session.role === UserRole.COORDINATOR) {
    return (
      (await canAccessZone(session, technician.primaryZoneId)) ||
      (technician.onLoanZoneId ? await canAccessZone(session, technician.onLoanZoneId) : false)
    );
  }
  return false;
}

/** True for ADMIN, the technician themself, or a COORDINATOR who owns the technician's zone. */
export async function canAccessTechnician(session: SessionClaims, technicianId: string): Promise<boolean> {
  if (session.role === UserRole.ADMIN) return true;
  if (session.role === UserRole.TECHNICIAN) return session.technicianId === technicianId;
  const technician = await repositories.technician.findById(technicianId);
  if (!technician) return false;
  return canAccessTechnicianRecord(session, technician);
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
