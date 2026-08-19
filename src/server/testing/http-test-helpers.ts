import { NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { signSession, type SessionClaims } from "@/server/auth/jwt";

/** Next's own RequestInit type (subtly narrower than the DOM lib's — e.g. `signal` can't be null). */
type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

/**
 * Shared plumbing for route-handler (real HTTP-shape) tests: build a
 * NextRequest carrying a signed session cookie, or none at all. Route
 * handlers are called directly (no real server), so this is what stands in
 * for "the browser sent a cookie".
 */
export async function authedRequest(
  url: string,
  claims: SessionClaims,
  init?: NextRequestInit,
): Promise<NextRequest> {
  const { token } = await signSession(claims);
  return new NextRequest(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

export function unauthedRequest(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(url, init);
}

export function jsonInit(method: string, body: unknown): NextRequestInit {
  return { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
}

/**
 * Known-good fixture sessions matching src/mocks (coordinators.ts,
 * technicians.ts, users.ts). coord-1 owns zone-noa/zone-nea; coord-2 owns
 * zone-cuyo/zone-centro; tech-01/02/03 are in zone-noa; tech-06/07/08 are in
 * zone-cuyo.
 */
export const sessions = {
  admin: { sub: "user-admin-1", role: UserRole.ADMIN, technicianId: null, coordinatorId: null },
  coord1: { sub: "user-coord-1", role: UserRole.COORDINATOR, technicianId: null, coordinatorId: "coord-1" },
  coord2: { sub: "user-coord-2", role: UserRole.COORDINATOR, technicianId: null, coordinatorId: "coord-2" },
  tech01: { sub: "user-tech-01", role: UserRole.TECHNICIAN, technicianId: "tech-01", coordinatorId: null },
  tech02: { sub: "user-tech-02", role: UserRole.TECHNICIAN, technicianId: "tech-02", coordinatorId: null },
  tech06: { sub: "user-tech-06", role: UserRole.TECHNICIAN, technicianId: "tech-06", coordinatorId: null },
} as const satisfies Record<string, SessionClaims>;
