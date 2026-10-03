import { createHash, randomBytes } from "node:crypto";
import { UserRole, type User } from "@/contracts";

export const SESSION_COOKIE = "fnet_session";
export const SESSION_SECONDS = 60 * 30;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function databaseUserToContract(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  technicianId: string | null;
  coordinatorId: string | null;
  active: boolean;
}): User {
  const roles: string[] = [UserRole.ADMIN, UserRole.COORDINATOR, UserRole.MANAGER, UserRole.TECHNICIAN];
  if (!roles.includes(row.role)) throw new Error("INVALID_USER_ROLE");
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as User["role"],
    technicianId: row.technicianId,
    coordinatorId: row.coordinatorId,
    active: row.active,
  };
}
