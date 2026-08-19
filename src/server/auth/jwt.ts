import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@/contracts";
import { getAuthSecret, SESSION_TTL_SECONDS } from "./env";

export interface SessionClaims {
  sub: string;
  role: UserRole;
  technicianId: string | null;
  coordinatorId: string | null;
}

export async function signSession(claims: SessionClaims): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getAuthSecret());
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      technicianId: typeof payload.technicianId === "string" ? payload.technicianId : null,
      coordinatorId: typeof payload.coordinatorId === "string" ? payload.coordinatorId : null,
    };
  } catch {
    return null;
  }
}
